// ============================================================
// OptiMesh EVA — Auto-Calibrating Detection Firmware (v4, final)
// Matches your exact hardware: MUX1 (GPIO34) = R1-R8,
// MUX2 (GPIO35) = R9,R10,CA-CF, shared select pins GPIO16-19.
//
// KEY CHANGE FROM v2: instead of trusting hardcoded
// ambientBaseline[] and expectedSignal[] values captured in a
// separate session (which may not match today's actual fiber
// contact quality), this firmware calibrates BOTH automatically
// every time it boots -- using whatever physical contact/
// alignment exists RIGHT NOW as the working baseline.
//
// This is more robust for a demo where you may not have time to
// physically inspect/reseat every fiber beforehand: the system
// adapts to today's real coupling quality instead of assuming
// yesterday's numbers still apply.
//
// NEW IN v4: the JSON output now includes a "calibration" block
// so your WEBSITE can display calibration health directly
// (which sensors are saturated/weak), not just Arduino IDE's
// Serial Monitor. This is computed once at boot and stays fixed
// for the session (it describes the calibration quality, not a
// live reading), so your frontend can show a one-time "sensor
// health" panel if useful.
//
// BOOT SEQUENCE:
// 1. Prompts you to make sure fiber-end LEDs are OFF, waits, then
//    captures ambientBaseline[] (same as the standalone
//    calibration tool did, just built into main firmware now).
// 2. Prompts you to turn fiber-end LEDs ON, waits, then captures
//    expectedSignal[] = (fiber-ON reading - ambientBaseline) for
//    each sensor automatically.
// 3. Then runs normal detection using these freshly-measured
//    values, with the same rolling-baseline + debounce logic
//    from v2 layered on top for ongoing stability.
//
// IMPORTANT: if a sensor is SATURATED (fiber-ON reading pinned
// at/near 4095) during this boot calibration, its expectedSignal
// will be based on a compressed/clipped value -- meaning that
// sensor's strength% calculation will be less sensitive to real
// damage than a properly-exposed sensor. The firmware flags this
// at boot AND in every JSON line's "calibration" block, so you
// know which sensors to trust less without needing Serial Monitor
// open during a live demo.
// ============================================================

const int MUX1_SIG = 34;
const int MUX2_SIG = 35;
const int S0 = 16;
const int S1 = 17;
const int S2 = 18;
const int S3 = 19;
const int NUM_SENSORS = 16;

const char *sensorNames[NUM_SENSORS] = {"R1", "R2", "R3", "R4",  "R5", "R6",
                                        "R7", "R8", "R9", "R10", "CA", "CB",
                                        "CC", "CD", "CE", "CF"};

float ambientBaseline[NUM_SENSORS];
float expectedSignal[NUM_SENSORS];
bool sensorSaturated[NUM_SENSORS];
bool sensorWeak[NUM_SENSORS];

const float MIN_TRUSTWORTHY_SIGNAL = 50.0; // below this, flagged "weak" at boot
const float MIN_EXPECTED_SIGNAL_FLOOR =
    20.0; // hard floor to avoid near-zero-divide amplification

const float NORMAL_THRESHOLD = 70.0;
const float WARNING_THRESHOLD = 40.0;
const int NUM_SAMPLES = 10;
const int CAL_SAMPLES = 20; // more samples during boot calibration specifically

const float BASELINE_ADAPT_RATE = 0.02;
const int DEBOUNCE_COUNT = 5;
int consecutiveFaultCount[NUM_SENSORS] = {0};
const char *debouncedStatus[NUM_SENSORS];
const int COMMON_MODE_SENSOR_COUNT = 10;

void setMuxChannel(int channel) {
  digitalWrite(S0, channel & 0x01);
  digitalWrite(S1, (channel >> 1) & 0x01);
  digitalWrite(S2, (channel >> 2) & 0x01);
  digitalWrite(S3, (channel >> 3) & 0x01);
  delayMicroseconds(100);
}

int readAveragedADC(int pin, int sampleCount) {
  analogRead(pin);
  long total = 0;
  for (int i = 0; i < sampleCount; i++) {
    total += analogRead(pin);
    delayMicroseconds(100);
  }
  return total / sampleCount;
}

