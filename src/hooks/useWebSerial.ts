import { useState, useCallback, useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { globalOptiMeshSerial } from '../utils/optimesh_10x6_simulated_new';
import type { FaultUpdatePayload } from '../utils/optimesh_10x6_simulated_new';
import type { SensorData, RawData, PerChannelData, ZoneStatus } from '../types';

export function useWebSerial() {
  const { 
    connectionState, 
    setConnectionState, 
    setSensorData, 
    setLiveSerialData, 
    addEventLogEntry, 
    calibrationMap, 
    gloveCalibrationMap 
  } = useAppStore();

  const [serialError, setSerialError] = useState<string | null>(null);

  const handleFaultUpdate = useCallback((payload: FaultUpdatePayload | any) => {
    const raw: RawData = {};
    const perChannel: PerChannelData = {};
    const brokenChannels: string[] = [];
    const zoneStatus: ZoneStatus = {};
    const timestampMs = Date.now();

    if (payload && payload.readings) {
      const { readings, rowFaults, colFaults } = payload as FaultUpdatePayload;
      
      const newFaultedSet = new Set<string>();
      const pointFaults = payload.pointFaults || new Set<string>();

      Object.entries(readings).forEach(([key, value]) => {
        raw[key] = value;
        const isFaulted = (rowFaults && rowFaults.has(key)) || 
                          (colFaults && colFaults.has(key)) || 
                          value < 59;
        
        perChannel[key] = isFaulted ? 'BROKEN' : 'OK';
        if (isFaulted) {
          newFaultedSet.add(key);
          brokenChannels.push(key);
          const region = calibrationMap[key]?.region || gloveCalibrationMap[key]?.region;
          if (region) {
            zoneStatus[region] = 'BROKEN';
          }
          addEventLogEntry({
            id: `evt-${timestampMs}-${key}`,
            timestamp: timestampMs,
            channelId: key,
            reading: value,
            region: (region ? region : 'left_glove') as any,
            status: 'BROKEN'
          });
        }
      });

      setLiveSerialData(readings, newFaultedSet, pointFaults);
    }

    const sensorData: SensorData = {
      timestamp: timestampMs,
      raw,
      perChannel,
      zoneStatus,
      brokenChannels
    };

    setSensorData(sensorData);
  }, [setSensorData, setLiveSerialData, addEventLogEntry, calibrationMap, gloveCalibrationMap]);

  const handleFaultUpdateRef = useRef(handleFaultUpdate);
  useEffect(() => {
    handleFaultUpdateRef.current = handleFaultUpdate;
  }, [handleFaultUpdate]);

  useEffect(() => {
    globalOptiMeshSerial.setStatusChangeCallback((connected, msg) => {
      if (connected) {
        if (useAppStore.getState().connectionState !== 'LIVE') {
          setConnectionState('LIVE');
        }
        setSerialError(null);
      } else {
        if (useAppStore.getState().connectionState !== 'DISCONNECTED') {
          setConnectionState('DISCONNECTED');
        }
        if (msg && msg !== 'ESP32 disconnected') {
          setSerialError(msg);
        }
      }
    });

    globalOptiMeshSerial.setFaultUpdateCallback((payload) => {
      handleFaultUpdateRef.current(payload);
    });

    // Auto-connect ONCE on app load if port is authorized
    globalOptiMeshSerial.autoConnectPreviousPort(115200).catch(() => {});
  }, [setConnectionState]);

  const connectSerial = useCallback(async (baudRate = 115200, useVendorFilter = false) => {
    setSerialError(null);
    try {
      const success = await globalOptiMeshSerial.connect(baudRate, useVendorFilter);
      if (success) {
        setConnectionState('LIVE');
      }
      return success;
    } catch (err: any) {
      console.error('Serial connection failed:', err);
      const errMsg = err?.message || 'Failed to open serial port.';
      setSerialError(errMsg);
      setConnectionState('DISCONNECTED');
      return false;
    }
  }, [setConnectionState]);

  const disconnectSerial = useCallback(async () => {
    await globalOptiMeshSerial.disconnect();
    setSerialError(null);
    setConnectionState('DISCONNECTED');
  }, [setConnectionState]);

  const isConnected = connectionState === 'LIVE';

  return {
    isConnected,
    serialError,
    setSerialError,
    connectSerial,
    disconnectSerial
  };
}
