import React, { useEffect, useState } from 'react';
import { Activity, Radio, WifiOff, PenTool, Hand, Cpu } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
import { useWebSerial } from '../../hooks/useWebSerial';
import styles from './Header.module.css';

export const Header: React.FC = () => {
  const { connectionState, demoMode, setDemoMode, sensorData } = useAppStore();
  const { isConnected, connectSerial, disconnectSerial } = useWebSerial();
  const [lastUpdate, setLastUpdate] = useState<string>('--:--:--');

  useEffect(() => {
    if (sensorData) {
      const date = new Date(sensorData.timestamp);
      setLastUpdate(date.toLocaleTimeString());
    }
  }, [sensorData]);

  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <div className={styles.logo}>
          <Activity className={styles.logoIcon} />
          CosmoTrace
        </div>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
          Spacesuit Integrity Monitor
        </span>
      </div>

      <div className={styles.controls}>
        <div className={styles.lastUpdate}>
          Last scan: {lastUpdate}
        </div>

        <Link to="/gloves" className={styles.demoToggle} style={{ textDecoration: 'none', borderColor: 'var(--status-healthy)', color: 'var(--status-healthy)' }}>
          <Hand size={16} />
          Glove Control Center
        </Link>

        <Link to="/calibration" className={styles.demoToggle} style={{ textDecoration: 'none' }}>
          <PenTool size={16} />
          Calibration Studio
        </Link>

        <button 
          className={`${styles.demoToggle} ${demoMode ? styles.active : ''}`}
          onClick={() => setDemoMode(!demoMode)}
        >
          Demo Mode
        </button>

        <button 
          className={`${styles.demoToggle} ${isConnected ? styles.active : ''}`}
          style={isConnected ? { borderColor: 'var(--status-healthy)', color: 'var(--status-healthy)' } : {}}
          onClick={() => isConnected ? disconnectSerial() : connectSerial(115200)}
        >
          <Cpu size={16} />
          {isConnected ? 'ESP32 USB Active' : 'Connect ESP32 (USB)'}
        </button>

        <div className={styles.statusIndicator}>
          {connectionState === 'LIVE' && <Radio size={16} className={styles.liveIcon} style={{color: 'var(--status-healthy)'}} />}
          {connectionState === 'WAITING' && <Radio size={16} style={{color: 'var(--status-warning)'}} />}
          {connectionState === 'DISCONNECTED' && <WifiOff size={16} style={{color: 'var(--status-unknown)'}} />}
          
          <div className={`${styles.dot} ${styles[connectionState.toLowerCase()]}`} />
          
          <span style={{
             color: connectionState === 'LIVE' ? 'var(--status-healthy)' :
                    connectionState === 'WAITING' ? 'var(--status-warning)' : 'var(--text-muted)'
          }}>
            {connectionState === 'LIVE' ? 'ESP32 Connected - Live' :
             connectionState === 'WAITING' ? 'Dashboard Connected - Waiting for ESP32' : 
             'Disconnected'}
          </span>
        </div>
      </div>
    </header>
  );
};
