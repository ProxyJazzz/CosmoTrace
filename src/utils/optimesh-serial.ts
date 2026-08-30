/// <reference types="w3c-web-serial" />

/**
 * OptiMeshSerial - Web Serial API bridge for CD74HC4067 multiplexed ESP32 fiber optic grid.
 * Parses frames formatted as: F,<timestamp_ms>,<25-char-hex-bitmask>\n
 */

export type FaultGrid = boolean[][]; // 10x10 grid (true = faulted junction, false = OK)

export class OptiMeshSerial {
  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private keepReading = false;
  private onGridUpdateCallback: ((faultGrid: FaultGrid, timestampMs: number) => void) | null = null;
  private onStatusChangeCallback: ((connected: boolean) => void) | null = null;

  constructor(
    onGridUpdate?: (faultGrid: FaultGrid, timestampMs: number) => void,
    onStatusChange?: (connected: boolean) => void
  ) {
    if (onGridUpdate) this.onGridUpdateCallback = onGridUpdate;
    if (onStatusChange) this.onStatusChangeCallback = onStatusChange;
  }

  public setGridUpdateCallback(cb: (faultGrid: FaultGrid, timestampMs: number) => void) {
    this.onGridUpdateCallback = cb;
  }

  public setStatusChangeCallback(cb: (connected: boolean) => void) {
    this.onStatusChangeCallback = cb;
  }

  /**
   * Opens user serial port picker and connects at target baud rate (default 115200)
   */
  public async connect(baudRate = 115200): Promise<boolean> {
    if (!('serial' in navigator)) {
      throw new Error('Web Serial API is not supported in this browser. Please use Chrome, Edge, or Opera over HTTPS/localhost.');
    }

    try {
      const serial = (navigator as unknown as { serial: Serial }).serial;
      this.port = await serial.requestPort();
      await this.port.open({ baudRate });
      this.keepReading = true;

      if (this.onStatusChangeCallback) this.onStatusChangeCallback(true);

      // Start reading stream in background
      this.readLoop();
      return true;
    } catch (err) {
      console.error('Failed to connect over Web Serial:', err);
      if (this.onStatusChangeCallback) this.onStatusChangeCallback(false);
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

    if (this.onStatusChangeCallback) this.onStatusChangeCallback(false);
  }

  /**
   * Continuous read loop with line buffering
   */
  private async readLoop(): Promise<void> {
    if (!this.port || !this.port.readable) return;

    const textDecoder = new TextDecoder();
    this.reader = this.port.readable.getReader();

    let buffer = '';

    try {
      while (this.keepReading) {
        const { value, done } = await this.reader.read();
        if (done) break;

        if (value) {
          buffer += textDecoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          // Keep last incomplete segment in buffer
          buffer = lines.pop() || '';

          for (const line of lines) {
            this.parseFrame(line.trim());
          }
        }
      }
    } catch (error) {
      console.error('Error reading serial stream:', error);
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
   * Parses frame line format: F,<timestamp_ms>,<25-char-hex-bitmask>
   */
  private parseFrame(line: string): void {
    if (!line.startsWith('F,')) return;

    const parts = line.split(',');
    if (parts.length < 3) return;

    const timestampMs = parseInt(parts[1], 10) || Date.now();
    const hexBitmask = parts[2].trim();

    if (hexBitmask.length !== 25) return; // 25 hex chars = 100 bits

    // Decode 25 hex characters into 100 bits (10x10 matrix)
    const faultGrid: FaultGrid = Array.from({ length: 10 }, () => Array(10).fill(false));
    let bitIndex = 0;

    for (let i = 0; i < hexBitmask.length; i++) {
      const hexNibble = parseInt(hexBitmask[i], 16);
      if (isNaN(hexNibble)) continue;

      // Extract 4 bits from nibble (MSB to LSB)
      for (let b = 3; b >= 0; b--) {
        if (bitIndex >= 100) break;

        const isFaulted = ((hexNibble >> b) & 1) === 1;
        const x = Math.floor(bitIndex / 10);
        const y = bitIndex % 10;

        faultGrid[x][y] = isFaulted;
        bitIndex++;
      }
    }

    if (this.onGridUpdateCallback) {
      this.onGridUpdateCallback(faultGrid, timestampMs);
    }
  }
}
