import React, { useMemo } from 'react';
import { Activity, ShieldCheck, ShieldAlert, Cpu, Timer } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import styles from './KPIGrid.module.css';

export const KPIGrid: React.FC = () => {
  const { sensorData, connectionState } = useAppStore();

  const kpis = useMemo(() => {
    if (!sensorData || connectionState === 'DISCONNECTED') {
      return {
        integrity: '--',
        activeChannels: '--',
        faults: '--',
        scanRate: '--',
        criticality: 'Unknown',
        status: 'unknown' as const
      };
    }

    const totalChannels = Object.keys(sensorData.raw).length || 120;
    const faults = sensorData.brokenChannels.length;
    const active = totalChannels - faults;
    const integrity = Math.max(0, 100 - (faults / totalChannels) * 100).toFixed(1);

    let status: 'healthy' | 'warning' | 'fault' = 'healthy';
    let criticality = 'Nominal';

    if (faults > 0) {
      if (faults > 3) {
        status = 'fault';
        criticality = 'CRITICAL';
      } else {
        status = 'warning';
        criticality = 'Warning';
      }
    }

    return {
      integrity: `${integrity}%`,
      activeChannels: `${active} / ${totalChannels}`,
      faults: faults.toString(),
      scanRate: '1 Hz', // Based on simulation or incoming rate
      criticality,
      status
    };
  }, [sensorData, connectionState]);

  return (
    <div className={styles.grid}>
      <div className={`panel ${styles.kpiCard}`}>
        <div className={styles.kpiHeader}>
          {kpis.status === 'healthy' || kpis.status === 'unknown' ? 
            <ShieldCheck size={18} /> : 
            <ShieldAlert size={18} className={styles[kpis.status]} />
          }
          Suit Integrity
        </div>
        <div className={`${styles.kpiValue} ${styles[kpis.status]}`}>
          {kpis.integrity}
        </div>
      </div>

      <div className={`panel ${styles.kpiCard}`}>
        <div className={styles.kpiHeader}>
          <Activity size={18} />
          Active Channels
        </div>
        <div className={`${styles.kpiValue} ${styles.healthy}`}>
          {kpis.activeChannels}
        </div>
      </div>

      <div className={`panel ${styles.kpiCard}`}>
        <div className={styles.kpiHeader}>
          <ShieldAlert size={18} />
          Active Faults
        </div>
        <div className={`${styles.kpiValue} ${kpis.faults !== '0' && kpis.faults !== '--' ? styles.fault : styles.healthy}`}>
          {kpis.faults}
        </div>
      </div>

      <div className={`panel ${styles.kpiCard}`}>
        <div className={styles.kpiHeader}>
          <Timer size={18} />
          Scan Rate
        </div>
        <div className={`${styles.kpiValue} ${styles.healthy}`}>
          {kpis.scanRate}
        </div>
      </div>

      <div className={`panel ${styles.kpiCard}`}>
        <div className={styles.kpiHeader}>
          <Cpu size={18} />
          Criticality
        </div>
        <div className={`${styles.kpiValue} ${styles[kpis.status]}`}>
          {kpis.criticality}
        </div>
      </div>
    </div>
  );
};
