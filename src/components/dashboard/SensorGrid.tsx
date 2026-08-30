import React, { useState, useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore';
import styles from './SensorGrid.module.css';

type Filter = 'ALL' | 'HEALTHY' | 'FAULTS' | 'X' | 'Y';

export const SensorGrid: React.FC = () => {
  const { sensorData, connectionState, eventLog, selectedSensorId, setSelectedSensorId, calibrationMap } = useAppStore();
  const [filter, setFilter] = useState<Filter>('ALL');

  const channels = useMemo(() => {
    return Object.keys(calibrationMap).sort((a, b) => {
      // Sort X before Y, then numerically
      const aType = a[0];
      const bType = b[0];
      if (aType !== bType) return aType.localeCompare(bType);
      return parseInt(a.slice(1)) - parseInt(b.slice(1));
    });
  }, []);

  const filteredChannels = useMemo(() => {
    return channels.filter(id => {
      const isConnected = connectionState !== 'DISCONNECTED' && sensorData !== null;
      const status = isConnected ? (sensorData?.perChannel[id] || 'UNKNOWN') : 'UNKNOWN';

      if (filter === 'HEALTHY') return status === 'OK';
      if (filter === 'FAULTS') return status === 'BROKEN';
      if (filter === 'X') return id.startsWith('X');
      if (filter === 'Y') return id.startsWith('Y');
      return true;
    });
  }, [channels, filter, sensorData, connectionState]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>Sensor Diagnostics</h3>
        <div className={styles.filters}>
          {(['ALL', 'HEALTHY', 'FAULTS', 'X', 'Y'] as Filter[]).map(f => (
            <button
              key={f}
              className={`${styles.filterBtn} ${filter === f ? styles.active : ''}`}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.gridWrapper}>
        <div className={styles.grid}>
          {filteredChannels.map(id => {
            const isConnected = connectionState !== 'DISCONNECTED' && sensorData !== null;
            const status = isConnected ? (sensorData?.perChannel[id] || 'UNKNOWN') : 'UNKNOWN';
            const reading = isConnected ? (sensorData?.raw[id] || 0) : '--';
            const region = calibrationMap[id]?.region.replace('_', ' ') || 'Unknown';
            const isSelected = selectedSensorId === id;

            let statusClass = styles.unknown;
            if (status === 'OK') statusClass = styles.healthy;
            if (status === 'BROKEN') statusClass = styles.broken;

            return (
              <div 
                key={id}
                className={`${styles.sensorCard} ${statusClass} ${isSelected ? styles.selected : ''}`}
                onClick={() => setSelectedSensorId(id)}
                title={calibrationMap[id]?.label}
              >
                <div className={styles.sensorHeader}>
                  <span className={styles.sensorId}>{id}</span>
                  <span className={styles.sensorReading}>{reading}</span>
                </div>
                <div className={styles.sensorRegion}>{region}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: 'rgba(255,170,0,0.1)', border: '1px solid var(--status-warning)', borderRadius: '4px', fontSize: '0.75rem', color: 'var(--status-warning)' }}>
        <strong>Developer Note (Calibration Map):</strong> After importing the final Blender model, update <code>sensorMap.ts</code> coordinates to match the real suit surface.
      </div>

      <div className={styles.eventLog}>
        <h4 className={styles.title} style={{ fontSize: '0.875rem' }}>Event Log</h4>
        {eventLog.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>No recent events.</div>
        ) : (
          eventLog.slice(0, 10).map((entry, idx) => {
            return (
              <div key={idx} className={styles.logEntry}>
                <span className={styles.logTime}>{new Date(entry.timestamp).toLocaleTimeString()}</span>
                <span className={styles.logChannel}>{entry.channelId}</span>
                <span className={styles.logMessage}>
                  {entry.status === 'BROKEN' ? 'Fault detected' : 'Status unknown'}
                  {entry.status === 'BROKEN' && calibrationMap[entry.channelId]?.confidence === 'placeholder' && ' — calibration required'}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
