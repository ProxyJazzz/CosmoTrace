import React from 'react';
import { useAppStore } from '../../store/useAppStore';
import type { SuitRegion } from '../../types';
import styles from './ZoneOverview.module.css';

const ZONES: { id: SuitRegion; label: string }[] = [
  { id: 'helmet', label: 'Helmet' },
  { id: 'torso_front', label: 'Torso (Front)' },
  { id: 'torso_back', label: 'Torso (Back)' },
  { id: 'left_arm', label: 'Left Arm' },
  { id: 'right_arm', label: 'Right Arm' },
  { id: 'left_glove', label: 'Left Glove' },
  { id: 'right_glove', label: 'Right Glove' },
  { id: 'left_leg', label: 'Left Leg' },
  { id: 'right_leg', label: 'Right Leg' },
  { id: 'left_boot', label: 'Left Boot' },
  { id: 'right_boot', label: 'Right Boot' },
];

export const ZoneOverview: React.FC = () => {
  const { sensorData, connectionState, calibrationMap } = useAppStore();

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>Zone Overview</h3>
      <div className={styles.grid}>
        {ZONES.map(zone => {
          let totalSensors = 0;
          let brokenSensors = 0;
          
          Object.values(calibrationMap).forEach(mapping => {
            if (mapping.region === zone.id) {
              totalSensors++;
              if (sensorData?.perChannel[mapping.id] === 'BROKEN') {
                brokenSensors++;
              }
            }
          });

          const isConnected = connectionState !== 'DISCONNECTED' && sensorData !== null;
          const status = !isConnected ? 'unknown' : brokenSensors > 0 ? 'broken' : 'healthy';
          const healthPct = totalSensors > 0 ? Math.max(0, 100 - (brokenSensors / totalSensors) * 100).toFixed(0) : 100;

          return (
            <div key={zone.id} className={`${styles.zoneCard} ${styles[status]}`}>
              <div className={styles.header}>
                <span className={styles.name}>{zone.label}</span>
                <span className={`${styles.status} ${styles[status]}`}>
                  {status.toUpperCase()}
                </span>
              </div>
              <div className={styles.stats}>
                <span>Health: {isConnected ? `${healthPct}%` : '--'}</span>
                <span>Faults: {isConnected ? brokenSensors : '--'}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
