/// <reference types="w3c-web-serial" />

/**
 * OptiMesh 10x6 Web Serial Bridge (v3 - Capacity & Multi-Wire Fault Model)
 *
 * Connects to ESP32 streaming 10 Horizontal (Row 1-10) x 6 Vertical (Col A-F)
 * light-intensity percentage readings (0-100%).
 *
 * Fault threshold: reading < 59% = FAULT.
 *
 * Emits payload shape:
 * {
 *   readings: { "Row 1": 87, "Row 8": 32, "Col A": 78, "Col B": 33, ... },
 *   rowFaults: Set(["Row 8", "Row 10"]),
 *   colFaults: Set(["Col B", "Col D"]),
 *   pointFaults: Set(["B8", "D10", ...])
 * }
 */

export const FAULT_THRESHOLD_PERCENT = 59;
export const FAULT_THRESHOLD = 59;

export interface ChannelEntry {
  firmwareKey: string;
  value: number;
  fault: boolean;
}

export type ChannelMap = Record<number | string, ChannelEntry>;

export interface FaultUpdatePayload {
  readings: Record<string, number>;
  rowFaults: Set<string>;
  colFaults: Set<string>;
  pointFaults: Set<string>;
  rawJson?: any;
}

export type OnFaultUpdateCallback = (payload: FaultUpdatePayload) => void;
export type OnStatusCallback = (connected: boolean, message?: string) => void;

export interface ESP32DeviceFilter {
  usbVendorId?: number;
  usbProductId?: number;
}

/**
 * Common ESP32 USB-to-UART Bridge & Native CDC USB Vendor IDs:
 * - 0x10C4: Silicon Labs CP2102/CP2104 (most popular ESP32 USB-to-UART chip)
 * - 0x1A86: QinHeng WCH CH340/CH341/CH9102 (common on budget ESP32 boards)
 * - 0x0403: FTDI FT232R (used on FTDI ESP32 dev boards)
 * - 0x303A: Espressif Systems (Native USB CDC on ESP32-S2/S3/C3/C6)
 * - 0x2341: Arduino SA
 */
export const ESP32_USB_FILTERS: ESP32DeviceFilter[] = [
  { usbVendorId: 0x10c4 }, // Silicon Labs CP210x
  { usbVendorId: 0x1a86 }, // WCH CH340 / CH341
  { usbVendorId: 0x0403 }, // FTDI
  { usbVendorId: 0x303a }, // Espressif CDC
  { usbVendorId: 0x2341 }, // Arduino
];

export class OptiMeshSerial {
  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private keepReading = false;
  private onFaultUpdateCallback: OnFaultUpdateCallback | null = null;
  private onStatusChangeCallback: OnStatusCallback | null = null;
  private lineBuffer = '';

  constructor(
    onFaultUpdate?: OnFaultUpdateCallback | any,
    onStatusChange?: OnStatusCallback
  ) {
    if (onFaultUpdate) {
      this.onFaultUpdateCallback = onFaultUpdate;
    }
    if (onStatusChange) {
      this.onStatusChangeCallback = onStatusChange;
    }
  }

  public setFaultUpdateCallback(cb: OnFaultUpdateCallback) {
    this.onFaultUpdateCallback = cb;
  }

  public setGridUpdateCallback(cb: any) {
    this.onFaultUpdateCallback = cb;
  }

  public setStatusChangeCallback(cb: OnStatusCallback) {
    this.onStatusChangeCallback = cb;
  }

  /**
   * Attempts to auto-connect to an already authorized serial port without opening the modal dialog.
   */
  public async autoConnectPreviousPort(baudRate = 115200): Promise<boolean> {
    if (!('serial' in navigator)) return false;
    try {
      const serial = (navigator as unknown as { serial: Serial }).serial;
      const ports = await serial.getPorts();
      if (ports && ports.length > 0) {
        this.port = ports[0];
        await this.port.open({ baudRate });
        this.keepReading = true;

        if (this.onStatusChangeCallback) {
          this.onStatusChangeCallback(true, 'ESP32 reconnected via saved port');
        }

        this.readLoop();
        return true;
      }
    } catch (e) {
      console.warn('[OptiMeshSerial] Auto-connect previous port failed:', e);
    }
    return false;
  }

