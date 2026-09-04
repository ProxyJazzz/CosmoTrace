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

export class OptiMeshSerial {
  constructor(onFaultUpdate, onStatusChange) {
    this.port = null;
    this.reader = null;
    this.keepReading = false;
    this.onFaultUpdateCallback = onFaultUpdate || null;
    this.onStatusChangeCallback = onStatusChange || null;
    this.lineBuffer = '';
  }

  setFaultUpdateCallback(cb) {
    this.onFaultUpdateCallback = cb;
  }

  setGridUpdateCallback(cb) {
    this.onFaultUpdateCallback = cb;
  }

  setStatusChangeCallback(cb) {
    this.onStatusChangeCallback = cb;
  }

  async connect(baudRate = 115200) {
    if (!('serial' in navigator)) {
      if (this.onStatusChangeCallback) {
        this.onStatusChangeCallback(false, 'Web Serial not supported — use Chrome or Edge.');
      }
      throw new Error('Web Serial API is not supported in this browser. Please use Chrome or Edge.');
    }

    try {
      this.port = await navigator.serial.requestPort();
      await this.port.open({ baudRate });
      this.keepReading = true;

      if (this.onStatusChangeCallback) {
        this.onStatusChangeCallback(true, 'ESP32 connected (115200 baud)');
      }

      this.readLoop();
      return true;
    } catch (err) {
      console.error('[OptiMeshSerial] Connection failed:', err);
      const errMsg = err?.message || 'Failed to open serial port';
      if (this.onStatusChangeCallback) {
        this.onStatusChangeCallback(false, errMsg);
      }
      throw err;
    }
  }

  async disconnect() {
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

  async readLoop() {
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
    } catch (error) {
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

  parseLine(line) {
    if (!line.startsWith('{')) return;

    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch (e) {
      return;
    }

    const readings = {};
    const rowFaults = new Set();
    const colFaults = new Set();
    const pointFaults = new Set();

    const rawReadings = parsed.readings && typeof parsed.readings === 'object' ? parsed.readings : parsed;

    for (const [key, val] of Object.entries(rawReadings)) {
      if (typeof val !== 'number') continue;

      const numVal = val;

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

    if (parsed.faults) {
      if (Array.isArray(parsed.faults.rows)) {
        parsed.faults.rows.forEach(r => {
          const rNum = parseInt(r, 10);
          if (!isNaN(rNum)) {
            rowFaults.add(`Row ${rNum}`);
            rowFaults.add(`${rNum}`);
          }
        });
      }
      if (Array.isArray(parsed.faults.cols)) {
        parsed.faults.cols.forEach(c => {
          const cStr = String(c).toUpperCase();
          if (/^[A-F]$/.test(cStr)) {
            colFaults.add(`Col ${cStr}`);
            colFaults.add(cStr);
          }
        });
      }
    }

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

    const payload = {
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
