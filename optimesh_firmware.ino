/*
  OptiMesh EVA — Fiber Grid Scanner
  ESP32 + CD74HC4067 Mux Matrix
  24 X-fibers (horizontal emitters: knuckles downward X1..X24)
  20 Y-fibers (vertical receivers: Y1..Y10 Front Palmar, Y11..Y20 Back Dorsal)

  WIRING (adjust pins to your actual build):
  --------------------------------------------
  MUX 1/2 (X side - LED emitters, driven one at a time):
    S0 -> GPIO 16
    S1 -> GPIO 17
    S2 -> GPIO 18
    S3 -> GPIO 19
    SIG/COM -> connects to transistor/driver feeding the selected LED emitter

  MUX 3/4 (Y side - phototransistor receivers, read one at a time):
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

  bitmask_hex = 480-bit grid (24x20) packed as hex chars,
  MSB-first, row-major (X1Y1, X1Y2, ... X1Y20, X2Y1, ...).
  A '1' bit = FAULT (broken/blocked fiber junction), '0' = OK.
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

const int GRID_X = 24;
const int GRID_Y = 20;

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
  // Pack 120 bits row-major into 30 hex chars (120 bits / 4 = 30 hex chars).
  char hexbuf[31];
  hexbuf[30] = '\0';

  uint8_t bitBuf[15] = {0}; // 120 bits -> 15 bytes (15 * 8 = 120 bits exactly)
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

  int nibbleCount = 30; // 120 bits / 4 = 30 nibbles exactly
  for (int n = 0; n < nibbleCount; n++) {
    int bitStart = n * 4;
    uint8_t nibble = 0;
    for (int b = 0; b < 4; b++) {
      int bi = bitStart + b;
      bool bit = false;
      if (bi < 120) {
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
