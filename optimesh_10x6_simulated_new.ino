/*
  OptiMesh EVA — SIMULATED LDR Data Generator (for frontend testing)
  10 Horizontal (Row 1-10) x 6 Vertical (Col A-F) grid

  This version does NOT read real LDR hardware yet. It generates random
  light-intensity values every cycle so you can test the website's live
  fault display before your physical wiring/mux is fully connected.

  WHAT "CAPACITY" MEANS HERE:
  Each LDR's reading is expressed as a percentage of its expected full-
  light baseline (0-100%). Below 50% capacity = flagged as FAULT (assumed
  broken/blocked fiber). This matches what you asked for -- a simple,
  demoable threshold -- rather than the raw ADC-value threshold used in
  earlier versions. Once you wire real LDRs, replace SIMULATE_DATA with
  false and fill in real analogRead() calls (marked below) using the same
  0-100% conversion so the JSON format and threshold logic stay identical.

  OUTPUT FORMAT (over USB serial, 115200 baud), once per cycle:

    {"grid":{"rows":10,"cols":6},
     "readings":{
       "R1":87,"R2":91,...,"R10":45,
       "CA":78,"CB":33,...,"CF":90
     },
     "faults":{"rows":[10],"cols":["B"]}
    }

  - "readings" gives every fiber's capacity percentage (0-100), keyed
    R1..R10 for the 10 horizontal (row) fibers and CA..CF for the 6
    vertical (column) fibers -- matching your frontend's "Row 1..Row 10"
    and "Col A..Col F" labeling directly, no translation needed on the
    JS side.
  - "faults" separately lists which rows/cols are currently below the
    50% threshold, as plain arrays -- your frontend can use this
    directly to light up red without recomputing anything, while still
    having the raw percentages available if you want to show a number.
*/

#include <Arduino.h>

const bool SIMULATE_DATA = true;  // set false once real LDR wiring is ready

const int NUM_ROWS = 10;  // horizontal fibers
const int NUM_COLS = 6;   // vertical fibers
const int FAULT_THRESHOLD_PERCENT = 50;

const char* COL_LETTERS = "ABCDEF";

// ---- Real hardware pins (used only when SIMULATE_DATA = false) ----
const int MUX_S0 = 16;
const int MUX_S1 = 17;
const int MUX_S2 = 18;
const int MUX_S3 = 19;
const int MUX_SIG = 34;

// Calibration baseline for converting raw ADC -> percentage, once real
// LDRs are wired. Set these after reading actual healthy-fiber values.
int ADC_MIN = 0;     // reading when fully dark (0% light)
int ADC_MAX = 4095;  // reading when fully lit (100% light)
bool FAULT_ON_HIGH_ADC = true; // true if darkness gives a HIGHER raw ADC reading (see wiring note below)

void selectMuxChannel(int channel) {
  digitalWrite(MUX_S0, (channel >> 0) & 0x01);
  digitalWrite(MUX_S1, (channel >> 1) & 0x01);
  digitalWrite(MUX_S2, (channel >> 2) & 0x01);
  digitalWrite(MUX_S3, (channel >> 3) & 0x01);
}

// Converts a raw ADC reading to a 0-100% "light capacity" value.
// If FAULT_ON_HIGH_ADC is true, darkness = high ADC, so we invert.
int adcToPercent(int adcValue) {
  int pct = map(adcValue, ADC_MIN, ADC_MAX, 0, 100);
  if (FAULT_ON_HIGH_ADC) pct = 100 - pct;
  return constrain(pct, 0, 100);
}

int readRowPercent(int rowIndex) {
  // rowIndex 0-9 -> mux channel 0-9 (adjust if your physical wiring differs)
  selectMuxChannel(rowIndex);
  delayMicroseconds(200);
  long sum = 0;
  for (int s = 0; s < 6; s++) sum += analogRead(MUX_SIG);
  return adcToPercent(sum / 6);
}

int readColPercent(int colIndex) {
  // colIndex 0-5 -> mux channel 10-15 (rows occupy 0-9, cols occupy 10-15)
  selectMuxChannel(NUM_ROWS + colIndex);
  delayMicroseconds(200);
  long sum = 0;
  for (int s = 0; s < 6; s++) sum += analogRead(MUX_SIG);
  return adcToPercent(sum / 6);
}

int simulateRowPercent(int rowIndex) {
  // Mostly healthy (70-100%), occasionally a low outlier to simulate a fault.
  // ~10% chance any given fiber reads as damaged this cycle.
  if (random(0, 100) < 10) {
    return random(5, 40); // simulated fault: well below the 50% threshold
  }
  return random(70, 101); // healthy range
}

void setup() {
  Serial.begin(115200);
  delay(300);

  pinMode(MUX_S0, OUTPUT);
  pinMode(MUX_S1, OUTPUT);
  pinMode(MUX_S2, OUTPUT);
  pinMode(MUX_S3, OUTPUT);
  pinMode(MUX_SIG, INPUT);
  analogReadResolution(12);

  randomSeed(analogRead(35)); // floating pin for entropy; change if 35 is used elsewhere

  Serial.println("R,OptiMesh simulator ready (10 Row x 6 Col)");
  if (SIMULATE_DATA) {
    Serial.println("R,SIMULATE_DATA = true -- output is RANDOM, not real sensor data.");
  }
}

void loop() {
  int rowPct[NUM_ROWS];
  int colPct[NUM_COLS];

  for (int r = 0; r < NUM_ROWS; r++) {
    rowPct[r] = SIMULATE_DATA ? simulateRowPercent(r) : readRowPercent(r);
  }
  for (int c = 0; c < NUM_COLS; c++) {
    colPct[c] = SIMULATE_DATA ? simulateRowPercent(c) : readColPercent(c);
  }

  // Build fault lists
  int faultRows[NUM_ROWS];
  int faultRowCount = 0;
  for (int r = 0; r < NUM_ROWS; r++) {
    if (rowPct[r] < FAULT_THRESHOLD_PERCENT) faultRows[faultRowCount++] = r + 1;
  }
  char faultCols[NUM_COLS];
  int faultColCount = 0;
  for (int c = 0; c < NUM_COLS; c++) {
    if (colPct[c] < FAULT_THRESHOLD_PERCENT) faultCols[faultColCount++] = COL_LETTERS[c];
  }

  // ---- Emit JSON ----
  Serial.print("{\"grid\":{\"rows\":");
  Serial.print(NUM_ROWS);
  Serial.print(",\"cols\":");
  Serial.print(NUM_COLS);
  Serial.print("},\"readings\":{");

  for (int r = 0; r < NUM_ROWS; r++) {
    Serial.print("\"R"); Serial.print(r + 1); Serial.print("\":");
    Serial.print(rowPct[r]);
    Serial.print(",");
  }
  for (int c = 0; c < NUM_COLS; c++) {
    Serial.print("\"C"); Serial.print(COL_LETTERS[c]); Serial.print("\":");
    Serial.print(colPct[c]);
    if (c < NUM_COLS - 1) Serial.print(",");
  }

  Serial.print("},\"faults\":{\"rows\":[");
  for (int i = 0; i < faultRowCount; i++) {
    Serial.print(faultRows[i]);
    if (i < faultRowCount - 1) Serial.print(",");
  }
  Serial.print("],\"cols\":[");
  for (int i = 0; i < faultColCount; i++) {
    Serial.print("\""); Serial.print(faultCols[i]); Serial.print("\"");
    if (i < faultColCount - 1) Serial.print(",");
  }
  Serial.println("]}}");

  delay(500); // half-second refresh -- adjust for how fast you want the UI updating
}
