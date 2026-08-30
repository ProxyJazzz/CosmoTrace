import { Header } from '../../components/layout/Header';
import { KPIGrid } from '../../components/dashboard/KPIGrid';
import { ZoneOverview } from '../../components/dashboard/ZoneOverview';
import { SensorGrid } from '../../components/dashboard/SensorGrid';
import { Scene } from '../../components/3d/Scene';
import { useAppStore } from '../../store/useAppStore';
import styles from '../../App.module.css';

export const Dashboard = () => {
  const { connectionState } = useAppStore();

  return (
    <div className={styles.app}>
      <Header />
      <KPIGrid />
      
      <main className={styles.mainContent}>
        <div className={styles.leftSidebar}>
          <ZoneOverview />
          
          <div className="panel" style={{ marginTop: 'auto' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>System Status</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.875rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>WebSocket</span>
                <span style={{ color: connectionState === 'LIVE' || connectionState === 'WAITING' ? 'var(--status-healthy)' : 'var(--status-fault)' }}>
                  {connectionState !== 'DISCONNECTED' ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Data Stream</span>
                <span style={{ color: connectionState === 'LIVE' ? 'var(--status-healthy)' : 'var(--status-warning)' }}>
                  {connectionState === 'LIVE' ? 'Active' : 'Waiting'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.centerView}>
          <Scene />
        </div>

        <div className={styles.rightSidebar}>
          <SensorGrid />
        </div>
      </main>
    </div>
  );
};
