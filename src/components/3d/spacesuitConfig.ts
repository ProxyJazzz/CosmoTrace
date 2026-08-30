// Configuration for the imported Blender GLB spacesuit model.
// Adjust these values after importing your final model so that it fits well in the scene.
export const spacesuitConfig = {
  scale: 1,
  // Adjust position [x, y, z] to center the model if it wasn't centered in Blender
  position: [0, -1, 0] as [number, number, number],
  // Adjust rotation [x, y, z] in radians if the model faces the wrong way
  rotation: [0, 0, 0] as [number, number, number],
};
