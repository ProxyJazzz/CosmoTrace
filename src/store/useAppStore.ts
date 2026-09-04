import { create } from 'zustand';
import type { ConnectionState, EventLogEntry, SensorData, CalibrationMap, GloveCalibrationMap } from '../types';
import defaultMap from '../data/fibreCalibrationMap.json';
import defaultGloveMap from '../data/gloveCalibrationMap.json';

interface AppState {
  connectionState: ConnectionState;
  sensorData: SensorData | null;
  eventLog: EventLogEntry[];
  demoMode: boolean;
  selectedSensorId: string | null;
  selectedGloveSensorId: string | null;
  calibrationMap: CalibrationMap;
  gloveCalibrationMap: GloveCalibrationMap;

  // Live Serial State
  liveReadings: Record<string, number>;
  serialFaults: Set<string>;
  serialPointFaults: Set<string>;
  serialErrorMessage: string | null;
  
  // Actions
  setConnectionState: (state: ConnectionState) => void;
  setSensorData: (data: SensorData) => void;
  addEventLogEntry: (entry: EventLogEntry) => void;
  setDemoMode: (enabled: boolean) => void;
  setSelectedSensorId: (id: string | null) => void;
  setSelectedGloveSensorId: (id: string | null) => void;
  setCalibrationMap: (map: CalibrationMap) => void;
  setGloveCalibrationMap: (map: GloveCalibrationMap) => void;
  setLiveSerialData: (readings: Record<string, number>, serialFaults: Set<string>, serialPointFaults: Set<string>) => void;
  setSerialErrorMessage: (msg: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  connectionState: 'DISCONNECTED',
  sensorData: null,
  eventLog: [],
  demoMode: false,
  selectedSensorId: null,
  selectedGloveSensorId: null,
  calibrationMap: defaultMap as unknown as CalibrationMap,
  gloveCalibrationMap: defaultGloveMap as unknown as GloveCalibrationMap,

  liveReadings: {},
  serialFaults: new Set<string>(),
  serialPointFaults: new Set<string>(),
  serialErrorMessage: null,

  setConnectionState: (state) => set((prev) => prev.connectionState === state ? prev : { connectionState: state }),
  setSensorData: (data) => set({ sensorData: data }),
  addEventLogEntry: (entry) => set((state) => ({
    eventLog: [entry, ...state.eventLog].slice(0, 100)
  })),
  setDemoMode: (enabled) => set({ demoMode: enabled }),
  setSelectedSensorId: (id) => set({ selectedSensorId: id }),
  setSelectedGloveSensorId: (id) => set({ selectedGloveSensorId: id }),
  setCalibrationMap: (map) => set({ calibrationMap: map }),
  setGloveCalibrationMap: (map) => set({ gloveCalibrationMap: map }),
  setLiveSerialData: (readings, serialFaults, serialPointFaults) => set({
    liveReadings: readings,
    serialFaults,
    serialPointFaults,
    connectionState: 'LIVE'
  }),
  setSerialErrorMessage: (msg) => set({ serialErrorMessage: msg }),
}));
