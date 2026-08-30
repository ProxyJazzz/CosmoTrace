# CosmoTrace — Spacesuit Integrity Monitor

CosmoTrace is a real-time monitoring dashboard for an ESP32-based optical-fiber sensor network embedded inside an astronaut spacesuit. It visualizes 120 sensor channels (X1-X65, Y1-Y55) and identifies the exact location of suspected punctures on an interactive 3D spacesuit.

## How to run the app

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

3. Open your browser to the local URL provided by Vite (usually `http://localhost:5173`).

4. Toggle "Demo Mode" in the top right to simulate incoming sensor data and occasional faults.

## Placing a real GLB suit model

To load your real astronaut spacesuit into CosmoTrace:

1. Export your Blender model as a **glTF Binary** (`.glb`) file.
2. Name the exported file exactly `spacesuit.glb`.
3. Copy it into the `public/models/` folder.
4. Restart the Vite development server after adding or replacing the file if the changes don't appear automatically.

The dashboard will automatically detect the model, enable shadows on its meshes, and display it inside the 3D view.

*Note: You can adjust the scale, rotation, and position offsets of the model in `src/components/3d/spacesuitConfig.ts` to ensure it fits perfectly into the scene.*

## Fibre Mapping Studio & Calibration

CosmoTrace includes a dedicated operator tool called **Fibre Mapping Studio**, accessible via the "Calibration Studio" button in the dashboard.

This tool is used to map every physical optical-fibre sensing point onto the imported 3D spacesuit model. The saved map allows live faults (like X38 or Y12) to appear at their precise physical location on the suit.

### Calibration Workflow

1. **Open Studio**: Click the "Calibration Studio" button on the top right.
2. **Select Sensor**: In the left panel, select an unmapped sensor channel (e.g. `X1`).
3. **Assign Route**: In the right panel, select or create an active Fibre Route (e.g. `FIBRE-X-01`).
4. **Map to Suit**: Click directly on the 3D spacesuit model where the physical sensor is located. This will instantly save the exact `[x, y, z]` and UV coordinates. The distance along the fibre route is automatically calculated.
5. **Export Data**: Once mapping is complete, click **Export JSON**.
6. **Save Map**: Replace the existing `src/data/fibreCalibrationMap.json` file in your repository with your newly downloaded file to permanently save it.

### JSON Data Schema

The exported `fibreCalibrationMap.json` follows this schema for each of the 120 sensor channels:

```json
{
  "X38": {
    "id": "X38",
    "fibreId": "FIBRE-X-01",
    "region": "torso_front",
    "label": "Calibration map - torso_front X38",
    "position": [ 0.15, -0.42, 0.88 ],
    "uv": [ 0.25, 0.75 ],
    "distanceAlongFibreMm": 1500,
    "sensorSpacingMm": 50,
    "confidence": "calibrated"
  }
}
```

*Note: The `confidence` field will be `placeholder` until a point is explicitly mapped by an operator using the studio tool.*

## Glove Control Center & Glove Calibration

CosmoTrace includes a dedicated standalone page and calibration workspace for astronaut gloves:
- **Glove Control Center** (`/gloves`): A glove-specific live telemetry dashboard featuring 12 glove zone overviews (Left/Right palm, thumb, index, middle, ring, little finger), glove KPIs, glove diagnostics, and glove-only event logging.
- **Glove Calibration Studio** (`/gloves/calibration`): An interactive 3D mapping workspace using the dedicated `/models/gloves.glb` model.

### Glove Model Loading
- Place the 3D Blender glove model at: `public/models/gloves.glb`.
- Adjust model scaling or position offsets in `src/components/3d/gloveConfig.ts`.

### Glove Calibration Workflow
1. Navigate to `/gloves` and click **Glove Calibration** (or open `/gloves/calibration`).
2. Select a glove sensor channel (e.g. `X1`), hand (`left` or `right`), and finger/palm region.
3. Select or create an active Fibre Route (e.g. `GLOVE-L-01` or `GLOVE-R-01`).
4. Click directly on the 3D glove model mesh surface to save `[x, y, z]` and `[u, v]` coordinates.
5. Click **Export JSON** and replace `src/data/gloveCalibrationMap.json` in your repository.

### Glove Calibration JSON Data Schema

```json
{
  "X1": {
    "id": "X1",
    "hand": "left",
    "finger": "index",
    "region": "left_index_finger",
    "label": "Glove map - left_index_finger X1",
    "position": [ -0.3, 0.05, 0.1 ],
    "uv": [ 0.5, 0.5 ],
    "fibreId": "GLOVE-L-01",
    "distanceAlongFibreMm": 250,
    "sensorSpacingMm": 25,
    "confidence": "calibrated"
  }
}
```

## Contributing

Contributions are welcome. Please ensure that all new components follow the existing design system and use CSS Modules for styling.

## Expected WebSocket Data Format

The dashboard expects live WebSocket data on `ws://localhost:3000` (configurable in `src/App.tsx`). The ESP32 should send JSON payloads in the following format:

```json
{
  "timestamp": 1760000000000,
  "raw": {
    "X1": 510,
    "X2": 498,
    "Y1": 503
  },
  "perChannel": {
    "X1": "OK",
    "X2": "BROKEN",
    "Y1": "OK"
  },
  "zoneStatus": {
    "fingers": "OK",
    "palm": "BROKEN",
    "wrist": "OK",
    "arm": "OK"
  },
  "brokenChannels": ["X2"]
}
```
* Note: A channel is considered faulty when its `perChannel` status is `"BROKEN"`. The UI currently treats raw readings below `100` as the fault threshold when running in Simulation mode.
