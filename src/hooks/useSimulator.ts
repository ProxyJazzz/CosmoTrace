import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import type { SensorData, RawData, PerChannelData, ZoneStatus } from '../types';

const NORMAL_MIN = 400;
const NORMAL_MAX = 600;
const SIMULATION_INTERVAL = 1000; // 1 second updates

export function useSimulator() {
  const { demoMode, setSensorData, addEventLogEntry, setConnectionState, calibrationMap } = useAppStore();
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (!demoMode) {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    setConnectionState('LIVE');

    const allChannels = Object.keys(calibrationMap);
    
    // Keep track of current values to make them drift smoothly
    const currentValues: Record<string, number> = {};
    allChannels.forEach(id => {
      currentValues[id] = NORMAL_MIN + Math.random() * (NORMAL_MAX - NORMAL_MIN);
    });

    // Randomly select a few channels to be broken over time
    let brokenSet = new Set<string>();

    const tick = () => {
      const timestamp = Date.now();
      const raw: RawData = {};
      const perChannel: PerChannelData = {};
      const zoneStatus: ZoneStatus = {
        helmet: 'OK', torso_front: 'OK', torso_back: 'OK',
        left_arm: 'OK', right_arm: 'OK', left_glove: 'OK', right_glove: 'OK',
        left_leg: 'OK', right_leg: 'OK', left_boot: 'OK', right_boot: 'OK',
        fingers: 'OK', palm: 'OK', wrist: 'OK', arm: 'OK' // legacy zones
      };

      // 1% chance to break a new random channel if less than 3 broken
      if (Math.random() < 0.05 && brokenSet.size < 3) {
        const randomId = allChannels[Math.floor(Math.random() * allChannels.length)];
        brokenSet.add(randomId);
      }

      // 2% chance to fix a broken channel
      if (Math.random() < 0.02 && brokenSet.size > 0) {
        const items = Array.from(brokenSet);
        const toFix = items[Math.floor(Math.random() * items.length)];
        brokenSet.delete(toFix);
      }

      allChannels.forEach(id => {
        let isBroken = brokenSet.has(id);
        
        if (isBroken) {
          currentValues[id] = Math.floor(Math.random() * 50); 
        } else {
          // Normal drift
          currentValues[id] += (Math.random() - 0.5) * 20;
          currentValues[id] = Math.max(NORMAL_MIN, Math.min(NORMAL_MAX, currentValues[id]));
        }

        const reading = Math.round(currentValues[id]);
        raw[id] = reading;
        
        const status = isBroken ? 'BROKEN' : 'OK';
        perChannel[id] = status;

        if (status === 'BROKEN') {
          const region = calibrationMap[id]?.region;
          if (region) zoneStatus[region] = 'BROKEN';
          
          // Legacy mapping logic for simulation
          if (region === 'left_glove' || region === 'right_glove') {
             zoneStatus.fingers = 'BROKEN';
             zoneStatus.palm = 'BROKEN';
          }
        }
      });

      const brokenChannels = allChannels.filter(id => perChannel[id] === 'BROKEN');
      
      const newData: SensorData = {
        timestamp,
        raw,
        perChannel,
        zoneStatus,
        brokenChannels
      };

      setSensorData(newData);

      // Add event log entries for newly broken channels (simplified for demo)
      brokenChannels.forEach(id => {
        // Just log occasionally for demo
        if (Math.random() < 0.1) {
          addEventLogEntry({
            id: `${timestamp}-${id}`,
            timestamp,
            channelId: id,
            reading: raw[id],
            region: calibrationMap[id]?.region || 'helmet',
            status: 'BROKEN'
          });
        }
      });
    };

    // Run first tick immediately
    tick();
    intervalRef.current = window.setInterval(tick, SIMULATION_INTERVAL);

    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
      }
    };
  }, [demoMode, setSensorData, setConnectionState, addEventLogEntry]);
}
