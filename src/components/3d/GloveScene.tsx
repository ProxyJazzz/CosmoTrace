import React, { useRef, useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Bounds } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { GloveModel } from './GloveModel';
import { GloveMarkers } from './GloveMarkers';
import { gloveConfig } from './gloveConfig';

export type GloveViewMode = 'both' | 'left' | 'right';

const Controls: React.FC<{ 
  view: 'front' | 'back'; 
  gloveView: GloveViewMode;
  resetTrigger: number;
}> = ({ view, gloveView, resetTrigger }) => {
  const controlsRef = useRef<OrbitControlsImpl>(null);

  useEffect(() => {
    if (!controlsRef.current) return;
    
    let targetX = 0;
    let cameraZ = 2.5;

    if (gloveView === 'left') {
      targetX = -0.3;
      cameraZ = 1.8;
    } else if (gloveView === 'right') {
      targetX = 0.3;
      cameraZ = 1.8;
    }

    const zSign = view === 'front' ? 1 : -1;
    controlsRef.current.object.position.set(targetX, 0, cameraZ * zSign);
    controlsRef.current.target.set(targetX, 0, 0);
    controlsRef.current.update();
  }, [view, gloveView, resetTrigger]);

  return <OrbitControls ref={controlsRef} makeDefault minDistance={0.3} maxDistance={6} enablePan={true} />;
};

export const GloveScene: React.FC<{
  gloveView?: GloveViewMode;
  onGloveViewChange?: (mode: GloveViewMode) => void;
}> = ({ gloveView: externalGloveView, onGloveViewChange }) => {
  const [view, setView] = useState<'front' | 'back'>('front');
  const [internalGloveView, setInternalGloveView] = useState<GloveViewMode>('both');
  const [resetTrigger, setResetTrigger] = useState(0);

  const activeGloveView = externalGloveView || internalGloveView;

  const handleGloveViewSelect = (mode: GloveViewMode) => {
    setInternalGloveView(mode);
    if (onGloveViewChange) onGloveViewChange(mode);
  };

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {/* 3D Scene Control Toolbar */}
      <div style={{
        position: 'absolute',
        top: 16,
        left: 16,
        zIndex: 10,
        display: 'flex',
        gap: 8,
        flexWrap: 'wrap',
        background: 'rgba(2, 8, 19, 0.85)',
        padding: '8px 12px',
        borderRadius: '8px',
        border: '1px solid var(--border-color)',
        backdropFilter: 'blur(8px)',
      }}>
        {/* Glove View Preset Selector */}
        <div style={{ display: 'flex', gap: 4, marginRight: 8, borderRight: '1px solid var(--border-color)', paddingRight: 8 }}>
          <button 
            onClick={() => handleGloveViewSelect('both')}
            style={{
              background: activeGloveView === 'both' ? 'rgba(0, 240, 255, 0.2)' : 'transparent',
              border: `1px solid ${activeGloveView === 'both' ? 'var(--status-healthy)' : 'var(--border-color)'}`,
              color: activeGloveView === 'both' ? 'var(--status-healthy)' : 'var(--text-muted)',
              padding: '4px 10px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600
            }}
          >
            Both Gloves
          </button>
          <button 
            onClick={() => handleGloveViewSelect('left')}
            style={{
              background: activeGloveView === 'left' ? 'rgba(0, 240, 255, 0.2)' : 'transparent',
              border: `1px solid ${activeGloveView === 'left' ? 'var(--status-healthy)' : 'var(--border-color)'}`,
              color: activeGloveView === 'left' ? 'var(--status-healthy)' : 'var(--text-muted)',
              padding: '4px 10px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600
            }}
          >
            Left Glove
          </button>
          <button 
            onClick={() => handleGloveViewSelect('right')}
            style={{
              background: activeGloveView === 'right' ? 'rgba(0, 240, 255, 0.2)' : 'transparent',
              border: `1px solid ${activeGloveView === 'right' ? 'var(--status-healthy)' : 'var(--border-color)'}`,
              color: activeGloveView === 'right' ? 'var(--status-healthy)' : 'var(--text-muted)',
              padding: '4px 10px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600
            }}
          >
            Right Glove
          </button>
        </div>

        {/* Camera Orientation Controls */}
        <button 
          onClick={() => setView(view === 'front' ? 'back' : 'front')}
          style={{
            background: 'transparent',
            border: '1px solid var(--border-color)',
            color: 'var(--text-main)',
            padding: '4px 8px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
          }}
        >
          View: {view === 'front' ? 'Front' : 'Back'}
        </button>
        <button 
          onClick={() => setResetTrigger(prev => prev + 1)}
          style={{
            background: 'transparent',
            border: '1px solid var(--border-color)',
            color: 'var(--text-main)',
            padding: '4px 8px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
          }}
        >
          Reset Camera
        </button>
      </div>

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
          <GloveModel />
          
          <group 
            scale={gloveConfig.scale} 
            position={gloveConfig.position} 
            rotation={gloveConfig.rotation}
          >
            <GloveMarkers />
          </group>
        </Bounds>
        
        <Controls view={view} gloveView={activeGloveView} resetTrigger={resetTrigger} />
      </Canvas>
    </div>
  );
};
