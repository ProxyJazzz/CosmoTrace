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
  Info,
  Crosshair
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
    { id: 'left_palm', label: 'Left Hand & Palm Grid', finger: 'palm', view: 'front' },
    { id: 'left_palm', label: 'Left Dorsal Hand Grid', finger: 'palm', view: 'back' },
    { id: 'left_forearm', label: 'Left Forearm Sleeve', finger: 'forearm', view: 'both' },
    { id: 'left_thumb', label: 'Left Thumb', finger: 'thumb', view: 'both' },
    { id: 'left_index_finger', label: 'Left Index', finger: 'index', view: 'both' },
    { id: 'left_middle_finger', label: 'Left Middle', finger: 'middle', view: 'both' },
    { id: 'left_ring_finger', label: 'Left Ring', finger: 'ring', view: 'both' },
    { id: 'left_little_finger', label: 'Left Little', finger: 'little', view: 'both' },
  ],
  right: [
    { id: 'right_palm', label: 'Right Hand & Palm Grid', finger: 'palm', view: 'front' },
    { id: 'right_palm', label: 'Right Dorsal Hand Grid', finger: 'palm', view: 'back' },
    { id: 'right_forearm', label: 'Right Forearm Sleeve', finger: 'forearm', view: 'both' },
    { id: 'right_thumb', label: 'Right Thumb', finger: 'thumb', view: 'both' },
    { id: 'right_index_finger', label: 'Right Index', finger: 'index', view: 'both' },
    { id: 'right_middle_finger', label: 'Right Middle', finger: 'middle', view: 'both' },
    { id: 'right_ring_finger', label: 'Right Ring', finger: 'ring', view: 'both' },
    { id: 'right_little_finger', label: 'Right Little', finger: 'little', view: 'both' },
  ]
};

