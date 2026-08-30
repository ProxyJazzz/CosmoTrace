/*
  OptiMesh EVA — Fiber Grid Scanner (V1 prototype)
  ESP32 + 2x CD74HC4067 16-channel muxes
  10 X-fibers (emitters, horizontal) x 10 Y-fibers (receivers, vertical)

  WIRING (adjust pins to your actual build):
  --------------------------------------------
  MUX 1 (X side - LED emitters, driven one at a time):
    S0 -> GPIO 16
    S1 -> GPIO 17
    S2 -> GPIO 18
    S3 -> GPIO 19
    SIG/COM -> connects to a transistor/driver feeding the selected LED
               (or directly to a GPIO output pin acting as the LED source
               if current is low enough — use a resistor either way)

  MUX 2 (Y side - phototransistor receivers, read one at a time):
    S0 -> GPIO 21
    S1 -> GPIO 22
    S2 -> GPIO 23
    S3 -> GPIO 25
    SIG/COM -> ESP32 ADC pin, GPIO 34 (input-only, no pull needed)

  Each phototransistor receiver sits in a voltage divider so SIG reads
  HIGH-ish (near VCC) when light is received, and drops LOW when the
  fiber path is broken/misaligned (no light reaching the receiver).

  PROTOCOL (over USB serial, 115200 baud):
  --------------------------------------------
  Each full scan cycle emits ONE line:

    F,<timestamp_ms>,<bitmask_hex>\n

  bitmask_hex = 100-bit grid (10x10) packed as 25 hex chars (100 bits),
  MSB-first, row-major (X0Y0, X0Y1, ... X0Y9, X1Y0, ...).
  A '1' bit = FAULT (broken/blocked fiber junction), '0' = OK.

  Example:
    F,184320,0000000000000000000000004\n
    (only the last junction, X9Y9, is faulted)

  This keeps the line short, fixed-format, and trivial to parse in JS
  with no JSON overhead — good for a tight polling loop over Web Serial.

  A human-readable companion line is also sent for debugging:
    D,X<i>,Y<j>,<adc_value>,<FAULT|OK>\n
  You can filter these out in the frontend if you only want the F, line.
*/

#include <Arduino.h>

// ---- Mux control pins (X side - emitter select) ----
const int X_S0 = 16;
const int X_S1 = 17;
const int X_S2 = 18;
const int X_S3 = 19;
const int X_EN_PIN = 4;   // optional: drives the selected LED/emitter row (via transistor)

// ---- Mux control pins (Y side - receiver select) ----
const int Y_S0 = 21;
const int Y_S1 = 22;
const int Y_S2 = 23;
const int Y_S3 = 25;
const int Y_SIG = 34;     // ADC input from selected phototransistor

const int GRID_X = 10;
const int GRID_Y = 10;

// ---- Calibration ----
// ADC below this = fiber broken / light blocked. Tune after running
// the CALIBRATION routine below on a known-good glove.
int FAULT_THRESHOLD = 1500;   // 0-4095 range on ESP32 ADC (12-bit)
const int SAMPLES_PER_JUNCTION = 4;   // averaging to reduce noise
const int SETTLE_US = 150;            // delay after mux switch before reading

bool faultGrid[GRID_X][GRID_Y];
bool prevFaultGrid[GRID_X][GRID_Y];

void selectMuxChannel(int s0, int s1, int s2, int s3, int channel) {
  digitalWrite(s0, (channel >> 0) & 0x01);
  digitalWrite(s1, (channel >> 1) & 0x01);
  digitalWrite(s2, (channel >> 2) & 0x01);
  digitalWrite(s3, (channel >> 3) & 0x01);
}

void setup() {
  Serial.begin(115200);
  delay(300);

  pinMode(X_S0, OUTPUT); pinMode(X_S1, OUTPUT);
  pinMode(X_S2, OUTPUT); pinMode(X_S3, OUTPUT);
  pinMode(X_EN_PIN, OUTPUT);

  pinMode(Y_S0, OUTPUT); pinMode(Y_S1, OUTPUT);
  pinMode(Y_S2, OUTPUT); pinMode(Y_S3, OUTPUT);
  pinMode(Y_SIG, INPUT);

  analogReadResolution(12); // 0-4095

  memset(faultGrid, 0, sizeof(faultGrid));
  memset(prevFaultGrid, 0, sizeof(prevFaultGrid));

  Serial.println("R,OptiMesh EVA scanner ready");
}

int readJunction(int xi, int yi) {
  selectMuxChannel(X_S0, X_S1, X_S2, X_S3, xi);
  digitalWrite(X_EN_PIN, HIGH);      // energize this emitter row
  selectMuxChannel(Y_S0, Y_S1, Y_S2, Y_S3, yi);
  delayMicroseconds(SETTLE_US);

  long sum = 0;
  for (int s = 0; s < SAMPLES_PER_JUNCTION; s++) {
    sum += analogRead(Y_SIG);
  }
  digitalWrite(X_EN_PIN, LOW);       // de-energize before next channel
  return sum / SAMPLES_PER_JUNCTION;
}

void scanGrid() {
  for (int xi = 0; xi < GRID_X; xi++) {
    for (int yi = 0; yi < GRID_Y; yi++) {
      int adc = readJunction(xi, yi);
      bool fault = (adc < FAULT_THRESHOLD);
      faultGrid[xi][yi] = fault;

      // Debug line — comment out once frontend integration is stable,
      // it roughly doubles serial traffic.
      Serial.print("D,X"); Serial.print(xi);
      Serial.print(",Y"); Serial.print(yi);
      Serial.print(","); Serial.print(adc);
      Serial.print(","); Serial.println(fault ? "FAULT" : "OK");
    }
  }
}

void sendFrame() {
  // Pack 100 bits row-major into 25 hex chars.
  char hexbuf[26];
  hexbuf[25] = '\0';

  uint8_t bitBuf[13] = {0}; // 100 bits -> 13 bytes (104 bits, top 4 unused)
  int bitIndex = 0;
  for (int xi = 0; xi < GRID_X; xi++) {
    for (int yi = 0; yi < GRID_Y; yi++) {
      if (faultGrid[xi][yi]) {
        int byteIdx = bitIndex / 8;
        int bitOff = 7 - (bitIndex % 8);
        bitBuf[byteIdx] |= (1 << bitOff);
      }
      bitIndex++;
    }
  }

  // Convert 13 bytes -> 26 hex chars, then trim to 25 (last nibble unused,
  // since 100 bits = 25 hex chars exactly if we pack tightly instead).
  // Simpler: build hex directly from the bit buffer as nibbles.
  int nibbleCount = 25; // 100 bits / 4 = 25 nibbles exactly
  for (int n = 0; n < nibbleCount; n++) {
    int bitStart = n * 4;
    uint8_t nibble = 0;
    for (int b = 0; b < 4; b++) {
      int bi = bitStart + b;
      bool bit = false;
      if (bi < 100) {
        int byteIdx = bi / 8;
        int bitOff = 7 - (bi % 8);
        bit = (bitBuf[byteIdx] >> bitOff) & 0x01;
      }
      nibble = (nibble << 1) | (bit ? 1 : 0);
    }
    hexbuf[n] = nibble < 10 ? ('0' + nibble) : ('A' + nibble - 10);
  }

  Serial.print("F,");
  Serial.print(millis());
  Serial.print(",");
  Serial.println(hexbuf);
}

void loop() {
  scanGrid();
  sendFrame();
  delay(200); // ~5 scans/sec — adjust for how fast you want the UI to react
}
