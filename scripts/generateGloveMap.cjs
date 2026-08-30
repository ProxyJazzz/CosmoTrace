const fs = require('fs');

const leftRegions = [
  { region: 'left_palm', finger: 'palm' },
  { region: 'left_thumb', finger: 'thumb' },
  { region: 'left_index_finger', finger: 'index' },
  { region: 'left_middle_finger', finger: 'middle' },
  { region: 'left_ring_finger', finger: 'ring' },
  { region: 'left_little_finger', finger: 'little' }
];

const rightRegions = [
  { region: 'right_palm', finger: 'palm' },
  { region: 'right_thumb', finger: 'thumb' },
  { region: 'right_index_finger', finger: 'index' },
  { region: 'right_middle_finger', finger: 'middle' },
  { region: 'right_ring_finger', finger: 'ring' },
  { region: 'right_little_finger', finger: 'little' }
];

const map = {};

for (let i = 1; i <= 65; i++) {
  const id = 'X' + i;
  const isLeft = i <= 32;
  const hand = isLeft ? 'left' : 'right';
  const regionList = isLeft ? leftRegions : rightRegions;
  const item = regionList[i % regionList.length];
  
  map[id] = {
    id,
    hand,
    finger: item.finger,
    region: item.region,
    label: `Glove map - ${item.region} ${id}`,
    position: [isLeft ? -0.3 : 0.3, (i % 5) * 0.1 - 0.2, (i % 3) * 0.1 - 0.1],
    uv: [0.5, 0.5],
    fibreId: isLeft ? 'GLOVE-L-01' : 'GLOVE-R-01',
    distanceAlongFibreMm: 0,
    sensorSpacingMm: 0,
    confidence: 'placeholder'
  };
}

for (let i = 1; i <= 55; i++) {
  const id = 'Y' + i;
  const isLeft = i <= 27;
  const hand = isLeft ? 'left' : 'right';
  const regionList = isLeft ? leftRegions : rightRegions;
  const item = regionList[i % regionList.length];

  map[id] = {
    id,
    hand,
    finger: item.finger,
    region: item.region,
    label: `Glove map - ${item.region} ${id}`,
    position: [isLeft ? -0.3 : 0.3, (i % 5) * 0.1 - 0.2, (i % 3) * 0.1 - 0.1],
    uv: [0.5, 0.5],
    fibreId: isLeft ? 'GLOVE-L-01' : 'GLOVE-R-01',
    distanceAlongFibreMm: 0,
    sensorSpacingMm: 0,
    confidence: 'placeholder'
  };
}

fs.writeFileSync('src/data/gloveCalibrationMap.json', JSON.stringify(map, null, 2));
console.log('Created gloveCalibrationMap.json successfully');
