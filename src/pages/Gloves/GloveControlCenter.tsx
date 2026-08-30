import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Radio, WifiOff, PenTool, Search, ArrowLeft, ShieldAlert, Cpu } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { useWebSerial } from '../../hooks/useWebSerial';
import { GloveScene } from '../../components/3d/GloveScene';
import type { GloveViewMode } from '../../components/3d/GloveScene';
import type { GloveRegion } from '../../types';
import styles from './GloveControlCenter.module.css';

const GLOVE_ZONES: { id: GloveRegion; label: string; hand: 'left' | 'right' }[] = [
  { id: 'left_palm', label: 'Left Palm', hand: 'left' },
  { id: 'left_thumb', label: 'Left Thumb', hand: 'left' },
  { id: 'left_index_finger', label: 'Left Index', hand: 'left' },
  { id: 'left_middle_finger', label: 'Left Middle', hand: 'left' },
  { id: 'left_ring_finger', label: 'Left Ring', hand: 'left' },
  { id: 'left_little_finger', label: 'Left Little', hand: 'left' },
  { id: 'right_palm', label: 'Right Palm', hand: 'right' },
  { id: 'right_thumb', label: 'Right Thumb', hand: 'right' },
  { id: 'right_index_finger', label: 'Right Index', hand: 'right' },
  { id: 'right_middle_finger', label: 'Right Middle', hand: 'right' },
  { id: 'right_ring_finger', label: 'Right Ring', hand: 'right' },
  { id: 'right_little_finger', label: 'Right Little', hand: 'right' },
];

type DiagFilter = 'ALL' | 'HEALTHY' | 'FAULTS' | 'LEFT' | 'RIGHT' | 'PALM' | 'FINGERS';