  /**
   * Opens user serial port picker and connects at target baud rate (default 115200).
   * Fully compatible with both Windows (CP2102/CH340 COM ports) and macOS (/dev/cu.usbserial-*).
   */
  public async connect(baudRate = 115200, useVendorFilter = false): Promise<boolean> {
    if (!('serial' in navigator)) {
      if (this.onStatusChangeCallback) {
        this.onStatusChangeCallback(false, 'Web Serial not supported — use Chrome, Edge, or Brave.');
      }
      throw new Error('Web Serial API is not supported in this browser. Please use Chrome, Edge, or Brave over HTTPS or localhost.');
    }

    try {
      const serial = (navigator as unknown as { serial: Serial }).serial;

      if (useVendorFilter) {
        try {
          this.port = await serial.requestPort({ filters: ESP32_USB_FILTERS });
        } catch (filterErr: any) {
          if (filterErr?.name === 'NotFoundError') {
            throw filterErr; // User explicitly cancelled picker
          }
          // Fall back to unfiltered picker if filter wasn't supported
          this.port = await serial.requestPort();
        }
      } else {
        this.port = await serial.requestPort();
      }

      const portInfo = (this.port as any).getInfo ? (this.port as any).getInfo() : {};
      console.log('[OptiMeshSerial] Selected port info:', portInfo);

      try {
        await this.port.open({ baudRate });
      } catch (openErr: any) {
        console.error('[OptiMeshSerial] Port open error:', openErr);
        const isWindows = typeof navigator !== 'undefined' && /win/i.test(navigator.userAgent || '');
        let detailedMsg = openErr?.message || 'Failed to open serial port';
        
        if (openErr?.name === 'InvalidStateError' || openErr?.name === 'NetworkError' || detailedMsg.includes('Failed to open') || detailedMsg.includes('denied') || detailedMsg.includes('busy')) {
          if (isWindows) {
            detailedMsg = 'COM port access denied or busy. On Windows, please ensure Arduino IDE Serial Monitor, PuTTY, or other terminal tools are closed, then try again.';
          } else {
            detailedMsg = 'Serial port is busy or locked by another app. Please close any open serial monitor and try again.';
          }
        }
        throw new Error(detailedMsg);
      }

      this.keepReading = true;

      if (this.onStatusChangeCallback) {
        this.onStatusChangeCallback(true, 'ESP32 connected (115200 baud)');
      }

      // Start reading stream in background
      this.readLoop();
      return true;
    } catch (err: any) {
      console.error('[OptiMeshSerial] Connection failed:', err);
      const errMsg = err?.message || 'Failed to open serial port';
      if (this.onStatusChangeCallback) {
        this.onStatusChangeCallback(false, errMsg);
      }
      throw err;
    }
  }

  /**
   * Closes serial connection
   */
  public async disconnect(): Promise<void> {
    this.keepReading = false;

    if (this.reader) {
      try {
        await this.reader.cancel();
      } catch (e) {
        // Ignore cancel errors
      }
      this.reader = null;
    }

    if (this.port) {
      try {
        await this.port.close();
      } catch (e) {
        // Ignore close errors
      }
      this.port = null;
    }

    if (this.onStatusChangeCallback) {
      this.onStatusChangeCallback(false, 'ESP32 disconnected');
    }
  }

