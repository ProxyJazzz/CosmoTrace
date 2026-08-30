import { Routes, Route } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard';
import { CalibrationStudio } from './pages/Calibration/CalibrationStudio';
import { GloveControlCenter } from './pages/Gloves/GloveControlCenter';
import { GloveCalibrationStudio } from './pages/Gloves/GloveCalibrationStudio';
import { LiveGloveStatus } from './pages/Gloves/LiveGloveStatus';
import { useSimulator } from './hooks/useSimulator';
import { useWebSocket } from './hooks/useWebSocket';

export default function App() {
  // Initialize hooks at the root
  useSimulator();
  useWebSocket('ws://localhost:3000');

  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/calibration" element={<CalibrationStudio />} />
      <Route path="/gloves" element={<GloveControlCenter />} />
      <Route path="/gloves/calibration" element={<GloveCalibrationStudio />} />
      <Route path="/gloves/live" element={<LiveGloveStatus />} />
      <Route path="/gloves/status" element={<LiveGloveStatus />} />
    </Routes>
  );
}
