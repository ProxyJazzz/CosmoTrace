import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import type { SensorData } from '../types';

export function useWebSocket(url: string = 'ws://localhost:3000') {
  const { demoMode, setSensorData, setConnectionState } = useAppStore();
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (demoMode) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    let isConnecting = false;
    let reconnectTimeout: number;

    const connect = () => {
      if (isConnecting || wsRef.current?.readyState === WebSocket.OPEN) return;
      
      isConnecting = true;
      setConnectionState('WAITING');
      
      try {
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
          isConnecting = false;
          // State stays WAITING until first data arrives
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
          setConnectionState('DISCONNECTED');
          // Reconnect after 3 seconds
          reconnectTimeout = window.setTimeout(connect, 3000);
        };

        ws.onerror = () => {
          // Handled by onclose
          ws.close();
        };
      } catch (err) {
        isConnecting = false;
        setConnectionState('DISCONNECTED');
      }
    };

    connect();

    return () => {
      if (reconnectTimeout) window.clearTimeout(reconnectTimeout);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [url, demoMode, setSensorData, setConnectionState]);
}
