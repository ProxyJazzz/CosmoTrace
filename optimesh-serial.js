/**
 * OptiMesh EVA — Web Serial bridge
 * Connects to ESP32 over USB, parses "F,<ts>,<hex25>" frames,
 * and calls onGridUpdate(faultGrid) where faultGrid is a 10x10
 * boolean array: faultGrid[x][y] === true means that junction is FAULTED.
 *
 * Drop this into your existing frontend and wire onGridUpdate to
 * whatever function currently lights up cells based on the numbers
 * you were reading before.
 *
 * Requires Chrome or Edge (Web Serial API). No internet required —
 * this is a direct USB connection, everything runs locally.
 */

const GRID_X = 10;
const GRID_Y = 10;

class OptiMeshSerial {
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
    this._readLoop(); // fire and forget
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
    // Only care about frame lines: F,<ts>,<hex25>
    if (line[0] !== "F") return;

    const parts = line.split(",");
    if (parts.length !== 3) return;

    const hex = parts[2].trim();
    if (hex.length !== 25) return; // malformed frame, drop it silently

    const faultGrid = this._hexToGrid(hex);
    this.onGridUpdate(faultGrid);
  }

  _hexToGrid(hex) {
    // 25 hex chars = 100 bits, row-major: bit i -> x = floor(i/10), y = i%10
    const grid = Array.from({ length: GRID_X }, () => new Array(GRID_Y).fill(false));

    let bits = "";
    for (const ch of hex) {
      bits += parseInt(ch, 16).toString(2).padStart(4, "0");
    }
    // bits now length 100

    for (let i = 0; i < GRID_X * GRID_Y; i++) {
      const x = Math.floor(i / GRID_Y);
      const y = i % GRID_Y;
      grid[x][y] = bits[i] === "1";
    }
    return grid;
  }
}

// ---------------------------------------------------------------
// USAGE EXAMPLE — wire this into your existing grid-lighting code
// ---------------------------------------------------------------
//
// const bridge = new OptiMeshSerial(
//   (faultGrid) => {
//     for (let x = 0; x < 10; x++) {
//       for (let y = 0; y < 10; y++) {
//         const cellEl = document.getElementById(`cell-${x}-${y}`);
//         if (!cellEl) continue;
//         cellEl.classList.toggle("damaged", faultGrid[x][y]);
//       }
//     }
//   },
//   (status, msg) => {
//     document.getElementById("status").textContent = msg;
//   }
// );
//
// document.getElementById("connectBtn").addEventListener("click", () => {
//   bridge.connect(115200).catch(console.error);
// });

export { OptiMeshSerial };
