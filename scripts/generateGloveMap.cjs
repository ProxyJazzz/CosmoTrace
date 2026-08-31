const fs = require('fs');

const map = {};

// -------------------------------------------------------------
// OPTIMESH EVA GLOVE & GAUNTLET MULTI-ZONE MESH MAP
// 
// 1. 5 Finger Vertical Wires (Fingertips to Knuckles):
//    - Y_Thumb, Y_Index, Y_Middle, Y_Ring, Y_Little (3 dots each)
// 
// 2. 24 Horizontal Lines from Knuckles to Elbow (Equally Spaced):
//    - X1 to X24
// 
// 3. 20 Vertical Lines from Knuckles to Elbow:
//    - Front Hand (Palmar): Y1 to Y10
//    - Back Hand (Dorsal): Y11 to Y20
// -------------------------------------------------------------

const fingerNames = [
  { finger: 'thumb', label: 'Thumb', region: 'thumb', code: 'TH' },
  { finger: 'index', label: 'Index Finger', region: 'index_finger', code: 'IF' },
  { finger: 'middle', label: 'Middle Finger', region: 'middle_finger', code: 'MF' },
  { finger: 'ring', label: 'Ring Finger', region: 'ring_finger', code: 'RF' },
  { finger: 'little', label: 'Little Finger', region: 'little_finger', code: 'LF' }
];

['left', 'right'].forEach(hand => {
  const isLeft = hand === 'left';
  const prefix = isLeft ? 'L' : 'R';
  const xBase = isLeft ? -0.3 : 0.3;

  // 1. Five Finger Vertical Wires (1 per finger)
  fingerNames.forEach((f, idx) => {
    const wireId = `${prefix}-Y-${f.code}`;
    map[wireId] = {
      id: wireId,
      hand,
      finger: f.finger,
      region: `${hand}_${f.region}`,
      label: `${hand.toUpperCase()} — Finger Vertical Wire [${f.label}]`,
      position: [xBase + (idx - 2) * 0.04, 0.15, 0],
      uv: [0.5, 0.5],
      fibreId: `${prefix}-FINGER-VERT`,
      distanceAlongFibreMm: 120,
      sensorSpacingMm: 40,
      confidence: 'calibrated'
    };
  });

  // 2. 24 Horizontal Lines from Knuckles to Elbow (X1 to X24, equally spaced)
  for (let i = 1; i <= 24; i++) {
    const wireId = `${prefix}-X${i}`;
    const yNorm = 0.12 - ((i - 1) * (0.40 / 23));
    map[wireId] = {
      id: wireId,
      hand,
      finger: i <= 10 ? 'palm' : 'forearm',
      region: i <= 10 ? `${hand}_palm` : `${hand}_forearm`,
      label: `${hand.toUpperCase()} — Horizontal Wire X${i} [Knuckles to Elbow Row ${i}/24]`,
      position: [xBase, yNorm, 0],
      uv: [0.5, 0.5],
      fibreId: `${prefix}-HORIZ-BUS`,
      distanceAlongFibreMm: (i - 1) * 16,
      sensorSpacingMm: 16,
      confidence: 'calibrated'
    };
  }

  // 3. 20 Vertical Lines from Knuckles to Elbow (Y1 to Y20)
  // - Y1 to Y10: Front Hand (Palmar)
  // - Y11 to Y20: Back Hand (Dorsal)
  for (let j = 1; j <= 20; j++) {
    const wireId = `${prefix}-Y${j}`;
    const isFront = j <= 10;
    const colIdx = isFront ? (j - 1) : (j - 11);
    const aspect = isFront ? 'Front (Palmar)' : 'Back (Dorsal)';
    const xPos = isLeft ? (-0.38 + colIdx * 0.016) : (0.38 - colIdx * 0.016);

    map[wireId] = {
      id: wireId,
      hand,
      finger: 'palm',
      region: `${hand}_palm`,
      label: `${hand.toUpperCase()} — Vertical Wire Y${j} [${aspect} Col ${colIdx + 1}/10 Knuckles-to-Elbow]`,
      position: [xPos, 0.0, isFront ? 0.02 : -0.02],
      uv: [0.5, 0.5],
      fibreId: `${prefix}-VERT-BUS-${isFront ? 'FRONT' : 'BACK'}`,
      distanceAlongFibreMm: colIdx * 15,
      sensorSpacingMm: 15,
      confidence: 'calibrated'
    };
  }
});

fs.writeFileSync('src/data/gloveCalibrationMap.json', JSON.stringify(map, null, 2));
console.log('Successfully generated gloveCalibrationMap.json with', Object.keys(map).length, 'channels.');
