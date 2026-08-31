import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { 
  ArrowLeft, 
  Cpu, 
  WifiOff, 
  Radio, 
  Activity, 
  Upload, 
  Search, 
  CheckCircle, 
  AlertTriangle, 
  RotateCcw,
  Zap,
  Info
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { OptiMeshSerial } from '../../utils/optimesh-serial';
import type { ChannelMap } from '../../utils/optimesh-serial';
import type { GloveCalibrationMap, GloveRegion, GloveHand, GloveFinger, RawData, PerChannelData, ZoneStatus, SensorData } from '../../types';
import styles from './LiveGloveStatus.module.css';

// Zone definitions for Left and Right hands
interface ZoneDef {
  id: GloveRegion;
  label: string;
  finger: GloveFinger;
  view: 'both' | 'front' | 'back';
}

const GLOVE_ZONES: Record<GloveHand, ZoneDef[]> = {
  left: [
    { id: 'left_palm', label: 'Left Palm', finger: 'palm', view: 'front' },
    { id: 'left_palm', label: 'Left Dorsal Palm', finger: 'palm', view: 'back' },
    { id: 'left_thumb', label: 'Left Thumb', finger: 'thumb', view: 'both' },
    { id: 'left_index_finger', label: 'Left Index', finger: 'index', view: 'both' },
    { id: 'left_middle_finger', label: 'Left Middle', finger: 'middle', view: 'both' },
    { id: 'left_ring_finger', label: 'Left Ring', finger: 'ring', view: 'both' },
    { id: 'left_little_finger', label: 'Left Little', finger: 'little', view: 'both' },
  ],
  right: [
    { id: 'right_palm', label: 'Right Palm', finger: 'palm', view: 'front' },
    { id: 'right_palm', label: 'Right Dorsal Palm', finger: 'palm', view: 'back' },
    { id: 'right_thumb', label: 'Right Thumb', finger: 'thumb', view: 'both' },
    { id: 'right_index_finger', label: 'Right Index', finger: 'index', view: 'both' },
    { id: 'right_middle_finger', label: 'Right Middle', finger: 'middle', view: 'both' },
    { id: 'right_ring_finger', label: 'Right Ring', finger: 'ring', view: 'both' },
    { id: 'right_little_finger', label: 'Right Little', finger: 'little', view: 'both' },
  ]
};

export const LiveGloveStatus: React.FC = () => {
  const { 
    gloveCalibrationMap, 
    setGloveCalibrationMap, 
    sensorData, 
    setSensorData,
    connectionState,
    setConnectionState,
    addEventLogEntry
  } = useAppStore();

  const [activeHand, setActiveHand] = useState<GloveHand>('left');
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [selectedZone, setSelectedZone] = useState<GloveRegion | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [simulatedFaults, setSimulatedFaults] = useState<Record<string, boolean>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [channelFilter, setChannelFilter] = useState<'ALL' | 'ZONE_1' | 'ZONE_2' | 'FAULTS'>('ALL');

  // Instantiated OptiMeshSerial bridge with onGridUpdate (v2 channelMap: 1-120) and onStatus handlers
  const bridge = React.useMemo(() => {
    const onGridUpdate = (channelMap: ChannelMap) => {
      const raw: RawData = {};
      const perChannel: PerChannelData = {};
      const brokenChannels: string[] = [];
      const zoneStatus: ZoneStatus = {};
      const timestampMs = Date.now();

      Object.entries(channelMap).forEach(([studioNumStr, entry]) => {
        const studioNum = parseInt(studioNumStr, 10);
        const channelId = `X${studioNum}`; // Studio channel key e.g. X1..X120

        raw[channelId] = entry.value;
        perChannel[channelId] = entry.fault ? 'BROKEN' : 'OK';

        if (entry.fault) {
          brokenChannels.push(channelId);

          const region = gloveCalibrationMap[channelId]?.region;
          if (region) {
            zoneStatus[region] = 'BROKEN';
          }

          addEventLogEntry({
            id: `evt-${timestampMs}-${channelId}`,
            timestamp: timestampMs,
            channelId,
            reading: entry.value,
            region: (region ? 'left_glove' : 'left_glove') as any,
            status: 'BROKEN'
          });
        }
      });

      const updatedSensorData: SensorData = {
        timestamp: timestampMs,
        raw,
        perChannel,
        zoneStatus,
        brokenChannels
      };

      setSensorData(updatedSensorData);
      setConnectionState('LIVE');
    };

    const onStatus = (connected: boolean, message?: string) => {
      if (connected) {
        setConnectionState('LIVE');
        setErrorMessage(null);
      } else {
        setConnectionState('DISCONNECTED');
        if (message && message !== 'ESP32 disconnected') {
          setErrorMessage(message);
        }
      }
    };

    return new OptiMeshSerial(onGridUpdate, onStatus);
  }, [gloveCalibrationMap, setSensorData, setConnectionState, addEventLogEntry]);

  // Clean up serial port connection on unmount
  React.useEffect(() => {
    return () => {
      bridge.disconnect();
    };
  }, [bridge]);

  // Real connection implementation using bridge.connect(115200)
  const connectToESP32 = async () => {
    setIsConnecting(true);
    setErrorMessage(null);

    try {
      await bridge.connect(115200);
    } catch (err: any) {
      console.error('[LiveGloveStatus] Serial connection failed:', err);
      const msg = err?.message || 'Failed to open Web Serial port or browser context does not support Web Serial.';
      setErrorMessage(msg);
    } finally {
      setIsConnecting(false);
    }
  };

  // 2. Handle Import of freshly exported Calibration JSON
  const handleImportCalibration = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string) as GloveCalibrationMap;
        if (typeof json === 'object' && json !== null) {
          const firstKey = Object.keys(json)[0];
          if (firstKey && json[firstKey].hand && json[firstKey].finger) {
            setGloveCalibrationMap(json);
            alert(`Loaded calibration map containing ${Object.keys(json).length} channels.`);
          } else {
            alert('Invalid glove calibration schema format.');
          }
        }
      } catch (err) {
        alert('Failed to parse JSON file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // 3. Mapping channels and fault states
  const channels = useMemo(() => {
    return Object.values(gloveCalibrationMap).sort((a, b) => {
      const aNum = parseInt(a.id.replace(/\D/g, '')) || 0;
      const bNum = parseInt(b.id.replace(/\D/g, '')) || 0;
      return aNum - bNum;
    });
  }, [gloveCalibrationMap]);

  // Check if a specific channel is faulted (from live sensorData or local simulator)
  const isChannelFaulted = (channelId: string): boolean => {
    if (simulatedFaults[channelId]) return true;
    if (sensorData?.perChannel && sensorData.perChannel[channelId] === 'BROKEN') return true;
    if (sensorData?.brokenChannels?.includes(channelId)) return true;
    return false;
  };

  // Check if a specific glove region has any broken channel
  const isZoneFaulted = (region: GloveRegion): boolean => {
    return channels.some(c => c.region === region && isChannelFaulted(c.id));
  };

  // KPI Calculations
  const stats = useMemo(() => {
    const handChannels = channels.filter(c => c.hand === activeHand);
    const total = handChannels.length;
    let faulted = 0;
    handChannels.forEach(c => {
      if (isChannelFaulted(c.id)) faulted++;
    });
    const healthy = total - faulted;
    const integrityPct = total > 0 ? Math.round((healthy / total) * 100) : 100;

    return { total, faulted, healthy, integrityPct };
  }, [channels, activeHand, sensorData, simulatedFaults]);

  // Toggle simulation fault for testing UI
  const toggleFault = (channelId: string) => {
    setSimulatedFaults(prev => ({
      ...prev,
      [channelId]: !prev[channelId]
    }));
  };

  const clearAllFaults = () => {
    setSimulatedFaults({});
  };

  const triggerRandomFaults = () => {
    const next: Record<string, boolean> = {};
    const handChannels = channels.filter(c => c.hand === activeHand);
    handChannels.forEach(c => {
      if (Math.random() < 0.2) {
        next[c.id] = true;
      }
    });
    setSimulatedFaults(next);
  };

  // Filtered channel list for sidebar
  const filteredChannels = useMemo(() => {
    return channels.filter(c => {
      if (c.hand !== activeHand) return false;
      if (selectedZone && c.region !== selectedZone) return false;
      if (channelFilter === 'ZONE_1' && (c.id.startsWith('Z2') || c.finger === 'forearm')) return false;
      if (channelFilter === 'ZONE_2' && (!c.id.startsWith('Z2') && c.finger !== 'forearm')) return false;
      if (channelFilter === 'FAULTS' && !isChannelFaulted(c.id)) return false;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return c.id.toLowerCase().includes(query) || 
               c.label.toLowerCase().includes(query) || 
               c.region.toLowerCase().includes(query) ||
               c.fibreId.toLowerCase().includes(query);
      }
      return true;
    });
  }, [channels, activeHand, selectedZone, channelFilter, searchQuery, simulatedFaults, sensorData]);

  const selectedSensor = selectedChannelId ? gloveCalibrationMap[selectedChannelId] : null;

  return (
    <div className={styles.container}>
      {/* Top Header */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Link to="/gloves" className={styles.backBtn}>
            <ArrowLeft size={18} />
            Glove Center
          </Link>
          <div className={styles.title}>
            <Activity size={20} />
            Live 2D Glove Status Monitor
            <span className={styles.badge}>Zone 1: Hand (3-Dots + 20 Knuckle Wires) &bull; Zone 2: Forearm (24&times;20 Mesh)</span>
          </div>
        </div>

        <div className={styles.headerRight}>
          <div className={`${styles.statusPill} ${connectionState === 'LIVE' ? styles.live : styles.disconnected}`}>
            {connectionState === 'LIVE' ? <Radio size={14} /> : <WifiOff size={14} />}
            {connectionState === 'LIVE' ? 'ESP32 Streaming (115200)' : 'Serial Standby'}
          </div>

          <label className={styles.btn}>
            <Upload size={15} />
            Load Calibration JSON
            <input 
              type="file" 
              accept=".json" 
              style={{ display: 'none' }} 
              onChange={handleImportCalibration} 
            />
          </label>

          <button 
            className={`${styles.btn} ${styles.primary}`}
            onClick={connectToESP32}
            disabled={isConnecting}
          >
            <Cpu size={16} />
            {isConnecting ? 'Opening Port...' : 'Connect ESP32 (USB)'}
          </button>
        </div>
      </header>

      {errorMessage && (
        <div style={{
          background: 'rgba(255, 42, 42, 0.15)',
          border: '1px solid var(--status-fault)',
          color: '#ff6b6b',
          padding: '8px 16px',
          margin: '0.5rem 1rem 0',
          borderRadius: '6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.85rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={16} color="var(--status-fault)" />
            <span><strong>Serial Error:</strong> {errorMessage}</span>
          </div>
          <button 
            onClick={() => setErrorMessage(null)}
            style={{ background: 'none', border: 'none', color: '#ff6b6b', cursor: 'pointer', fontWeight: 'bold' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* KPI Stats Bar */}
      <div className={styles.kpiBar}>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Monitored Hand</span>
          <span className={styles.kpiValue} style={{ textTransform: 'capitalize' }}>
            {activeHand} Glove & Gauntlet
          </span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Monitored Wires/Sensors</span>
          <span className={styles.kpiValue}>{stats.total} Active</span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Healthy Junctions</span>
          <span className={`${styles.kpiValue} ${styles.healthy}`}>{stats.healthy}</span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Faulted Junctions</span>
          <span className={`${styles.kpiValue} ${stats.faulted > 0 ? styles.fault : styles.healthy}`}>
            {stats.faulted}
          </span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Integrity Index</span>
          <span className={`${styles.kpiValue} ${stats.integrityPct < 90 ? styles.fault : styles.healthy}`}>
            {stats.integrityPct}%
          </span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Status</span>
          <span className={`${styles.kpiValue} ${stats.faulted === 0 ? styles.healthy : styles.fault}`}>
            {stats.faulted === 0 ? 'NOMINAL' : 'ALERT'}
          </span>
        </div>
      </div>

      {/* Main Workspace */}
      <div className={styles.mainContent}>
        {/* Left Sidebar: Channels & Test Injections */}
        <aside className={styles.leftSidebar}>
          <div className={styles.sectionHeader}>
            <span>Wire Channels ({filteredChannels.length})</span>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button 
                className={styles.tabBtn} 
                style={{ fontSize: '0.65rem', padding: '2px 6px' }}
                onClick={triggerRandomFaults}
                title="Inject random fault bits for testing"
              >
                <Zap size={12} style={{ marginRight: '2px' }} />
                Sim Faults
              </button>
              <button 
                className={styles.tabBtn} 
                style={{ fontSize: '0.65rem', padding: '2px 6px' }}
                onClick={clearAllFaults}
                title="Clear test faults"
              >
                <RotateCcw size={12} />
              </button>
            </div>
          </div>

          <div style={{ padding: '0.75rem 0.75rem 0', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input 
                type="text"
                placeholder="Search wire (e.g. Y1, X1, Z2-X10)..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  background: 'rgba(0,0,0,0.2)',
                  border: '1px solid var(--border-color)',
                  color: 'white',
                  padding: '6px 8px 6px 28px',
                  borderRadius: '4px',
                  fontSize: '0.8rem'
                }}
              />
            </div>

            {/* Zone Filter Tabs */}
            <div style={{ display: 'flex', gap: '4px' }}>
              {(['ALL', 'ZONE_1', 'ZONE_2', 'FAULTS'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setChannelFilter(f)}
                  style={{
                    flex: 1,
                    padding: '4px 0',
                    fontSize: '0.65rem',
                    borderRadius: '4px',
                    border: '1px solid var(--border-color)',
                    background: channelFilter === f ? 'rgba(0, 240, 255, 0.2)' : 'rgba(0,0,0,0.2)',
                    color: channelFilter === f ? 'var(--status-healthy)' : 'var(--text-muted)',
                    cursor: 'pointer',
                    fontWeight: channelFilter === f ? 600 : 400
                  }}
                >
                  {f === 'ALL' ? 'ALL' : f === 'ZONE_1' ? 'Zone 1 (Hand)' : f === 'ZONE_2' ? 'Zone 2 (Arm)' : 'FAULTS'}
                </button>
              ))}
            </div>

            {selectedZone && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,240,255,0.1)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem' }}>
                <span>Filter: <strong>{selectedZone.replace('_', ' ')}</strong></span>
                <button 
                  onClick={() => setSelectedZone(null)} 
                  style={{ background: 'none', border: 'none', color: 'var(--status-healthy)', cursor: 'pointer', fontSize: '0.75rem' }}
                >
                  Clear
                </button>
              </div>
            )}
          </div>

          <div className={styles.channelList}>
            {filteredChannels.map(c => {
              const faulted = isChannelFaulted(c.id);
              const isSelected = selectedChannelId === c.id;
              const isZone2 = c.id.startsWith('Z2') || c.finger === 'forearm';

              return (
                <div 
                  key={c.id}
                  className={`${styles.channelItem} ${faulted ? styles.faulted : ''} ${isSelected ? styles.selected : ''}`}
                  onClick={() => {
                    setSelectedChannelId(c.id);
                    setSelectedZone(c.region);
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {faulted ? (
                      <AlertTriangle size={14} color="var(--status-fault)" />
                    ) : (
                      <CheckCircle size={14} color="var(--status-healthy)" />
                    )}
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>{c.id}</span>
                        <span style={{ 
                          fontSize: '0.62rem', 
                          padding: '1px 5px', 
                          borderRadius: '3px', 
                          background: isZone2 ? 'rgba(255, 170, 0, 0.15)' : 'rgba(0, 240, 255, 0.15)',
                          color: isZone2 ? '#ffaa00' : '#00f0ff'
                        }}>
                          {isZone2 ? 'Zone 2 (Arm)' : 'Zone 1 (Hand)'}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                        {c.label}
                      </div>
                    </div>
                  </div>

                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFault(c.id);
                    }}
                    style={{
                      background: faulted ? 'rgba(255,42,42,0.2)' : 'rgba(0,240,255,0.1)',
                      border: `1px solid ${faulted ? 'var(--status-fault)' : 'var(--border-color)'}`,
                      color: faulted ? 'var(--status-fault)' : 'var(--text-muted)',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontSize: '0.65rem',
                      cursor: 'pointer'
                    }}
                  >
                    {faulted ? 'FAULT' : 'OK'}
                  </button>
                </div>
              );
            })}
          </div>
        </aside>

        {/* Center Viewer: FRONT & BACK 2D SVG Hand + Forearm Diagrams */}
        <main className={styles.centerViewer}>
          <div className={styles.diagramControls}>
            <div className={styles.viewTabs}>
              <button 
                className={`${styles.tabBtn} ${activeHand === 'left' ? styles.active : ''}`}
                onClick={() => setActiveHand('left')}
              >
                Left Glove & Forearm
              </button>
              <button 
                className={`${styles.tabBtn} ${activeHand === 'right' ? styles.active : ''}`}
                onClick={() => setActiveHand('right')}
              >
                Right Glove & Forearm
              </button>
            </div>

            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Info size={14} />
              Zone 1: Fingers (Y1..Y5 vertical) + Knuckles (20 Horiz X) &bull; Zone 2: Forearm (24 Horiz X &times; 20 Vert Y)
            </div>
          </div>

          <div className={styles.diagramGrid}>
            {/* FRONT VIEW (Palmar Aspect) */}
            <div className={styles.diagramCard}>
              <div className={styles.diagramHeader}>
                <div className={styles.diagramTitle}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--status-healthy)', display: 'inline-block' }}></span>
                  FRONT VIEW (Palmar / Anterior Aspect)
                </div>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                  {activeHand} Glove + Gauntlet (Zone 1 & 2)
                </span>
              </div>

              <div className={styles.diagramSvgWrapper} style={{ minHeight: '620px' }}>
                <Hand2DDiagram 
                  hand={activeHand}
                  view="front"
                  channels={channels.filter(c => c.hand === activeHand)}
                  isChannelFaulted={isChannelFaulted}
                  isZoneFaulted={isZoneFaulted}
                  selectedChannelId={selectedChannelId}
                  selectedZone={selectedZone}
                  onSelectChannel={setSelectedChannelId}
                  onSelectZone={setSelectedZone}
                />
              </div>
            </div>

            {/* BACK VIEW (Dorsal Aspect) */}
            <div className={styles.diagramCard}>
              <div className={styles.diagramHeader}>
                <div className={styles.diagramTitle}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--status-healthy)', display: 'inline-block' }}></span>
                  BACK VIEW (Dorsal / Posterior Aspect)
                </div>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                  {activeHand} Glove + Gauntlet (Zone 1 & 2)
                </span>
              </div>

              <div className={styles.diagramSvgWrapper} style={{ minHeight: '620px' }}>
                <Hand2DDiagram 
                  hand={activeHand}
                  view="back"
                  channels={channels.filter(c => c.hand === activeHand)}
                  isChannelFaulted={isChannelFaulted}
                  isZoneFaulted={isZoneFaulted}
                  selectedChannelId={selectedChannelId}
                  selectedZone={selectedZone}
                  onSelectChannel={setSelectedChannelId}
                  onSelectZone={setSelectedZone}
                />
              </div>
            </div>
          </div>
        </main>

        {/* Right Sidebar: Telemetry & Zone Breakdown */}
        <aside className={styles.rightSidebar}>
          <div className={styles.sectionHeader}>
            <span>Telemetry Inspector</span>
          </div>

          <div style={{ padding: '1rem', display: 'flex', flex: 1, flexDirection: 'column', gap: '1rem', overflowY: 'auto' }}>
            {selectedSensor ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Selected Channel / Wire</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: isChannelFaulted(selectedSensor.id) ? 'var(--status-fault)' : 'var(--status-healthy)', marginTop: '2px' }}>
                    {selectedSensor.id}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-main)', marginTop: '4px' }}>
                    {selectedSensor.label}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Zone</div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 600, color: selectedSensor.id.startsWith('Z2') || selectedSensor.finger === 'forearm' ? '#ffaa00' : '#00f0ff' }}>
                      {selectedSensor.id.startsWith('Z2') || selectedSensor.finger === 'forearm' ? 'Zone 2 (Wrist-to-Elbow)' : 'Zone 1 (Hand)'}
                    </div>
                  </div>
                  <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Status</div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 600, color: isChannelFaulted(selectedSensor.id) ? 'var(--status-fault)' : 'var(--status-healthy)' }}>
                      {isChannelFaulted(selectedSensor.id) ? 'FAULT (1)' : 'NOMINAL (0)'}
                    </div>
                  </div>
                  <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Anatomical Region</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', textTransform: 'capitalize' }}>
                      {selectedSensor.region.replace('_', ' ')}
                    </div>
                  </div>
                  <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Fibre Bus Route</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)' }}>
                      {selectedSensor.fibreId}
                    </div>
                  </div>
                </div>

                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '4px' }}>3D Spatial Anchor</div>
                  <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--status-healthy)' }}>
                    X: {selectedSensor.position[0].toFixed(3)} | Y: {selectedSensor.position[1].toFixed(3)} | Z: {selectedSensor.position[2].toFixed(3)}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', padding: '2rem 1rem' }}>
                Click any wire or junction dot on the hand or forearm diagram to inspect optical telemetry.
              </div>
            )}

            <div className={styles.sectionHeader} style={{ margin: '0.5rem -1rem 0', padding: '0.5rem 1rem' }}>
              <span>Zone Status Summary</span>
            </div>

            <div className={styles.zoneOverviewList}>
              {GLOVE_ZONES[activeHand].map((z, idx) => {
                const faulted = isZoneFaulted(z.id);
                return (
                  <div 
                    key={`${z.id}-${idx}`}
                    className={`${styles.zoneBadge} ${faulted ? styles.faulted : ''}`}
                    onClick={() => setSelectedZone(z.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <span className={styles.zoneBadgeName}>{z.label}</span>
                    <span className={`${styles.zoneBadgeStatus} ${faulted ? styles.faulted : ''}`}>
                      {faulted ? 'FAULT DETECTED' : 'HEALTHY'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

// ----------------------------------------------------------------------------------
// 2D SVG Hand & Forearm Diagram Component:
// Zone 1: Hand (Finger Vertical Wires Y1..Y5 + 20 Knuckle Horizontal Wires X1..X20)
// Zone 2: Forearm Wrist to Elbow (24 Horizontal Wires Z2-X1..X24 & 20 Vertical Wires Z2-Y1..Y20)
// ----------------------------------------------------------------------------------

// Zone 1 Knuckle Horizontal Wires: 20 wires localized exclusively to the Knuckles (MCP Band, y=138 to 176)
const Z1_KNUCKLE_X_WIRES = Array.from({ length: 20 }, (_, i) => {
  const wireNum = i + 1;
  const y = 138 + i * 1.95; // Localized within the 38px knuckle band
  const leftX = 82;
  const rightX = 216;
  return {
    num: wireNum,
    id: `Z1-X${wireNum}`,
    y,
    span: [leftX, rightX]
  };
});

// Zone 2 Forearm Horizontal Wires: 24 wires from wrist (y=345) to elbow (y=625)
const Z2_FOREARM_X_WIRES = Array.from({ length: 24 }, (_, i) => {
  const wireNum = i + 1;
  const y = 345 + i * 12.2;
  const leftX = 90 - (y - 330) * 0.07;
  const rightX = 210 + (y - 330) * 0.07;
  return {
    num: wireNum,
    id: `Z2-X${wireNum}`,
    y,
    span: [leftX, rightX]
  };
});

// Zone 2 Forearm Vertical Wires: 20 vertical wires across forearm width
const Z2_FOREARM_Y_COLS = Array.from({ length: 20 }, (_, j) => {
  const colNum = j + 1;
  const u = j / 19; // 0 to 1
  return {
    num: colNum,
    id: `Z2-Y${colNum}`,
    u
  };
});

interface FingerDotDef {
  segment: 'tip' | 'mid' | 'base';
  label: string;
  shortLabel: string;
  x: number;
  y: number;
}

interface FingerVerticalWireDef {
  finger: GloveFinger;
  region: GloveRegion;
  label: string;
  yWireId: string;
  yWireLabel: string;
  pathD: string;
  dots: FingerDotDef[];
}

const Z1_FINGER_WIRES: Record<GloveHand, FingerVerticalWireDef[]> = {
  left: [
    {
      finger: 'thumb',
      region: 'left_thumb',
      label: 'Left Thumb',
      yWireId: 'Y1',
      yWireLabel: 'Y1 (Thumb)',
      pathD: 'M 45 122 L 63 157 L 81 192 Q 100 250 105 320',
      dots: [
        { segment: 'tip', label: 'Distal Tip', shortLabel: 'TIP', x: 45, y: 122 },
        { segment: 'mid', label: 'Interphalangeal (IP)', shortLabel: 'MID', x: 63, y: 157 },
        { segment: 'base', label: 'Metacarpophalangeal (MCP)', shortLabel: 'BASE', x: 81, y: 192 }
      ]
    },
    {
      finger: 'index',
      region: 'left_index_finger',
      label: 'Left Index Finger',
      yWireId: 'Y2',
      yWireLabel: 'Y2 (Index)',
      pathD: 'M 110 48 L 110 92 L 110 136 L 115 320',
      dots: [
        { segment: 'tip', label: 'Distal Tip', shortLabel: 'TIP', x: 110, y: 48 },
        { segment: 'mid', label: 'Proximal Interphalangeal (PIP)', shortLabel: 'MID', x: 110, y: 92 },
        { segment: 'base', label: 'Metacarpophalangeal (MCP)', shortLabel: 'BASE', x: 110, y: 136 }
      ]
    },
    {
      finger: 'middle',
      region: 'left_middle_finger',
      label: 'Left Middle Finger',
      yWireId: 'Y3',
      yWireLabel: 'Y3 (Middle)',
      pathD: 'M 146 32 L 146 82 L 146 132 L 146 320',
      dots: [
        { segment: 'tip', label: 'Distal Tip', shortLabel: 'TIP', x: 146, y: 32 },
        { segment: 'mid', label: 'Proximal Interphalangeal (PIP)', shortLabel: 'MID', x: 146, y: 82 },
        { segment: 'base', label: 'Metacarpophalangeal (MCP)', shortLabel: 'BASE', x: 146, y: 132 }
      ]
    },
    {
      finger: 'ring',
      region: 'left_ring_finger',
      label: 'Left Ring Finger',
      yWireId: 'Y4',
      yWireLabel: 'Y4 (Ring)',
      pathD: 'M 178 48 L 178 92 L 178 136 L 175 320',
      dots: [
        { segment: 'tip', label: 'Distal Tip', shortLabel: 'TIP', x: 178, y: 48 },
        { segment: 'mid', label: 'Proximal Interphalangeal (PIP)', shortLabel: 'MID', x: 178, y: 92 },
        { segment: 'base', label: 'Metacarpophalangeal (MCP)', shortLabel: 'BASE', x: 178, y: 136 }
      ]
    },
    {
      finger: 'little',
      region: 'left_little_finger',
      label: 'Left Little Finger',
      yWireId: 'Y5',
      yWireLabel: 'Y5 (Little)',
      pathD: 'M 218 78 L 212 117 L 206 156 Q 195 240 185 320',
      dots: [
        { segment: 'tip', label: 'Distal Tip', shortLabel: 'TIP', x: 218, y: 78 },
        { segment: 'mid', label: 'Proximal Interphalangeal (PIP)', shortLabel: 'MID', x: 212, y: 117 },
        { segment: 'base', label: 'Metacarpophalangeal (MCP)', shortLabel: 'BASE', x: 206, y: 156 }
      ]
    }
  ],
  right: [
    {
      finger: 'thumb',
      region: 'right_thumb',
      label: 'Right Thumb',
      yWireId: 'Y1',
      yWireLabel: 'Y1 (Thumb)',
      pathD: 'M 45 122 L 63 157 L 81 192 Q 100 250 105 320',
      dots: [
        { segment: 'tip', label: 'Distal Tip', shortLabel: 'TIP', x: 45, y: 122 },
        { segment: 'mid', label: 'Interphalangeal (IP)', shortLabel: 'MID', x: 63, y: 157 },
        { segment: 'base', label: 'Metacarpophalangeal (MCP)', shortLabel: 'BASE', x: 81, y: 192 }
      ]
    },
    {
      finger: 'index',
      region: 'right_index_finger',
      label: 'Right Index Finger',
      yWireId: 'Y2',
      yWireLabel: 'Y2 (Index)',
      pathD: 'M 110 48 L 110 92 L 110 136 L 115 320',
      dots: [
        { segment: 'tip', label: 'Distal Tip', shortLabel: 'TIP', x: 110, y: 48 },
        { segment: 'mid', label: 'Proximal Interphalangeal (PIP)', shortLabel: 'MID', x: 110, y: 92 },
        { segment: 'base', label: 'Metacarpophalangeal (MCP)', shortLabel: 'BASE', x: 110, y: 136 }
      ]
    },
    {
      finger: 'middle',
      region: 'right_middle_finger',
      label: 'Right Middle Finger',
      yWireId: 'Y3',
      yWireLabel: 'Y3 (Middle)',
      pathD: 'M 146 32 L 146 82 L 146 132 L 146 320',
      dots: [
        { segment: 'tip', label: 'Distal Tip', shortLabel: 'TIP', x: 146, y: 32 },
        { segment: 'mid', label: 'Proximal Interphalangeal (PIP)', shortLabel: 'MID', x: 146, y: 82 },
        { segment: 'base', label: 'Metacarpophalangeal (MCP)', shortLabel: 'BASE', x: 146, y: 132 }
      ]
    },
    {
      finger: 'ring',
      region: 'right_ring_finger',
      label: 'Right Ring Finger',
      yWireId: 'Y4',
      yWireLabel: 'Y4 (Ring)',
      pathD: 'M 178 48 L 178 92 L 178 136 L 175 320',
      dots: [
        { segment: 'tip', label: 'Distal Tip', shortLabel: 'TIP', x: 178, y: 48 },
        { segment: 'mid', label: 'Proximal Interphalangeal (PIP)', shortLabel: 'MID', x: 178, y: 92 },
        { segment: 'base', label: 'Metacarpophalangeal (MCP)', shortLabel: 'BASE', x: 178, y: 136 }
      ]
    },
    {
      finger: 'little',
      region: 'right_little_finger',
      label: 'Right Little Finger',
      yWireId: 'Y5',
      yWireLabel: 'Y5 (Little)',
      pathD: 'M 218 78 L 212 117 L 206 156 Q 195 240 185 320',
      dots: [
        { segment: 'tip', label: 'Distal Tip', shortLabel: 'TIP', x: 218, y: 78 },
        { segment: 'mid', label: 'Proximal Interphalangeal (PIP)', shortLabel: 'MID', x: 212, y: 117 },
        { segment: 'base', label: 'Metacarpophalangeal (MCP)', shortLabel: 'BASE', x: 206, y: 156 }
      ]
    }
  ]
};

interface Hand2DDiagramProps {
  hand: GloveHand;
  view: 'front' | 'back';
  channels: any[];
  isChannelFaulted: (channelId: string) => boolean;
  isZoneFaulted: (region: GloveRegion) => boolean;
  selectedChannelId: string | null;
  selectedZone: GloveRegion | null;
  onSelectChannel: (id: string) => void;
  onSelectZone: (zone: GloveRegion) => void;
}

const Hand2DDiagram: React.FC<Hand2DDiagramProps> = ({
  hand,
  view,
  channels: _channels,
  isChannelFaulted,
  isZoneFaulted,
  selectedChannelId,
  selectedZone,
  onSelectChannel,
  onSelectZone
}) => {
  const isRight = hand === 'right';
  const isBack = view === 'back';
  const flipX = (isRight && !isBack) || (!isRight && isBack);

  const palmRegion: GloveRegion = `${hand}_palm`;
  const thumbRegion: GloveRegion = `${hand}_thumb`;
  const indexRegion: GloveRegion = `${hand}_index_finger`;
  const middleRegion: GloveRegion = `${hand}_middle_finger`;
  const ringRegion: GloveRegion = `${hand}_ring_finger`;
  const littleRegion: GloveRegion = `${hand}_little_finger`;
  const forearmRegion: GloveRegion = `${hand}_forearm`;

  const getZoneStyle = (region: GloveRegion) => {
    const faulted = isZoneFaulted(region);
    const isSelected = selectedZone === region;

    if (faulted) {
      return {
        fill: 'rgba(255, 42, 42, 0.25)',
        stroke: '#ff2a2a',
        strokeWidth: isSelected ? 3 : 2,
        filter: 'drop-shadow(0 0 8px rgba(255,42,42,0.8))',
        transition: 'all 0.25s ease'
      };
    }

    if (isSelected) {
      return {
        fill: 'rgba(0, 240, 255, 0.2)',
        stroke: '#00f0ff',
        strokeWidth: 2.5,
        filter: 'drop-shadow(0 0 8px rgba(0,240,255,0.8))',
        transition: 'all 0.25s ease'
      };
    }

    return {
      fill: 'rgba(6, 20, 42, 0.75)',
      stroke: 'rgba(0, 240, 255, 0.35)',
      strokeWidth: 1.5,
      transition: 'all 0.25s ease'
    };
  };

  const fingerWires = Z1_FINGER_WIRES[hand];

  return (
    <svg 
      viewBox="0 0 340 680" 
      style={{ 
        width: '100%', 
        height: '100%', 
        maxHeight: '640px',
        overflow: 'visible'
      }}
    >
      <defs>
        <radialGradient id={`glow-fault-${hand}-${view}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ff2a2a" stopOpacity="0.95" />
          <stop offset="60%" stopColor="#ff2a2a" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#ff2a2a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`glow-healthy-${hand}-${view}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.85" />
          <stop offset="65%" stopColor="#00f0ff" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#00f0ff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`glow-selected-${hand}-${view}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#00f0ff" stopOpacity="1" />
          <stop offset="50%" stopColor="#00f0ff" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#00f0ff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Main Graphics Group (flipped via SVG transform if needed) */}
      <g transform={flipX ? 'translate(340, 0) scale(-1, 1)' : undefined}>
        
        {/* ========================================================================= */}
        {/* SILHOUETTES: ZONE 1 (HAND) & ZONE 2 (FOREARM WRIST TO ELBOW)              */}
        {/* ========================================================================= */}
        <g style={{ cursor: 'pointer' }}>
          {/* Zone 1: Wrist & Palm Region */}
          <path
            d="M 90 320 C 85 280, 80 250, 75 220 C 70 190, 80 160, 95 150 C 130 145, 170 145, 205 155 C 220 170, 225 210, 220 250 C 215 285, 210 320, 210 320 Z"
            style={getZoneStyle(palmRegion)}
            onClick={() => onSelectZone(palmRegion)}
          />

          {/* Zone 1: Thumb */}
          <path
            d="M 75 220 C 50 200, 35 170, 30 140 C 28 120, 45 110, 60 125 C 75 140, 85 165, 95 185 Z"
            style={getZoneStyle(thumbRegion)}
            onClick={() => onSelectZone(thumbRegion)}
          />

          {/* Zone 1: Index Finger */}
          <path
            d="M 95 150 C 95 115, 95 80, 100 45 C 102 30, 118 30, 120 45 C 122 80, 125 115, 125 147 Z"
            style={getZoneStyle(indexRegion)}
            onClick={() => onSelectZone(indexRegion)}
          />

          {/* Zone 1: Middle Finger */}
          <path
            d="M 127 146 C 130 105, 133 65, 137 25 C 139 12, 156 12, 158 25 C 160 65, 160 105, 160 146 Z"
            style={getZoneStyle(middleRegion)}
            onClick={() => onSelectZone(middleRegion)}
          />

          {/* Zone 1: Ring Finger */}
          <path
            d="M 163 147 C 165 110, 168 75, 172 40 C 174 28, 189 28, 191 40 C 193 75, 193 110, 193 150 Z"
            style={getZoneStyle(ringRegion)}
            onClick={() => onSelectZone(ringRegion)}
          />

          {/* Zone 1: Little Finger */}
          <path
            d="M 195 152 C 200 120, 205 95, 210 75 C 212 62, 226 62, 228 75 C 227 100, 223 135, 218 165 Z"
            style={getZoneStyle(littleRegion)}
            onClick={() => onSelectZone(littleRegion)}
          />

          {/* Zone 2: Forearm Sleeve (Wrist to Elbow) */}
          <path
            d="M 90 330 L 68 640 C 110 655, 190 655, 232 640 L 210 330 Z"
            style={getZoneStyle(forearmRegion)}
            onClick={() => onSelectZone(forearmRegion)}
          />
        </g>

        {/* ========================================================================= */}
        {/* ZONE 1: HAND OPTICAL WIRES & 3 EQUIDISTANT DOTS PER FINGER                */}
        {/* ========================================================================= */}

        {/* 1. Finger Vertical Wires: Y1..Y5 (1 per finger, ending at wrist) */}
        <g>
          {fingerWires.map(fw => {
            const isWireSelected = selectedChannelId === fw.yWireId || selectedChannelId?.includes(fw.yWireId);
            const isWireFaulted = isChannelFaulted(fw.yWireId) || isChannelFaulted(`Z1-${hand === 'left' ? 'L' : 'R'}-${fw.yWireId}`);

            return (
              <g 
                key={fw.finger}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectChannel(`Z1-${hand === 'left' ? 'L' : 'R'}-${fw.yWireId}`);
                  onSelectZone(fw.region);
                }}
                style={{ cursor: 'pointer' }}
              >
                <title>{`Vertical Wire: ${fw.yWireLabel}`}</title>
                {/* Finger vertical wire path */}
                <path
                  d={fw.pathD}
                  fill="none"
                  stroke={isWireFaulted ? '#ff2a2a' : isWireSelected ? '#00f0ff' : 'rgba(0, 240, 255, 0.65)'}
                  strokeWidth={isWireSelected ? 2.5 : 1.8}
                />

                {/* Fingertip Label */}
                <text
                  x={fw.dots[0].x}
                  y={fw.dots[0].y - 10}
                  textAnchor="middle"
                  fill={isWireFaulted ? '#ff6b6b' : isWireSelected ? '#00f0ff' : '#ffaa00'}
                  fontSize="8.5"
                  fontFamily="monospace"
                  fontWeight="bold"
                >
                  {fw.yWireId}
                </text>

                {/* 3 Equidistant Dots on this vertical finger wire */}
                {fw.dots.map((dot, dIdx) => {
                  const dotChannelId = `Z1-${hand === 'left' ? 'L' : 'R'}-${fw.yWireId}-D${dIdx + 1}`;
                  const isDotSelected = selectedChannelId === dotChannelId || isWireSelected;
                  const isDotFaulted = isWireFaulted || isChannelFaulted(dotChannelId);

                  return (
                    <g 
                      key={dot.segment}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectChannel(`Z1-${hand === 'left' ? 'L' : 'R'}-${fw.yWireId}`);
                        onSelectZone(fw.region);
                      }}
                    >
                      <title>{`${fw.label} — ${dot.label} (${dot.shortLabel})\nPosition: X=${dot.x}, Y=${dot.y}\nWire: ${fw.yWireId}`}</title>
                      {/* Fault Glow */}
                      {isDotFaulted && (
                        <circle cx={dot.x} cy={dot.y} r={12} fill={`url(#glow-fault-${hand}-${view})`} />
                      )}
                      {/* Selection Glow */}
                      {isDotSelected && !isDotFaulted && (
                        <circle cx={dot.x} cy={dot.y} r={11} fill={`url(#glow-selected-${hand}-${view})`} />
                      )}
                      {/* Selection Ring */}
                      {isDotSelected && (
                        <circle cx={dot.x} cy={dot.y} r={8.5} fill="none" stroke={isDotFaulted ? '#ff2a2a' : '#00f0ff'} strokeWidth={1.5} strokeDasharray="2 2" />
                      )}
                      {/* Core Dot */}
                      <circle
                        cx={dot.x}
                        cy={dot.y}
                        r={isDotSelected ? 5.5 : 4.5}
                        fill={isDotFaulted ? '#ff2a2a' : isDotSelected ? '#00f0ff' : 'var(--status-healthy)'}
                        stroke={isDotFaulted ? '#ffffff' : '#020813'}
                        strokeWidth={isDotSelected ? 2 : 1.2}
                      />
                      {/* Optic Pin */}
                      <circle cx={dot.x} cy={dot.y} r={1.5} fill="#ffffff" opacity={0.95} />
                    </g>
                  );
                })}
              </g>
            );
          })}
        </g>

        {/* 2. Zone 1 Knuckle Band 20 Horizontal Wires (X1..X20 exclusively across Knuckles) */}
        <g>
          {/* Subtle Knuckle Band Region Boundary */}
          <rect
            x="76"
            y="134"
            width="146"
            height="46"
            rx="4"
            fill="rgba(0, 240, 255, 0.03)"
            stroke="rgba(0, 240, 255, 0.2)"
            strokeWidth="0.8"
            strokeDasharray="3 3"
          />
          <text
            x="226"
            y="158"
            fill="rgba(0, 240, 255, 0.6)"
            fontSize="5.5"
            fontFamily="monospace"
            fontWeight="bold"
          >
            KNUCKLE BAND (20 X-WIRES)
          </text>

          {Z1_KNUCKLE_X_WIRES.map(row => {
            const wireKey = `Z1-${hand === 'left' ? 'L' : 'R'}-X${row.num}`;
            const isRowSelected = selectedChannelId === wireKey || selectedChannelId === row.id;
            const isRowFaulted = isChannelFaulted(wireKey) || isChannelFaulted(row.id);

            return (
              <g 
                key={row.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectChannel(wireKey);
                  onSelectZone(palmRegion);
                }}
                style={{ cursor: 'pointer' }}
              >
                <title>{`Zone 1 Knuckle Wire: X${row.num} [Knuckle Band Row ${row.num}/20]`}</title>
                {/* Horizontal Wire Line */}
                <line
                  x1={row.span[0]}
                  y1={row.y}
                  x2={row.span[1]}
                  y2={row.y}
                  stroke={isRowFaulted ? '#ff2a2a' : isRowSelected ? '#00f0ff' : 'rgba(0, 240, 255, 0.45)'}
                  strokeWidth={isRowSelected ? 1.8 : 0.85}
                />
                {/* Wire Tag Number */}
                <text
                  x={row.span[0] - 3}
                  y={row.y + 1.8}
                  textAnchor="end"
                  fill={isRowFaulted ? '#ff6b6b' : isRowSelected ? '#00f0ff' : 'rgba(0, 240, 255, 0.65)'}
                  fontSize="5"
                  fontFamily="monospace"
                  fontWeight="600"
                >
                  {`X${row.num}`}
                </text>
              </g>
            );
          })}
        </g>

        {/* ========================================================================= */}
        {/* WRIST CUFF DIVIDER (ZONE 1 / ZONE 2 BOUNDARY)                              */}
        {/* ========================================================================= */}
        <g>
          <rect x="88" y="322" width="124" height="6" rx="3" fill="rgba(0, 240, 255, 0.2)" stroke="#00f0ff" strokeWidth="1" />
          <text x="150" y="327" textAnchor="middle" fill="#00f0ff" fontSize="5.5" fontFamily="monospace" fontWeight="bold" letterSpacing="0.8">
            WRIST CUFF (Z1 ▲ | ▼ Z2)
          </text>
        </g>

        {/* ========================================================================= */}
        {/* ZONE 2: FOREARM (WRIST TO ELBOW) — 24 HORIZONTAL & 20 VERTICAL WIRES      */}
        {/* ========================================================================= */}

        {/* Zone 2: 24 Horizontal Wires (Z2-X1..X24) */}
        <g>
          {Z2_FOREARM_X_WIRES.map(row => {
            const wireKey = `Z2-${hand === 'left' ? 'L' : 'R'}-X${row.num}`;
            const isRowSelected = selectedChannelId === wireKey || selectedChannelId === row.id;
            const isRowFaulted = isChannelFaulted(wireKey) || isChannelFaulted(row.id);

            return (
              <g 
                key={row.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectChannel(wireKey);
                  onSelectZone(forearmRegion);
                }}
                style={{ cursor: 'pointer' }}
              >
                <title>{`Zone 2 Forearm Wire: X${row.num} [Row ${row.num}/24]`}</title>
                <line
                  x1={row.span[0]}
                  y1={row.y}
                  x2={row.span[1]}
                  y2={row.y}
                  stroke={isRowFaulted ? '#ff2a2a' : isRowSelected ? '#00f0ff' : 'rgba(255, 170, 0, 0.4)'}
                  strokeWidth={isRowSelected ? 2 : 1}
                  strokeDasharray={isRowSelected ? undefined : '3 2'}
                />
                <text
                  x={row.span[0] - 4}
                  y={row.y + 2.5}
                  textAnchor="end"
                  fill={isRowFaulted ? '#ff6b6b' : isRowSelected ? '#00f0ff' : 'rgba(255, 170, 0, 0.7)'}
                  fontSize="6"
                  fontFamily="monospace"
                  fontWeight="600"
                >
                  {`X${row.num}`}
                </text>
              </g>
            );
          })}
        </g>

        {/* Zone 2: 20 Vertical Wires (Z2-Y1..Y20) */}
        <g>
          {Z2_FOREARM_Y_COLS.map(col => {
            const wireKey = `Z2-${hand === 'left' ? 'L' : 'R'}-Y${col.num}`;
            const isColSelected = selectedChannelId === wireKey || selectedChannelId === col.id;
            const isColFaulted = isChannelFaulted(wireKey) || isChannelFaulted(col.id);

            const xTop = 90 + col.u * 120;
            const xBottom = 68 + col.u * 164;

            return (
              <g 
                key={col.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectChannel(wireKey);
                  onSelectZone(forearmRegion);
                }}
                style={{ cursor: 'pointer' }}
              >
                <title>{`Zone 2 Forearm Wire: Y${col.num} [Col ${col.num}/20]`}</title>
                <line
                  x1={xTop}
                  y1={338}
                  x2={xBottom}
                  y2={636}
                  stroke={isColFaulted ? '#ff2a2a' : isColSelected ? '#00f0ff' : 'rgba(0, 240, 255, 0.4)'}
                  strokeWidth={isColSelected ? 2 : 1}
                />
                {/* Column Tag at bottom */}
                <text
                  x={xBottom}
                  y={648}
                  textAnchor="middle"
                  fill={isColFaulted ? '#ff6b6b' : isColSelected ? '#00f0ff' : 'rgba(0, 240, 255, 0.7)'}
                  fontSize="5.5"
                  fontFamily="monospace"
                  fontWeight="bold"
                >
                  {`Y${col.num}`}
                </text>
              </g>
            );
          })}
        </g>

        {/* Zone 2 Sample Grid Junction Dots */}
        <g>
          {[0, 5, 11, 17, 23].map(rIdx => {
            const row = Z2_FOREARM_X_WIRES[rIdx];
            return [0, 4, 9, 14, 19].map(cIdx => {
              const col = Z2_FOREARM_Y_COLS[cIdx];
              const jX = row.span[0] + col.u * (row.span[1] - row.span[0]);
              const jY = row.y;
              const junctionId = `Z2-${hand === 'left' ? 'L' : 'R'}-X${row.num}-Y${col.num}`;
              const isJunctionFaulted = isChannelFaulted(junctionId);
              const isJunctionSelected = selectedChannelId === junctionId;

              return (
                <circle
                  key={junctionId}
                  cx={jX}
                  cy={jY}
                  r={isJunctionSelected ? 3.5 : 2}
                  fill={isJunctionFaulted ? '#ff2a2a' : isJunctionSelected ? '#00f0ff' : 'rgba(0, 240, 255, 0.6)'}
                  stroke="#020813"
                  strokeWidth={0.8}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectChannel(`Z2-${hand === 'left' ? 'L' : 'R'}-X${row.num}`);
                    onSelectZone(forearmRegion);
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <title>{`Zone 2 Junction (X${row.num}, Y${col.num})`}</title>
                </circle>
              );
            });
          })}
        </g>
      </g>

      {/* Upright Bottom Legend */}
      <text
        x="170"
        y="670"
        textAnchor="middle"
        fill="var(--text-muted)"
        fontSize="9"
        letterSpacing="1"
        fontWeight="600"
      >
        {view.toUpperCase()} ASPECT &bull; Z1: HAND (Y1..Y5 + 20 X-WIRES) &bull; Z2: ARM (24 X &times; 20 Y)
      </text>
    </svg>
  );
};

export default LiveGloveStatus;
