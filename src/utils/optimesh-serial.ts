/// <reference types="w3c-web-serial" />

/**
 * OptiMeshSerial - Web Serial API bridge for CD74HC4067 multiplexed ESP32 fiber optic grid.
 * Parses frames formatted as: F,<timestamp_ms>,<25-char-hex-bitmask>\n
 */

export interface ChannelEntry {
  firmwareKey: string;
  value: number;
  fault: boolean;
}

export type ChannelMap = Record<number, ChannelEntry>;

export const FAULT_THRESHOLD = 200; // ADC below this = fault. Healthy baseline ~450-550.

export function studioChannelToFirmwareKey(studioChannelNum: number): string {
  if (studioChannelNum <= 65) return `X${studioChannelNum}`;
  return `Y${studioChannelNum - 65}`;
}

export function firmwareKeyToStudioChannel(firmwareKey: string): number | null {
  const match = firmwareKey.match(/^([XY])(\d+)$/);
  if (!match) return null;
  const [, axis, numStr] = match;
  const num = parseInt(numStr, 10);
  return axis === 'X' ? num : num + 65;
}

export class OptiMeshSerial {
  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private keepReading = false;
  private onGridUpdateCallback: ((channelMap: ChannelMap) => void) | null = null;
  private onStatusChangeCallback: ((connected: boolean, message?: string) => void) | null = null;

  constructor(
    onGridUpdate?: (channelMap: ChannelMap) => void,
    onStatusChange?: (connected: boolean, message?: string) => void
  ) {
    if (onGridUpdate) this.onGridUpdateCallback = onGridUpdate;
    if (onStatusChange) this.onStatusChangeCallback = onStatusChange;
  }

  public setGridUpdateCallback(cb: (channelMap: ChannelMap) => void) {
    this.onGridUpdateCallback = cb;
  }

  public setStatusChangeCallback(cb: (connected: boolean, message?: string) => void) {
    this.onStatusChangeCallback = cb;
  }

  /**
   * Opens user serial port picker and connects at target baud rate (default 115200)
   */
  public async connect(baudRate = 115200): Promise<boolean> {
    if (!('serial' in navigator)) {
      if (this.onStatusChangeCallback) {
        this.onStatusChangeCallback(false, 'Web Serial not supported — use Chrome or Edge.');
      }
      throw new Error('Web Serial API is not supported in this browser. Please use Chrome, Edge, or Opera over HTTPS/localhost.');
    }

    try {
      const serial = (navigator as unknown as { serial: Serial }).serial;
      this.port = await serial.requestPort();
      await this.port.open({ baudRate });
      this.keepReading = true;

      if (this.onStatusChangeCallback) this.onStatusChangeCallback(true, 'ESP32 connected');

      // Start reading stream in background
      this.readLoop();
      return true;
    } catch (err: any) {
      console.error('Failed to connect over Web Serial:', err);
      const errMsg = err?.message || 'Failed to open serial port';
      if (this.onStatusChangeCallback) this.onStatusChangeCallback(false, errMsg);
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

    if (this.onStatusChangeCallback) this.onStatusChangeCallback(false, 'ESP32 disconnected');
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
            this.parseLine(line.trim());
          }
        }
      }
    } catch (error: any) {
      console.error('Error reading serial stream:', error);
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
   * Parses JSON line format: {"X1":542,"X2":509,...,"Y55":515}
   */
  private parseLine(line: string): void {
    if (!line.startsWith('{')) return;

    let reading: Record<string, number>;
    try {
      reading = JSON.parse(line);
    } catch (e) {
      return;
    }

    const channelMap: ChannelMap = {};
    for (const key of Object.keys(reading)) {
      const value = reading[key];
      if (typeof value !== 'number') continue;
      const studioChannel = firmwareKeyToStudioChannel(key);
      if (studioChannel === null) continue;
      channelMap[studioChannel] = {
        firmwareKey: key,
        value,
        fault: value < FAULT_THRESHOLD
      };
    }

    if (this.onGridUpdateCallback) {
      this.onGridUpdateCallback(channelMap);
    }
  }
}
