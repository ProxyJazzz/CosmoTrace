/**
 * OptiMesh EVA — Web Serial bridge (v2)
 * Matches the ACTUAL firmware currently running on the ESP32, which streams
 * one flat JSON object per line, e.g.:
 *
 *   {"X1":542,"X2":509,...,"X65":532,"Y1":547,"Y2":23,...,"Y55":515}
 *
 * 65 X-channels + 55 Y-channels = 120 total, matching the Glove Calibration
 * Studio's 120 named channels (X1-X120 in the UI maps to X1-X65 + Y1-Y55
 * here — see CHANNEL NUMBERING NOTE below).
 *
 * Each value is a raw ADC reading (roughly 450-550 when healthy). A value
 * far below baseline (isolated low outlier) indicates a broken/blocked
 * fiber junction. FAULT_THRESHOLD below is a starting point — tune it
 * once you have more real readings from intentionally broken fibers.
 *
 * CHANNEL NUMBERING (CONFIRMED):
 * Calibration Studio's channel list (X1-X120, e.g. X1=Left-Thumb,
 * X2=Left-Index...) maps onto firmware keys as:
 *   Studio X1  .. X65  -> firmware "X1".."X65"   (horizontal fibers)
 *   Studio X66 .. X120 -> firmware "Y1".."Y55"   (vertical fibers)
 * i.e. Studio channel number N maps to firmware key "X"+N for N<=65,
 * and firmware key "Y"+(N-65) for N>65. studioChannelToFirmwareKey()
 * and firmwareKeyToStudioChannel() below implement this both ways.
 */

export function studioChannelToFirmwareKey(studioChannelNum) {
  if (studioChannelNum <= 65) return `X${studioChannelNum}`;
  return `Y${studioChannelNum - 65}`;
}

export function firmwareKeyToStudioChannel(firmwareKey) {
  const match = firmwareKey.match(/^([XY])(\d+)$/);
  if (!match) return null;
  const [, axis, numStr] = match;
  const num = parseInt(numStr, 10);
  return axis === "X" ? num : num + 65;
}

export const FAULT_THRESHOLD = 200; // ADC below this = fault. Healthy baseline ~450-550.

export class OptiMeshSerial {
  constructor(onGridUpdate, onStatus) {
    this.port = null;
    this.reader = null;
    this.onGridUpdate = onGridUpdate || (() => {});
    this.onStatus = onStatus || (() => {});
    this.lineBuffer = "";
    this.keepReading = false;
  }

  async connect(baudRate = 115200) {
    if (!("serial" in navigator)) {
      this.onStatus("error", "Web Serial not supported — use Chrome or Edge.");
      throw new Error("Web Serial API unavailable");
    }

    this.port = await navigator.serial.requestPort();
    await this.port.open({ baudRate });
    this.onStatus("connected", "ESP32 connected");

    this.keepReading = true;
    this._readLoop();
  }

  async disconnect() {
    this.keepReading = false;
    if (this.reader) {
      await this.reader.cancel().catch(() => {});
    }
    if (this.port) {
      await this.port.close().catch(() => {});
    }
    this.onStatus("disconnected", "ESP32 disconnected");
  }

  async _readLoop() {
    const decoder = new TextDecoderStream();
    const inputDone = this.port.readable.pipeTo(decoder.writable);
    const inputStream = decoder.readable;
    this.reader = inputStream.getReader();

    try {
      while (this.keepReading) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (value) this._handleChunk(value);
      }
    } catch (err) {
      this.onStatus("error", "Serial read error: " + err.message);
    } finally {
      this.reader.releaseLock();
    }
  }

  _handleChunk(chunk) {
    this.lineBuffer += chunk;
    let idx;
    while ((idx = this.lineBuffer.indexOf("\n")) >= 0) {
      const line = this.lineBuffer.slice(0, idx).trim();
      this.lineBuffer = this.lineBuffer.slice(idx + 1);
      if (line.length > 0) this._handleLine(line);
    }
  }

  _handleLine(line) {
    // Expecting a flat JSON object like {"X1":542,"X2":509,...,"Y55":515}
    if (line[0] !== "{") return; // not a data line, ignore silently

    let reading;
    try {
      reading = JSON.parse(line);
    } catch (e) {
      // Malformed/partial line - drop it, next line will likely be clean.
      return;
    }

    // Keyed by Studio channel number (1-120) so the caller can look up
    // zone names directly from the Calibration Studio export without
    // doing any X/Y translation itself.
    const channelMap = {}; // e.g. { 1: {firmwareKey: "X1", value: 542, fault: false}, ... }
    for (const key of Object.keys(reading)) {
      const value = reading[key];
      if (typeof value !== "number") continue;
      const studioChannel = firmwareKeyToStudioChannel(key);
      if (studioChannel === null) continue; // unrecognized key, skip
      channelMap[studioChannel] = {
        firmwareKey: key,
        value,
        fault: value < FAULT_THRESHOLD,
      };
    }

    this.onGridUpdate(channelMap);
  }
}
