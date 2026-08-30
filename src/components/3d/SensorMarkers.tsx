import React, { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useAppStore } from '../../store/useAppStore';

const PulsingMarker: React.FC<{ position: [number, number, number], id: string, reading: number, region: string, isSelected: boolean, onClick: () => void }> = ({ position, id, reading, region, isSelected, onClick }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  useFrame((state) => {
    if (meshRef.current) {
      const scale = 1 + Math.sin(state.clock.elapsedTime * 4) * 0.2;
      meshRef.current.scale.set(scale, scale, scale);
    }
    if (ringRef.current) {
      const scale = 1 + (state.clock.elapsedTime * 2) % 2;
      const opacity = 1 - (scale - 1) / 2;
      ringRef.current.scale.set(scale, scale, scale);
      (ringRef.current.material as THREE.MeshBasicMaterial).opacity = opacity;
    }
  });

  return (
    <group position={position} onClick={(e) => { e.stopPropagation(); onClick(); }} onPointerOver={() => setHovered(true)} onPointerOut={() => setHovered(false)}>
      <mesh ref={meshRef}>
        <sphereGeometry args={[0.03, 16, 16]} />
        <meshBasicMaterial color="#ff2a2a" />
      </mesh>
      <mesh ref={ringRef}>
        <sphereGeometry args={[0.04, 16, 16]} />
        <meshBasicMaterial color="#ffaa00" transparent opacity={0.5} depthWrite={false} />
      </mesh>
      
      {/* Heat zone */}
      <mesh>
        <sphereGeometry args={[0.15, 16, 16]} />
        <meshBasicMaterial color="#ff2a2a" transparent opacity={0.15} depthWrite={false} />
      </mesh>

      {(hovered || isSelected) && (
        <Html center position={[0, 0.1, 0]} style={{ pointerEvents: 'none' }}>
          <div style={{
            background: 'rgba(2, 8, 19, 0.9)',
            border: '1px solid #ff2a2a',
            padding: '8px 12px',
            borderRadius: '4px',
            color: '#fff',
            fontSize: '12px',
            whiteSpace: 'nowrap',
            boxShadow: '0 0 10px rgba(255, 42, 42, 0.3)',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px'
          }}>
            <strong style={{ color: '#ff2a2a' }}>Possible puncture detected</strong>
            <div>ID: {id}</div>
            <div>Reading: {reading}</div>
            <div style={{ textTransform: 'uppercase', fontSize: '10px', color: '#8ab4f8' }}>{region.replace('_', ' ')}</div>
          </div>
        </Html>
      )}
    </group>
  );
};

export const SensorMarkers: React.FC = () => {
  const { sensorData, connectionState, selectedSensorId, setSelectedSensorId, calibrationMap } = useAppStore();

  if (connectionState === 'DISCONNECTED' || !sensorData) return null;

  return (
    <group>
      {Object.entries(calibrationMap).map(([id, mapping]) => {
        const isBroken = sensorData.perChannel[id] === 'BROKEN';
        const isSelected = selectedSensorId === id;
        
        // Only render if it's broken or selected, AND it is actually calibrated.
        if ((!isBroken && !isSelected) || mapping.confidence === 'placeholder') return null;

        const reading = sensorData.raw[id] || 0;

        // Map the [-0.5, 0.5] X/Z and [-1, 1] Y generated coords to the suit volume
        const px = mapping.position[0] * 1.5;
        const py = mapping.position[1] * 1.2 + 0.5;
        const pz = mapping.position[2] * 1.5;

        if (isBroken) {
          return (
            <PulsingMarker 
              key={id}
              position={[px, py, pz]}
              id={id}
              reading={reading}
              region={mapping.region}
              isSelected={isSelected}
              onClick={() => setSelectedSensorId(id)}
            />
          );
        }

        // Selected but healthy marker
        return (
          <group key={id} position={[px, py, pz]} onClick={(e) => { e.stopPropagation(); setSelectedSensorId(id); }}>
            <mesh>
              <sphereGeometry args={[0.03, 16, 16]} />
              <meshBasicMaterial color="#00f0ff" />
            </mesh>
            <Html center position={[0, 0.1, 0]} style={{ pointerEvents: 'none' }}>
              <div style={{
                background: 'rgba(2, 8, 19, 0.9)',
                border: '1px solid #00f0ff',
                padding: '4px 8px',
                borderRadius: '4px',
                color: '#fff',
                fontSize: '10px',
                whiteSpace: 'nowrap'
              }}>
                {id} - OK ({reading})
              </div>
            </Html>
          </group>
        );
      })}
    </group>
  );
};