export interface SelectedIntersection {
  xNum: number; // 1..24 (Knuckles to Elbow)
  yNum: number; // 1..20 (1..10 = Front, 11..20 = Back)
  xId: string;  // e.g. "X2"
  yId: string;  // e.g. "Y20"
  aspect: 'front' | 'back';
}

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
  const [selectedIntersection, setSelectedIntersection] = useState<SelectedIntersection | null>(null);
  const [selectedZone, setSelectedZone] = useState<GloveRegion | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [simulatedFaults, setSimulatedFaults] = useState<Record<string, boolean>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [channelFilter, setChannelFilter] = useState<'ALL' | 'X_WIRES' | 'Y_FRONT' | 'Y_BACK' | 'FAULTS'>('ALL');

  // Parser: Checks if search query is an intersection like "x2,y20", "X2, Y20", "X2 Y20", "x2-y20", "(x2, y20)"
  const parsedSearchIntersection = useMemo<SelectedIntersection | null>(() => {
    if (!searchQuery) return null;
    const q = searchQuery.trim().toUpperCase();

    // Pattern 1: X<num> [,/ -] Y<num>
    const matchXY = q.match(/X\s*(\d{1,2})\s*[,/\s\-]+\s*Y\s*(\d{1,2})/);
    if (matchXY) {
      const xNum = parseInt(matchXY[1], 10);
      const yNum = parseInt(matchXY[2], 10);
      if (xNum >= 1 && xNum <= 24 && yNum >= 1 && yNum <= 20) {
        return {
          xNum,
          yNum,
          xId: `X${xNum}`,
          yId: `Y${yNum}`,
          aspect: yNum <= 10 ? 'front' : 'back'
        };
      }
    }

    // Pattern 2: Y<num> [,/ -] X<num>
    const matchYX = q.match(/Y\s*(\d{1,2})\s*[,/\s\-]+\s*X\s*(\d{1,2})/);
    if (matchYX) {
      const yNum = parseInt(matchYX[1], 10);
      const xNum = parseInt(matchYX[2], 10);
      if (xNum >= 1 && xNum <= 24 && yNum >= 1 && yNum <= 20) {
        return {
          xNum,
          yNum,
          xId: `X${xNum}`,
          yId: `Y${yNum}`,
          aspect: yNum <= 10 ? 'front' : 'back'
        };
      }
    }

    // Pattern 3: (2, 20) or 2, 20
    const matchNumPair = q.match(/^\(?\s*(\d{1,2})\s*[,/\s\-]+\s*(\d{1,2})\s*\)?$/);
    if (matchNumPair) {
      const xNum = parseInt(matchNumPair[1], 10);
      const yNum = parseInt(matchNumPair[2], 10);
      if (xNum >= 1 && xNum <= 24 && yNum >= 1 && yNum <= 20) {
        return {
          xNum,
          yNum,
          xId: `X${xNum}`,
          yId: `Y${yNum}`,
          aspect: yNum <= 10 ? 'front' : 'back'
        };
      }
    }

    return null;
  }, [searchQuery]);

  // Synchronize search intersection with selectedIntersection
  React.useEffect(() => {
    if (parsedSearchIntersection) {
      setSelectedIntersection(parsedSearchIntersection);
      setSelectedChannelId(null);
    }
  }, [parsedSearchIntersection]);

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
            region: (region ? region : 'left_glove') as any,
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

  // Handle Import of freshly exported Calibration JSON
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

  // Mapping channels and fault states
  const channels = useMemo(() => {
    return Object.values(gloveCalibrationMap).sort((a, b) => {
      const aNum = parseInt(a.id.replace(/\D/g, '')) || 0;
      const bNum = parseInt(b.id.replace(/\D/g, '')) || 0;
      return aNum - bNum;
    });
  }, [gloveCalibrationMap]);

  // Check if a specific channel is faulted
  const isChannelFaulted = (channelId: string): boolean => {
    if (simulatedFaults[channelId]) return true;
    if (sensorData?.perChannel && sensorData.perChannel[channelId] === 'BROKEN') return true;
    if (sensorData?.brokenChannels?.includes(channelId)) return true;
    return false;
  };

  // Check if a specific intersection is faulted
  const isIntersectionFaulted = (xNum: number, yNum: number): boolean => {
    const prefix = activeHand === 'left' ? 'L' : 'R';
    const junctionKey = `INT-${prefix}-X${xNum}-Y${yNum}`;
    if (simulatedFaults[junctionKey]) return true;
    if (isChannelFaulted(`${prefix}-X${xNum}`) || isChannelFaulted(`${prefix}-Y${yNum}`)) return true;
    return false;
  };

  // Toggle intersection fault simulation
  const toggleIntersectionFault = (xNum: number, yNum: number) => {
    const prefix = activeHand === 'left' ? 'L' : 'R';
    const junctionKey = `INT-${prefix}-X${xNum}-Y${yNum}`;
    setSimulatedFaults(prev => ({
      ...prev,
      [junctionKey]: !prev[junctionKey]
    }));
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
    // Add random intersection faults
    for (let i = 1; i <= 6; i++) {
      const rx = Math.floor(Math.random() * 24) + 1;
      const ry = Math.floor(Math.random() * 20) + 1;
      const prefix = activeHand === 'left' ? 'L' : 'R';
      next[`INT-${prefix}-X${rx}-Y${ry}`] = true;
    }
    setSimulatedFaults(next);
  };

  // Filtered channel list for sidebar
  const filteredChannels = useMemo(() => {
    return channels.filter(c => {
      if (c.hand !== activeHand) return false;
      if (selectedZone && c.region !== selectedZone) return false;
      if (channelFilter === 'X_WIRES' && !c.id.includes('-X')) return false;
      if (channelFilter === 'Y_FRONT') {
        const yNum = parseInt(c.id.replace(/^[^-]+-Y(\d+)$/, '$1'), 10);
        if (isNaN(yNum) || yNum > 10) return false;
      }
      if (channelFilter === 'Y_BACK') {
        const yNum = parseInt(c.id.replace(/^[^-]+-Y(\d+)$/, '$1'), 10);
        if (isNaN(yNum) || yNum < 11 || yNum > 20) return false;
      }
      if (channelFilter === 'FAULTS' && !isChannelFaulted(c.id)) return false;
      if (searchQuery && !parsedSearchIntersection) {
        const query = searchQuery.toLowerCase();
        return c.id.toLowerCase().includes(query) || 
               c.label.toLowerCase().includes(query) || 
               c.region.toLowerCase().includes(query) ||
               c.fibreId.toLowerCase().includes(query);
      }
      return true;
    });
  }, [channels, activeHand, selectedZone, channelFilter, searchQuery, parsedSearchIntersection, simulatedFaults, sensorData]);

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
            <span className={styles.badge}>24 Horizontal &bull; 20 Vertical (10 Front / 10 Back) from Knuckles to Elbow</span>
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
          <span className={styles.kpiLabel}>Monitored Glove</span>
          <span className={styles.kpiValue} style={{ textTransform: 'capitalize' }}>
            {activeHand} Glove & Arm
          </span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Mesh Matrix</span>
          <span className={styles.kpiValue}>24 X &times; 20 Y (480 Junc)</span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Span</span>
          <span className={styles.kpiValue}>Knuckles to Elbow</span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Faulted Channels</span>
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
        {/* Left Sidebar: Channels, Search & Test Injections */}
        <aside className={styles.leftSidebar}>
          <div className={styles.sectionHeader}>
            <span>Wire Channels & Intersections</span>
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
            {/* Interactive Search Bar (Wires OR Intersections e.g. X2, Y20 or X2,Y20) */}
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input 
                type="text"
                placeholder="Search intersection (e.g. X2, Y20 or X12, Y5)..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  background: parsedSearchIntersection ? 'rgba(0, 240, 255, 0.12)' : 'rgba(0,0,0,0.2)',
                  border: `1px solid ${parsedSearchIntersection ? '#00f0ff' : 'var(--border-color)'}`,
                  color: 'white',
                  padding: '6px 8px 6px 28px',
                  borderRadius: '4px',
                  fontSize: '0.8rem',
                  outline: 'none'
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedIntersection(null);
                  }}
                  style={{
                    position: 'absolute',
                    right: '6px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: '0.75rem'
                  }}
                >
                  ✕
                </button>
              )}
            </div>

            {/* Quick Intersection Search Feedback Tag */}
            {parsedSearchIntersection && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'rgba(0, 240, 255, 0.15)',
                border: '1px solid #00f0ff',
                padding: '5px 8px',
                borderRadius: '4px',
                fontSize: '0.75rem',
                color: '#00f0ff'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Crosshair size={14} />
                  <span>Targeting <strong>({parsedSearchIntersection.xId}, {parsedSearchIntersection.yId})</strong> on {parsedSearchIntersection.aspect.toUpperCase()} VIEW</span>
                </div>
              </div>
            )}

            {/* Quick Intersection Jump Buttons */}
            <div style={{ display: 'flex', gap: '4px', overflowX: 'auto', paddingBottom: '2px' }}>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', alignSelf: 'center', whiteSpace: 'nowrap' }}>Try:</span>
              {[
                { label: 'X2, Y20', q: 'X2, Y20' },
                { label: 'X8, Y5', q: 'X8, Y5' },
                { label: 'X15, Y14', q: 'X15, Y14' },
                { label: 'X24, Y10', q: 'X24, Y10' }
              ].map(item => (
                <button
                  key={item.label}
                  onClick={() => setSearchQuery(item.q)}
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-muted)',
                    fontSize: '0.65rem',
                    padding: '2px 5px',
                    borderRadius: '3px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {/* Wire Filter Tabs */}
            <div style={{ display: 'flex', gap: '4px' }}>
              {(['ALL', 'X_WIRES', 'Y_FRONT', 'Y_BACK', 'FAULTS'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setChannelFilter(f)}
                  style={{
                    flex: 1,
                    padding: '3px 0',
                    fontSize: '0.62rem',
                    borderRadius: '4px',
                    border: '1px solid var(--border-color)',
                    background: channelFilter === f ? 'rgba(0, 240, 255, 0.2)' : 'rgba(0,0,0,0.2)',
                    color: channelFilter === f ? 'var(--status-healthy)' : 'var(--text-muted)',
                    cursor: 'pointer',
                    fontWeight: channelFilter === f ? 600 : 400
                  }}
                >
                  {f === 'ALL' ? 'ALL' : f === 'X_WIRES' ? 'X (1-24)' : f === 'Y_FRONT' ? 'Y-Front' : f === 'Y_BACK' ? 'Y-Back' : 'FAULTS'}
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
              const isX = c.id.includes('-X');

              return (
                <div 
                  key={c.id}
                  className={`${styles.channelItem} ${faulted ? styles.faulted : ''} ${isSelected ? styles.selected : ''}`}
                  onClick={() => {
                    setSelectedChannelId(c.id);
                    setSelectedIntersection(null);
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
                        <span>{c.id.replace(/^[^-]+-/, '')}</span>
                        <span style={{ 
                          fontSize: '0.62rem', 
                          padding: '1px 5px', 
                          borderRadius: '3px', 
                          background: isX ? 'rgba(0, 240, 255, 0.15)' : 'rgba(255, 170, 0, 0.15)',
                          color: isX ? '#00f0ff' : '#ffaa00'
                        }}>
                          {isX ? 'Horizontal Wire' : 'Vertical Wire'}
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

        {/* Center Viewer: FRONT (Palmar Y1..Y10) & BACK (Dorsal Y11..Y20) 2D Diagrams */}
        <main className={styles.centerViewer}>
          <div className={styles.diagramControls}>
            <div className={styles.viewTabs}>
              <button 
                className={`${styles.tabBtn} ${activeHand === 'left' ? styles.active : ''}`}
                onClick={() => setActiveHand('left')}
              >
                Left Glove & Arm
              </button>
              <button 
                className={`${styles.tabBtn} ${activeHand === 'right' ? styles.active : ''}`}
                onClick={() => setActiveHand('right')}
              >
                Right Glove & Arm
              </button>
            </div>

            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Info size={14} />
              24 Horiz Wires (X1..X24) &bull; Front Vert Wires (Y1..Y10) &bull; Back Vert Wires (Y11..Y20) [Knuckles to Elbow]
            </div>
          </div>

          <div className={styles.diagramGrid}>
            {/* FRONT VIEW (Palmar Aspect: Y1 to Y10) */}
            <div className={styles.diagramCard} style={{
              border: selectedIntersection?.aspect === 'front' ? '1px solid #00f0ff' : undefined,
              boxShadow: selectedIntersection?.aspect === 'front' ? '0 0 15px rgba(0, 240, 255, 0.25)' : undefined
            }}>
              <div className={styles.diagramHeader}>
                <div className={styles.diagramTitle}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--status-healthy)', display: 'inline-block' }}></span>
                  FRONT VIEW (Palmar Aspect: Knuckles to Elbow)
                </div>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  Vertical Wires: <strong>Y1 &ndash; Y10</strong> &bull; 24 Horizontal (X1..X24)
                </span>
              </div>

              <div className={styles.diagramSvgWrapper} style={{ minHeight: '620px' }}>
                <Hand2DDiagram 
                  hand={activeHand}
                  view="front"
                  channels={channels.filter(c => c.hand === activeHand)}
                  isChannelFaulted={isChannelFaulted}
                  isZoneFaulted={isZoneFaulted}
                  isIntersectionFaulted={isIntersectionFaulted}
                  selectedChannelId={selectedChannelId}
                  selectedIntersection={selectedIntersection}
                  selectedZone={selectedZone}
                  onSelectChannel={(id) => {
                    setSelectedChannelId(id);
                    setSelectedIntersection(null);
                  }}
                  onSelectIntersection={(intSec) => {
                    setSelectedIntersection(intSec);
                    setSelectedChannelId(null);
                    setSearchQuery(`${intSec.xId}, ${intSec.yId}`);
                  }}
                  onSelectZone={setSelectedZone}
                />
              </div>
            </div>

            {/* BACK VIEW (Dorsal Aspect: Y11 to Y20) */}
            <div className={styles.diagramCard} style={{
              border: selectedIntersection?.aspect === 'back' ? '1px solid #00f0ff' : undefined,
              boxShadow: selectedIntersection?.aspect === 'back' ? '0 0 15px rgba(0, 240, 255, 0.25)' : undefined
            }}>
              <div className={styles.diagramHeader}>
                <div className={styles.diagramTitle}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--status-healthy)', display: 'inline-block' }}></span>
                  BACK VIEW (Dorsal Aspect: Knuckles to Elbow)
                </div>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  Vertical Wires: <strong>Y11 &ndash; Y20</strong> &bull; 24 Horizontal (X1..X24)
                </span>
              </div>

              <div className={styles.diagramSvgWrapper} style={{ minHeight: '620px' }}>
                <Hand2DDiagram 
                  hand={activeHand}
                  view="back"
                  channels={channels.filter(c => c.hand === activeHand)}
                  isChannelFaulted={isChannelFaulted}
                  isZoneFaulted={isZoneFaulted}
                  isIntersectionFaulted={isIntersectionFaulted}
                  selectedChannelId={selectedChannelId}
                  selectedIntersection={selectedIntersection}
                  selectedZone={selectedZone}
                  onSelectChannel={(id) => {
                    setSelectedChannelId(id);
                    setSelectedIntersection(null);
                  }}
                  onSelectIntersection={(intSec) => {
                    setSelectedIntersection(intSec);
                    setSelectedChannelId(null);
                    setSearchQuery(`${intSec.xId}, ${intSec.yId}`);
                  }}
                  onSelectZone={setSelectedZone}
                />
              </div>
            </div>
          </div>
        </main>

        {/* Right Sidebar: Telemetry Inspector */}
        <aside className={styles.rightSidebar}>
          <div className={styles.sectionHeader}>
            <span>Telemetry Inspector</span>
          </div>

          <div style={{ padding: '1rem', display: 'flex', flex: 1, flexDirection: 'column', gap: '1rem', overflowY: 'auto' }}>
            {selectedIntersection ? (
              /* Display Selected Intersection Details (e.g. X2, Y20) */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ background: 'rgba(0, 240, 255, 0.08)', padding: '0.75rem', borderRadius: '6px', border: '1px solid #00f0ff' }}>
                  <div style={{ fontSize: '0.7rem', color: '#00f0ff', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    🎯 Selected Mesh Intersection
                  </div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: isIntersectionFaulted(selectedIntersection.xNum, selectedIntersection.yNum) ? 'var(--status-fault)' : '#00f0ff', marginTop: '2px' }}>
                    ({selectedIntersection.xId}, {selectedIntersection.yId})
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-main)', marginTop: '4px' }}>
                    Intersection of Row <strong>{selectedIntersection.xId}</strong> & Column <strong>{selectedIntersection.yId}</strong>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Aspect Location</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#00f0ff' }}>
                      {selectedIntersection.aspect === 'front' ? 'Front (Palmar Y1-Y10)' : 'Back (Dorsal Y11-Y20)'}
                    </div>
                  </div>
                  <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Status</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: isIntersectionFaulted(selectedIntersection.xNum, selectedIntersection.yNum) ? 'var(--status-fault)' : 'var(--status-healthy)' }}>
                      {isIntersectionFaulted(selectedIntersection.xNum, selectedIntersection.yNum) ? 'FAULT DETECTED' : 'NOMINAL (0)'}
                    </div>
                  </div>
                  <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Horizontal Wire</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)' }}>
                      Row {selectedIntersection.xNum} of 24
                    </div>
                  </div>
                  <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Vertical Wire</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)' }}>
                      Col {selectedIntersection.aspect === 'front' ? selectedIntersection.yNum : (selectedIntersection.yNum - 10)} of 10
                    </div>
                  </div>
                </div>

                <button 
                  onClick={() => toggleIntersectionFault(selectedIntersection.xNum, selectedIntersection.yNum)}
                  style={{
                    background: isIntersectionFaulted(selectedIntersection.xNum, selectedIntersection.yNum) ? 'rgba(255,42,42,0.2)' : 'rgba(0,240,255,0.15)',
                    border: `1px solid ${isIntersectionFaulted(selectedIntersection.xNum, selectedIntersection.yNum) ? 'var(--status-fault)' : 'var(--border-color)'}`,
                    color: isIntersectionFaulted(selectedIntersection.xNum, selectedIntersection.yNum) ? 'var(--status-fault)' : 'var(--status-healthy)',
                    padding: '8px',
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  {isIntersectionFaulted(selectedIntersection.xNum, selectedIntersection.yNum) ? 'Clear Intersection Fault' : 'Simulate Fault on Intersection'}
                </button>
              </div>
            ) : selectedSensor ? (
              /* Display Selected Individual Channel Details */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Selected Wire Channel</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: isChannelFaulted(selectedSensor.id) ? 'var(--status-fault)' : 'var(--status-healthy)', marginTop: '2px' }}>
                    {selectedSensor.id.replace(/^[^-]+-/, '')}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-main)', marginTop: '4px' }}>
                    {selectedSensor.label}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Wire Type</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: selectedSensor.id.includes('-X') ? '#00f0ff' : '#ffaa00' }}>
                      {selectedSensor.id.includes('-X') ? 'Horizontal (X)' : 'Vertical (Y)'}
                    </div>
                  </div>
                  <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Status</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: isChannelFaulted(selectedSensor.id) ? 'var(--status-fault)' : 'var(--status-healthy)' }}>
                      {isChannelFaulted(selectedSensor.id) ? 'FAULT (1)' : 'NOMINAL (0)'}
                    </div>
                  </div>
                  <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Anatomical Zone</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', textTransform: 'capitalize' }}>
                      {selectedSensor.region.replace('_', ' ')}
                    </div>
                  </div>
                  <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Fibre Route</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)' }}>
                      {selectedSensor.fibreId}
                    </div>
                  </div>
                </div>

                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '4px' }}>3D Spatial Position</div>
                  <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--status-healthy)' }}>
                    X: {selectedSensor.position[0].toFixed(3)} | Y: {selectedSensor.position[1].toFixed(3)} | Z: {selectedSensor.position[2].toFixed(3)}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', padding: '2rem 1rem' }}>
                Type an intersection query (e.g. <code>X2, Y20</code>) or click any wire or junction dot on the hand and arm diagrams.
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
// - 24 Horizontal Wires (X1..X24) from Knuckles (y=140) to Elbow (y=625), equally spaced
// - 20 Vertical Lines from Knuckles (y=140) to Elbow (y=625) (10 Front Y1..Y10 / 10 Back Y11..Y20)
// - 5 Finger Vertical Wires (1 per finger with 3 equidistant dots)
// - Interactive Intersection Matrix (240 Front + 240 Back) with Crosshair Highlight
// ----------------------------------------------------------------------------------

