const fs = require('fs');

const map = {};

// -------------------------------------------------------------
// ZONE 1: Hand / Glove
// - Vertical wires: Y1 (Thumb), Y2 (Index), Y3 (Middle), Y4 (Ring), Y5 (Little)
// - Horizontal wires: X1 to X20 (from knuckles down across palm to wrist)
// - 3 dots per finger on Y1..Y5
// -------------------------------------------------------------

const z1FingerNames = [
  { finger: 'thumb', label: 'Thumb', region: 'thumb' },
  { finger: 'index', label: 'Index Finger', region: 'index_finger' },
  { finger: 'middle', label: 'Middle Finger', region: 'middle_finger' },
  { finger: 'ring', label: 'Ring Finger', region: 'ring_finger' },
  { finger: 'little', label: 'Little Finger', region: 'little_finger' }
];

['left', 'right'].forEach(hand => {
  const isLeft = hand === 'left';
  const prefix = isLeft ? 'L' : 'R';
  const xBase = isLeft ? -0.3 : 0.3;

  // 1. Zone 1: Vertical Finger Wires Y1..Y5
  z1FingerNames.forEach((f, idx) => {
    const wireId = `Z1-${prefix}-Y${idx + 1}`;
    map[wireId] = {
      id: wireId,
      hand,
      finger: f.finger,
      region: `${hand}_${f.region}`,
      label: `Zone 1 (${hand.toUpperCase()}) — Vertical Wire Y${idx + 1} [${f.label}]`,
      position: [xBase + (idx - 2) * 0.04, 0.15, 0],
      uv: [0.5, 0.5],
      fibreId: `Z1-${prefix}-VERT`,
      distanceAlongFibreMm: 120,
      sensorSpacingMm: 40,
      confidence: 'calibrated'
    };
  });

  // 2. Zone 1: 20 Horizontal Wires X1..X20 exclusively on Knuckles (MCP Knuckle Band)
  for (let i = 1; i <= 20; i++) {
    const wireId = `Z1-${prefix}-X${i}`;
    const yPos = 0.08 - ((i - 1) * 0.002);
    map[wireId] = {
      id: wireId,
      hand,
      finger: 'palm',
      region: `${hand}_palm`,
      label: `Zone 1 (${hand.toUpperCase()}) — Knuckle Wire X${i} [Knuckle Band Row ${i}/20]`,
      position: [xBase, yPos, 0],
      uv: [0.5, 0.5],
      fibreId: `Z1-${prefix}-KNUCKLE-HORIZ`,
      distanceAlongFibreMm: (i - 1) * 3,
      sensorSpacingMm: 3,
      confidence: 'calibrated'
    };
  }

  // 3. Zone 2: Wrist to Elbow (Forearm)
  // - 24 Horizontal Wires (X1..X24)
  for (let i = 1; i <= 24; i++) {
    const wireId = `Z2-${prefix}-X${i}`;
    const yPos = -0.15 - ((i - 1) * 0.015);
    map[wireId] = {
      id: wireId,
      hand,
      finger: 'forearm',
      region: `${hand}_forearm`,
      label: `Zone 2 (${hand.toUpperCase()}) Forearm — Horizontal Wire X${i} [Row ${i}/24]`,
      position: [xBase, yPos, 0],
      uv: [0.5, 0.5],
      fibreId: `Z2-${prefix}-HORIZ`,
      distanceAlongFibreMm: (i - 1) * 15,
      sensorSpacingMm: 15,
      confidence: 'calibrated'
    };
  }

  // - 20 Vertical Wires (Y1..Y20)
  for (let j = 1; j <= 20; j++) {
    const wireId = `Z2-${prefix}-Y${j}`;
    const xColPos = xBase + ((j - 10.5) * 0.006);
    map[wireId] = {
      id: wireId,
      hand,
      finger: 'forearm',
      region: `${hand}_forearm`,
      label: `Zone 2 (${hand.toUpperCase()}) Forearm — Vertical Wire Y${j} [Col ${j}/20]`,
      position: [xColPos, -0.3, 0],
      uv: [0.5, 0.5],
      fibreId: `Z2-${prefix}-VERT`,
      distanceAlongFibreMm: (j - 1) * 15,
      sensorSpacingMm: 15,
      confidence: 'calibrated'
    };
  }
});

fs.writeFileSync('src/data/gloveCalibrationMap.json', JSON.stringify(map, null, 2));
console.log('Created multi-zone gloveCalibrationMap.json with', Object.keys(map).length, 'channels.');
