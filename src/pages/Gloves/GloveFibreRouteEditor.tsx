import React, { useState, useMemo } from 'react';
import { Route, Plus } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { useGloveCalibrationStore } from '../../store/useGloveCalibrationStore';
import styles from '../Calibration/Calibration.module.css';

export const GloveFibreRouteEditor = () => {
  const { gloveCalibrationMap } = useAppStore();
  const { activeFibreRoute, setActiveFibreRoute } = useGloveCalibrationStore();
  const [newRouteName, setNewRouteName] = useState('');

  // Extract unique fibre IDs from mapped glove sensors
  const existingRoutes = useMemo(() => {
    const routes = new Set<string>(['GLOVE-L-01', 'GLOVE-R-01']);
    Object.values(gloveCalibrationMap).forEach(s => {
      if (s.fibreId && s.fibreId !== 'UNASSIGNED') {
        routes.add(s.fibreId);
      }
    });
    if (activeFibreRoute && activeFibreRoute !== 'UNASSIGNED') {
      routes.add(activeFibreRoute);
    }
    return Array.from(routes).sort();
  }, [gloveCalibrationMap, activeFibreRoute]);

  const handleAddRoute = (e: React.FormEvent) => {
    e.preventDefault();
    if (newRouteName.trim()) {
      setActiveFibreRoute(newRouteName.trim().toUpperCase());
      setNewRouteName('');
    }
  };

  const getRouteStats = (routeId: string) => {
    const sensorsOnRoute = Object.values(gloveCalibrationMap)
      .filter(s => s.fibreId === routeId && s.confidence === 'calibrated')
      .sort((a, b) => parseInt(a.id.slice(1)) - parseInt(b.id.slice(1)));
      
    if (sensorsOnRoute.length === 0) return { count: 0, lengthMm: 0 };
    
    const maxDistMm = sensorsOnRoute[sensorsOnRoute.length - 1].distanceAlongFibreMm;
    
    return {
      count: sensorsOnRoute.length,
      lengthMm: Math.round(maxDistMm)
    };
  };

  return (
    <>
      <div className={styles.panelHeader}>
        Glove Fibre Routes
        <Route size={16} />
      </div>
      
      <div className={styles.panelContent}>
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Active Assignment Route</label>
          <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
            <select 
              value={activeFibreRoute || 'GLOVE-L-01'} 
              onChange={(e) => setActiveFibreRoute(e.target.value)}
              style={{ flex: 1, background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', color: 'white', padding: '6px', borderRadius: '4px', fontSize: '0.8rem' }}
            >
              {existingRoutes.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
        </div>

        <form onSubmit={handleAddRoute} style={{ display: 'flex', gap: '8px', marginBottom: '1rem' }}>
          <input 
            type="text" 
            placeholder="New route (e.g. GLOVE-L-02)" 
            value={newRouteName}
            onChange={e => setNewRouteName(e.target.value)}
            style={{ flex: 1, background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', color: 'white', padding: '6px', borderRadius: '4px', fontSize: '0.8rem' }}
          />
          <button type="submit" className={styles.actionBtn} style={{ padding: '6px' }}>
            <Plus size={16} />
          </button>
        </form>

        <h4 style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Glove Fibre Lengths</h4>
        {existingRoutes.map(route => {
          const stats = getRouteStats(route);
          const isActive = activeFibreRoute === route;
          return (
            <div 
              key={route}
              onClick={() => setActiveFibreRoute(route)}
              style={{
                background: isActive ? 'rgba(0, 240, 255, 0.1)' : 'rgba(0,0,0,0.2)',
                border: `1px solid ${isActive ? 'var(--status-healthy)' : 'var(--border-color)'}`,
                padding: '8px',
                borderRadius: '4px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ color: isActive ? 'var(--status-healthy)' : 'var(--text-main)', fontSize: '0.85rem' }}>{route}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                <span>{stats.count} sensors mapped</span>
                <span>{stats.lengthMm} mm ({(stats.lengthMm / 1000).toFixed(2)}m)</span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
};
