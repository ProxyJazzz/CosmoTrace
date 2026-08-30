import React, { useRef, useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Bounds } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { SpacesuitModel } from './SpacesuitModel';
import { SensorMarkers } from './SensorMarkers';
import { spacesuitConfig } from './spacesuitConfig';

const Controls: React.FC<{ view: 'front' | 'back', resetTrigger: number }> = ({ view, resetTrigger }) => {
  const controlsRef = useRef<OrbitControlsImpl>(null);

  useEffect(() => {
    if (controlsRef.current) {
      if (view === 'front') {
        controlsRef.current.setAzimuthalAngle(0);
        controlsRef.current.setPolarAngle(Math.PI / 2);
      } else {
        controlsRef.current.setAzimuthalAngle(Math.PI);
        controlsRef.current.setPolarAngle(Math.PI / 2);
      }
      controlsRef.current.update();
    }
  }, [view]);

  useEffect(() => {
    if (controlsRef.current && resetTrigger > 0) {
      controlsRef.current.reset();
      controlsRef.current.setAzimuthalAngle(0);
      controlsRef.current.setPolarAngle(Math.PI / 2);
      controlsRef.current.update();
    }
  }, [resetTrigger]);

  return <OrbitControls ref={controlsRef} makeDefault enablePan={false} minDistance={2} maxDistance={6} target={[0, 1, 0]} />;
};

export const Scene: React.FC = () => {
  const [view, setView] = useState<'front' | 'back'>('front');
  const [resetTrigger, setResetTrigger] = useState(0);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: '400px' }}>
      <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 10, display: 'flex', gap: '8px' }}>
        <button 
          onClick={() => setView(v => v === 'front' ? 'back' : 'front')}
          style={{
            background: 'var(--bg-panel)', border: '1px solid var(--border-color)', 
            color: 'var(--text-main)', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer',
            fontSize: '0.875rem'
          }}
        >
          {view === 'front' ? 'Show Back View' : 'Show Front View'}
        </button>
        <button 
          onClick={() => setResetTrigger(v => v + 1)}
          style={{
            background: 'var(--bg-panel)', border: '1px solid var(--border-color)', 
            color: 'var(--text-main)', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer',
            fontSize: '0.875rem'
          }}
        >
          Reset Camera
        </button>
      </div>

      <Canvas camera={{ position: [0, 1, 4], fov: 50 }}>
        <color attach="background" args={['#020813']} />
        
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 5, 5]} intensity={1} />
        <directionalLight position={[-5, 5, -5]} intensity={0.5} />
        
        <Grid position={[0, -0.5, 0]} args={[10, 10]} cellColor="#00f0ff" sectionColor="#00f0ff" sectionThickness={1} cellThickness={0.5} fadeDistance={15} />

        <Bounds fit clip observe margin={1.2}>
          <SpacesuitModel />
          
          {/* Render markers relative to the imported GLB model configuration */}
          <group 
            scale={spacesuitConfig.scale} 
            position={spacesuitConfig.position} 
            rotation={spacesuitConfig.rotation}
          >
            <SensorMarkers />
          </group>
        </Bounds>
        
        <Controls view={view} resetTrigger={resetTrigger} />
      </Canvas>
    </div>
  );
};
