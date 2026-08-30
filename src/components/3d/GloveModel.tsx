import React, { Suspense } from 'react';
import { Html, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { gloveConfig } from './gloveConfig';

const ModelLoader = ({ onClick }: { onClick?: (e: any) => void }) => {
  const { scene } = useGLTF('/models/gloves.glb');
  
  // Traverse and enable shadows without overwriting original materials
  scene.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  return (
    <primitive 
      object={scene} 
      scale={gloveConfig.scale} 
      position={gloveConfig.position} 
      rotation={gloveConfig.rotation} 
      onClick={onClick}
    />
  );
};

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <Html center>
          <div style={{
            background: 'rgba(2, 8, 19, 0.9)',
            border: '1px solid #ffaa00',
            padding: '16px 24px',
            borderRadius: '8px',
            color: '#fff',
            fontSize: '14px',
            textAlign: 'center',
            maxWidth: '300px',
            boxShadow: '0 0 20px rgba(255, 170, 0, 0.2)',
          }}>
            <h3 style={{ color: '#ffaa00', margin: '0 0 8px 0' }}>Glove model not found</h3>
            <p style={{ margin: 0, color: 'var(--text-muted)' }}>
              Export your Blender model as gloves.glb and place it in public/models/
            </p>
          </div>
        </Html>
      );
    }
    return this.props.children;
  }
}

const LoadingIndicator = () => (
  <Html center>
    <div style={{
      color: '#00f0ff',
      fontSize: '14px',
      background: 'rgba(2, 8, 19, 0.8)',
      padding: '8px 16px',
      borderRadius: '20px',
      border: '1px solid rgba(0, 240, 255, 0.3)',
      boxShadow: '0 0 10px rgba(0, 240, 255, 0.1)'
    }}>
      Loading glove model...
    </div>
  </Html>
);

export const GloveModel: React.FC<{ onClick?: (e: any) => void }> = ({ onClick }) => {
  return (
    <ErrorBoundary>
      <Suspense fallback={<LoadingIndicator />}>
        <ModelLoader onClick={onClick} />
      </Suspense>
    </ErrorBoundary>
  );
};

// Preload the model
useGLTF.preload('/models/gloves.glb');
