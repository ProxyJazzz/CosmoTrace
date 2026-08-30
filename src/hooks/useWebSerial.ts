import { useState, useCallback, useRef, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { OptiMeshSerial } from '../utils/optimesh-serial';
import type { ChannelMap } from '../utils/optimesh-serial';
import type { SensorData, RawData, PerChannelData, ZoneStatus } from '../types';

export function useWebSerial() {
  const { setSensorData, setConnectionState, addEventLogEntry, calibrationMap, gloveCalibrationMap } = useAppStore();
  const [isConnected, setIsConnected] = useState(false);
  const serialRef = useRef<OptiMeshSerial | null>(null);

  const handleGridUpdate = useCallback((channelMap: ChannelMap) => {
    const raw: RawData = {};
    const perChannel: PerChannelData = {};
    const brokenChannels: string[] = [];
    const zoneStatus: ZoneStatus = {};
    const timestampMs = Date.now();

    Object.entries(channelMap).forEach(([studioNumStr, entry]) => {
      const studioNum = parseInt(studioNumStr, 10);
      const channelId = `X${studioNum}`;
      const status = entry.fault ? 'BROKEN' : 'OK';

      raw[channelId] = entry.value;
      perChannel[channelId] = status;

      if (entry.fault) {
        brokenChannels.push(channelId);

        const region = calibrationMap[channelId]?.region || gloveCalibrationMap[channelId]?.region;
        if (region) {
          zoneStatus[region] = 'BROKEN';
        }

        addEventLogEntry({
          id: `evt-${timestampMs}-${channelId}`,
          timestamp: timestampMs,
          channelId,
          reading: entry.value,
          region: (region ? 'left_arm' : 'left_arm') as any,
          status: 'BROKEN'
        });
      }
    });

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

  const connectSerial = useCallback(async (baudRate = 115200) => {
    if (!serialRef.current) {
      serialRef.current = new OptiMeshSerial(handleGridUpdate, (connected) => {
        setIsConnected(connected);
        if (connected) {
          setConnectionState('LIVE');
        } else {
          setConnectionState('DISCONNECTED');
        }
      });
    } else {
      serialRef.current.setGridUpdateCallback(handleGridUpdate);
    }

    try {
      return await serialRef.current.connect(baudRate);
    } catch (err) {
      console.error('Serial connection failed:', err);
      setIsConnected(false);
      setConnectionState('DISCONNECTED');
      return false;
    }
  }, [handleGridUpdate, setConnectionState]);

  const disconnectSerial = useCallback(async () => {
    if (serialRef.current) {
      await serialRef.current.disconnect();
      setIsConnected(false);
      setConnectionState('DISCONNECTED');
    }
  }, [setConnectionState]);

  useEffect(() => {
    return () => {
      if (serialRef.current) {
        serialRef.current.disconnect();
      }
    };
  }, []);

  return {
    isConnected,
    connectSerial,
    disconnectSerial
  };
}
