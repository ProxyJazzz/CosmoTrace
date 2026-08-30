import { Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import { useAppStore } from '../../store/useAppStore';
import { useCalibrationStore } from '../../store/useCalibrationStore';
import type { CalibratedSensor } from '../../types';

const PinMarker = ({ 
  sensor, 
  isSelected, 
  isFaultPreview 
}: { 
  sensor: CalibratedSensor, 
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
        <sphereGeometry args={[0.02, 16, 16]} />
        <meshBasicMaterial color={color} />
      </mesh>
      
      {/* Label or Card */}
      {isSelected ? (
        <Html center position={[0, 0.05, 0]}>
          <div style={{
            background: 'rgba(2, 8, 19, 0.9)',
            border: `1px solid ${color}`,
            padding: '8px 12px',
            borderRadius: '4px',
            color: 'white',
            fontSize: '12px',
            whiteSpace: 'nowrap',
            boxShadow: `0 0 10px ${color}40`,
            pointerEvents: 'none'
          }}>
            <strong style={{ color }}>{sensor.id}</strong> {isFault && '— FAULT PREVIEW'}
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Fibre: {sensor.fibreId}<br/>
              Region: {sensor.region.replace('_', ' ')}<br/>
              Pos: {sensor.position[0].toFixed(2)}, {sensor.position[1].toFixed(2)}, {sensor.position[2].toFixed(2)}<br/>
              Dist: {(sensor.distanceAlongFibreMm / 1000).toFixed(2)}m
            </div>
            {isFaultPreview && (
              <div style={{ fontSize: '10px', color: '#ff2a2a', marginTop: '4px', maxWidth: '150px', whiteSpace: 'normal' }}>
                Location accuracy is limited by physical spacing.
              </div>
            )}
          </div>
        </Html>
      ) : (
        <Html center position={[0, 0.03, 0]}>
          <div style={{
            color: 'white',
            fontSize: '10px',
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

export const CalibrationOverlays = () => {
  const { calibrationMap } = useAppStore();
  const { selectedSensorId, faultPreviewMode } = useCalibrationStore();

  const mappedSensors = Object.values(calibrationMap).filter(s => s.confidence === 'calibrated');
  
  // Group by fibre route for lines
  const fibreRoutes = mappedSensors.reduce((acc, sensor) => {
    if (sensor.fibreId && sensor.fibreId !== 'UNASSIGNED') {
      if (!acc[sensor.fibreId]) acc[sensor.fibreId] = [];
      acc[sensor.fibreId].push(sensor);
    }
    return acc;
  }, {} as Record<string, CalibratedSensor[]>);

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
            opacity={0.5} 
            transparent
          />
        );
      })}

      {/* Draw pins */}
      {mappedSensors.map(sensor => (
        <PinMarker 
          key={sensor.id} 
          sensor={sensor} 
          isSelected={selectedSensorId === sensor.id} 
          isFaultPreview={faultPreviewMode} 
        />
      ))}
    </group>
  );
};
