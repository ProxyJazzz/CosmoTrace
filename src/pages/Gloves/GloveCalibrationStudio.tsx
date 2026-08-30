import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Upload, Download, AlertTriangle, RotateCcw } from 'lucide-react';
import { useGloveCalibrationStore } from '../../store/useGloveCalibrationStore';
import { useAppStore } from '../../store/useAppStore';
import { GloveCalibrationScene } from './GloveCalibrationScene';
import { GloveSensorAssignmentPanel } from './GloveSensorAssignmentPanel';
import { GloveFibreRouteEditor } from './GloveFibreRouteEditor';
import type { GloveCalibrationMap } from '../../types';
import styles from '../Calibration/Calibration.module.css';

export const GloveCalibrationStudio: React.FC = () => {
  const { hasUnsavedChanges, setHasUnsavedChanges } = useGloveCalibrationStore();
  const { gloveCalibrationMap, setGloveCalibrationMap } = useAppStore();
  const [history, setHistory] = useState<GloveCalibrationMap[]>([]);

  const handleAddHistory = (prevMap: GloveCalibrationMap) => {
    setHistory(h => [...h.slice(-10), prevMap]);
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setHistory(h => h.slice(0, h.length - 1));
    setGloveCalibrationMap(previous);
    setHasUnsavedChanges(true);
  };

  const handleExport = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(gloveCalibrationMap, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "gloveCalibrationMap.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    setHasUnsavedChanges(false);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (typeof json === 'object' && json !== null) {
          // Validate structure
          const firstKey = Object.keys(json)[0];
          if (firstKey && json[firstKey].hand && json[firstKey].finger) {
            setGloveCalibrationMap(json);
            setHasUnsavedChanges(false);
            alert('Glove calibration map imported successfully.');
          } else {
            alert('Invalid glove calibration schema.');
          }
        } else {
          alert('Invalid JSON format.');
        }
      } catch (err) {
        alert('Failed to parse JSON file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className={styles.studioContainer}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Link to="/gloves" className={styles.backBtn}>
            <ArrowLeft size={18} />
            Glove Control Center
          </Link>
          <div className={styles.title}>
            <span style={{ color: 'var(--status-healthy)' }}>Glove Calibration Studio</span>
          </div>
          {hasUnsavedChanges && (
            <div className={styles.unsavedWarning}>
              <AlertTriangle size={14} />
              Unsaved Changes
            </div>
          )}
        </div>

        <div className={styles.stepIndicator}>
          1. Select sensor channel &rarr; 2. Click glove mesh &rarr; 3. Set fibre route &rarr; 4. Export JSON
        </div>

        <div className={styles.headerRight}>
          <button 
            onClick={handleUndo} 
            disabled={history.length === 0}
            className={styles.actionBtn}
            style={{ opacity: history.length === 0 ? 0.5 : 1, cursor: history.length === 0 ? 'not-allowed' : 'pointer' }}
          >
            <RotateCcw size={15} />
            Undo
          </button>
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
          <GloveSensorAssignmentPanel />
        </div>
        
        <div className={styles.canvasArea}>
          <GloveCalibrationScene onAddHistoryEntry={handleAddHistory} />
        </div>

        <div className={styles.rightSidebar}>
          <GloveFibreRouteEditor />
        </div>
      </main>
    </div>
  );
};
