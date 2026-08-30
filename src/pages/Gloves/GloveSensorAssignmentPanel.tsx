import React, { useState, useMemo } from 'react';
import { Search, X, CheckCircle, Circle, Eye } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { useGloveCalibrationStore } from '../../store/useGloveCalibrationStore';
import styles from '../Calibration/Calibration.module.css';

type GloveFilter = 'ALL' | 'UNMAPPED' | 'MAPPED' | 'LEFT' | 'RIGHT' | 'PALM' | 'FINGERS';

export const GloveSensorAssignmentPanel = () => {
  const { gloveCalibrationMap, setGloveCalibrationMap } = useAppStore();
  const { selectedSensorId, setSelectedSensorId, faultPreviewMode, setFaultPreviewMode, setHasUnsavedChanges } = useGloveCalibrationStore();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<GloveFilter>('ALL');

  const channels = useMemo(() => {
    return Object.values(gloveCalibrationMap).sort((a, b) => {
      const aType = a.id[0];
      const bType = b.id[0];
      if (aType !== bType) return aType.localeCompare(bType);
      return parseInt(a.id.slice(1)) - parseInt(b.id.slice(1));
    });
  }, [gloveCalibrationMap]);

  const filtered = channels.filter(c => {
    if (search && !c.id.toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === 'MAPPED') return c.confidence === 'calibrated';
    if (filter === 'UNMAPPED') return c.confidence === 'placeholder';
    if (filter === 'LEFT') return c.hand === 'left';
    if (filter === 'RIGHT') return c.hand === 'right';
    if (filter === 'PALM') return c.finger === 'palm';
    if (filter === 'FINGERS') return c.finger !== 'palm';
    return true;
  });

  const handleUnmap = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (window.confirm(`Are you sure you want to unmap glove sensor ${id}?`)) {
      const newMap = { ...gloveCalibrationMap };
      newMap[id] = {
        ...newMap[id],
        confidence: 'placeholder',
        distanceAlongFibreMm: 0,
        sensorSpacingMm: 0,
      };
      setGloveCalibrationMap(newMap);
      setHasUnsavedChanges(true);
    }
  };

  return (
    <>
      <div className={styles.panelHeader}>
        Glove Channels ({filtered.length})
        <button 
          onClick={() => setFaultPreviewMode(!faultPreviewMode)}
          style={{
            background: faultPreviewMode ? 'rgba(255,42,42,0.2)' : 'transparent',
            border: `1px solid ${faultPreviewMode ? '#ff2a2a' : 'var(--border-color)'}`,
            color: faultPreviewMode ? '#ff2a2a' : 'var(--text-muted)',
            padding: '4px 8px',
            borderRadius: '4px',
            cursor: 'pointer',
            display: 'flex',
            gap: '4px',
            alignItems: 'center',
            fontSize: '0.75rem'
          }}
        >
          <Eye size={14} />
          {faultPreviewMode ? 'Preview ON' : 'Preview OFF'}
        </button>
      </div>

      <div style={{ padding: '1rem 1rem 0', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input 
            type="text" 
            placeholder="Search glove sensor..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', color: 'white', padding: '6px 8px 6px 28px', borderRadius: '4px', fontSize: '0.8rem' }}
          />
        </div>

        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {(['ALL', 'UNMAPPED', 'MAPPED', 'LEFT', 'RIGHT', 'PALM', 'FINGERS'] as GloveFilter[]).map(f => (
            <button 
              key={f}
              onClick={() => setFilter(f)}
              style={{
                background: filter === f ? 'rgba(0, 240, 255, 0.2)' : 'transparent',
                border: '1px solid var(--border-color)',
                color: filter === f ? 'var(--status-healthy)' : 'var(--text-muted)',
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '0.65rem',
                cursor: 'pointer'
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>
      
      <div className={styles.panelContent}>
        {filtered.map(c => {
          const isSelected = selectedSensorId === c.id;
          const isMapped = c.confidence === 'calibrated';
          return (
            <div 
              key={c.id}
              onClick={() => setSelectedSensorId(c.id)}
              style={{
                background: isSelected ? 'rgba(0, 240, 255, 0.1)' : 'rgba(0,0,0,0.2)',
                border: `1px solid ${isSelected ? 'var(--status-healthy)' : 'var(--border-color)'}`,
                padding: '8px',
                borderRadius: '4px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {isMapped ? <CheckCircle size={14} color="var(--status-healthy)" /> : <Circle size={14} color="var(--text-muted)" />}
                <div>
                  <span style={{ fontWeight: 600, color: isSelected ? 'var(--text-main)' : 'var(--text-muted)', fontSize: '0.85rem' }}>{c.id}</span>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                    {c.hand} — {c.finger}
                  </div>
                </div>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                  {isMapped ? c.region.replace('_', ' ') : 'Unmapped'}
                </span>
                {isMapped && (
                  <button 
                    onClick={(e) => handleUnmap(e, c.id)}
                    style={{ background: 'none', border: 'none', color: 'var(--status-fault)', cursor: 'pointer', padding: '2px' }}
                    title="Unmap glove sensor"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
};
