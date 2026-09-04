const fs = require('fs');

const map = {};

// -------------------------------------------------------------
// OPTIMESH EVA GLOVE & GAUNTLET MULTI-ZONE MESH MAP
// 
// 1. 5 Finger Vertical Wires (Fingertips to Knuckles):
//    - Y_Thumb, Y_Index, Y_Middle, Y_Ring, Y_Little (3 dots each)
// 
// 2. 10 Horizontal Lines from Knuckles to Forearm (Equally Spaced):
//    - 1 to 10 (Row 1 to 10)
// 
// 3. 6 Vertical Lines from Knuckles to Forearm:
//    - A to F (Col A to F)
// -------------------------------------------------------------

const fingerNames = [
  { finger: 'thumb', label: 'Thumb', region: 'thumb', code: 'TH' },
  { finger: 'index', label: 'Index Finger', region: 'index_finger', code: 'IF' },
  { finger: 'middle', label: 'Middle Finger', region: 'middle_finger', code: 'MF' },
  { finger: 'ring', label: 'Ring Finger', region: 'ring_finger', code: 'RF' },
  { finger: 'little', label: 'Little Finger', region: 'little_finger', code: 'LF' }
];

const vertLetters = ['A', 'B', 'C', 'D', 'E', 'F'];

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

  // 2. 10 Horizontal Lines from Knuckles to Elbow (Row 1 to 10, equally spaced)
  for (let i = 1; i <= 10; i++) {
    const wireId = `${prefix}-${i}`;
    const yNorm = 0.12 - ((i - 1) * (0.40 / 9));
    map[wireId] = {
      id: wireId,
      hand,
      finger: i <= 5 ? 'palm' : 'forearm',
      region: i <= 5 ? `${hand}_palm` : `${hand}_forearm`,
      label: `${hand.toUpperCase()} — Horizontal Wire ${i} [Row ${i}/10 Knuckles-to-Elbow]`,
      position: [xBase, yNorm, 0],
      uv: [0.5, 0.5],
      fibreId: `${prefix}-HORIZ-BUS`,
      distanceAlongFibreMm: (i - 1) * 15,
      sensorSpacingMm: 15,
      confidence: 'calibrated'
    };
  }

  // 3. 6 Vertical Lines from Knuckles to Elbow (A to F)
  vertLetters.forEach((letter, colIdx) => {
    const wireId = `${prefix}-${letter}`;
    const xPos = isLeft ? (-0.38 + colIdx * 0.032) : (0.38 - colIdx * 0.032);

    map[wireId] = {
      id: wireId,
      hand,
      finger: 'palm',
      region: `${hand}_palm`,
      label: `${hand.toUpperCase()} — Vertical Wire ${letter} [Col ${letter}/F Knuckles-to-Elbow]`,
      position: [xPos, 0.0, 0.02],
      uv: [0.5, 0.5],
      fibreId: `${prefix}-VERT-BUS`,
      distanceAlongFibreMm: colIdx * 25,
      sensorSpacingMm: 25,
      confidence: 'calibrated'
    };
  });
});

fs.writeFileSync('src/data/gloveCalibrationMap.json', JSON.stringify(map, null, 2));
console.log('Successfully generated gloveCalibrationMap.json with', Object.keys(map).length, 'channels.');
