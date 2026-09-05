// ============================================================
// OptiMesh EVA - FINAL Adaptive Fiber Fault Detector
//
// 16 LDRs through 2 x 16-channel analog multiplexers
//
// MUX1 SIG -> GPIO34 : R1-R8
// MUX2 SIG -> GPIO35 : R9-R10, CA-CF
//
// S0 = GPIO16
// S1 = GPIO17
// S2 = GPIO18
// S3 = GPIO19
//
// JSON output format:
//
// {
//   "grid":{"rows":10,"cols":6},
//   "readings":{
//      "R1":3700,
//      ...
//      "CF":3850
//   },
//   "status":"OK",
//   "faults":[]
// }
//
// If faults exist:
//
// "status":"FAULT",
// "faults":["R4","CC"]
// ============================================================

#define MUX1_SIG 34
#define MUX2_SIG 35

#define S0 16
#define S1 17
#define S2 18
#define S3 19

#define NUM_SENSORS 16

const char *names[NUM_SENSORS] = {"R1", "R2", "R3", "R4",  "R5", "R6",
                                  "R7", "R8", "R9", "R10", "CA", "CB",
                                  "CC", "CD", "CE", "CF"};

// ------------------------------------------------------------
// Calibration
// ------------------------------------------------------------

#define CALIBRATION_SAMPLES 50

// Percentage drop required for suspicion
const float DROP_LIMIT = 3.0;

// Minimum ADC drop required
const int MIN_DROP_ADC = 80;

// Consecutive suspicious scans required
#define REQUIRED_BAD_SCANS 3

// ------------------------------------------------------------

float baseline[NUM_SENSORS];
int badCount[NUM_SENSORS];

// ------------------------------------------------------------
// MUX CHANNEL SELECT
// ------------------------------------------------------------

void selectChannel(int ch) {

  digitalWrite(S0, ch & 1);
  digitalWrite(S1, (ch >> 1) & 1);
  digitalWrite(S2, (ch >> 2) & 1);
  digitalWrite(S3, (ch >> 3) & 1);
}

// ------------------------------------------------------------
// READ MUX
// ------------------------------------------------------------

int readMux(int muxPin, int channel) {

  selectChannel(channel);

  delayMicroseconds(100);

  // Dummy read after switching MUX
  analogRead(muxPin);

  // Actual reading
  return analogRead(muxPin);
}

// ------------------------------------------------------------
// READ SENSOR
// ------------------------------------------------------------

int readSensor(int sensor) {

  if (sensor < 8) {

    return readMux(MUX1_SIG, sensor);

  } else {

    return readMux(MUX2_SIG, sensor - 8);
  }
}

// ------------------------------------------------------------
// CALIBRATION
// ------------------------------------------------------------

void calibrateSensors() {

  Serial.println();
  Serial.println("======================================");
  Serial.println(" CALIBRATING FIBER SYSTEM");
  Serial.println("======================================");
  Serial.println("IMPORTANT:");
  Serial.println("LED must be ON.");
  Serial.println("Fiber must be GOOD / INTACT.");
  Serial.println("Keep sensors stationary.");
  Serial.println();

  long sums[NUM_SENSORS];

  for (int i = 0; i < NUM_SENSORS; i++) {

    sums[i] = 0;
    badCount[i] = 0;
  }

  // ----------------------------------------------------------
  // Collect calibration samples
  // ----------------------------------------------------------

  for (int sample = 0; sample < CALIBRATION_SAMPLES; sample++) {

    for (int sensor = 0; sensor < NUM_SENSORS; sensor++) {

      int value = readSensor(sensor);

      sums[sensor] += value;
    }

    delay(20);
  }

  // ----------------------------------------------------------
  // Calculate baseline
  // ----------------------------------------------------------

  Serial.println("Baseline values:");

  for (int sensor = 0; sensor < NUM_SENSORS; sensor++) {

    baseline[sensor] = (float)sums[sensor] / CALIBRATION_SAMPLES;

    Serial.print(names[sensor]);
    Serial.print(" = ");
    Serial.println(baseline[sensor], 1);
  }

  Serial.println();
  Serial.println("Calibration complete.");
  Serial.println("Starting fault detection...");
  Serial.println("======================================");
  Serial.println();

  delay(1000);
}

