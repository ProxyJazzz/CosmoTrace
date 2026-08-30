import React, { useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Grid, Bounds } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import { SpacesuitModel } from '../../components/3d/SpacesuitModel';
import { spacesuitConfig } from '../../components/3d/spacesuitConfig';
import { useAppStore } from '../../store/useAppStore';
import { useCalibrationStore } from '../../store/useCalibrationStore';
import { CalibrationOverlays } from './CalibrationOverlays';

const Controls: React.FC = () => {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  return <OrbitControls ref={controlsRef} makeDefault minDistance={0.5} maxDistance={5} enablePan={true} />;
};

export const CalibrationScene: React.FC = () => {
  const { calibrationMap, setCalibrationMap } = useAppStore();
  const { selectedSensorId, activeFibreRoute, setHasUnsavedChanges } = useCalibrationStore();

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (!selectedSensorId) return;

    // We must apply the inverse of the spacesuitConfig to the point if the SpacesuitModel handles its own transforms.
    // Wait, the point provided by React Three Fiber is in WORLD coordinates. 
    // Since SpacesuitModel has its own scale/position/rotation, if we want the point relative to the model, we can use e.point directly and store it as world coordinates, because our markers apply the SAME spacesuitConfig transformation! 
    // Actually, e.point is WORLD space. If SensorMarkers applies the same spacesuitConfig to its parent group, the positions in SENSOR_MAP MUST BE IN LOCAL SPACE of the model, NOT world space!
    // But `e.intersections[0].point` is world space. We should use `e.intersections[0].object.worldToLocal(e.point.clone())` to get it in local space.
    // However, the spacesuitConfig is applied to the `<primitive>` root object. If we use `e.point` (world) and then in SensorMarkers we wrap it in a `<group scale={...}>`, we'd be double applying the transform.
    // Let's store local coordinates!
    
    // Convert world point to local point relative to the GLB root if needed. 
    // `e.point` is world space. The object clicked is a child of the primitive.
    
    // Instead of doing complicated math, R3F's `e.point` is world space. 
    // But wait! If we store `e.point` (world) and in the Dashboard we DON'T wrap SensorMarkers in `spacesuitConfig` group, it works.
    // BUT we ALREADY DO wrap SensorMarkers in `spacesuitConfig` group in `Scene.tsx`. So the map MUST store local coordinates.
    // Wait, `e.point` is world space. If we wrap the `<SpacesuitModel>` inside a group, `e.point` is still world.
    // To get the local point relative to spacesuitConfig, we can just inverse-transform it.
    const worldPoint = e.point.clone();
    
    // Inverse spacesuitConfig
    
    // Better way: Apply Matrix4 invert
    const matrix = new THREE.Matrix4();
    matrix.compose(
      new THREE.Vector3(...spacesuitConfig.position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...spacesuitConfig.rotation)),
      new THREE.Vector3(spacesuitConfig.scale, spacesuitConfig.scale, spacesuitConfig.scale)
    );
    matrix.invert();
    const localPoint = worldPoint.applyMatrix4(matrix);

    const position: [number, number, number] = [localPoint.x, localPoint.y, localPoint.z];
    const uv: [number, number] | undefined = e.uv ? [e.uv.x, e.uv.y] : undefined;

    // Calculate distance if on a fibre route
    let distanceAlongFibreMm = 0;
    let sensorSpacingMm = 0;
    
    if (activeFibreRoute && activeFibreRoute !== 'UNASSIGNED') {
      // Find all existing sensors on this route
      const sensorsOnRoute = Object.values(calibrationMap)
        .filter(s => s.fibreId === activeFibreRoute && s.confidence === 'calibrated')
        .sort((a, b) => parseInt(a.id.slice(1)) - parseInt(b.id.slice(1)));

      if (sensorsOnRoute.length > 0) {
        // We will calculate distance from the last sensor in the chain
        const lastSensor = sensorsOnRoute[sensorsOnRoute.length - 1];
        
        // Calculate 3D distance between local points (in meters usually, convert to mm)
        const p1 = new THREE.Vector3(...lastSensor.position);
        const p2 = localPoint;
        const distMeters = p1.distanceTo(p2);
        
        // spacesuit config scale affects real physical distance? 
        // If the model is 1:1, 1 unit = 1 meter.
        sensorSpacingMm = distMeters * 1000;
        distanceAlongFibreMm = lastSensor.distanceAlongFibreMm + sensorSpacingMm;
      }
    }

    const newMap = { ...calibrationMap };
    newMap[selectedSensorId] = {
      ...newMap[selectedSensorId],
      position,
      uv,
      fibreId: activeFibreRoute || 'UNASSIGNED',
      distanceAlongFibreMm,
      sensorSpacingMm,
      confidence: 'calibrated'
    };
    
    setCalibrationMap(newMap);
    setHasUnsavedChanges(true);
  };

  return (
    <Canvas shadows camera={{ position: [0, 1.5, 3], fov: 45 }}>
      <color attach="background" args={['#020813']} />
      <ambientLight intensity={0.4} />
      <directionalLight 
        position={[5, 5, 5]} 
        intensity={1} 
        castShadow 
        shadow-mapSize={[2048, 2048]} 
      />
      <directionalLight position={[-5, 3, -5]} intensity={0.5} />
      
      <Grid position={[0, -0.5, 0]} args={[10, 10]} cellColor="#00f0ff" sectionColor="#00f0ff" sectionThickness={1} cellThickness={0.5} fadeDistance={15} />

      <Bounds fit clip observe margin={1.2}>
        <SpacesuitModel onClick={handlePointerDown} />
        
        {/* Render markers relative to the imported GLB model configuration */}
        <group 
          scale={spacesuitConfig.scale} 
          position={spacesuitConfig.position} 
          rotation={spacesuitConfig.rotation}
        >
          <CalibrationOverlays />
        </group>
      </Bounds>
      
      <Controls />
    </Canvas>
  );
};