void readAllSensors(int *results, int sampleCount) {
  for (int ch = 0; ch < 8; ch++) {
    setMuxChannel(ch);
    results[ch] = readAveragedADC(MUX1_SIG, sampleCount);
  }
  for (int ch = 0; ch < 8; ch++) {
    setMuxChannel(ch);
    results[8 + ch] = readAveragedADC(MUX2_SIG, sampleCount);
  }
}

float calculateStrength(int sensorIndex, int adcValue) {
  float signal = adcValue - ambientBaseline[sensorIndex];
  if (signal <= 0)
    return 0;
  if (expectedSignal[sensorIndex] <= 0)
    return 0; // avoid divide-by-zero if calibration failed
  float strength = (signal / expectedSignal[sensorIndex]) * 100.0;
  if (strength < 0)
    strength = 0;
  if (strength > 100)
    strength = 100;
  return strength;
}

const char *getRawStatus(float strength) {
  if (strength >= NORMAL_THRESHOLD)
    return "NORMAL";
  if (strength >= WARNING_THRESHOLD)
    return "WARNING";
  return "FAULT";
}

bool isHealthy(float strength) { return strength >= NORMAL_THRESHOLD; }

void runBootCalibration() {
  Serial.println();
  Serial.println("========================================================");
  Serial.println("OptiMesh EVA — Auto-Calibration (runs every boot)");
  Serial.println("========================================================");
  Serial.println("STEP 1/2: Turn fiber-end LEDs OFF now.");
  Serial.print("Capturing ambient baseline in 5 seconds...");
  for (int i = 0; i < 5; i++) {
    delay(1000);
    Serial.print(".");
  }
  Serial.println();

  int ambientReadings[NUM_SENSORS];
  readAllSensors(ambientReadings, CAL_SAMPLES);
  for (int i = 0; i < NUM_SENSORS; i++) {
    ambientBaseline[i] = ambientReadings[i];
  }

  Serial.println("Ambient baseline captured.");
  Serial.println();
  Serial.println("STEP 2/2: Turn fiber-end LEDs ON now.");
  Serial.print("Capturing fiber-ON signal in 8 seconds (LED warm-up time)...");
  for (int i = 0; i < 8; i++) {
    delay(1000);
    Serial.print(".");
  }
  Serial.println();

  int fiberOnReadings[NUM_SENSORS];
  readAllSensors(fiberOnReadings, CAL_SAMPLES);

  Serial.println();
  Serial.println("Sensor | Ambient | Fiber-ON | expectedSignal | Status");
  Serial.println("-------|---------|----------|-----------------|--------");
  for (int i = 0; i < NUM_SENSORS; i++) {
    expectedSignal[i] = fiberOnReadings[i] - ambientBaseline[i];
    sensorSaturated[i] = (fiberOnReadings[i] >= 4090);
    sensorWeak[i] =
        (!sensorSaturated[i] && expectedSignal[i] < MIN_TRUSTWORTHY_SIGNAL);

    // Guard against a near-zero or negative expectedSignal (would make
    // strength% wildly oversensitive, since it's a division denominator).
    if (expectedSignal[i] < MIN_EXPECTED_SIGNAL_FLOOR) {
      expectedSignal[i] = MIN_EXPECTED_SIGNAL_FLOOR;
    }

    Serial.print(sensorNames[i]);
    Serial.print("\t");
    Serial.print(ambientBaseline[i], 0);
    Serial.print("\t");
    Serial.print(fiberOnReadings[i]);
    Serial.print("\t");
    Serial.print(expectedSignal[i], 1);
    Serial.print("\t");
    if (sensorSaturated[i]) {
      Serial.println("SATURATED -- reduced sensitivity, check fiber alignment");
    } else if (sensorWeak[i]) {
      Serial.println("WEAK SIGNAL -- check fiber coupling");
    } else {
      Serial.println("OK");
    }
  }
  Serial.println();
  Serial.println("Calibration complete. Starting live detection...");
  Serial.println("========================================================");
  Serial.println();
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  pinMode(S0, OUTPUT);
  pinMode(S1, OUTPUT);
  pinMode(S2, OUTPUT);
  pinMode(S3, OUTPUT);
  pinMode(MUX1_SIG, INPUT);
  pinMode(MUX2_SIG, INPUT);
  analogReadResolution(12);
  analogSetPinAttenuation(MUX1_SIG, ADC_11db);
  analogSetPinAttenuation(MUX2_SIG, ADC_11db);

  for (int i = 0; i < NUM_SENSORS; i++) {
    debouncedStatus[i] = "NORMAL";
  }

  runBootCalibration();
}

