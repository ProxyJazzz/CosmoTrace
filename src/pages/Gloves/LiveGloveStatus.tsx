import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
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
  Crosshair,
  Volume2,
  VolumeX,
  Square,
  Layers,
  CheckSquare
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { OptiMeshSerial, FAULT_THRESHOLD_PERCENT } from '../../utils/optimesh_10x6_simulated_new';
import type { FaultUpdatePayload } from '../../utils/optimesh_10x6_simulated_new';
import { emergencyAudio } from '../../utils/emergencyAudio';
import type { GloveCalibrationMap, GloveRegion, GloveHand, GloveFinger } from '../../types';
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

// 10 Horizontal Rows: 1 through 10
export const HORIZ_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
export type HorizNumber = typeof HORIZ_NUMBERS[number];

// 6 Vertical Columns: A through F
export const VERT_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
export type VertLetter = typeof VERT_LETTERS[number];

export interface SelectedIntersection {
  colLetter: VertLetter; // A..F
  rowNum: HorizNumber;   // 1..10
  aspect: 'front' | 'back';
}

export const LiveGloveStatus: React.FC = () => {
  const { 
    gloveCalibrationMap, 
    setGloveCalibrationMap, 
    sensorData, 
    connectionState,
    setConnectionState
  } = useAppStore();

  const activeHand: GloveHand = 'left';
  
  // Multi-wire selection state: list of wire IDs e.g. ['L-1', 'L-3', 'L-A', 'L-C']
  const [selectedWireIds, setSelectedWireIds] = useState<string[]>([]);
  const [selectedIntersection, setSelectedIntersection] = useState<SelectedIntersection | null>(null);
  const [selectedZone, setSelectedZone] = useState<GloveRegion | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [simulatedFaults, setSimulatedFaults] = useState<Record<string, boolean>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [channelFilter, setChannelFilter] = useState<'ALL' | 'HORIZ' | 'VERT' | 'FAULTS'>('ALL');
  const [showOsGuide, setShowOsGuide] = useState(false);

  // Live Serial Capacity Readings (0-100%) and Fault Sets from ESP32
  const [liveReadings, setLiveReadings] = useState<Record<string, number>>({});
  const [serialFaults, setSerialFaults] = useState<Set<string>>(new Set());
  const [serialPointFaults, setSerialPointFaults] = useState<Set<string>>(new Set());

  // 1m 30s Emergency Simulation State & Sound
  const [emergencyTimer, setEmergencyTimer] = useState<number | null>(null);
  const [isMuted, setIsMuted] = useState(false);

  const prefix = activeHand === 'left' ? 'L' : 'R';

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Helper to get capacity reading for any wire
  const getWireReading = (wireTag: string): number | null => {
    const clean = wireTag.replace(/^[^-]+-/, '');
    const val = liveReadings[clean] ?? 
                liveReadings[`Row ${clean}`] ?? 
                liveReadings[`Col ${clean}`] ?? 
                liveReadings[`R${clean}`] ?? 
                liveReadings[`C${clean}`];
    return typeof val === 'number' ? val : null;
  };

  // Helper to check if a specific channel or wire is faulted (< 59% reading or explicitly faulted)
  const isChannelFaulted = (channelId: string): boolean => {
    if (simulatedFaults[channelId]) return true;
    if (serialFaults.has(channelId)) return true;

    const wireTag = channelId.replace(/^[^-]+-/, '');
    if (serialFaults.has(wireTag) || serialFaults.has(`Row ${wireTag}`) || serialFaults.has(`Col ${wireTag}`)) {
      return true;
    }

    // Check reading < 59%
    const reading = getWireReading(wireTag);
    if (reading !== null && reading < FAULT_THRESHOLD_PERCENT) {
      return true;
    }

    if (sensorData?.perChannel && sensorData.perChannel[channelId] === 'BROKEN') return true;
    if (sensorData?.brokenChannels?.includes(channelId)) return true;

    // Check if any intersection fault touches this wire
    const handPrefix = activeHand === 'left' ? 'L' : 'R';
    if (channelId.startsWith(handPrefix)) {
      // Horizontal wire check (e.g. L-1..L-10)
      const hMatch = channelId.match(/^[LR]-(\d+)$/);
      if (hMatch) {
        const row = parseInt(hMatch[1], 10);
        for (const col of VERT_LETTERS) {
          if (simulatedFaults[`INT-${handPrefix}-${col}-${row}`] || 
              serialPointFaults.has(`${col}${row}`) || 
              serialPointFaults.has(`INT-${col}-${row}`)) {
            return true;
          }
        }
      }

      // Vertical wire check (e.g. L-A..L-F)
      const vMatch = channelId.match(/^[LR]-([A-F])$/);
      if (vMatch) {
        const col = vMatch[1];
        for (let row = 1; row <= 10; row++) {
          if (simulatedFaults[`INT-${handPrefix}-${col}-${row}`] || 
              serialPointFaults.has(`${col}${row}`) || 
              serialPointFaults.has(`INT-${col}-${row}`)) {
            return true;
          }
        }
      }

      // Finger wire aliases
      const fingerMatch = channelId.match(/^[LR]-Y-(TH|IF|MF|RF|LF)$/);
      if (fingerMatch) {
        const fingerMap: Record<string, string> = { 'TH': 'A', 'IF': 'B', 'MF': 'C', 'RF': 'D', 'LF': 'E' };
        const col = fingerMap[fingerMatch[1]];
        if (col) {
          for (let row = 1; row <= 10; row++) {
            if (simulatedFaults[`INT-${handPrefix}-${col}-${row}`] || 
                serialPointFaults.has(`${col}${row}`)) {
              return true;
            }
          }
        }
      }
    }

    return false;
  };

  // Helper to check if an intersection (Col Letter, Row Num) is faulted
  const isIntersectionFaulted = (colLetter: string, rowNum: number): boolean => {
    const handPrefix = activeHand === 'left' ? 'L' : 'R';
    const junctionKey = `INT-${handPrefix}-${colLetter}-${rowNum}`;
    if (simulatedFaults[junctionKey]) return true;
    if (serialPointFaults.has(`${colLetter}${rowNum}`) || serialPointFaults.has(`INT-${colLetter}-${rowNum}`)) return true;
    if (isChannelFaulted(`${handPrefix}-${colLetter}`) || isChannelFaulted(`${handPrefix}-${rowNum}`)) return true;
    return false;
  };

  // Channels list for active hand
  const channels = useMemo(() => {
    return Object.values(gloveCalibrationMap).sort((a, b) => {
      const aIsHoriz = /\d+$/.test(a.id);
      const bIsHoriz = /\d+$/.test(b.id);
      if (aIsHoriz && !bIsHoriz) return -1;
      if (!aIsHoriz && bIsHoriz) return 1;
      return a.id.localeCompare(b.id, undefined, { numeric: true });
    });
  }, [gloveCalibrationMap]);

  // Check if a specific glove region has any broken channel
  const isZoneFaulted = (region: GloveRegion): boolean => {
    return channels.some(c => c.region === region && isChannelFaulted(c.id));
  };

  // List of all currently faulted channel IDs
  const allFaultedWires = useMemo(() => {
    return channels.filter(c => c.hand === activeHand && isChannelFaulted(c.id)).map(c => c.id);
  }, [channels, activeHand, simulatedFaults, serialFaults, liveReadings, sensorData]);

  // Start Emergency Alarm when 1 or more faults are detected/simulated
  const triggerAlarm = () => {
    if (emergencyTimer === null || emergencyTimer <= 0) {
      setEmergencyTimer(90);
    }
    emergencyAudio.setMuted(isMuted);
    emergencyAudio.startAlarmLoop();
  };

  // Stop Emergency Alarm
  const stopEmergencySimulation = () => {
    setSimulatedFaults({});
    setSerialFaults(new Set());
    setSerialPointFaults(new Set());
    setSelectedIntersection(null);
    setSelectedWireIds([]);
    setEmergencyTimer(null);
    emergencyAudio.stopAlarmLoop();
  };

  const toggleMute = () => {
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    emergencyAudio.setMuted(nextMute);
  };

  // Timer interval effect
  useEffect(() => {
    if (emergencyTimer === null) return;

    if (emergencyTimer <= 0) {
      emergencyAudio.playExpiredChime();
      return;
    }

    const timer = setInterval(() => {
      setEmergencyTimer(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          emergencyAudio.playExpiredChime();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [emergencyTimer]);

  // Cleanup audio loop on unmount
  useEffect(() => {
    return () => {
      emergencyAudio.stopAlarmLoop();
    };
  }, []);

  // Multi-wire selection management
  const isWireSelected = (wireId: string): boolean => {
    return selectedWireIds.includes(wireId);
  };

  const toggleSelectWire = (wireId: string) => {
    setSelectedWireIds(prev => {
      if (prev.includes(wireId)) {
        return prev.filter(id => id !== wireId);
      } else {
        return [...prev, wireId];
      }
    });
  };

  const selectWires = (wireIds: string[]) => {
    setSelectedWireIds(wireIds);
  };

  const clearWireSelection = () => {
    setSelectedWireIds([]);
    setSelectedIntersection(null);
  };

  // Toggle fault for a single wire
  const toggleWireFault = (wireId: string) => {
    setSimulatedFaults(prev => {
      const next = { ...prev };
      if (next[wireId]) {
        delete next[wireId];
      } else {
        next[wireId] = true;
      }
      return next;
    });

    const isCurrentlyFaulted = isChannelFaulted(wireId);
    if (!isCurrentlyFaulted) {
      triggerAlarm();
    }
  };

  // Fault all currently selected wires
  const faultSelectedWires = () => {
    if (selectedWireIds.length === 0) return;
    setSimulatedFaults(prev => {
      const next = { ...prev };
      selectedWireIds.forEach(id => {
        next[id] = true;
      });
      return next;
    });
    triggerAlarm();
  };

  // Clear fault for all currently selected wires
  const clearFaultOnSelectedWires = () => {
    if (selectedWireIds.length === 0) return;
    setSimulatedFaults(prev => {
      const next = { ...prev };
      selectedWireIds.forEach(id => {
        delete next[id];
      });
      return next;
    });
  };

  // Toggle intersection fault (also selects the intersection & both wires)
  const toggleIntersectionFault = (colLetter: VertLetter, rowNum: HorizNumber, aspect: 'front' | 'back') => {
    const junctionKey = `INT-${prefix}-${colLetter}-${rowNum}`;
    const isCurrentlyFaulted = isIntersectionFaulted(colLetter, rowNum);

    if (!isCurrentlyFaulted) {
      setSimulatedFaults(prev => ({ ...prev, [junctionKey]: true }));
      setSelectedIntersection({ colLetter, rowNum, aspect });
      const colId = `${prefix}-${colLetter}`;
      const rowId = `${prefix}-${rowNum}`;
      setSelectedWireIds(prev => Array.from(new Set([...prev, colId, rowId])));
      triggerAlarm();
    } else {
      setSimulatedFaults(prev => {
        const next = { ...prev };
        delete next[junctionKey];
        delete next[`${prefix}-${colLetter}`];
        delete next[`${prefix}-${rowNum}`];
        return next;
      });
    }
  };

  // Parser: Supports searching for single wire ("A", "3"), multiple wires ("A, C, 4"), or intersection ("A4", "A, 4")
  useEffect(() => {
    if (!searchQuery) return;
    const q = searchQuery.trim().toUpperCase();

    const matchColRow = q.match(/^[\(]?\s*([A-F])\s*[,/\s\-]+\s*(\d{1,2})\s*[\)]?$/) ||
                        q.match(/^[\(]?\s*([A-F])(\d{1,2})\s*[\)]?$/);
    if (matchColRow) {
      const colLetter = matchColRow[1] as VertLetter;
      const rowNum = parseInt(matchColRow[2], 10) as HorizNumber;
      if (VERT_LETTERS.includes(colLetter) && rowNum >= 1 && rowNum <= 10) {
        setSelectedIntersection({ colLetter, rowNum, aspect: 'back' });
        setSelectedWireIds([`${prefix}-${colLetter}`, `${prefix}-${rowNum}`]);
        return;
      }
    }

    const matchRowCol = q.match(/^[\(]?\s*(\d{1,2})\s*[,/\s\-]+\s*([A-F])\s*[\)]?$/) ||
                        q.match(/^[\(]?\s*(\d{1,2})([A-F])\s*[\)]?$/);
    if (matchRowCol) {
      const rowNum = parseInt(matchRowCol[1], 10) as HorizNumber;
      const colLetter = matchRowCol[2] as VertLetter;
      if (VERT_LETTERS.includes(colLetter) && rowNum >= 1 && rowNum <= 10) {
        setSelectedIntersection({ colLetter, rowNum, aspect: 'back' });
        setSelectedWireIds([`${prefix}-${colLetter}`, `${prefix}-${rowNum}`]);
        return;
      }
    }

    const tokens = q.split(/[,;\s]+/).map(t => t.replace(/^(WIRE|ROW|COL|X|Y)-?/i, '').trim()).filter(Boolean);
    const matchedWireIds: string[] = [];

    tokens.forEach(tok => {
      if (VERT_LETTERS.includes(tok as any)) {
        matchedWireIds.push(`${prefix}-${tok}`);
      } else {
        const num = parseInt(tok, 10);
        if (!isNaN(num) && num >= 1 && num <= 10) {
          matchedWireIds.push(`${prefix}-${num}`);
        }
      }
    });

    if (matchedWireIds.length > 0) {
      setSelectedWireIds(matchedWireIds);
      setSelectedIntersection(null);
    }
  }, [searchQuery, prefix]);

  // OptiMesh Serial Connection Setup with persistent useRef to prevent reconnect loops & header bar flickering
  const serialRef = useRef<OptiMeshSerial | null>(null);

  const handleFaultUpdate = useCallback((payload: FaultUpdatePayload) => {
    const { readings, rowFaults, colFaults, pointFaults } = payload;
    setLiveReadings(readings);
    setSerialPointFaults(pointFaults);

    const newFaultedSet = new Set<string>();
    const activePrefix = activeHand === 'left' ? 'L' : 'R';

    // Process row faults (e.g. "Row 8", "8")
    rowFaults.forEach(rf => {
      const rowNum = rf.replace(/^(?:Row\s*|R)/i, '');
      if (/^\d+$/.test(rowNum)) {
        newFaultedSet.add(`${activePrefix}-${rowNum}`);
        newFaultedSet.add(rf);
        newFaultedSet.add(rowNum);
      }
    });

    // Process col faults (e.g. "Col D", "D")
    colFaults.forEach(cf => {
      const colLetter = cf.replace(/^(?:Col\s*|C)/i, '').toUpperCase();
      if (/^[A-F]$/.test(colLetter)) {
        newFaultedSet.add(`${activePrefix}-${colLetter}`);
        newFaultedSet.add(cf);
        newFaultedSet.add(colLetter);
      }
    });

    // Also flag any reading whose capacity goes below 59%
    Object.entries(readings).forEach(([key, val]) => {
      if (typeof val === 'number' && val < FAULT_THRESHOLD_PERCENT) {
        const rowMatch = key.match(/^(?:R|Row\s*)?(\d+)$/i);
        if (rowMatch && parseInt(rowMatch[1], 10) >= 1 && parseInt(rowMatch[1], 10) <= 10) {
          newFaultedSet.add(`${activePrefix}-${rowMatch[1]}`);
          newFaultedSet.add(`Row ${rowMatch[1]}`);
          newFaultedSet.add(rowMatch[1]);
        }
        const colMatch = key.match(/^(?:C|Col\s*)?([A-F])$/i);
        if (colMatch) {
          const letter = colMatch[1].toUpperCase();
          newFaultedSet.add(`${activePrefix}-${letter}`);
          newFaultedSet.add(`Col ${letter}`);
          newFaultedSet.add(letter);
        }
      }
    });

    setSerialFaults(newFaultedSet);

    if (newFaultedSet.size > 0) {
      triggerAlarm();
    }

    if (useAppStore.getState().connectionState !== 'LIVE') {
      setConnectionState('LIVE');
    }
  }, [activeHand, setConnectionState]);

  const handleFaultUpdateRef = useRef(handleFaultUpdate);
  useEffect(() => {
    handleFaultUpdateRef.current = handleFaultUpdate;
  }, [handleFaultUpdate]);

  const handleStatusChange = useCallback((connected: boolean, message?: string) => {
    if (connected) {
      if (useAppStore.getState().connectionState !== 'LIVE') {
        setConnectionState('LIVE');
      }
      setErrorMessage(null);
    } else {
      if (useAppStore.getState().connectionState !== 'DISCONNECTED') {
        setConnectionState('DISCONNECTED');
      }
      if (message && message !== 'ESP32 disconnected') {
        setErrorMessage(message);
      }
    }
  }, [setConnectionState]);

  const handleStatusChangeRef = useRef(handleStatusChange);
  useEffect(() => {
    handleStatusChangeRef.current = handleStatusChange;
  }, [handleStatusChange]);

  // Clean up serial port connection on unmount & auto-reconnect ONCE on mount
  useEffect(() => {
    const serial = new OptiMeshSerial(
      (payload: FaultUpdatePayload) => handleFaultUpdateRef.current(payload),
      (connected, msg) => handleStatusChangeRef.current(connected, msg)
    );
    serialRef.current = serial;
    serial.autoConnectPreviousPort(115200).catch(() => {});

    return () => {
      serial.disconnect();
      serialRef.current = null;
    };
  }, []);

  const connectToESP32 = async (useVendorFilter = false) => {
    if (!serialRef.current) return;
    setIsConnecting(true);
    setErrorMessage(null);
    try {
      await serialRef.current.connect(115200, useVendorFilter);
    } catch (err: any) {
      console.error('[LiveGloveStatus] Serial connection failed:', err);
      const msg = err?.message || 'Failed to open Web Serial port.';
      setErrorMessage(msg);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleImportCalibration = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string) as GloveCalibrationMap;
        if (typeof json === 'object' && json !== null) {
          setGloveCalibrationMap(json);
          alert(`Loaded calibration map containing ${Object.keys(json).length} channels.`);
        }
      } catch (err) {
        alert('Failed to parse JSON file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // KPI Calculations
  const stats = useMemo(() => {
    const handChannels = channels.filter(c => c.hand === activeHand);
    const total = handChannels.length || 16;
    let faulted = 0;
    handChannels.forEach(c => {
      if (isChannelFaulted(c.id)) faulted++;
    });

    const activeIntersections = Object.keys(simulatedFaults).filter(
      k => k.startsWith(`INT-${prefix}-`) && simulatedFaults[k]
    );
    if (activeIntersections.length > 0 && faulted === 0) {
      faulted = activeIntersections.length;
    }

    const healthy = Math.max(0, total - faulted);
    const integrityPct = total > 0 ? Math.max(0, Math.round(((total - faulted) / total) * 100)) : 100;
    const isBreached = faulted > 0 || emergencyTimer !== null;
    const statusText = !isBreached ? 'NOMINAL' : 'DANGER';

    return { total, faulted, healthy, integrityPct, isBreached, statusText };
  }, [channels, activeHand, prefix, sensorData, simulatedFaults, serialFaults, liveReadings, emergencyTimer]);

  // Simulate test fault with readings dropping below 59%
  const triggerThresholdFaults = () => {
    const mockReadings: Record<string, number> = {};
    for (let r = 1; r <= 10; r++) {
      mockReadings[`Row ${r}`] = Math.floor(Math.random() * 30) + 70; // healthy 70-100%
    }
    for (const c of VERT_LETTERS) {
      mockReadings[`Col ${c}`] = Math.floor(Math.random() * 30) + 70; // healthy 70-100%
    }

    // Drop 2 random wires below 59% (e.g. 25-45%)
    const faultRow = Math.floor(Math.random() * 10) + 1;
    const faultCol = VERT_LETTERS[Math.floor(Math.random() * VERT_LETTERS.length)];
    mockReadings[`Row ${faultRow}`] = Math.floor(Math.random() * 30) + 20; // 20-50%
    mockReadings[`Col ${faultCol}`] = Math.floor(Math.random() * 30) + 20; // 20-50%

    setLiveReadings(mockReadings);

    const nextFaults: Record<string, boolean> = {};
    nextFaults[`${prefix}-${faultRow}`] = true;
    nextFaults[`${prefix}-${faultCol}`] = true;
    setSimulatedFaults(nextFaults);

    triggerAlarm();
  };

  const clearAllFaults = () => {
    setSimulatedFaults({});
    setSerialFaults(new Set());
    setSerialPointFaults(new Set());
    setLiveReadings({});
    setEmergencyTimer(null);
    emergencyAudio.stopAlarmLoop();
  };

  // Filtered channels list for sidebar
  const filteredChannels = useMemo(() => {
    return channels.filter(c => {
      if (c.hand !== activeHand) return false;
      if (selectedZone && c.region !== selectedZone) return false;
      const isHoriz = /\d+$/.test(c.id);
      if (channelFilter === 'HORIZ' && !isHoriz) return false;
      if (channelFilter === 'VERT' && isHoriz) return false;
      if (channelFilter === 'FAULTS' && !isChannelFaulted(c.id)) return false;
      if (searchQuery && !selectedIntersection) {
        const query = searchQuery.toLowerCase();
        return c.id.toLowerCase().includes(query) || 
               c.label.toLowerCase().includes(query) || 
               c.region.toLowerCase().includes(query);
      }
      return true;
    });
  }, [channels, activeHand, selectedZone, channelFilter, searchQuery, selectedIntersection, simulatedFaults, serialFaults, liveReadings, sensorData]);

  // Break down selected wires into Horizontal and Vertical
  const selectedHorizWires = useMemo(() => {
    return selectedWireIds
      .filter(id => id.startsWith(prefix) && /\d+$/.test(id))
      .map(id => parseInt(id.replace(/^[^-]+-/, ''), 10))
      .sort((a, b) => a - b);
  }, [selectedWireIds, prefix]);

  const selectedVertWires = useMemo(() => {
    return selectedWireIds
      .filter(id => id.startsWith(prefix) && /[A-F]$/.test(id))
      .map(id => id.replace(/^[^-]+-/, ''))
      .sort();
  }, [selectedWireIds, prefix]);

  return (
    <div className={`${styles.container} ${emergencyTimer !== null ? styles.emergencyMode : ''}`}>
      {/* Emergency Countdown Banner */}
      {emergencyTimer !== null && (
        <div className={styles.emergencyBanner}>
          <div className={styles.emergencyBannerLeft}>
            <div className={styles.emergencyBadge}>
              <AlertTriangle size={14} />
              CONTAINMENT BREACH
            </div>
            <div className={styles.emergencyTitle}>
              {allFaultedWires.length > 0 ? (
                <span>
                  BREACH DETECTED: FAULT ON WIRES <strong>[{allFaultedWires.map(w => {
                    const tag = w.replace(/^[^-]+-/, '');
                    const reading = getWireReading(tag);
                    return reading !== null ? `${tag} (${reading}%)` : tag;
                  }).join(', ')}]</strong> &bull; {stats.faulted} FAULTED WIRES (&lt; 59% CAPACITY)
                </span>
              ) : selectedIntersection ? (
                <span>
                  BREACH DETECTED: Intersection <strong>(Col {selectedIntersection.colLetter}, Row {selectedIntersection.rowNum})</strong>
                </span>
              ) : (
                <span>BREACH DETECTED: ACTIVE FAULT MONITORED &bull; {stats.faulted} FAULTED WIRES</span>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
            <div className={styles.emergencyTimerWrap}>
              <span className={styles.emergencyTimerLabel}>Timer:</span>
              <span className={styles.emergencyTimerValue}>{formatTime(emergencyTimer)}</span>
            </div>

            <div className={styles.emergencyControls}>
              <button 
                className={styles.emergencyBtn}
                onClick={toggleMute}
                title={isMuted ? 'Unmute alert audio' : 'Mute alert audio'}
              >
                {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                {isMuted ? 'Unmuted' : 'Beeping'}
              </button>

              <button 
                className={styles.emergencyBtnDanger}
                onClick={stopEmergencySimulation}
                title="Stop countdown and clear all simulated faults"
              >
                <Square size={13} fill="#c00c0c" />
                Clear Faults / Stop
              </button>
            </div>
          </div>

          <div className={styles.emergencyProgressBar}>
            <div 
              className={styles.emergencyProgressFill} 
              style={{ width: `${(emergencyTimer / 90) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Top Header */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Link to="/gloves" className={styles.backBtn}>
            <ArrowLeft size={18} />
            Glove Center
          </Link>
          <div className={styles.title}>
            <Activity size={20} />
            Live 2D Status &bull; 10 Horizontal (Row 1&ndash;10) &times; 6 Vertical (Col A&ndash;F)
            <span className={styles.badge}>Threshold: &lt; 59% Fault &bull; ESP32 Serial Ready</span>
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
            className={styles.btn}
            onClick={() => setShowOsGuide(!showOsGuide)}
            title="Windows & Mac ESP32 port help"
          >
            <Info size={15} />
            {showOsGuide ? 'Hide Guide' : 'Windows & Mac Guide'}
          </button>

          <button 
            className={`${styles.btn} ${styles.primary}`}
            onClick={() => connectToESP32(false)}
            disabled={isConnecting}
          >
            <Cpu size={16} />
            {isConnecting ? 'Opening Port...' : connectionState === 'LIVE' ? 'ESP32 Connected' : 'Connect ESP32 (USB)'}
          </button>
        </div>
      </header>

      {showOsGuide && (
        <div style={{
          background: 'rgba(30, 41, 59, 0.95)',
          border: '1px solid #38bdf8',
          color: '#e2e8f0',
          padding: '14px 18px',
          margin: '0.5rem 1rem 0',
          borderRadius: '8px',
          fontSize: '0.85rem',
          lineHeight: '1.5',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <strong style={{ color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.95rem' }}>
              <Info size={18} /> ESP32 Serial Port Compatibility Guide (Windows & macOS)
            </strong>
            <button 
              onClick={() => setShowOsGuide(false)}
              style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem' }}
            >
              ✕
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '8px' }}>
            <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '10px 12px', borderRadius: '6px', borderLeft: '3px solid #60a5fa' }}>
              <strong style={{ color: '#60a5fa', fontSize: '0.9rem' }}>🪟 Windows PC:</strong>
              <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
                <li>In Chrome/Edge pop-up, select <strong>CP2102 USB to UART Bridge Controller (COM12)</strong> or <strong>CH340 (COMx)</strong>. <em>(Windows names USB chips this way — it IS your ESP32!)</em></li>
                <li><strong>Close Arduino IDE Serial Monitor or PuTTY</strong> before clicking connect. Windows locks COM ports exclusively.</li>
                <li>If not listed, download the <strong>CP210x Universal Driver</strong> or <strong>CH340 Driver</strong> for Windows.</li>
              </ul>
            </div>
            <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '10px 12px', borderRadius: '6px', borderLeft: '3px solid #a78bfa' }}>
              <strong style={{ color: '#a78bfa', fontSize: '0.9rem' }}>🍏 macOS:</strong>
              <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
                <li>Look for <strong>/dev/cu.usbserial-...</strong> or <strong>SLAB_USBtoUART</strong> in the browser prompt.</li>
                <li>Ensure you are using a <strong>Data Micro-USB / USB-C Cable</strong> (charge-only cables won't create a COM port).</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {errorMessage && (
        <div style={{
          background: 'rgba(255, 42, 42, 0.15)',
          border: '1px solid var(--status-fault)',
          color: '#ff6b6b',
          padding: '10px 16px',
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
          <span className={styles.kpiValue}>
            Left Glove Matrix
          </span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Grid Architecture</span>
          <span className={styles.kpiValue}>10 Horiz (1-10) &times; 6 Vert (A-F)</span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Fault Threshold</span>
          <span className={styles.kpiValue} style={{ color: '#00f0ff' }}>&lt; 59% Light</span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Faulted Wires</span>
          <span className={`${styles.kpiValue} ${stats.faulted > 0 ? styles.fault : styles.healthy}`}>
            {stats.faulted}
          </span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Integrity Index</span>
          <span className={`${styles.kpiValue} ${stats.integrityPct < 100 ? (stats.integrityPct < 85 ? styles.fault : styles.warning) : styles.healthy}`}>
            {stats.integrityPct}%
          </span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Containment Status</span>
          <span className={`${styles.kpiValue} ${!stats.isBreached ? styles.healthy : styles.fault}`}>
            {stats.statusText}
          </span>
        </div>
      </div>

      {/* Main Workspace */}
      <div className={styles.mainContent}>
        {/* Left Sidebar: Wire Channel List, Multi-Select & Search */}
        <aside className={styles.leftSidebar}>
          <div className={styles.sectionHeader}>
            <span>Wire Channels & Multi-Select</span>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button 
                className={styles.tabBtn} 
                style={{ fontSize: '0.65rem', padding: '2px 6px' }}
                onClick={triggerThresholdFaults}
                title="Simulate random capacity readings with faults (< 59%)"
              >
                <Zap size={12} style={{ marginRight: '2px' }} />
                Sim &lt; 59%
              </button>
              <button 
                className={styles.tabBtn} 
                style={{ fontSize: '0.65rem', padding: '2px 6px' }}
                onClick={clearAllFaults}
                title="Clear all faults"
              >
                <RotateCcw size={12} />
              </button>
            </div>
          </div>

          <div style={{ padding: '0.75rem 0.75rem 0', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {/* Interactive Search Bar */}
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input 
                type="text"
                placeholder="Search wires (e.g. A, C, 4) or intersection (e.g. A4, B6)..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  background: selectedWireIds.length > 0 ? 'rgba(0, 240, 255, 0.12)' : 'rgba(0,0,0,0.2)',
                  border: `1px solid ${selectedWireIds.length > 0 ? '#00f0ff' : 'var(--border-color)'}`,
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
                    clearWireSelection();
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

            {/* Quick Preset Jump Buttons */}
            <div style={{ display: 'flex', gap: '4px', overflowX: 'auto', paddingBottom: '2px' }}>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', alignSelf: 'center', whiteSpace: 'nowrap' }}>Try:</span>
              {[
                { label: 'Wire A', ids: [`${prefix}-A`] },
                { label: 'Wire 4', ids: [`${prefix}-4`] },
                { label: 'Wires A & 4', ids: [`${prefix}-A`, `${prefix}-4`] },
                { label: 'Wires A, C, 5', ids: [`${prefix}-A`, `${prefix}-C`, `${prefix}-5`] },
                { label: 'Breach A4', q: 'A4' }
              ].map(item => (
                <button
                  key={item.label}
                  onClick={() => {
                    if (item.q) setSearchQuery(item.q);
                    else if (item.ids) selectWires(item.ids);
                  }}
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

            {/* Filter Tabs */}
            <div style={{ display: 'flex', gap: '4px' }}>
              {(['ALL', 'HORIZ', 'VERT', 'FAULTS'] as const).map(f => (
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
                  {f === 'ALL' ? 'ALL' : f === 'HORIZ' ? 'Horiz (1-10)' : f === 'VERT' ? 'Vert (A-F)' : 'FAULTS'}
                </button>
              ))}
            </div>

            {/* Batch Selection Toolbar */}
            <div className={styles.batchToolbar}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckSquare size={13} color="var(--status-healthy)" />
                <span>{selectedWireIds.length} Chosen</span>
              </div>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button 
                  className={styles.batchToolbarBtn}
                  onClick={() => selectWires(channels.filter(c => c.hand === activeHand).map(c => c.id))}
                >
                  Select All
                </button>
                <button 
                  className={styles.batchToolbarBtn}
                  onClick={clearWireSelection}
                >
                  Clear
                </button>
                {allFaultedWires.length > 0 && (
                  <button 
                    className={styles.batchToolbarBtn}
                    style={{ color: '#ff6b6b' }}
                    onClick={() => selectWires(allFaultedWires)}
                  >
                    Select Faults
                  </button>
                )}
              </div>
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

          {/* Wire List with Checkboxes & Capacity Percentages */}
          <div className={styles.channelList}>
            {filteredChannels.map(c => {
              const faulted = isChannelFaulted(c.id);
              const isSelected = isWireSelected(c.id);
              const isHoriz = /\d+$/.test(c.id);
              const wireTag = c.id.replace(/^[^-]+-/, '');
              const reading = getWireReading(wireTag);

              return (
                <div 
                  key={c.id}
                  className={`${styles.channelItem} ${faulted ? styles.faulted : ''} ${isSelected ? styles.selected : ''}`}
                  onClick={() => toggleSelectWire(c.id)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input 
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        e.stopPropagation();
                        toggleSelectWire(c.id);
                      }}
                      className={styles.customCheckbox}
                    />

                    {faulted ? (
                      <AlertTriangle size={14} color="var(--status-fault)" />
                    ) : (
                      <CheckCircle size={14} color="var(--status-healthy)" />
                    )}

                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>Wire {wireTag}</span>
                        <span style={{ 
                          fontSize: '0.62rem', 
                          padding: '1px 5px', 
                          borderRadius: '3px', 
                          background: isHoriz ? 'rgba(0, 240, 255, 0.15)' : 'rgba(255, 170, 0, 0.15)',
                          color: isHoriz ? '#00f0ff' : '#ffaa00'
                        }}>
                          {isHoriz ? `Row ${wireTag}` : `Col ${wireTag}`}
                        </span>

                        {reading !== null && (
                          <span style={{
                            fontSize: '0.65rem',
                            fontWeight: 700,
                            padding: '1px 5px',
                            borderRadius: '3px',
                            background: reading < FAULT_THRESHOLD_PERCENT ? 'rgba(255,42,42,0.25)' : 'rgba(0,240,255,0.15)',
                            color: reading < FAULT_THRESHOLD_PERCENT ? '#ff6b6b' : 'var(--status-healthy)'
                          }}>
                            {reading}%
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                        {c.label}
                      </div>
                    </div>
                  </div>

                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleWireFault(c.id);
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

        {/* Center 2D Diagram: BACK VIEW (Dorsal Aspect) */}
        <main className={styles.centerViewer}>
          <div className={styles.diagramControls}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: 600, color: 'var(--status-healthy)', fontSize: '0.85rem', letterSpacing: '0.5px' }}>
                Left Hand &amp; Arm Matrix
              </span>
              <span className={styles.zoneBadgeStatus} style={{ fontSize: '0.65rem', padding: '2px 8px' }}>
                BACK VIEW (DORSAL)
              </span>
            </div>

            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Info size={14} />
              10 Horizontal (Row 1&ndash;10) &bull; 6 Vertical (Col A&ndash;F) &bull; Fault triggers when reading &lt; 59%
            </div>
          </div>

          <div className={styles.diagramGrid}>
            {/* BACK VIEW (Dorsal Aspect) */}
            <div className={styles.diagramCard}>
              <div className={styles.diagramHeader}>
                <div className={styles.diagramTitle}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--status-healthy)', display: 'inline-block' }}></span>
                  BACK VIEW (Dorsal Aspect)
                </div>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  10 Horiz (1&ndash;10) &bull; 6 Vert (A&ndash;F)
                </span>
              </div>

              <div className={styles.diagramSvgWrapper} style={{ minHeight: '600px' }}>
                <Hand2DDiagram 
                  hand="left"
                  view="back"
                  channels={channels.filter(c => c.hand === 'left')}
                  isChannelFaulted={isChannelFaulted}
                  isZoneFaulted={isZoneFaulted}
                  isIntersectionFaulted={isIntersectionFaulted}
                  selectedWireIds={selectedWireIds}
                  selectedIntersection={selectedIntersection}
                  selectedZone={selectedZone}
                  onToggleSelectWire={toggleSelectWire}
                  onSelectIntersection={(intSec) => {
                    setSelectedIntersection(intSec);
                    const colId = `L-${intSec.colLetter}`;
                    const rowId = `L-${intSec.rowNum}`;
                    setSelectedWireIds(prev => Array.from(new Set([...prev, colId, rowId])));
                    setSearchQuery(`${intSec.colLetter}${intSec.rowNum}`);
                  }}
                  onSelectZone={setSelectedZone}
                />
              </div>
            </div>
          </div>
        </main>

        {/* Right Sidebar: Telemetry Inspector with Multi-Wire Actions & Capacity Stats */}
        <aside className={styles.rightSidebar}>
          <div className={styles.sectionHeader}>
            <span>Telemetry Inspector</span>
          </div>

          <div style={{ padding: '1rem', display: 'flex', flex: 1, flexDirection: 'column', gap: '1rem', overflowY: 'auto' }}>
            {selectedWireIds.length > 0 ? (
              /* Display Multi-Wire Selection Inspector */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ background: 'rgba(0, 240, 255, 0.08)', padding: '0.75rem', borderRadius: '6px', border: '1px solid #00f0ff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '0.7rem', color: '#00f0ff', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Layers size={13} />
                      Active Wire Selection ({selectedWireIds.length})
                    </div>
                    <button 
                      onClick={clearWireSelection}
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.7rem' }}
                    >
                      Clear
                    </button>
                  </div>

                  {/* Wire Chips with Live Capacity Readings */}
                  <div className={styles.selectionChipsWrap}>
                    {selectedWireIds.map(wireId => {
                      const faulted = isChannelFaulted(wireId);
                      const tag = wireId.replace(/^[^-]+-/, '');
                      const isHoriz = /\d+$/.test(tag);
                      const reading = getWireReading(tag);

                      return (
                        <div 
                          key={wireId}
                          className={`${styles.wireChip} ${faulted ? styles.faulted : ''}`}
                          onClick={() => toggleWireFault(wireId)}
                          title={`Click to toggle fault on Wire ${tag}`}
                        >
                          <span>{isHoriz ? `Row ${tag}` : `Col ${tag}`}</span>
                          {reading !== null && (
                            <span style={{ fontWeight: 700, fontSize: '0.62rem' }}>[{reading}%]</span>
                          )}
                          <span style={{ fontSize: '0.6rem', opacity: 0.8 }}>({faulted ? 'FAULT' : 'OK'})</span>
                          <button 
                            className={styles.wireChipRemove}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleSelectWire(wireId);
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Primary Multi-Wire Actions */}
                <div className={styles.multiActionGrid}>
                  <button 
                    className={styles.actionBtnPrimary}
                    onClick={faultSelectedWires}
                    title="Simulate fault breach across all chosen wires"
                  >
                    <Zap size={14} />
                    Fault Chosen ({selectedWireIds.length})
                  </button>

                  <button 
                    className={styles.actionBtnSecondary}
                    onClick={clearFaultOnSelectedWires}
                    title="Clear fault from chosen wires"
                  >
                    <CheckCircle size={14} />
                    Clear Faults
                  </button>
                </div>

                {/* Matrix Intersection summary for chosen wires */}
                {selectedHorizWires.length > 0 && selectedVertWires.length > 0 && (
                  <div style={{ background: 'rgba(0,0,0,0.25)', padding: '0.65rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                      Intersecting Mesh Nodes ({selectedHorizWires.length * selectedVertWires.length} Junctions):
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                      {selectedVertWires.map(col => 
                        selectedHorizWires.map(row => (
                          <span 
                            key={`${col}-${row}`}
                            style={{
                              fontSize: '0.65rem',
                              fontFamily: 'monospace',
                              padding: '1px 5px',
                              borderRadius: '3px',
                              background: isIntersectionFaulted(col, row) ? 'rgba(255,42,42,0.25)' : 'rgba(0,240,255,0.1)',
                              color: isIntersectionFaulted(col, row) ? '#ff6b6b' : '#00f0ff',
                              border: `1px solid ${isIntersectionFaulted(col, row) ? 'rgba(255,42,42,0.4)' : 'rgba(0,240,255,0.2)'}`
                            }}
                          >
                            ({col}, {row})
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Horizontal Rows (1&ndash;10)</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#00f0ff' }}>
                      {selectedHorizWires.length > 0 ? selectedHorizWires.map(r => `Row ${r}`).join(', ') : 'None'}
                    </div>
                  </div>
                  <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Vertical Columns (A&ndash;F)</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#ffaa00' }}>
                      {selectedVertWires.length > 0 ? selectedVertWires.map(c => `Col ${c}`).join(', ') : 'None'}
                    </div>
                  </div>
                </div>
              </div>
            ) : selectedIntersection ? (
              /* Display Selected Single Intersection Details */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ background: 'rgba(0, 240, 255, 0.08)', padding: '0.75rem', borderRadius: '6px', border: '1px solid #00f0ff' }}>
                  <div style={{ fontSize: '0.7rem', color: '#00f0ff', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    🎯 Selected Mesh Intersection
                  </div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: isIntersectionFaulted(selectedIntersection.colLetter, selectedIntersection.rowNum) ? 'var(--status-fault)' : '#00f0ff', marginTop: '2px' }}>
                    ({selectedIntersection.colLetter}, {selectedIntersection.rowNum})
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-main)', marginTop: '4px' }}>
                    Column <strong>Wire {selectedIntersection.colLetter}</strong> &bull; Row <strong>Wire {selectedIntersection.rowNum}</strong>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Aspect</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#00f0ff' }}>
                      {selectedIntersection.aspect === 'front' ? 'Front (Palmar)' : 'Back (Dorsal)'}
                    </div>
                  </div>
                  <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Status</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: isIntersectionFaulted(selectedIntersection.colLetter, selectedIntersection.rowNum) ? 'var(--status-fault)' : 'var(--status-healthy)' }}>
                      {isIntersectionFaulted(selectedIntersection.colLetter, selectedIntersection.rowNum) ? 'FAULT DETECTED' : 'NOMINAL (0)'}
                    </div>
                  </div>
                </div>

                <button 
                  onClick={() => toggleIntersectionFault(selectedIntersection.colLetter, selectedIntersection.rowNum, selectedIntersection.aspect)}
                  className={styles.actionBtnPrimary}
                  style={{ width: '100%', padding: '10px' }}
                >
                  <Zap size={14} />
                  {isIntersectionFaulted(selectedIntersection.colLetter, selectedIntersection.rowNum) ? 'Clear Intersection Fault' : 'Simulate Intersection Fault'}
                </button>
              </div>
            ) : (
              /* Prompt state when nothing is selected */
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', padding: '1.5rem 1rem', display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
                <Crosshair size={28} color="rgba(0, 240, 255, 0.4)" />
                <span>
                  Click any horizontal wire (1&ndash;10), vertical wire (A&ndash;F), or node dot to select one or multiple wires.
                </span>

                {/* Preset quick actions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
                  <button
                    onClick={triggerThresholdFaults}
                    className={styles.actionBtnPrimary}
                    style={{ width: '100%' }}
                  >
                    <Zap size={14} />
                    Simulate &lt; 59% Fault Threshold Trigger
                  </button>

                  <button
                    onClick={() => {
                      const wires = [`${prefix}-B`];
                      selectWires(wires);
                      setSimulatedFaults(prev => ({ ...prev, [`${prefix}-B`]: true }));
                      triggerAlarm();
                    }}
                    className={styles.actionBtnMuted}
                    style={{ width: '100%' }}
                  >
                    Simulate Single Wire Fault (Wire B)
                  </button>
                </div>
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
// - 10 Horizontal Wires (Row 1..10) equally spaced across knuckles to elbow
// - 6 Vertical Wires (Col A..F) running from knuckles to elbow
// - 5 Finger Vertical Wires (1 per finger with 3 equidistant dots)
// - 60 Interactive Matrix Intersections (Col A..F x Row 1..10)
// ----------------------------------------------------------------------------------

// Per-row horizontal matrix spans [leftX, rightX] calibrated to stay precisely INSIDE palm & forearm silhouettes (1..10)
const ROW_SPANS: [number, number][] = [
  [80, 212], // Row 1: Upper Palm (y=202.2)
  [84, 214], // Row 2: Lower Palm (y=252.0)
  [92, 208], // Row 3: Wrist (y=301.7)
  [90, 210], // Row 4: Upper Forearm (y=351.5)
  [86, 214], // Row 5: Mid-Forearm 1 (y=401.2)
  [83, 217], // Row 6: Mid-Forearm 2 (y=451.0)
  [79, 221], // Row 7: Lower Forearm 1 (y=500.8)
  [75, 225], // Row 8: Lower Forearm 2 (y=550.5)
  [72, 228], // Row 9: Elbow (y=600.3)
  [69, 231], // Row 10: Elbow Bottom (y=650.0)
];

// 10 Horizontal Rows (1..10) starting from Upper Palm (y=202.2) down to Elbow Bottom (y=650.0)
const HORIZ_ROWS = HORIZ_NUMBERS.map((num, idx) => {
  const y = 202.2 + (idx * (650.0 - 202.2) / 9);
  return {
    num,
    id: `ROW-${num}`,
    y,
    span: ROW_SPANS[idx]
  };
});

// 6 Vertical Columns (A..F) from knuckles to elbow
// In Back View (flipX = true), u=1 is on screen left (little finger) and u=0 is on screen right (thumb).
// Mapping u = j / 5 puts Column F (j=5, u=1) on screen left (little finger) and Column A (j=0, u=0) on screen right (thumb).
const VERT_COLS = VERT_LETTERS.map((colLetter, j) => {
  const u = j / 5; // u=1 for F (little finger/left), u=0 for A (thumb/right)
  return {
    letter: colLetter,
    id: `COL-${colLetter}`,
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
      pathD: 'M 45 122 L 60 155 L 75 188',
      dots: [
        { segment: 'tip', label: 'Distal Tip', shortLabel: 'TIP', x: 45, y: 122 },
        { segment: 'mid', label: 'Interphalangeal (IP)', shortLabel: 'MID', x: 60, y: 155 },
        { segment: 'base', label: 'Metacarpophalangeal (MCP)', shortLabel: 'BASE', x: 75, y: 188 }
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
      pathD: 'M 45 122 L 60 155 L 75 188',
      dots: [
        { segment: 'tip', label: 'Distal Tip', shortLabel: 'TIP', x: 45, y: 122 },
        { segment: 'mid', label: 'Interphalangeal (IP)', shortLabel: 'MID', x: 60, y: 155 },
        { segment: 'base', label: 'Metacarpophalangeal (MCP)', shortLabel: 'BASE', x: 75, y: 188 }
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
  isIntersectionFaulted: (colLetter: string, rowNum: number) => boolean;
  selectedWireIds: string[];
  selectedIntersection: SelectedIntersection | null;
  selectedZone: GloveRegion | null;
  onToggleSelectWire: (wireId: string) => void;
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
  selectedWireIds,
  selectedIntersection,
  selectedZone,
  onToggleSelectWire,
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
  const prefix = hand === 'left' ? 'L' : 'R';

  // Build the vertical wire SVG paths running continuously across all 10 horizontal rows
  const vertWirePaths = useMemo(() => {
    return VERT_COLS.map(col => {
      const pts = HORIZ_ROWS.map(row => {
        const x = row.span[0] + col.u * (row.span[1] - row.span[0]);
        return `${x.toFixed(1)} ${row.y.toFixed(1)}`;
      });
      return {
        ...col,
        pathD: `M ${pts.join(' L ')}`,
        xTop: HORIZ_ROWS[0].span[0] + col.u * (HORIZ_ROWS[0].span[1] - HORIZ_ROWS[0].span[0]),
        xBottom: HORIZ_ROWS[9].span[0] + col.u * (HORIZ_ROWS[9].span[1] - HORIZ_ROWS[9].span[0])
      };
    });
  }, []);

  return (
    <svg 
      viewBox="0 0 340 705" 
      style={{ 
        width: '100%', 
        height: '100%', 
        maxHeight: '680px',
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

      {/* Main Hand & Arm Graphics Group */}
      <g transform={flipX ? 'translate(340, 0) scale(-1, 1)' : undefined}>
        
        {/* Anatomical Silhouettes */}
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
            d="M 75 220 C 50 200, 35 170, 30 140 C 28 120, 45 110, 60 125 C 75 140, 85 165, 75 220 Z"
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

        {/* 1. Finger Vertical Wires */}
        <g>
          {fingerWires.map(fw => {
            const wireKey = `${prefix}-${fw.yWireId}`;
            const isWireSelected = selectedWireIds.includes(wireKey) || selectedWireIds.includes(fw.yWireId);
            const isWireFaulted = isChannelFaulted(wireKey);

            return (
              <g 
                key={fw.finger}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSelectWire(wireKey);
                  onSelectZone(fw.region);
                }}
                style={{ cursor: 'pointer' }}
              >
                <title>{`${fw.label} Vertical Wire (${fw.yWireId})`}</title>
                {/* Finger vertical wire path */}
                <path
                  d={fw.pathD}
                  fill="none"
                  stroke={isWireFaulted ? '#ff2a2a' : isWireSelected ? '#00f0ff' : 'rgba(0, 240, 255, 0.45)'}
                  strokeWidth={isWireSelected ? 2.5 : 1.5}
                />
              </g>
            );
          })}
        </g>

        {/* 2. 10 Horizontal Wires (Row 1..10) */}
        <g>
          {HORIZ_ROWS.map(row => {
            const wireKey = `${prefix}-${row.num}`;
            const isRowSelected = selectedWireIds.includes(wireKey);
            const isRowFaulted = isChannelFaulted(wireKey);

            return (
              <g 
                key={row.num}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSelectWire(wireKey);
                  onSelectZone(row.y <= 325 ? palmRegion : forearmRegion);
                }}
                style={{ cursor: 'pointer' }}
              >
                <title>{`Horizontal Wire: ${row.num} [Row ${row.num}/10 Knuckles-to-Elbow]`}</title>
                
                {/* Horizontal Line */}
                <line
                  x1={row.span[0]}
                  y1={row.y}
                  x2={row.span[1]}
                  y2={row.y}
                  stroke={isRowFaulted ? '#ff2a2a' : isRowSelected ? '#00f0ff' : 'rgba(0, 240, 255, 0.45)'}
                  strokeWidth={isRowSelected ? 2.8 : isRowFaulted ? 2.2 : 1.2}
                  strokeDasharray={isRowSelected ? undefined : '3 2'}
                />

                {/* Left Tag: Row Number 1..10 */}
                <text
                  x={row.span[0] - 4}
                  y={row.y + 3}
                  textAnchor={flipX ? 'start' : 'end'}
                  transform={flipX ? `translate(${row.span[0] - 4}, ${row.y + 3}) scale(-1, 1) translate(${-(row.span[0] - 4)}, ${-(row.y + 3)})` : undefined}
                  fill={isRowFaulted ? '#ff6b6b' : isRowSelected ? '#00f0ff' : 'rgba(0, 240, 255, 0.85)'}
                  fontSize="7.5"
                  fontFamily="monospace"
                  fontWeight="bold"
                >
                  {row.num}
                </text>

                {/* Right Tag: Row Number 1..10 */}
                <text
                  x={row.span[1] + 4}
                  y={row.y + 3}
                  textAnchor={flipX ? 'end' : 'start'}
                  transform={flipX ? `translate(${row.span[1] + 4}, ${row.y + 3}) scale(-1, 1) translate(${-(row.span[1] + 4)}, ${-(row.y + 3)})` : undefined}
                  fill={isRowFaulted ? '#ff6b6b' : isRowSelected ? '#00f0ff' : 'rgba(0, 240, 255, 0.85)'}
                  fontSize="7.5"
                  fontFamily="monospace"
                  fontWeight="bold"
                >
                  {row.num}
                </text>
              </g>
            );
          })}
        </g>

        {/* 3. 6 Vertical Wires (Col A..F) */}
        <g>
          {vertWirePaths.map(col => {
            const wireKey = `${prefix}-${col.letter}`;
            const isColSelected = selectedWireIds.includes(wireKey);
            const isColFaulted = isChannelFaulted(wireKey);

            return (
              <g 
                key={col.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSelectWire(wireKey);
                  onSelectZone(palmRegion);
                }}
                style={{ cursor: 'pointer' }}
              >
                <title>{`Vertical Wire: ${col.letter} [Column ${col.letter}/F Knuckles-to-Elbow]`}</title>

                {/* Vertical Line running continuously from Knuckles to Elbow */}
                <path
                  d={col.pathD}
                  fill="none"
                  stroke={isColFaulted ? '#ff2a2a' : isColSelected ? '#ffaa00' : 'rgba(255, 170, 0, 0.5)'}
                  strokeWidth={isColSelected ? 2.6 : isColFaulted ? 2.0 : 1.2}
                />

                {/* Top Column Tag (above Row 1 at Palm) */}
                <text
                  x={col.xTop}
                  y={184}
                  textAnchor="middle"
                  transform={flipX ? `translate(${col.xTop}, 184) scale(-1, 1) translate(${-col.xTop}, -184)` : undefined}
                  fill={isColFaulted ? '#ff6b6b' : isColSelected ? '#ffaa00' : '#ffaa00'}
                  stroke="#020813"
                  strokeWidth="2.5"
                  paintOrder="stroke fill"
                  fontSize="8.5"
                  fontFamily="monospace"
                  fontWeight="bold"
                >
                  {col.letter}
                </text>

                {/* Bottom Column Tag (below Row 10 at Elbow) */}
                <text
                  x={col.xBottom}
                  y={668}
                  textAnchor="middle"
                  transform={flipX ? `translate(${col.xBottom}, 668) scale(-1, 1) translate(${-col.xBottom}, -668)` : undefined}
                  fill={isColFaulted ? '#ff6b6b' : isColSelected ? '#ffaa00' : '#ffaa00'}
                  stroke="#020813"
                  strokeWidth="2.5"
                  paintOrder="stroke fill"
                  fontSize="8.5"
                  fontFamily="monospace"
                  fontWeight="bold"
                >
                  {col.letter}
                </text>
              </g>
            );
          })}
        </g>

        {/* 4. Complete 6x10 Intersection Points (A1..F10) */}
        <g>
          {HORIZ_ROWS.map(row => {
            return VERT_COLS.map(col => {
              const jX = row.span[0] + col.u * (row.span[1] - row.span[0]);
              const jY = row.y;
              
              const isTargeted = selectedIntersection?.colLetter === col.letter && 
                                selectedIntersection?.rowNum === row.num;
              
              const isWireActive = selectedWireIds.includes(`${prefix}-${col.letter}`) && 
                                   selectedWireIds.includes(`${prefix}-${row.num}`);

              const isFaulted = isIntersectionFaulted(col.letter, row.num);

              return (
                <g 
                  key={`int-${col.letter}-${row.num}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectIntersection({
                      colLetter: col.letter as VertLetter,
                      rowNum: row.num as HorizNumber,
                      aspect: view
                    });
                    onSelectZone(row.y <= 325 ? palmRegion : forearmRegion);
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <title>{`Intersection (${col.letter}, ${row.num})\nLocation: Knuckles-to-Elbow Matrix\nStatus: ${isFaulted ? 'FAULT (<59%)' : 'NOMINAL'}\nAspect: ${view.toUpperCase()}`}</title>
                  
                  {/* Targeted Crosshair Reticle */}
                  {(isTargeted || isWireActive) && (
                    <>
                      <circle cx={jX} cy={jY} r={18} fill={`url(#glow-target-${hand}-${view})`} />
                      <circle cx={jX} cy={jY} r={10} fill="none" stroke="#00f0ff" strokeWidth={1.8} strokeDasharray="3 2" />
                      <line x1={jX - 14} y1={jY} x2={jX + 14} y2={jY} stroke="#00f0ff" strokeWidth={1.2} />
                      <line x1={jX} y1={jY - 14} x2={jX + 14} y2={jY} stroke="#00f0ff" strokeWidth={1.2} />
                    </>
                  )}

                  {/* Fault Glow */}
                  {isFaulted && !isTargeted && !isWireActive && (
                    <circle cx={jX} cy={jY} r={10} fill={`url(#glow-fault-${hand}-${view})`} />
                  )}

                  {/* Intersection Node Dot */}
                  <circle
                    cx={jX}
                    cy={jY}
                    r={isTargeted || isWireActive ? 5.5 : isFaulted ? 4.0 : 2.4}
                    fill={isFaulted ? '#ff2a2a' : isTargeted || isWireActive ? '#00f0ff' : 'rgba(0, 240, 255, 0.65)'}
                    stroke={isTargeted || isWireActive ? '#ffffff' : '#020813'}
                    strokeWidth={isTargeted || isWireActive ? 1.8 : 0.8}
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
        y="692"
        textAnchor="middle"
        fill="var(--text-muted)"
        fontSize="9.5"
        letterSpacing="1"
        fontWeight="600"
      >
        {view === 'front' 
          ? 'FRONT VIEW (PALMAR) • 10 HORIZONTAL (1–10) × 6 VERTICAL (A–F)' 
          : 'BACK VIEW (DORSAL) • 10 HORIZONTAL (1–10) × 6 VERTICAL (A–F)'}
      </text>
    </svg>
  );
};

export default LiveGloveStatus;
