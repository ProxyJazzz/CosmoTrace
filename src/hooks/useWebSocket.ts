import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import type { SensorData } from '../types';

export function useWebSocket(url: string = 'ws://localhost:3000') {
  const { demoMode, setSensorData, setConnectionState } = useAppStore();
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // If demo mode is enabled or Web Serial is currently active, do not run background WebSocket retries
    if (demoMode) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    let isConnecting = false;
    let reconnectTimeout: number | undefined;

    const connect = () => {
      // Don't disturb connectionState if already LIVE via Web Serial
      if (useAppStore.getState().connectionState === 'LIVE') return;
      if (isConnecting || wsRef.current?.readyState === WebSocket.OPEN) return;
      
      isConnecting = true;
      
      try {
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
          isConnecting = false;
          if (useAppStore.getState().connectionState !== 'LIVE') {
            setConnectionState('WAITING');
          }
        };

        ws.onmessage = (event) => {
          try {
            const data: SensorData = JSON.parse(event.data);
            setSensorData(data);
            setConnectionState('LIVE');
          } catch (e) {
            console.error('Failed to parse WebSocket message', e);
          }
        };

        ws.onclose = () => {
          isConnecting = false;
          // Silent retry without forcing setConnectionState('DISCONNECTED') on every tick
        };

        ws.onerror = () => {
          isConnecting = false;
          try { ws.close(); } catch (e) {}
        };
      } catch (err) {
        isConnecting = false;
      }
    };

    connect();

    return () => {
      if (reconnectTimeout) window.clearTimeout(reconnectTimeout);
      if (wsRef.current) {
        try { wsRef.current.close(); } catch (e) {}
        wsRef.current = null;
      }
    };
  }, [url, demoMode, setSensorData, setConnectionState]);
}