export const GloveControlCenter: React.FC = () => {
  const { 
    connectionState, 
    sensorData, 
    eventLog, 
    demoMode, 
    setDemoMode, 
    selectedGloveSensorId, 
    setSelectedGloveSensorId, 
    gloveCalibrationMap 
  } = useAppStore();

  const { isConnected, connectSerial, disconnectSerial } = useWebSerial();

  const [diagFilter, setDiagFilter] = useState<DiagFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [gloveViewMode, setGloveViewMode] = useState<GloveViewMode>('both');

  // Filter all channels in gloveCalibrationMap
  const gloveChannelIds = useMemo(() => {
    return Object.keys(gloveCalibrationMap).sort((a, b) => {
      const aType = a[0];
      const bType = b[0];
      if (aType !== bType) return aType.localeCompare(bType);
      return parseInt(a.slice(1)) - parseInt(b.slice(1));
    });
  }, [gloveCalibrationMap]);

  // Statistics & KPI calculations
  const stats = useMemo(() => {
    let totalChannels = 0;
    let healthyChannels = 0;
    let brokenChannels = 0;
    let leftTotal = 0;
    let leftHealthy = 0;
    let rightTotal = 0;
    let rightHealthy = 0;

    gloveChannelIds.forEach(id => {
      const sensor = gloveCalibrationMap[id];
      if (!sensor) return;

      totalChannels++;
      const isBroken = sensorData?.perChannel[id] === 'BROKEN';
      
      if (isBroken) {
        brokenChannels++;
      } else {
        healthyChannels++;
      }

      if (sensor.hand === 'left') {
        leftTotal++;
        if (!isBroken) leftHealthy++;
      } else if (sensor.hand === 'right') {
        rightTotal++;
        if (!isBroken) rightHealthy++;
      }
    });

    const overallIntegrity = totalChannels > 0 ? Math.round((healthyChannels / totalChannels) * 100) : 100;
    const leftHealth = leftTotal > 0 ? Math.round((leftHealthy / leftTotal) * 100) : 100;
    const rightHealth = rightTotal > 0 ? Math.round((rightHealthy / rightTotal) * 100) : 100;

    let highestSeverity = 'NOMINAL';
    if (brokenChannels > 3) highestSeverity = 'HIGH FAULT';
    else if (brokenChannels > 0) highestSeverity = 'WARNING';

    return {
      totalChannels,
      healthyChannels,
      brokenChannels,
      overallIntegrity,
      leftHealth,
      rightHealth,
      highestSeverity,
    };
  }, [gloveChannelIds, gloveCalibrationMap, sensorData]);

  // Glove Diagnostics Filtered List
  const filteredSensors = useMemo(() => {
    return gloveChannelIds.filter(id => {
      const sensor = gloveCalibrationMap[id];
      if (!sensor) return false;

      const isBroken = sensorData?.perChannel[id] === 'BROKEN';

      // Search query
      if (searchQuery && !id.toLowerCase().includes(searchQuery.toLowerCase())) return false;

      // Diag filters
      if (diagFilter === 'HEALTHY' && isBroken) return false;
      if (diagFilter === 'FAULTS' && !isBroken) return false;
      if (diagFilter === 'LEFT' && sensor.hand !== 'left') return false;
      if (diagFilter === 'RIGHT' && sensor.hand !== 'right') return false;
      if (diagFilter === 'PALM' && sensor.finger !== 'palm') return false;
      if (diagFilter === 'FINGERS' && sensor.finger === 'palm') return false;

      return true;
    });
  }, [gloveChannelIds, gloveCalibrationMap, sensorData, searchQuery, diagFilter]);

  // Glove-only Event Log
  const gloveEvents = useMemo(() => {
    return eventLog.filter(e => {
      // Event channel belongs to gloveCalibrationMap
      return !!gloveCalibrationMap[e.channelId];
    });
  }, [eventLog, gloveCalibrationMap]);

  const lastScanTime = sensorData ? new Date(sensorData.timestamp).toLocaleTimeString() : 'N/A';

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Link to="/" className={styles.brandLink}>
            <ArrowLeft size={16} />
            Spacesuit Dashboard
          </Link>
          <div className={styles.title}>CosmoTrace — Glove Control Center</div>
        </div>

        <div className={styles.headerRight}>
          <div className={`${styles.statusPill} ${connectionState === 'DISCONNECTED' ? styles.disconnected : ''}`}>
            {connectionState === 'LIVE' && <Activity size={14} />}
            {connectionState === 'WAITING' && <Radio size={14} />}
            {connectionState === 'DISCONNECTED' && <WifiOff size={14} />}
            <span>{connectionState}</span>
          </div>

          <div className={styles.lastScan}>
            Last scan: {lastScanTime}
          </div>

          <Link to="/gloves/live" className={`${styles.btn} ${styles.primary}`}>
            <Activity size={15} />
            Live 2D Status
          </Link>

          <Link to="/gloves/calibration" className={styles.btn}>
            <PenTool size={15} />
            Glove Calibration
          </Link>

          <button 
            className={`${styles.btn} ${demoMode ? styles.primary : ''}`}
            onClick={() => setDemoMode(!demoMode)}
          >
            {demoMode ? 'Demo Mode Active' : 'Start Demo'}
          </button>

          <button 
            className={`${styles.btn} ${isConnected ? styles.primary : ''}`}
            onClick={() => isConnected ? disconnectSerial() : connectSerial(115200)}
          >
            <Cpu size={15} />
            {isConnected ? 'ESP32 USB Active' : 'Connect ESP32 (USB)'}
          </button>
        </div>
      </header>

      {/* KPI Bar */}
      <div className={styles.kpiBar}>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Overall Glove Integrity</span>
          <span className={`${styles.kpiValue} ${stats.overallIntegrity > 90 ? styles.healthy : (stats.overallIntegrity > 70 ? styles.warning : styles.fault)}`}>
            {stats.overallIntegrity}%
          </span>
        </div>

        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Left Glove Health</span>
          <span className={`${styles.kpiValue} ${stats.leftHealth > 90 ? styles.healthy : styles.fault}`}>
            {stats.leftHealth}%
          </span>
        </div>

        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Right Glove Health</span>
          <span className={`${styles.kpiValue} ${stats.rightHealth > 90 ? styles.healthy : styles.fault}`}>
            {stats.rightHealth}%
          </span>
        </div>

        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Active Glove Channels</span>
          <span className={styles.kpiValue}>{stats.totalChannels}</span>
        </div>

        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Active Glove Faults</span>
          <span className={`${styles.kpiValue} ${stats.brokenChannels > 0 ? styles.fault : styles.healthy}`}>
            {stats.brokenChannels}
          </span>
        </div>

        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Highest Criticality</span>
          <span className={`${styles.kpiValue} ${stats.brokenChannels > 0 ? styles.fault : styles.healthy}`}>
            {stats.highestSeverity}
          </span>
        </div>
      </div>

      {/* Main Workspace */}
      <main className={styles.mainContent}>
        {/* Left Sidebar: 12 Glove Zones Overview */}
        <div className={styles.leftSidebar}>
          <div className={styles.sectionHeader}>
            Glove Zone Overview (12 Zones)
          </div>

          <div className={styles.zoneGrid}>
            {GLOVE_ZONES.map(zone => {
              let total = 0;
              let broken = 0;

              Object.values(gloveCalibrationMap).forEach(sensor => {
                if (sensor.region === zone.id) {
                  total++;
                  if (sensorData?.perChannel[sensor.id] === 'BROKEN') {
                    broken++;
                  }
                }
              });

              const health = total > 0 ? Math.round(((total - broken) / total) * 100) : 100;
              const isBroken = broken > 0;

              return (
                <div key={zone.id} className={`${styles.zoneCard} ${isBroken ? styles.broken : ''}`}>
                  <div className={styles.zoneName}>{zone.label}</div>
                  <div className={styles.zoneStats}>
                    <span>Health: <strong style={{ color: isBroken ? 'var(--status-fault)' : 'var(--status-healthy)' }}>{health}%</strong></span>
                    <span>Sensors: {total}</span>
                  </div>
                  {isBroken && (
                    <div style={{ color: 'var(--status-fault)', fontSize: '0.65rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <ShieldAlert size={10} /> {broken} Active Fault{broken > 1 ? 's' : ''}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Center View: 3D Interactive Glove Viewer */}
        <div className={styles.centerViewer}>
          <GloveScene 
            gloveView={gloveViewMode} 
            onGloveViewChange={setGloveViewMode} 
          />
        </div>

        {/* Right Sidebar: Sensor Diagnostics & Glove Event Log */}
        <div className={styles.rightSidebar}>
          {/* Glove Diagnostics Panel */}
          <div className={styles.diagPanel}>
            <div className={styles.sectionHeader}>
              Glove Sensor Diagnostics ({filteredSensors.length})
            </div>

            <div className={styles.diagFilterBar}>
              <div style={{ position: 'relative' }}>
                <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input 
                  type="text" 
                  placeholder="Search sensor ID..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={styles.searchInput}
                />
              </div>

              <div className={styles.filterGroup}>
                {(['ALL', 'HEALTHY', 'FAULTS', 'LEFT', 'RIGHT', 'PALM', 'FINGERS'] as DiagFilter[]).map(f => (
                  <button 
                    key={f}
                    onClick={() => setDiagFilter(f)}
                    className={`${styles.filterBtn} ${diagFilter === f ? styles.active : ''}`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.sensorList}>
              {filteredSensors.map(id => {
                const sensor = gloveCalibrationMap[id];
                const isBroken = sensorData?.perChannel[id] === 'BROKEN';
                const reading = sensorData?.raw[id] ?? '--';
                const isSelected = selectedGloveSensorId === id;

                return (
                  <div 
                    key={id}
                    onClick={() => setSelectedGloveSensorId(id)}
                    className={`${styles.sensorItem} ${isSelected ? styles.selected : ''} ${isBroken ? styles.broken : ''}`}
                  >
                    <div>
                      <strong style={{ color: isBroken ? 'var(--status-fault)' : 'var(--text-main)' }}>{id}</strong>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginLeft: 8, textTransform: 'capitalize' }}>
                        {sensor.hand} — {sensor.finger} ({sensor.region.replace('_', ' ')})
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{sensor.fibreId}</span>
                      <strong style={{ color: isBroken ? 'var(--status-fault)' : 'var(--status-healthy)' }}>{reading}</strong>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Glove Event Log Panel */}
          <div className={styles.eventLogPanel}>
            <div className={styles.sectionHeader}>
              Glove Event Log ({gloveEvents.length})
            </div>

            <div className={styles.logList}>
              {gloveEvents.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>No recent glove events.</div>
              ) : (
                gloveEvents.slice(0, 15).map((entry, idx) => {
                  const sensor = gloveCalibrationMap[entry.channelId];
                  const isUnmapped = sensor?.confidence === 'placeholder';
                  const isFault = entry.status === 'BROKEN';

                  return (
                    <div key={idx} className={`${styles.logItem} ${isFault ? styles.fault : ''}`}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                        <span>{entry.channelId} ({sensor ? `${sensor.hand} ${sensor.finger}` : entry.region})</span>
                        <span>{new Date(entry.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                        Reading: {entry.reading} | Status: <strong style={{ color: isFault ? 'var(--status-fault)' : 'var(--status-healthy)' }}>{entry.status}</strong>
                      </div>
                      {isFault && isUnmapped && (
                        <div style={{ color: 'var(--status-warning)', fontSize: '0.65rem', fontWeight: 600, marginTop: 2 }}>
                          Fault detected — glove calibration required.
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