void loop() {
  int rawADC[NUM_SENSORS];
  float strength[NUM_SENSORS];
  const char *rawStatus[NUM_SENSORS];

  readAllSensors(rawADC, NUM_SAMPLES);
  for (int i = 0; i < NUM_SENSORS; i++) {
    strength[i] = calculateStrength(i, rawADC[i]);
    rawStatus[i] = getRawStatus(strength[i]);
  }

  int droppedCount = 0;
  for (int i = 0; i < NUM_SENSORS; i++) {
    if (strength[i] < NORMAL_THRESHOLD)
      droppedCount++;
  }
  bool ambientShiftDetected = (droppedCount >= COMMON_MODE_SENSOR_COUNT);

  if (ambientShiftDetected) {
    for (int i = 0; i < NUM_SENSORS; i++) {
      ambientBaseline[i] = rawADC[i];
      consecutiveFaultCount[i] = 0;
      debouncedStatus[i] = "NORMAL";
    }
  } else {
    for (int i = 0; i < NUM_SENSORS; i++) {
      if (isHealthy(strength[i])) {
        ambientBaseline[i] = ambientBaseline[i] * (1.0 - BASELINE_ADAPT_RATE) +
                             rawADC[i] * BASELINE_ADAPT_RATE;
      }
    }
    for (int i = 0; i < NUM_SENSORS; i++) {
      if (strength[i] < NORMAL_THRESHOLD) {
        consecutiveFaultCount[i]++;
      } else {
        consecutiveFaultCount[i] = 0;
        debouncedStatus[i] = "NORMAL";
      }
      if (consecutiveFaultCount[i] >= DEBOUNCE_COUNT) {
        debouncedStatus[i] = rawStatus[i];
      }
    }
  }

  // ---- JSON output (same shape as v1/v2) ----
  Serial.print("{\"grid\":{\"rows\":10,\"cols\":6},");

  Serial.print("\"readings\":{");
  for (int i = 0; i < NUM_SENSORS; i++) {
    Serial.print("\"");
    Serial.print(sensorNames[i]);
    Serial.print("\":");
    Serial.print((int)round(strength[i]));
    if (i < NUM_SENSORS - 1)
      Serial.print(",");
  }
  Serial.print("},");

  Serial.print("\"status\":{");
  for (int i = 0; i < NUM_SENSORS; i++) {
    Serial.print("\"");
    Serial.print(sensorNames[i]);
    Serial.print("\":\"");
    Serial.print(debouncedStatus[i]);
    Serial.print("\"");
    if (i < NUM_SENSORS - 1)
      Serial.print(",");
  }
  Serial.print("},");

  Serial.print("\"raw\":{");
  for (int i = 0; i < NUM_SENSORS; i++) {
    Serial.print("\"");
    Serial.print(sensorNames[i]);
    Serial.print("\":");
    Serial.print(rawADC[i]);
    if (i < NUM_SENSORS - 1)
      Serial.print(",");
  }
  Serial.print("},");

  // Calibration health, fixed since boot -- lets the website show
  // sensor trust/quality without needing Serial Monitor.
  Serial.print("\"calibration\":{");
  for (int i = 0; i < NUM_SENSORS; i++) {
    Serial.print("\"");
    Serial.print(sensorNames[i]);
    Serial.print("\":\"");
    if (sensorSaturated[i]) {
      Serial.print("saturated");
    } else if (sensorWeak[i]) {
      Serial.print("weak");
    } else {
      Serial.print("ok");
    }
    Serial.print("\"");
    if (i < NUM_SENSORS - 1)
      Serial.print(",");
  }
  Serial.print("}");

  Serial.println("}");

  delay(100);
}