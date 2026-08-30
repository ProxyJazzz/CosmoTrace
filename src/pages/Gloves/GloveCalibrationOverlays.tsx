import { Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import { useAppStore } from '../../store/useAppStore';
import { useGloveCalibrationStore } from '../../store/useGloveCalibrationStore';
import type { CalibratedGloveSensor } from '../../types';

const GlovePinMarker = ({ 
  sensor, 
  isSelected, 
  isFaultPreview 
}: { 
  sensor: CalibratedGloveSensor, 
  isSelected: boolean, 
  isFaultPreview: boolean 
}) => {
  const isHealthyPreview = isSelected && !isFaultPreview;
  const isFault = isSelected && isFaultPreview;
  
  const color = isFault ? '#ff2a2a' : (isHealthyPreview ? '#00f0ff' : '#00aa55');
  const scale = isSelected ? 1.5 : 1;

  return (
    <group position={sensor.position}>
      <mesh scale={scale}>
        <sphereGeometry args={[0.015, 16, 16]} />
        <meshBasicMaterial color={color} />
      </mesh>
      
      {/* Label or Tooltip */}
      {isSelected ? (
        <Html center position={[0, 0.04, 0]}>
          <div style={{
            background: 'rgba(2, 8, 19, 0.95)',
            border: `1px solid ${color}`,
            padding: '8px 12px',
            borderRadius: '6px',
            color: 'white',
            fontSize: '11px',
            whiteSpace: 'nowrap',
            boxShadow: `0 0 10px ${color}40`,
            pointerEvents: 'none',
          }}>
            <strong style={{ color }}>{sensor.id}</strong> ({sensor.hand} {sensor.finger}) {isFault && '— FAULT PREVIEW'}
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Route: {sensor.fibreId}<br/>
              Region: {sensor.region.replace('_', ' ')}<br/>
              Pos: {sensor.position[0].toFixed(2)}, {sensor.position[1].toFixed(2)}, {sensor.position[2].toFixed(2)}<br/>
              Dist: {sensor.distanceAlongFibreMm.toFixed(0)}mm ({ (sensor.distanceAlongFibreMm / 1000).toFixed(2) }m)
            </div>
            {isFaultPreview && (
              <div style={{ fontSize: '9px', color: '#ff2a2a', marginTop: '4px', maxWidth: '160px', whiteSpace: 'normal' }}>
                Location accuracy limited by sensing point spacing.
              </div>
            )}
          </div>
        </Html>
      ) : (
        <Html center position={[0, 0.025, 0]}>
          <div style={{
            color: 'white',
            fontSize: '9px',
            fontWeight: 600,
            textShadow: '0 0 2px black, 0 0 2px black',
            pointerEvents: 'none'
          }}>
            {sensor.id}
          </div>
        </Html>
      )}
    </group>
  );
};

export const GloveCalibrationOverlays = () => {
  const { gloveCalibrationMap } = useAppStore();
  const { selectedSensorId, faultPreviewMode } = useGloveCalibrationStore();

  const mappedSensors = Object.values(gloveCalibrationMap).filter(s => s.confidence === 'calibrated');
  
  // Group by fibre route for lines
  const fibreRoutes = mappedSensors.reduce((acc, sensor) => {
    if (sensor.fibreId && sensor.fibreId !== 'UNASSIGNED') {
      if (!acc[sensor.fibreId]) acc[sensor.fibreId] = [];
      acc[sensor.fibreId].push(sensor);
    }
    return acc;
  }, {} as Record<string, CalibratedGloveSensor[]>);

  // Sort each route numerically to connect lines in order
  Object.values(fibreRoutes).forEach(route => {
    route.sort((a, b) => parseInt(a.id.slice(1)) - parseInt(b.id.slice(1)));
  });

  return (
    <group>
      {/* Draw route lines */}
      {Object.entries(fibreRoutes).map(([fibreId, sensors]) => {
        if (sensors.length < 2) return null;
        const points = sensors.map(s => new THREE.Vector3(...s.position));
        return (
          <Line 
            key={fibreId} 
            points={points} 
            color="#00f0ff" 
            lineWidth={2} 
            opacity={0.6} 
            transparent
          />
        );
      })}

      {/* Draw pins */}
      {mappedSensors.map(sensor => (
        <GlovePinMarker 
          key={sensor.id} 
          sensor={sensor} 
          isSelected={selectedSensorId === sensor.id} 
          isFaultPreview={faultPreviewMode} 
        />
      ))}
    </group>
  );
};
