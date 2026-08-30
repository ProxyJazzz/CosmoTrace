import React, { useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Grid, Bounds } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import { GloveModel } from '../../components/3d/GloveModel';
import { gloveConfig } from '../../components/3d/gloveConfig';
import { useAppStore } from '../../store/useAppStore';
import { useGloveCalibrationStore } from '../../store/useGloveCalibrationStore';
import { GloveCalibrationOverlays } from './GloveCalibrationOverlays';
import type { GloveCalibrationMap } from '../../types';

const Controls: React.FC = () => {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  return <OrbitControls ref={controlsRef} makeDefault minDistance={0.3} maxDistance={5} enablePan={true} />;
};

interface GloveCalibrationSceneProps {
  onAddHistoryEntry?: (previousMap: GloveCalibrationMap) => void;
}

export const GloveCalibrationScene: React.FC<GloveCalibrationSceneProps> = ({ onAddHistoryEntry }) => {
  const { gloveCalibrationMap, setGloveCalibrationMap } = useAppStore();
  const { selectedSensorId, activeFibreRoute, setHasUnsavedChanges } = useGloveCalibrationStore();

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (!selectedSensorId) return;

    const currentSensor = gloveCalibrationMap[selectedSensorId];
    if (!currentSensor) return;

    // Check if replacing an existing mapped sensor and confirm if so
    if (currentSensor.confidence === 'calibrated') {
      const confirmReplace = window.confirm(
        `Sensor ${selectedSensorId} is already mapped at [${currentSensor.position.map(n => n.toFixed(2)).join(', ')}]. Replace mapping?`
      );
      if (!confirmReplace) return;
    }

    // Save history before mutating
    if (onAddHistoryEntry) {
      onAddHistoryEntry({ ...gloveCalibrationMap });
    }

    const worldPoint = e.point.clone();
    
    // Matrix4 invert for gloveConfig
    const matrix = new THREE.Matrix4();
    matrix.compose(
      new THREE.Vector3(...gloveConfig.position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...gloveConfig.rotation)),
      new THREE.Vector3(gloveConfig.scale, gloveConfig.scale, gloveConfig.scale)
    );
    matrix.invert();
    const localPoint = worldPoint.applyMatrix4(matrix);

    const position: [number, number, number] = [localPoint.x, localPoint.y, localPoint.z];
    const uv: [number, number] | undefined = e.uv ? [e.uv.x, e.uv.y] : undefined;

    // Distance calculation along active route
    let distanceAlongFibreMm = 0;
    let sensorSpacingMm = 0;
    
    if (activeFibreRoute && activeFibreRoute !== 'UNASSIGNED') {
      const sensorsOnRoute = Object.values(gloveCalibrationMap)
        .filter(s => s.fibreId === activeFibreRoute && s.confidence === 'calibrated' && s.id !== selectedSensorId)
        .sort((a, b) => parseInt(a.id.slice(1)) - parseInt(b.id.slice(1)));

      if (sensorsOnRoute.length > 0) {
        const lastSensor = sensorsOnRoute[sensorsOnRoute.length - 1];
        const p1 = new THREE.Vector3(...lastSensor.position);
        const p2 = localPoint;
        const distMeters = p1.distanceTo(p2);
        
        sensorSpacingMm = Math.round(distMeters * 1000);
        distanceAlongFibreMm = lastSensor.distanceAlongFibreMm + sensorSpacingMm;
      }
    }

    const newMap: GloveCalibrationMap = {
      ...gloveCalibrationMap,
      [selectedSensorId]: {
        ...currentSensor,
        position,
        uv,
        fibreId: activeFibreRoute || currentSensor.fibreId || 'GLOVE-L-01',
        distanceAlongFibreMm,
        sensorSpacingMm,
        confidence: 'calibrated'
      }
    };
    
    setGloveCalibrationMap(newMap);
    setHasUnsavedChanges(true);
  };

  return (
    <Canvas shadows camera={{ position: [0, 0, 2.5], fov: 45 }}>
      <color attach="background" args={['#020813']} />
      <ambientLight intensity={0.5} />
      <directionalLight 
        position={[5, 5, 5]} 
        intensity={1.2} 
        castShadow 
        shadow-mapSize={[2048, 2048]} 
      />
      <directionalLight position={[-5, 3, -5]} intensity={0.6} />
      
      <Grid position={[0, -0.6, 0]} args={[10, 10]} cellColor="#00f0ff" sectionColor="#00f0ff" sectionThickness={1} cellThickness={0.5} fadeDistance={15} />

      <Bounds fit clip observe margin={1.2}>
        <GloveModel onClick={handlePointerDown} />
        
        <group 
          scale={gloveConfig.scale} 
          position={gloveConfig.position} 
          rotation={gloveConfig.rotation}
        >
          <GloveCalibrationOverlays />
        </group>
      </Bounds>
      
      <Controls />
    </Canvas>
  );
};
