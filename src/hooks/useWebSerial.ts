import { useState, useCallback, useRef, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { OptiMeshSerial } from '../utils/optimesh-serial';
import type { FaultGrid } from '../utils/optimesh-serial';
import type { SensorData, RawData, PerChannelData, ZoneStatus } from '../types';

export function useWebSerial() {
  const { setSensorData, setConnectionState, addEventLogEntry, calibrationMap, gloveCalibrationMap } = useAppStore();
  const [isConnected, setIsConnected] = useState(false);
  const serialRef = useRef<OptiMeshSerial | null>(null);

  const handleGridUpdate = useCallback((faultGrid: FaultGrid, timestampMs: number) => {
    const raw: RawData = {};
    const perChannel: PerChannelData = {};
    const brokenChannels: string[] = [];
    const zoneStatus: ZoneStatus = {};

    let index = 0;
    // Map 10x10 faultGrid (100 bits) to CosmoTrace channels X1..X65, Y1..Y35
    for (let x = 0; x < 10; x++) {
      for (let y = 0; y < 10; y++) {
        index++;
        const channelId = index <= 65 ? `X${index}` : `Y${index - 65}`;
        const isFaulted = faultGrid[x][y];

        const status = isFaulted ? 'BROKEN' : 'OK';
        const reading = isFaulted ? 20 : 500; // Raw value < 100 indicates fault

        raw[channelId] = reading;
        perChannel[channelId] = status;

        if (isFaulted) {
          brokenChannels.push(channelId);

          const region = calibrationMap[channelId]?.region || gloveCalibrationMap[channelId]?.region;
          if (region) {
            zoneStatus[region] = 'BROKEN';
          }

          addEventLogEntry({
            id: `evt-${timestampMs}-${channelId}`,
            timestamp: timestampMs,
            channelId,
            reading,
            region: region || 'torso_front',
            status: 'BROKEN'
          });
        }
      }
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
