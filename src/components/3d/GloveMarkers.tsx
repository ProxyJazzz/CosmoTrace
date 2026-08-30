import React, { useRef } from 'react';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useAppStore } from '../../store/useAppStore';

const PulsingGloveMarker: React.FC<{ 
  position: [number, number, number];
  id: string;
  reading: number;
  hand: string;
  finger: string;
  region: string;
  fibreId: string;
  distance: number;
  confidence: string;
  isSelected: boolean;
  onClick: () => void;
}> = ({ position, id, reading, hand, finger, region, fibreId, distance, confidence, isSelected, onClick }) => {
  const innerMeshRef = useRef<THREE.Mesh>(null);
  const heatRingRef = useRef<THREE.Mesh>(null);

  return (
    <group position={position} onClick={(e) => { e.stopPropagation(); onClick(); }}>
      {/* Outer Orange/Red Heat Ring */}
      <mesh ref={heatRingRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.03, 0.07, 32]} />
        <meshBasicMaterial color="#ff5500" transparent opacity={0.6} side={THREE.DoubleSide} />
      </mesh>

      {/* Pulsing Red Pinpoint Marker */}
      <mesh ref={innerMeshRef} position={[0, 0, 0.01]}>
        <sphereGeometry args={[0.02, 16, 16]} />
        <meshBasicMaterial color="#ff2a2a" />
      </mesh>

      {/* Detailed Fault Card / Tooltip */}
      {isSelected && (
        <Html center position={[0, 0.12, 0]}>
          <div style={{
            background: 'rgba(2, 8, 19, 0.95)',
            border: '1px solid #ff2a2a',
            borderRadius: '8px',
            padding: '12px 16px',
            boxShadow: '0 0 20px rgba(255, 42, 42, 0.4)',
            color: '#fff',
            fontSize: '12px',
            minWidth: '220px',
            pointerEvents: 'none',
            backdropFilter: 'blur(8px)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,42,42,0.3)', paddingBottom: '6px', marginBottom: '8px' }}>
              <span style={{ fontWeight: 'bold', color: '#ff2a2a', fontSize: '14px' }}>FAULT: {id}</span>
              <span style={{ fontSize: '10px', background: 'rgba(255,42,42,0.2)', color: '#ff2a2a', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>
                CRITICAL
              </span>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', fontSize: '11px' }}>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Hand:</span>{' '}
                <strong style={{ textTransform: 'capitalize' }}>{hand}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Finger:</span>{' '}
                <strong style={{ textTransform: 'capitalize' }}>{finger}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Region:</span>{' '}
                <span style={{ textTransform: 'capitalize' }}>{region.replace('_', ' ')}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Reading:</span>{' '}
                <strong style={{ color: '#ff2a2a' }}>{reading}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Fibre Route:</span>{' '}
                <strong>{fibreId || 'N/A'}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Distance:</span>{' '}
                <strong>{(distance / 1000).toFixed(2)}m</strong>
              </div>
            </div>

            <div style={{ marginTop: '8px', paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)' }}>
              <span>Confidence: <strong style={{ color: confidence === 'calibrated' ? 'var(--status-healthy)' : 'var(--status-warning)' }}>{confidence}</strong></span>
            </div>
          </div>
        </Html>
      )}
    </group>
  );
};

export const GloveMarkers: React.FC = () => {
  const { sensorData, connectionState, selectedGloveSensorId, setSelectedGloveSensorId, gloveCalibrationMap } = useAppStore();

  if (connectionState === 'DISCONNECTED' || !sensorData) return null;

  return (
    <group>
      {Object.entries(gloveCalibrationMap).map(([id, mapping]) => {
        const isBroken = sensorData.perChannel[id] === 'BROKEN';
        const isSelected = selectedGloveSensorId === id;
        
        // Only render if it's broken or selected, AND it is actually calibrated
        if ((!isBroken && !isSelected) || mapping.confidence === 'placeholder') return null;

        const reading = sensorData.raw[id] || 0;

        return (
          <PulsingGloveMarker 
            key={id}
            position={mapping.position}
            id={id}
            reading={reading}
            hand={mapping.hand}
            finger={mapping.finger}
            region={mapping.region}
            fibreId={mapping.fibreId}
            distance={mapping.distanceAlongFibreMm}
            confidence={mapping.confidence}
            isSelected={isSelected}
            onClick={() => setSelectedGloveSensorId(id)}
          />
        );
      })}
    </group>
  );
};