// 24 Horizontal Wires starting at knuckles (y=140) down to elbow (y=625), equally spaced
const HORIZ_X_WIRES = Array.from({ length: 24 }, (_, i) => {
  const num = i + 1;
  // Equally spaced from knuckles (140) to elbow (625)
  const y = 140 + (i * (625 - 140) / 23);
  
  let leftX: number;
  let rightX: number;

  if (y <= 325) {
    // Hand & Palm region
    leftX = 75 - (y > 220 ? (y - 220) * 0.15 : (220 - y) * 0.1);
    rightX = 220 - (y > 250 ? (y - 250) * 0.15 : 0);
  } else {
    // Forearm sleeve down to elbow
    leftX = 90 - (y - 325) * 0.075;
    rightX = 210 + (y - 325) * 0.075;
  }

  return {
    num,
    id: `X${num}`,
    y,
    span: [Math.max(68, leftX), Math.min(232, rightX)]
  };
});

// Front Vertical Wires: Y1 to Y10 from Knuckles to Elbow
const FRONT_VERT_Y_WIRES = Array.from({ length: 10 }, (_, j) => {
  const num = j + 1;
  const u = j / 9; // fraction from 0 to 1
  return {
    num,
    id: `Y${num}`,
    u
  };
});

// Back Vertical Wires: Y11 to Y20 from Knuckles to Elbow
const BACK_VERT_Y_WIRES = Array.from({ length: 10 }, (_, j) => {
  const num = 11 + j;
  const u = j / 9; // fraction from 0 to 1
  return {
    num,
    id: `Y${num}`,
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
  pathD: string;
  dots: FingerDotDef[];
}

const FINGER_WIRES: Record<GloveHand, FingerVerticalWireDef[]> = {
  left: [
    {
      finger: 'thumb',
      region: 'left_thumb',
      label: 'Thumb',
      yWireId: 'Y-TH',
      pathD: 'M 45 122 L 63 157 L 81 192',
      dots: [
        { segment: 'tip', label: 'Distal Tip', shortLabel: 'TIP', x: 45, y: 122 },
        { segment: 'mid', label: 'Interphalangeal (IP)', shortLabel: 'MID', x: 63, y: 157 },
        { segment: 'base', label: 'Metacarpophalangeal (MCP)', shortLabel: 'BASE', x: 81, y: 192 }
      ]
    },
    {
      finger: 'index',
      region: 'left_index_finger',
      label: 'Index Finger',
      yWireId: 'Y-IF',
      pathD: 'M 110 48 L 110 92 L 110 136',
      dots: [
        { segment: 'tip', label: 'Distal Tip', shortLabel: 'TIP', x: 110, y: 48 },
        { segment: 'mid', label: 'Proximal Interphalangeal (PIP)', shortLabel: 'MID', x: 110, y: 92 },
        { segment: 'base', label: 'Metacarpophalangeal (MCP)', shortLabel: 'BASE', x: 110, y: 136 }
      ]
    },
    {
      finger: 'middle',
      region: 'left_middle_finger',
      label: 'Middle Finger',
      yWireId: 'Y-MF',
      pathD: 'M 146 32 L 146 82 L 146 132',
      dots: [
        { segment: 'tip', label: 'Distal Tip', shortLabel: 'TIP', x: 146, y: 32 },
        { segment: 'mid', label: 'Proximal Interphalangeal (PIP)', shortLabel: 'MID', x: 146, y: 82 },
        { segment: 'base', label: 'Metacarpophalangeal (MCP)', shortLabel: 'BASE', x: 146, y: 132 }
      ]
    },
    {
      finger: 'ring',
      region: 'left_ring_finger',
      label: 'Ring Finger',
      yWireId: 'Y-RF',
      pathD: 'M 178 48 L 178 92 L 178 136',
      dots: [
        { segment: 'tip', label: 'Distal Tip', shortLabel: 'TIP', x: 178, y: 48 },
        { segment: 'mid', label: 'Proximal Interphalangeal (PIP)', shortLabel: 'MID', x: 178, y: 92 },
        { segment: 'base', label: 'Metacarpophalangeal (MCP)', shortLabel: 'BASE', x: 178, y: 136 }
      ]
    },
    {
      finger: 'little',
      region: 'left_little_finger',
      label: 'Little Finger',
      yWireId: 'Y-LF',
      pathD: 'M 218 78 L 212 117 L 206 156',
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
      label: 'Thumb',
      yWireId: 'Y-TH',
      pathD: 'M 45 122 L 63 157 L 81 192',
      dots: [
        { segment: 'tip', label: 'Distal Tip', shortLabel: 'TIP', x: 45, y: 122 },
        { segment: 'mid', label: 'Interphalangeal (IP)', shortLabel: 'MID', x: 63, y: 157 },
        { segment: 'base', label: 'Metacarpophalangeal (MCP)', shortLabel: 'BASE', x: 81, y: 192 }
      ]
    },
    {
      finger: 'index',
      region: 'right_index_finger',
      label: 'Index Finger',
      yWireId: 'Y-IF',
      pathD: 'M 110 48 L 110 92 L 110 136',
      dots: [
        { segment: 'tip', label: 'Distal Tip', shortLabel: 'TIP', x: 110, y: 48 },
        { segment: 'mid', label: 'Proximal Interphalangeal (PIP)', shortLabel: 'MID', x: 110, y: 92 },
        { segment: 'base', label: 'Metacarpophalangeal (MCP)', shortLabel: 'BASE', x: 110, y: 136 }
      ]
    },
    {
      finger: 'middle',
      region: 'right_middle_finger',
      label: 'Middle Finger',
      yWireId: 'Y-MF',
      pathD: 'M 146 32 L 146 82 L 146 132',
      dots: [
        { segment: 'tip', label: 'Distal Tip', shortLabel: 'TIP', x: 146, y: 32 },
        { segment: 'mid', label: 'Proximal Interphalangeal (PIP)', shortLabel: 'MID', x: 146, y: 82 },
        { segment: 'base', label: 'Metacarpophalangeal (MCP)', shortLabel: 'BASE', x: 146, y: 132 }
      ]
    },
    {
      finger: 'ring',
      region: 'right_ring_finger',
      label: 'Ring Finger',
      yWireId: 'Y-RF',
      pathD: 'M 178 48 L 178 92 L 178 136',
      dots: [
        { segment: 'tip', label: 'Distal Tip', shortLabel: 'TIP', x: 178, y: 48 },
        { segment: 'mid', label: 'Proximal Interphalangeal (PIP)', shortLabel: 'MID', x: 178, y: 92 },
        { segment: 'base', label: 'Metacarpophalangeal (MCP)', shortLabel: 'BASE', x: 178, y: 136 }
      ]
    },
    {
      finger: 'little',
      region: 'right_little_finger',
      label: 'Little Finger',
      yWireId: 'Y-LF',
      pathD: 'M 218 78 L 212 117 L 206 156',
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
  isIntersectionFaulted: (xNum: number, yNum: number) => boolean;
  selectedChannelId: string | null;
  selectedIntersection: SelectedIntersection | null;
  selectedZone: GloveRegion | null;
  onSelectChannel: (id: string) => void;
  onSelectIntersection: (intSec: SelectedIntersection) => void;
  onSelectZone: (zone: GloveRegion) => void;
}

const Hand2DDiagram: React.FC<Hand2DDiagramProps> = ({
  hand,
  view,
  channels: _channels,
  isChannelFaulted,
  isZoneFaulted,
  isIntersectionFaulted,
  selectedChannelId,
  selectedIntersection,
  selectedZone,
  onSelectChannel,
  onSelectIntersection,
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
        fill: 'rgba(255, 42, 42, 0.22)',
        stroke: '#ff2a2a',
        strokeWidth: isSelected ? 3 : 2,
        filter: 'drop-shadow(0 0 8px rgba(255,42,42,0.8))',
        transition: 'all 0.25s ease'
      };
    }

    if (isSelected) {
      return {
        fill: 'rgba(0, 240, 255, 0.18)',
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

  const fingerWires = FINGER_WIRES[hand];
  const vertWires = view === 'front' ? FRONT_VERT_Y_WIRES : BACK_VERT_Y_WIRES;
  const prefix = hand === 'left' ? 'L' : 'R';

  // Check if an intersection is active on this view
  const isIntersectionTargeted = selectedIntersection && selectedIntersection.aspect === view;
  const targetX = selectedIntersection?.xNum;
  const targetY = selectedIntersection?.yNum;

  // Build the vertical wire SVG paths running continuously across all 24 horizontal rows
  const vertWirePaths = useMemo(() => {
    return vertWires.map(col => {
      // Calculate points along every horizontal row
      const pts = HORIZ_X_WIRES.map(row => {
        const x = row.span[0] + col.u * (row.span[1] - row.span[0]);
        return `${x.toFixed(1)} ${row.y.toFixed(1)}`;
      });
      return {
        ...col,
        pathD: `M ${pts.join(' L ')}`,
        xTop: HORIZ_X_WIRES[0].span[0] + col.u * (HORIZ_X_WIRES[0].span[1] - HORIZ_X_WIRES[0].span[0]),
        xBottom: HORIZ_X_WIRES[23].span[0] + col.u * (HORIZ_X_WIRES[23].span[1] - HORIZ_X_WIRES[23].span[0])
      };
    });
  }, [vertWires]);

  return (
    <svg 
      viewBox="0 0 340 680" 
      style={{ 
        width: '100%', 
        height: '100%', 
        maxHeight: '660px',
        overflow: 'visible'
      }}
    >
      <defs>
        <radialGradient id={`glow-fault-${hand}-${view}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ff2a2a" stopOpacity="0.95" />
          <stop offset="60%" stopColor="#ff2a2a" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#ff2a2a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`glow-target-${hand}-${view}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#00f0ff" stopOpacity="1" />
          <stop offset="50%" stopColor="#00f0ff" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#00f0ff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Main Hand & Arm Graphics Group (flipped via SVG transform if needed) */}
      <g transform={flipX ? 'translate(340, 0) scale(-1, 1)' : undefined}>
        
        {/* Anatomical Silhouettes: Hand & Forearm Sleeve */}
        <g style={{ cursor: 'pointer' }}>
          {/* Hand & Palm */}
          <path
            d="M 90 320 C 85 280, 80 250, 75 220 C 70 190, 80 160, 95 150 C 130 145, 170 145, 205 155 C 220 170, 225 210, 220 250 C 215 285, 210 320, 210 320 Z"
            style={getZoneStyle(palmRegion)}
            onClick={() => onSelectZone(palmRegion)}
          />

          {/* Forearm Sleeve down to Elbow */}
          <path
            d="M 90 320 L 68 635 C 110 650, 190 650, 232 635 L 210 320 Z"
            style={getZoneStyle(forearmRegion)}
            onClick={() => onSelectZone(forearmRegion)}
          />

          {/* Thumb */}
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

          {/* Little Finger */}
          <path
            d="M 195 152 C 200 120, 205 95, 210 75 C 212 62, 226 62, 228 75 C 227 100, 223 135, 218 165 Z"
            style={getZoneStyle(littleRegion)}
            onClick={() => onSelectZone(littleRegion)}
          />
        </g>

        {/* 1. Finger Vertical Wires (5 wires with 3 equidistant dots each) */}
        <g>
          {fingerWires.map(fw => {
            const wireKey = `${prefix}-${fw.yWireId}`;
            const isWireSelected = selectedChannelId === wireKey || selectedChannelId === fw.yWireId;
            const isWireFaulted = isChannelFaulted(wireKey);

            return (
              <g 
                key={fw.finger}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectChannel(wireKey);
                  onSelectZone(fw.region);
                }}
                style={{ cursor: 'pointer' }}
              >
                <title>{`${fw.label} Vertical Wire (${fw.yWireId})`}</title>
                <path
                  d={fw.pathD}
                  fill="none"
                  stroke={isWireFaulted ? '#ff2a2a' : isWireSelected ? '#00f0ff' : 'rgba(0, 240, 255, 0.45)'}
                  strokeWidth={isWireSelected ? 2.5 : 1.5}
                />

                {/* 3 Equidistant Dots */}
                {fw.dots.map(dot => (
                  <g key={dot.segment}>
                    <circle
                      cx={dot.x}
                      cy={dot.y}
                      r={4.2}
                      fill={isWireFaulted ? '#ff2a2a' : isWireSelected ? '#00f0ff' : 'var(--status-healthy)'}
                      stroke="#020813"
                      strokeWidth={1.2}
                    />
                    <circle cx={dot.x} cy={dot.y} r={1.5} fill="#ffffff" opacity={0.9} />
                  </g>
                ))}
              </g>
            );
          })}
        </g>

        {/* 2. 24 Horizontal Wires (X1..X24 from Knuckles to Elbow, equally spaced) */}
        <g>
          {HORIZ_X_WIRES.map(row => {
            const wireKey = `${prefix}-X${row.num}`;
            const isRowSelected = selectedChannelId === wireKey || (isIntersectionTargeted && targetX === row.num);
            const isRowFaulted = isChannelFaulted(wireKey);

            return (
              <g 
                key={row.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectChannel(wireKey);
                  onSelectZone(row.y <= 325 ? palmRegion : forearmRegion);
                }}
                style={{ cursor: 'pointer' }}
              >
                <title>{`Horizontal Wire: X${row.num} (Knuckles to Elbow Row ${row.num}/24)`}</title>
                {/* Horizontal Line */}
                <line
                  x1={row.span[0]}
                  y1={row.y}
                  x2={row.span[1]}
                  y2={row.y}
                  stroke={isRowFaulted ? '#ff2a2a' : isRowSelected ? '#00f0ff' : 'rgba(0, 240, 255, 0.35)'}
                  strokeWidth={isRowSelected ? 2.2 : 0.9}
                  strokeDasharray={isRowSelected ? undefined : '2 2'}
                />
                {/* Row Number Tag */}
                <text
                  x={row.span[0] - 3}
                  y={row.y + 2.2}
                  textAnchor="end"
                  fill={isRowFaulted ? '#ff6b6b' : isRowSelected ? '#00f0ff' : 'rgba(0, 240, 255, 0.65)'}
                  fontSize="5.5"
                  fontFamily="monospace"
                  fontWeight="600"
                >
                  {`X${row.num}`}
                </text>
              </g>
            );
          })}
        </g>

        {/* 3. 10 Vertical Wires from Knuckles to Elbow (Y1..Y10 on Front / Y11..Y20 on Back) */}
        <g>
          {vertWirePaths.map(col => {
            const wireKey = `${prefix}-Y${col.num}`;
            const isColSelected = selectedChannelId === wireKey || (isIntersectionTargeted && targetY === col.num);
            const isColFaulted = isChannelFaulted(wireKey);

            return (
              <g 
                key={col.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectChannel(wireKey);
                  onSelectZone(palmRegion);
                }}
                style={{ cursor: 'pointer' }}
              >
                <title>{`Vertical Wire: Y${col.num} (${view === 'front' ? 'Front' : 'Back'} Column ${view === 'front' ? col.num : col.num - 10}/10: Knuckles to Elbow)`}</title>
                {/* Vertical Line running continuously from Knuckles to Elbow */}
                <path
                  d={col.pathD}
                  fill="none"
                  stroke={isColFaulted ? '#ff2a2a' : isColSelected ? '#ffaa00' : 'rgba(255, 170, 0, 0.4)'}
                  strokeWidth={isColSelected ? 2.2 : 1}
                />
                {/* Top Column Tag (above Knuckles) */}
                <text
                  x={col.xTop}
                  y={133}
                  textAnchor="middle"
                  fill={isColFaulted ? '#ff6b6b' : isColSelected ? '#ffaa00' : 'rgba(255, 170, 0, 0.8)'}
                  fontSize="5.5"
                  fontFamily="monospace"
                  fontWeight="bold"
                >
                  {`Y${col.num}`}
                </text>
                {/* Bottom Column Tag (below Elbow) */}
                <text
                  x={col.xBottom}
                  y={644}
                  textAnchor="middle"
                  fill={isColFaulted ? '#ff6b6b' : isColSelected ? '#ffaa00' : 'rgba(255, 170, 0, 0.8)'}
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

        {/* 4. Complete 24x10 Intersection Points (Knuckles to Elbow) */}
        <g>
          {HORIZ_X_WIRES.map(row => {
            return vertWires.map(col => {
              const jX = row.span[0] + col.u * (row.span[1] - row.span[0]);
              const jY = row.y;
              const isTargeted = isIntersectionTargeted && targetX === row.num && targetY === col.num;
              const isFaulted = isIntersectionFaulted(row.num, col.num);

              return (
                <g 
                  key={`int-${row.num}-${col.num}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectIntersection({
                      xNum: row.num,
                      yNum: col.num,
                      xId: `X${row.num}`,
                      yId: `Y${col.num}`,
                      aspect: view
                    });
                    onSelectZone(row.y <= 325 ? palmRegion : forearmRegion);
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <title>{`Intersection (X${row.num}, Y${col.num})\nLocation: Knuckles-to-Elbow Matrix\nStatus: ${isFaulted ? 'FAULT' : 'NOMINAL'}\nAspect: ${view.toUpperCase()}`}</title>
                  
                  {/* Targeted Crosshair Glow */}
                  {isTargeted && (
                    <>
                      <circle cx={jX} cy={jY} r={16} fill={`url(#glow-target-${hand}-${view})`} />
                      <circle cx={jX} cy={jY} r={9} fill="none" stroke="#00f0ff" strokeWidth={1.8} strokeDasharray="3 2" />
                      <line x1={jX - 12} y1={jY} x2={jX + 12} y2={jY} stroke="#00f0ff" strokeWidth={1.2} />
                      <line x1={jX} y1={jY - 12} x2={jX} y2={jY + 12} stroke="#00f0ff" strokeWidth={1.2} />
                    </>
                  )}

                  {/* Fault Glow */}
                  {isFaulted && !isTargeted && (
                    <circle cx={jX} cy={jY} r={8} fill={`url(#glow-fault-${hand}-${view})`} />
                  )}

                  {/* Intersection Node Dot */}
                  <circle
                    cx={jX}
                    cy={jY}
                    r={isTargeted ? 5 : isFaulted ? 3.2 : 1.8}
                    fill={isFaulted ? '#ff2a2a' : isTargeted ? '#00f0ff' : 'rgba(0, 240, 255, 0.55)'}
                    stroke={isTargeted ? '#ffffff' : '#020813'}
                    strokeWidth={isTargeted ? 1.8 : 0.6}
                  />
                </g>
              );
            });
          })}
        </g>
      </g>

      {/* Upright Bottom Legend */}
      <text
        x="170"
        y="668"
        textAnchor="middle"
        fill="var(--text-muted)"
        fontSize="9"
        letterSpacing="1"
        fontWeight="600"
      >
        {view === 'front' 
          ? 'FRONT VIEW (PALMAR) • 24 X-WIRES × 10 Y-WIRES (Y1..Y10) [KNUCKLES TO ELBOW]' 
          : 'BACK VIEW (DORSAL) • 24 X-WIRES × 10 Y-WIRES (Y11..Y20) [KNUCKLES TO ELBOW]'}
      </text>
    </svg>
  );
};

export default LiveGloveStatus;
