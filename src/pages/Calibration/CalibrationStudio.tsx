import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Upload, Download, AlertTriangle } from 'lucide-react';
import { useCalibrationStore } from '../../store/useCalibrationStore';
import { useAppStore } from '../../store/useAppStore';
import { CalibrationScene } from './CalibrationScene';
import { SensorAssignmentPanel } from './SensorAssignmentPanel';
import { FibreRouteEditor } from './FibreRouteEditor';
import styles from './Calibration.module.css';

export const CalibrationStudio = () => {
  const { hasUnsavedChanges } = useCalibrationStore();
  const { calibrationMap, setCalibrationMap } = useAppStore();

  const handleExport = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(calibrationMap, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "fibreCalibrationMap.json");
    document.body.appendChild(downloadAnchorNode); // required for firefox
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    useCalibrationStore.getState().setHasUnsavedChanges(false);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        // Basic validation
        if (typeof json === 'object' && json !== null) {
          setCalibrationMap(json);
          useCalibrationStore.getState().setHasUnsavedChanges(false);
          alert('Calibration map imported successfully.');
        } else {
          alert('Invalid JSON format.');
        }
      } catch (err) {
        alert('Failed to parse JSON file.');
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // reset
  };

  return (
    <div className={styles.studioContainer}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Link to="/" className={styles.backBtn}>
            <ArrowLeft size={18} />
            Back to Dashboard
          </Link>
          <div className={styles.title}>
            <span style={{ color: 'var(--status-healthy)' }}>Fibre Mapping Studio</span>
          </div>
          {hasUnsavedChanges && (
            <div className={styles.unsavedWarning}>
              <AlertTriangle size={14} />
              Unsaved Changes
            </div>
          )}
        </div>

        <div className={styles.stepIndicator}>
          1. Select channel &rarr; 2. Click suit surface &rarr; 3. Add route &rarr; 4. Export
        </div>

        <div className={styles.headerRight}>
          <label className={styles.actionBtn}>
            <Upload size={16} />
            Import JSON
            <input type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
          </label>
          <button className={`${styles.actionBtn} ${styles.primary}`} onClick={handleExport}>
            <Download size={16} />
            Export JSON
          </button>
        </div>
      </header>

      <main className={styles.workspace}>
        <div className={styles.sidebar}>
          <SensorAssignmentPanel />
        </div>
        
        <div className={styles.canvasArea}>
          <CalibrationScene />
        </div>

        <div className={styles.rightSidebar}>
          <FibreRouteEditor />
        </div>
      </main>
    </div>
  );
};
