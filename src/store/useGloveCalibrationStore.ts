import { create } from 'zustand';
import type { GloveHand } from '../types';

interface GloveCalibrationState {
  selectedSensorId: string | null;
  activeFibreRoute: string | null;
  handFilter: GloveHand | 'all';
  faultPreviewMode: boolean;
  hasUnsavedChanges: boolean;
  
  // Actions
  setSelectedSensorId: (id: string | null) => void;
  setActiveFibreRoute: (route: string | null) => void;
  setHandFilter: (filter: GloveHand | 'all') => void;
  setFaultPreviewMode: (enabled: boolean) => void;
  setHasUnsavedChanges: (hasUnsaved: boolean) => void;
}

export const useGloveCalibrationStore = create<GloveCalibrationState>((set) => ({
  selectedSensorId: null,
  activeFibreRoute: 'GLOVE-L-01',
  handFilter: 'all',
  faultPreviewMode: false,
  hasUnsavedChanges: false,
  
  setSelectedSensorId: (id) => set({ selectedSensorId: id }),
  setActiveFibreRoute: (route) => set({ activeFibreRoute: route }),
  setHandFilter: (filter) => set({ handFilter: filter }),
  setFaultPreviewMode: (enabled) => set({ faultPreviewMode: enabled }),
  setHasUnsavedChanges: (hasUnsaved) => set({ hasUnsavedChanges: hasUnsaved }),
}));
