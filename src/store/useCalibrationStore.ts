import { create } from 'zustand';

interface CalibrationState {
  selectedSensorId: string | null;
  activeFibreRoute: string | null;
  faultPreviewMode: boolean;
  hasUnsavedChanges: boolean;
  
  // Actions
  setSelectedSensorId: (id: string | null) => void;
  setActiveFibreRoute: (route: string | null) => void;
  setFaultPreviewMode: (enabled: boolean) => void;
  setHasUnsavedChanges: (hasUnsaved: boolean) => void;
}

export const useCalibrationStore = create<CalibrationState>((set) => ({
  selectedSensorId: null,
  activeFibreRoute: null,
  faultPreviewMode: false,
  hasUnsavedChanges: false,
  
  setSelectedSensorId: (id) => set({ selectedSensorId: id }),
  setActiveFibreRoute: (route) => set({ activeFibreRoute: route }),
  setFaultPreviewMode: (enabled) => set({ faultPreviewMode: enabled }),
  setHasUnsavedChanges: (hasUnsaved) => set({ hasUnsavedChanges: hasUnsaved }),
}));
