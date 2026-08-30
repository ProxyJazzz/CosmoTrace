// Configuration for the imported Blender GLB gloves model.
export const gloveConfig = {
  scale: 1,
  position: [0, 0, 0] as [number, number, number],
  rotation: [0, 0, 0] as [number, number, number],
  // View preset offsets for camera framing
  viewPresets: {
    both: { position: [0, 0, 2.5], target: [0, 0, 0] },
    left: { position: [-0.4, 0, 1.8], target: [-0.3, 0, 0] },
    right: { position: [0.4, 0, 1.8], target: [0.3, 0, 0] },
  }
};
