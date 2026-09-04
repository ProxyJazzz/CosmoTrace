import { useState, useCallback, useRef, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { OptiMeshSerial } from '../utils/optimesh-serial';
import type { FaultUpdatePayload } from '../utils/optimesh-serial';
import type { SensorData, RawData, PerChannelData, ZoneStatus } from '../types';

export function useWebSerial() {
  const { setSensorData, setConnectionState, addEventLogEntry, calibrationMap, gloveCalibrationMap } = useAppStore();
  const [isConnected, setIsConnected] = useState(false);
  const serialRef = useRef<OptiMeshSerial | null>(null);

  const handleFaultUpdate = useCallback((payload: FaultUpdatePayload | any) => {
    const raw: RawData = {};
    const perChannel: PerChannelData = {};
    const brokenChannels: string[] = [];
    const zoneStatus: ZoneStatus = {};
    const timestampMs = Date.now();

    if (payload && payload.readings) {
      // 10x6 payload shape
      const { readings, rowFaults, colFaults } = payload as FaultUpdatePayload;
      
      Object.entries(readings).forEach(([key, value]) => {
        raw[key] = value;
        const isFaulted = (rowFaults && rowFaults.has(key)) || 
                          (colFaults && colFaults.has(key)) || 
                          value < 59;
        
        perChannel[key] = isFaulted ? 'BROKEN' : 'OK';
        if (isFaulted) {
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
    } else if (payload && typeof payload === 'object') {
      // ChannelMap fallback
      Object.entries(payload).forEach(([studioNumStr, entry]: [string, any]) => {
        const studioNum = parseInt(studioNumStr, 10);
        const channelId = `X${studioNum}`;
        const status = entry?.fault ? 'BROKEN' : 'OK';
        const val = entry?.value ?? 0;

        raw[channelId] = val;
        perChannel[channelId] = status;

        if (entry?.fault) {
          brokenChannels.push(channelId);
          const region = calibrationMap[channelId]?.region || gloveCalibrationMap[channelId]?.region;
          if (region) {
            zoneStatus[region] = 'BROKEN';
          }
          addEventLogEntry({
            id: `evt-${timestampMs}-${channelId}`,
            timestamp: timestampMs,
            channelId,
            reading: val,
            region: (region ? region : 'left_arm') as any,
            status: 'BROKEN'
          });
        }
      });
    }

    const sensorData: SensorData = {
      timestamp: timestampMs,
      raw,
      perChannel,
      zoneStatus,
      brokenChannels
    };

    setSensorData(sensorData);
    setConnectionState('LIVE');
  }, [setSensorData, setConnectionState, addEventLogEntry, calibrationMap, gloveCalibrationMap]);

  const [serialError, setSerialError] = useState<string | null>(null);

  const connectSerial = useCallback(async (baudRate = 115200, useVendorFilter = false) => {
    setSerialError(null);
    if (!serialRef.current) {
      serialRef.current = new OptiMeshSerial(handleFaultUpdate, (connected, msg) => {
        setIsConnected(connected);
        if (connected) {
          setConnectionState('LIVE');
          setSerialError(null);
        } else {
          setConnectionState('DISCONNECTED');
          if (msg && msg !== 'ESP32 disconnected') {
            setSerialError(msg);
          }
        }
      });
    } else {
      serialRef.current.setFaultUpdateCallback(handleFaultUpdate);
    }

    try {
      const success = await serialRef.current.connect(baudRate, useVendorFilter);
      return success;
    } catch (err: any) {
      console.error('Serial connection failed:', err);
      const errMsg = err?.message || 'Failed to open serial port.';
      setSerialError(errMsg);
      setIsConnected(false);
      setConnectionState('DISCONNECTED');
      return false;
    }
  }, [handleFaultUpdate, setConnectionState]);

  const disconnectSerial = useCallback(async () => {
    if (serialRef.current) {
      await serialRef.current.disconnect();
      setIsConnected(false);
      setSerialError(null);
      setConnectionState('DISCONNECTED');
    }
  }, [setConnectionState]);

  useEffect(() => {
    // Attempt auto-connect if previous port exists
    if (!serialRef.current) {
      const serial = new OptiMeshSerial(handleFaultUpdate, (connected) => {
        setIsConnected(connected);
        if (connected) {
          setConnectionState('LIVE');
        } else {
          setConnectionState('DISCONNECTED');
        }
      });
      serialRef.current = serial;
      serial.autoConnectPreviousPort(115200).catch(() => {});
    }

    return () => {
      if (serialRef.current) {
        serialRef.current.disconnect();
      }
    };
  }, [handleFaultUpdate, setConnectionState]);

  return {
    isConnected,
    serialError,
    setSerialError,
    connectSerial,
    disconnectSerial
  };
}