  /**
   * Continuous read loop with line buffering
   */
  private async readLoop(): Promise<void> {
    if (!this.port || !this.port.readable) return;

    const textDecoder = new TextDecoder();
    this.reader = this.port.readable.getReader();

    this.lineBuffer = '';

    try {
      while (this.keepReading) {
        const { value, done } = await this.reader.read();
        if (done) break;

        if (value) {
          this.lineBuffer += textDecoder.decode(value, { stream: true });
          const lines = this.lineBuffer.split('\n');
          // Keep last incomplete segment in buffer
          this.lineBuffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.length > 0) {
              this.parseLine(trimmed);
            }
          }
        }
      }
    } catch (error: any) {
      console.error('[OptiMeshSerial] Error reading serial stream:', error);
      if (this.onStatusChangeCallback) {
        this.onStatusChangeCallback(false, 'Serial read error: ' + (error?.message || 'Unknown error'));
      }
    } finally {
      if (this.reader) {
        try {
          this.reader.releaseLock();
        } catch (e) {}
        this.reader = null;
      }
      this.disconnect();
    }
  }

  /**
   * Parses JSON line from ESP32:
   * e.g. {"grid":{"rows":10,"cols":6},"readings":{"R1":87,...,"R10":45,"CA":78,...,"CF":90},"faults":{"rows":[10],"cols":["B"]}}
   */
  private parseLine(line: string): void {
    if (!line.startsWith('{')) {
      // Non-JSON debug message (e.g. "R,OptiMesh simulator ready")
      if (line.startsWith('R,')) {
        console.log('[ESP32 Ready]:', line.slice(2));
      }
      return;
    }

    let parsed: any;
    try {
      parsed = JSON.parse(line);
    } catch (e) {
      return;
    }

    const readings: Record<string, number> = {};
    const rowFaults = new Set<string>();
    const colFaults = new Set<string>();
    const pointFaults = new Set<string>();

    // Extract readings from parsed.readings or directly from parsed object
    const rawReadings = parsed.readings && typeof parsed.readings === 'object' ? parsed.readings : parsed;

    for (const [key, val] of Object.entries(rawReadings)) {
      if (typeof val !== 'number') continue;

      const numVal = val as number;

      // Match keys like "R1".."R10", "Row 1".."Row 10", "1".."10"
      const rowMatch = key.match(/^(?:R|Row\s*)(\d+)$/i);
      if (rowMatch) {
        const rowNum = parseInt(rowMatch[1], 10);
        if (rowNum >= 1 && rowNum <= 10) {
          const stdKey = `Row ${rowNum}`;
          readings[stdKey] = numVal;
          readings[`R${rowNum}`] = numVal;
          readings[`${rowNum}`] = numVal;

          if (numVal < FAULT_THRESHOLD_PERCENT) {
            rowFaults.add(stdKey);
            rowFaults.add(`${rowNum}`);
          }
        }
        continue;
      }

      // Match keys like "CA".."CF", "Col A".."Col F", "A".."F"
      const colMatch = key.match(/^(?:C|Col\s*)([A-F])$/i);
      if (colMatch) {
        const colLetter = colMatch[1].toUpperCase();
        const stdKey = `Col ${colLetter}`;
        readings[stdKey] = numVal;
        readings[`C${colLetter}`] = numVal;
        readings[colLetter] = numVal;

        if (numVal < FAULT_THRESHOLD_PERCENT) {
          colFaults.add(stdKey);
          colFaults.add(colLetter);
        }
        continue;
      }

      // Plain number key e.g. "1".."10"
      const plainNum = parseInt(key, 10);
      if (!isNaN(plainNum) && plainNum >= 1 && plainNum <= 10) {
        const stdKey = `Row ${plainNum}`;
        readings[stdKey] = numVal;
        readings[`R${plainNum}`] = numVal;
        readings[`${plainNum}`] = numVal;
        if (numVal < FAULT_THRESHOLD_PERCENT) {
          rowFaults.add(stdKey);
          rowFaults.add(`${plainNum}`);
        }
        continue;
      }

      // Plain letter key e.g. "A".."F"
      if (/^[A-F]$/i.test(key)) {
        const colLetter = key.toUpperCase();
        const stdKey = `Col ${colLetter}`;
        readings[stdKey] = numVal;
        readings[`C${colLetter}`] = numVal;
        readings[colLetter] = numVal;
        if (numVal < FAULT_THRESHOLD_PERCENT) {
          colFaults.add(stdKey);
          colFaults.add(colLetter);
        }
        continue;
      }
    }

    // Also parse explicit faults array if provided by firmware
    if (parsed.faults) {
      if (Array.isArray(parsed.faults.rows)) {
        parsed.faults.rows.forEach((r: any) => {
          const rNum = parseInt(r, 10);
          if (!isNaN(rNum)) {
            rowFaults.add(`Row ${rNum}`);
            rowFaults.add(`${rNum}`);
          }
        });
      }
      if (Array.isArray(parsed.faults.cols)) {
        parsed.faults.cols.forEach((c: any) => {
          const cStr = String(c).toUpperCase();
          if (/^[A-F]$/.test(cStr)) {
            colFaults.add(`Col ${cStr}`);
            colFaults.add(cStr);
          }
        });
      }
    }

    // Generate intersection point faults for all faulted row/col combinations
    colFaults.forEach(c => {
      const cLetter = c.replace(/^(?:Col\s*|C)/i, '').toUpperCase();
      if (!/^[A-F]$/.test(cLetter)) return;

      rowFaults.forEach(r => {
        const rNum = r.replace(/^(?:Row\s*|R)/i, '');
        if (!/^\d+$/.test(rNum)) return;

        pointFaults.add(`${cLetter}${rNum}`);
        pointFaults.add(`(${cLetter}, ${rNum})`);
        pointFaults.add(`INT-${cLetter}-${rNum}`);
      });
    });

    const payload: FaultUpdatePayload = {
      readings,
      rowFaults,
      colFaults,
      pointFaults,
      rawJson: parsed
    };

    if (this.onFaultUpdateCallback) {
      this.onFaultUpdateCallback(payload);
    }
  }
}

export const globalOptiMeshSerial = new OptiMeshSerial();
