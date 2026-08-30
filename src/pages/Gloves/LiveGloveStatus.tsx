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
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return c.id.toLowerCase().includes(query) || 
               c.label.toLowerCase().includes(query) || 
               c.region.toLowerCase().includes(query) ||
               c.fibreId.toLowerCase().includes(query);
      }
      return true;
    });
  }, [channels, activeHand, selectedZone, searchQuery]);

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
            <span className={styles.badge}>Real-Time Telemetry</span>
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
            {activeHand} Glove
          </span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Total Channels</span>
          <span className={styles.kpiValue}>{stats.total} / 120</span>
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
            <span>Channels ({filteredChannels.length})</span>
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
                placeholder="Search channel (e.g. X1, Palm)..."
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
                      <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{c.id}</div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                        {c.region.replace('_', ' ')} &bull; {c.fibreId}
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

        {/* Center Viewer: FRONT & BACK 2D SVG Hand Diagrams */}
        <main className={styles.centerViewer}>
          <div className={styles.diagramControls}>
            <div className={styles.viewTabs}>
              <button 
                className={`${styles.tabBtn} ${activeHand === 'left' ? styles.active : ''}`}
                onClick={() => setActiveHand('left')}
              >
                Left Glove
              </button>
              <button 
                className={`${styles.tabBtn} ${activeHand === 'right' ? styles.active : ''}`}
                onClick={() => setActiveHand('right')}
              >
                Right Glove
              </button>
            </div>

            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Info size={14} />
              Click zones or nodes to inspect telemetry
            </div>
          </div>

          <div className={styles.diagramGrid}>
            {/* FRONT VIEW (Palmar) */}
            <div className={styles.diagramCard}>
              <div className={styles.diagramHeader}>
                <div className={styles.diagramTitle}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--status-healthy)', display: 'inline-block' }}></span>
                  FRONT VIEW (Palmar Aspect)
                </div>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                  {activeHand} Hand
                </span>
              </div>

              <div className={styles.diagramSvgWrapper}>
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

            {/* BACK VIEW (Dorsal) */}
            <div className={styles.diagramCard}>
              <div className={styles.diagramHeader}>
                <div className={styles.diagramTitle}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--status-healthy)', display: 'inline-block' }}></span>
                  BACK VIEW (Dorsal Aspect)
                </div>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                  {activeHand} Hand
                </span>
              </div>

              <div className={styles.diagramSvgWrapper}>
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
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Selected Sensor</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--status-healthy)', marginTop: '2px' }}>
                    {selectedSensor.id}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-main)', marginTop: '4px' }}>
                    {selectedSensor.label}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Status</div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 600, color: isChannelFaulted(selectedSensor.id) ? 'var(--status-fault)' : 'var(--status-healthy)' }}>
                      {isChannelFaulted(selectedSensor.id) ? 'FAULT (1)' : 'NOMINAL (0)'}
                    </div>
                  </div>
                  <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Fibre Route</div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)' }}>
                      {selectedSensor.fibreId}
                    </div>
                  </div>
                  <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Zone</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', textTransform: 'capitalize' }}>
                      {selectedSensor.region.replace('_', ' ')}
                    </div>
                  </div>
                  <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Finger / Part</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', textTransform: 'capitalize' }}>
                      {selectedSensor.finger}
                    </div>
                  </div>
                </div>

                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '4px' }}>3D / Calibration Anchor</div>
                  <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--status-healthy)' }}>
                    X: {selectedSensor.position[0].toFixed(3)} | Y: {selectedSensor.position[1].toFixed(3)} | Z: {selectedSensor.position[2].toFixed(3)}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', padding: '2rem 1rem' }}>
                Select a channel or zone on the diagram to inspect real-time junction data.
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
// 2D SVG Hand Diagram Component with Distinct Anatomical Zones & Sensor Coordinates
// ----------------------------------------------------------------------------------

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
  channels,
  isChannelFaulted,
  isZoneFaulted,
  selectedChannelId,
  selectedZone,
  onSelectChannel,
  onSelectZone
}) => {
  // Mirror horizontally if right hand
  const isRight = hand === 'right';
  const isBack = view === 'back';
  
  // Transform scale for mirroring if needed
  // For front left: thumb is on left. For front right: thumb is on right.
  // For back left: thumb is on right. For back right: thumb is on left.
  const flipX = (isRight && !isBack) || (!isRight && isBack);

  const palmRegion: GloveRegion = `${hand}_palm`;
  const thumbRegion: GloveRegion = `${hand}_thumb`;
  const indexRegion: GloveRegion = `${hand}_index_finger`;
  const middleRegion: GloveRegion = `${hand}_middle_finger`;
  const ringRegion: GloveRegion = `${hand}_ring_finger`;
  const littleRegion: GloveRegion = `${hand}_little_finger`;

  const getZoneStyle = (region: GloveRegion) => {
    const faulted = isZoneFaulted(region);
    const isSelected = selectedZone === region;

    if (faulted) {
      return {
        fill: 'rgba(255, 42, 42, 0.35)',
        stroke: '#ff2a2a',
        strokeWidth: isSelected ? 3 : 2,
        filter: 'drop-shadow(0 0 6px rgba(255,42,42,0.8))',
        transition: 'all 0.25s ease'
      };
    }

    if (isSelected) {
      return {
        fill: 'rgba(0, 240, 255, 0.25)',
        stroke: '#00f0ff',
        strokeWidth: 2.5,
        filter: 'drop-shadow(0 0 6px rgba(0,240,255,0.8))',
        transition: 'all 0.25s ease'
      };
    }

    return {
      fill: 'rgba(6, 20, 42, 0.7)',
      stroke: 'rgba(0, 240, 255, 0.4)',
      strokeWidth: 1.5,
      transition: 'all 0.25s ease'
    };
  };

  return (
    <svg 
      viewBox="0 0 300 360" 
      style={{ 
        width: '100%', 
        height: '100%', 
        maxHeight: '380px',
        transform: flipX ? 'scaleX(-1)' : 'none',
        overflow: 'visible'
      }}
    >
      <defs>
        <radialGradient id={`glow-fault-${hand}-${view}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ff2a2a" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#ff2a2a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`glow-healthy-${hand}-${view}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#00f0ff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Hand Silhouette / Zones */}
      <g style={{ cursor: 'pointer' }}>
        {/* Wrist & Palm Region */}
        <path
          d="M 90 320 C 85 280, 80 250, 75 220 C 70 190, 80 160, 95 150 C 130 145, 170 145, 205 155 C 220 170, 225 210, 220 250 C 215 285, 210 320, 210 320 Z"
          style={getZoneStyle(palmRegion)}
          onClick={() => onSelectZone(palmRegion)}
        />

        {/* Thumb (Base & Tip) */}
        <path
          d="M 75 220 C 50 200, 35 170, 30 140 C 28 120, 45 110, 60 125 C 75 140, 85 165, 95 185 Z"
          style={getZoneStyle(thumbRegion)}
          onClick={() => onSelectZone(thumbRegion)}
        />

        {/* Index Finger */}
        <path
          d="M 95 150 C 95 115, 95 80, 100 45 C 102 30, 118 30, 120 45 C 122 80, 125 115, 125 147 Z"
          style={getZoneStyle(indexRegion)}
          onClick={() => onSelectZone(indexRegion)}
        />

        {/* Middle Finger */}
        <path
          d="M 127 146 C 130 105, 133 65, 137 25 C 139 12, 156 12, 158 25 C 160 65, 160 105, 160 146 Z"
          style={getZoneStyle(middleRegion)}
          onClick={() => onSelectZone(middleRegion)}
        />

        {/* Ring Finger */}
        <path
          d="M 163 147 C 165 110, 168 75, 172 40 C 174 28, 189 28, 191 40 C 193 75, 193 110, 193 150 Z"
          style={getZoneStyle(ringRegion)}
          onClick={() => onSelectZone(ringRegion)}
        />

        {/* Little / Pinky Finger */}
        <path
          d="M 195 152 C 200 120, 205 95, 210 75 C 212 62, 226 62, 228 75 C 227 100, 223 135, 218 165 Z"
          style={getZoneStyle(littleRegion)}
          onClick={() => onSelectZone(littleRegion)}
        />
      </g>

      {/* Fibre Routing Overlay Lines */}
      <g stroke="rgba(0, 240, 255, 0.25)" strokeWidth="1" strokeDasharray="3 3" fill="none">
        <path d="M 150 320 Q 150 200 60 135" />
        <path d="M 150 320 Q 140 200 110 45" />
        <path d="M 150 320 Q 150 200 148 25" />
        <path d="M 150 320 Q 160 200 182 40" />
        <path d="M 150 320 Q 170 200 219 75" />
      </g>

      {/* Calibrated Sensor Junction Dots (X1..X120) */}
      <g>
        {channels.map((c, idx) => {
          const faulted = isChannelFaulted(c.id);
          const isSelected = selectedChannelId === c.id;

          // Compute 2D position from 3D calibrated anchor or index offset
          let cx = 150;
          let cy = 200;

          if (c.finger === 'palm') {
            const row = idx % 5;
            const col = Math.floor(idx / 5) % 4;
            cx = 105 + row * 22;
            cy = 180 + col * 28;
          } else if (c.finger === 'thumb') {
            const seg = (idx % 6);
            cx = 40 + seg * 8;
            cy = 135 + seg * 10;
          } else if (c.finger === 'index') {
            const seg = (idx % 6);
            cx = 108 + (seg % 2) * 5;
            cy = 45 + seg * 16;
          } else if (c.finger === 'middle') {
            const seg = (idx % 6);
            cx = 145 + (seg % 2) * 4;
            cy = 30 + seg * 18;
          } else if (c.finger === 'ring') {
            const seg = (idx % 6);
            cx = 180 + (seg % 2) * 4;
            cy = 45 + seg * 16;
          } else if (c.finger === 'little') {
            const seg = (idx % 6);
            cx = 215 + (seg % 2) * 3;
            cy = 75 + seg * 14;
          }

          return (
            <g 
              key={c.id} 
              onClick={(e) => {
                e.stopPropagation();
                onSelectChannel(c.id);
                onSelectZone(c.region);
              }}
              style={{ cursor: 'pointer' }}
            >
              {faulted && (
                <circle 
                  cx={cx} 
                  cy={cy} 
                  r={8} 
                  fill={`url(#glow-fault-${hand}-${view})`} 
                />
              )}
              <circle
                cx={cx}
                cy={cy}
                r={isSelected ? 5 : 3.5}
                fill={faulted ? '#ff2a2a' : isSelected ? '#00f0ff' : 'var(--status-healthy)'}
                stroke={faulted ? '#ffffff' : '#020813'}
                strokeWidth={1}
              />
            </g>
          );
        })}
      </g>

      {/* Label Overlay for Orientation */}
      <text
        x="150"
        y="345"
        textAnchor="middle"
        fill="var(--text-muted)"
        fontSize="10"
        letterSpacing="1"
        style={{ transform: flipX ? 'scaleX(-1) translate(-300px, 0)' : 'none' }}
      >
        {view.toUpperCase()} ASPECT
      </text>
    </svg>
  );
};

export default LiveGloveStatus;
