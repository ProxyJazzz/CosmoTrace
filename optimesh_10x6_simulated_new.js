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
 * IMPORTANT: "readings" here are RAW ADC values (roughly 0-4095), NOT 0-100%
 * percentages like earlier firmware versions produced. If your UI displays
 * this number directly, label it as a raw sensor reading, not a percentage,
 * or convert it yourself using your own baseline/range if you want a
 * normalized display value (the firmware doesn't send one in this version).
 *
 * The firmware's own fault decision (dual absolute + array-relative drop
 * test, with a gradual up/down debounce counter) is the ONLY source of
 * truth here — this module does not recompute or second-guess it. A
 * sensor is faulted if and only if its name appears in the "faults" array.
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

function rowKeyToLabel(key) {
  // "R1".."R10" -> "Row 1".."Row 10"
  const match = key.match(/^R(\d+)$/i);
  if (!match) return null;
  return `Row ${parseInt(match[1], 10)}`;
}

function colKeyToLabel(key) {
  // "CA".."CF" -> "Col A".."Col F"
  const match = key.match(/^C([A-F])$/i);
  if (!match) return null;
  return `Col ${match[1].toUpperCase()}`;
}

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
      try { await this.reader.cancel(); } catch (e) {}
      this.reader = null;
    }
    if (this.port) {
      try { await this.port.close(); } catch (e) {}
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
        try { this.reader.releaseLock(); } catch (e) {}
        this.reader = null;
      }
      this.disconnect();
    }
  }

  parseLine(line) {
    if (!line.startsWith('{')) return; // ignore firmware's plain-text calibration/log lines

    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch (e) {
      return; // malformed/partial line, drop silently
    }

    // Only handle full sensor frames -- must have readings + faults array.
    if (!parsed.readings || !Array.isArray(parsed.faults)) return;

    const readings = {};
    const rowFaults = new Set();
    const colFaults = new Set();

    // Populate readings (raw ADC values) under friendly labels
    for (const key of Object.keys(parsed.readings)) {
      const rowLabel = rowKeyToLabel(key);
      const colLabel = colKeyToLabel(key);
      const label = rowLabel || colLabel;
      if (!label) continue;
      readings[label] = parsed.readings[key];
    }

    // Faults come ONLY from the firmware's own "faults" array -- this is
    // the authoritative, debounced decision. Do not recompute from readings.
    for (const faultKey of parsed.faults) {
      const rowLabel = rowKeyToLabel(faultKey);
      const colLabel = colKeyToLabel(faultKey);
      if (rowLabel) rowFaults.add(rowLabel);
      else if (colLabel) colFaults.add(colLabel);
    }

    // A true X,Y point fault only when a row AND a col are BOTH faulted
    // (matches the line-based sensing model: a single fiber cut only
    // gives a 1D row or column location; a genuine 2D point is only
    // confirmed when both directions fault together).
    const pointFaults = new Set();
    if (rowFaults.size > 0 && colFaults.size > 0) {
      for (const row of rowFaults) {
        for (const col of colFaults) {
          const rowNum = row.replace('Row ', '');
          const colLetter = col.replace('Col ', '');
          pointFaults.add(`(${colLetter}, ${rowNum})`);
        }
      }
    }

    const payload = {
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