// ------------------------------------------------------------
// PRINT JSON
// ------------------------------------------------------------

void printJSON(int values[], bool faultState) {

  Serial.print("{");

  // Grid
  Serial.print("\"grid\":{");
  Serial.print("\"rows\":10,");
  Serial.print("\"cols\":6");
  Serial.print("},");

  // Readings
  Serial.print("\"readings\":{");

  for (int i = 0; i < NUM_SENSORS; i++) {

    Serial.print("\"");
    Serial.print(names[i]);
    Serial.print("\":");
    Serial.print(values[i]);

    if (i < NUM_SENSORS - 1) {
      Serial.print(",");
    }
  }

  Serial.print("},");

  // Status
  Serial.print("\"status\":\"");

  if (faultState) {
    Serial.print("FAULT");
  } else {
    Serial.print("OK");
  }

  Serial.print("\",");

  // Fault list
  Serial.print("\"faults\":[");

  bool firstFault = true;

  for (int i = 0; i < NUM_SENSORS; i++) {

    if (badCount[i] >= REQUIRED_BAD_SCANS) {

      if (!firstFault) {
        Serial.print(",");
      }

      Serial.print("\"");
      Serial.print(names[i]);
      Serial.print("\"");

      firstFault = false;
    }
  }

  Serial.print("]");

  Serial.println("}");
}

// ------------------------------------------------------------
// SETUP
// ------------------------------------------------------------

void setup() {

  Serial.begin(115200);

  pinMode(S0, OUTPUT);
  pinMode(S1, OUTPUT);
  pinMode(S2, OUTPUT);
  pinMode(S3, OUTPUT);

  analogReadResolution(12);

  delay(1000);

  calibrateSensors();
}

// ------------------------------------------------------------
// MAIN DETECTOR
// ------------------------------------------------------------

void loop() {

  int values[NUM_SENSORS];

  // ----------------------------------------------------------
  // Read all 16 sensors
  // ----------------------------------------------------------

  for (int sensor = 0; sensor < NUM_SENSORS; sensor++) {

    values[sensor] = readSensor(sensor);
  }

  // ----------------------------------------------------------
  // Calculate average relative change
  // ----------------------------------------------------------

  float totalRatio = 0;

  for (int sensor = 0; sensor < NUM_SENSORS; sensor++) {

    if (baseline[sensor] > 0) {

      float ratio = (float)values[sensor] / baseline[sensor];

      totalRatio += ratio;
    }
  }

  float averageRatio = totalRatio / NUM_SENSORS;

  // ----------------------------------------------------------
  // Check each sensor
  // ----------------------------------------------------------

  bool anyFault = false;

  for (int sensor = 0; sensor < NUM_SENSORS; sensor++) {

    // --------------------------------------------------------
    // Absolute drop
    // --------------------------------------------------------

    float drop =
        ((baseline[sensor] - values[sensor]) / baseline[sensor]) * 100.0;

    float difference = baseline[sensor] - values[sensor];

    // --------------------------------------------------------
    // Normalized ratio
    // --------------------------------------------------------

    float normalizedRatio =
        ((float)values[sensor] / baseline[sensor]) / averageRatio;

    float normalizedDrop = (1.0 - normalizedRatio) * 100.0;

    // --------------------------------------------------------
    // Suspicious decision
    // --------------------------------------------------------

    bool suspicious = false;

    // Absolute drop test
    if (drop >= DROP_LIMIT && difference >= MIN_DROP_ADC) {

      suspicious = true;
    }

    // Relative sensor-to-array test
    if (normalizedDrop >= 2.5) {

      suspicious = true;
    }

    // --------------------------------------------------------
    // Consecutive reading filter
    // --------------------------------------------------------

    if (suspicious) {

      badCount[sensor]++;

    } else {

      // Slowly recover
      if (badCount[sensor] > 0) {

        badCount[sensor]--;
      }
    }

    // --------------------------------------------------------
    // Final fault state
    // --------------------------------------------------------

    if (badCount[sensor] >= REQUIRED_BAD_SCANS) {

      anyFault = true;
    }
  }

  // ----------------------------------------------------------
  // SEND JSON
  // ----------------------------------------------------------

  printJSON(values, anyFault);

  // ----------------------------------------------------------
  // Scan interval
  // ----------------------------------------------------------

  delay(500);
}