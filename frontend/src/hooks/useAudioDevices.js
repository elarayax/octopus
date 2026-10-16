import { useState, useEffect, useCallback } from 'react';

export function useAudioDevices() {
  const [devices, setDevices] = useState([]);
  const [selectedId, setSelectedId] = useState('');

  const refresh = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const all = await navigator.mediaDevices.enumerateDevices();
      const inputs = all.filter((d) => d.kind === 'audioinput');
      setDevices(inputs);
      setSelectedId((prev) => {
        const exists = inputs.some((d) => d.deviceId === prev);
        return exists && prev ? prev : inputs[0]?.deviceId ?? '';
      });
    } catch (err) {
      console.error('Error listando dispositivos de audio:', err);
    }
  }, []);

  useEffect(() => {
    refresh();
    const md = navigator.mediaDevices;
    md?.addEventListener?.('devicechange', refresh);
    return () => md?.removeEventListener?.('devicechange', refresh);
  }, [refresh]);

  return { devices, selectedId, setSelectedId, refresh };
}
