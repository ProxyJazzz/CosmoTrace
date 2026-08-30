# 3D Model Import Instructions

To load your real astronaut spacesuit into CosmoTrace:

1. Export your Blender model as a **glTF Binary** (`.glb`) file.
2. Name the exported file exactly `spacesuit.glb`.
3. Copy it into this `public/models/` folder.
4. Restart the Vite development server after adding or replacing the file if the changes don't appear automatically.

The dashboard will automatically detect the model, enable shadows on its meshes, and display it inside the 3D view.

*Note: You can adjust the scale, rotation, and position offsets of the model in `src/components/3d/spacesuitConfig.ts` to ensure it fits perfectly into the scene.*
