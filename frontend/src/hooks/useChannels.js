import { useState, useEffect, useCallback } from 'react';
import { GetCanales, SwitchToCanal, ConnectToPeer } from '../../wailsjs/go/main/App';
import { EventsOn } from '../../wailsjs/runtime/runtime';

/**
 * Historial de canales recientes. Permite cambiar de canal (sin conectar)
 * o conectarse directamente a uno.
 */
export function useChannels({ onSwitch, notify, p2pStatus }) {
  const [channels, setChannels] = useState([]);

  const refresh = useCallback(() => {
    GetCanales()
      .then((list) => setChannels(list || []))
      .catch((err) => console.error('Error cargando canales:', err));
  }, []);

  useEffect(() => {
    refresh();
    const off1 = EventsOn('channel_switched', refresh);
    const off2 = EventsOn('channel_info', refresh);
    return () => {
      off1();
      off2();
    };
  }, [refresh]);

  const switchTo = useCallback(
    async (codigo) => {
      try {
        const res = await SwitchToCanal(codigo);
        if (res === 'OK') {
          if (onSwitch) onSwitch();
        } else {
          notify(res, 'error');
        }
      } catch (err) {
        notify(`No se pudo cambiar de canal: ${err}`, 'error');
      }
    },
    [onSwitch, notify]
  );

  const connectTo = useCallback(
    async (codigo) => {
      try {
        await SwitchToCanal(codigo);
        const res = await ConnectToPeer(codigo);
        if (res && !res.includes('Error') && !res.includes('No puedes')) {
          notify(`Conectando a ${codigo}...`, 'success');
        } else if (res) {
          notify(res, 'error');
        }
      } catch (err) {
        notify(`No se pudo conectar: ${err}`, 'error');
      }
    },
    [notify]
  );

  return { channels, refresh, switchTo, connectTo };
}
