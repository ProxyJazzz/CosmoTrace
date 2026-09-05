/// <reference types="w3c-web-serial" />

/**
 * OptiMesh 10x6 Web Serial Bridge (v5 — matches Adaptive Fiber Fault Detector firmware)
 *
 * Matches this exact firmware JSON shape:
 * {
 *   "grid":{"rows":10,"cols":6},
 *   "readings":{"R1":3700,...,"CF":3850},   // RAW ADC values, not percentages
 *   "status":"OK",                           // single string: "OK" or "FAULT"
 *   "faults":["R4","CC"]                     // array of sensor names currently faulted
 * }
 *
 * Emits payload shape:
 * {
 *   readings: { "Row 1": 3700, "Col A": 3850, ... },   // raw ADC, relabeled
 *   overallStatus: "OK" | "FAULT",
 *   rowFaults: Set(["Row 4"]),
 *   colFaults: Set(["Col C"]),
 *   pointFaults: Set(["(C, 4)"]),   // only when a row AND col are BOTH faulted together
 * }
 */

export interface FaultUpdatePayload {
  readings: Record<string, number>;
  overallStatus?: string;
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

export const ESP32_USB_FILTERS: ESP32DeviceFilter[] = [
  { usbVendorId: 0x10c4 }, // Silicon Labs CP210x
  { usbVendorId: 0x1a86 }, // WCH CH340 / CH341
  { usbVendorId: 0x0403 }, // FTDI
  { usbVendorId: 0x303a }, // Espressif CDC
  { usbVendorId: 0x2341 }, // Arduino
];

function rowKeyToLabel(key: string): string | null {
  // "R1".."R10" -> "Row 1".."Row 10"
  const match = key.match(/^R(\d+)$/i);
  if (!match) return null;
  return `Row ${parseInt(match[1], 10)}`;
}

function colKeyToLabel(key: string): string | null {
  // "CA".."CF" -> "Col A".."Col F"
  const match = key.match(/^C([A-F])$/i);
  if (!match) return null;
  return `Col ${match[1].toUpperCase()}`;
}

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
            throw filterErr;
          }
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
      } catch (e) {}
      this.reader = null;
    }

    if (this.port) {
      try {
        await this.port.close();
      } catch (e) {}
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
   * Parses JSON line from ESP32 v5:
   * e.g. {"grid":{"rows":10,"cols":6},"readings":{"R1":3700,...,"CF":3850},"status":"OK","faults":["R4","CC"]}
   */
  private parseLine(line: string): void {
    if (!line.startsWith('{')) return; // ignore firmware's plain-text calibration/log lines

    let parsed: any;
    try {
      parsed = JSON.parse(line);
    } catch (e) {
      return; // malformed/partial line, drop silently
    }

    // Only handle full sensor frames -- must have readings + faults array.
    if (!parsed.readings || !Array.isArray(parsed.faults)) return;

    const readings: Record<string, number> = {};
    const rowFaults = new Set<string>();
    const colFaults = new Set<string>();

    // Populate readings (raw ADC values) under friendly labels
    for (const key of Object.keys(parsed.readings)) {
      const rowLabel = rowKeyToLabel(key);
      const colLabel = colKeyToLabel(key);
      const label = rowLabel || colLabel;
      if (!label) continue;
      readings[label] = parsed.readings[key];
      // Keep original key as alias for lookup compatibility
      readings[key] = parsed.readings[key];
    }

    // Faults come ONLY from the firmware's own "faults" array -- this is
    // the authoritative, debounced decision. Do not recompute from readings.
    for (const faultKey of parsed.faults) {
      const rowLabel = rowKeyToLabel(faultKey);
      const colLabel = colKeyToLabel(faultKey);
      if (rowLabel) {
        rowFaults.add(rowLabel);
        rowFaults.add(faultKey);
        rowFaults.add(rowLabel.replace('Row ', ''));
      } else if (colLabel) {
        colFaults.add(colLabel);
        colFaults.add(faultKey);
        colFaults.add(colLabel.replace('Col ', ''));
      }
    }

    // A true X,Y point fault only when a row AND a col are BOTH faulted
    const pointFaults = new Set<string>();
    if (rowFaults.size > 0 && colFaults.size > 0) {
      for (const row of rowFaults) {
        if (!row.startsWith('Row ')) continue;
        for (const col of colFaults) {
          if (!col.startsWith('Col ')) continue;
          const rowNum = row.replace('Row ', '');
          const colLetter = col.replace('Col ', '');
          pointFaults.add(`(${colLetter}, ${rowNum})`);
          pointFaults.add(`${colLetter}${rowNum}`);
          pointFaults.add(`INT-${colLetter}-${rowNum}`);
          pointFaults.add(`INT-L-${colLetter}-${rowNum}`);
          pointFaults.add(`INT-R-${colLetter}-${rowNum}`);
        }
      }
    }

    const payload: FaultUpdatePayload = {
      readings,
      overallStatus: parsed.status, // "OK" | "FAULT"
      rowFaults,
      colFaults,
      pointFaults,
      rawJson: parsed,
    };

    if (this.onFaultUpdateCallback) {
      this.onFaultUpdateCallback(payload);
    }
  }
}

export const globalOptiMeshSerial = new OptiMeshSerial();
