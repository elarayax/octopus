import { useState, useEffect, useCallback } from 'react';
import {
  GetCanales,
  GetCurrentChannelCode,
  GetPersonalChannelCode,
  SwitchToCanal,
  ConnectToPeer,
} from '../../wailsjs/go/main/App';
import { EventsOn } from '../../wailsjs/runtime/runtime';

/**
 * Historial de canales recientes. Permite cambiar de canal (sin conectar)
 * o conectarse directamente a uno.
 */
export function useChannels({ onSwitch, notify, connectedCodes = [] }) {
  const [channels, setChannels] = useState([]);
  const [personalCode, setPersonalCode] = useState('');
  const [selectedCode, setSelectedCode] = useState('');
  const [connectingCodes, setConnectingCodes] = useState([]);

  const refresh = useCallback(() => {
    GetCanales()
      .then((list) => setChannels(list || []))
      .catch((err) => console.error('Error cargando canales:', err));
  }, []);

  useEffect(() => {
    refresh();
    GetCurrentChannelCode()
      .then((code) => setSelectedCode((current) => current || code || ''))
      .catch((err) => console.error('Error obteniendo el canal activo:', err));
    GetPersonalChannelCode()
      .then((code) => setPersonalCode(code || ''))
      .catch((err) => console.error('Error obteniendo el ID personal:', err));
    const off1 = EventsOn('channel_switched', (code) => {
      setSelectedCode(code || '');
      refresh();
    });
    const off2 = EventsOn('channel_info', refresh);
    const clearConnecting = (code) => {
      setConnectingCodes((current) => current.filter((item) => item !== code));
    };
    const off3 = EventsOn('peer_connected', clearConnecting);
    const off4 = EventsOn('peer_disconnected', clearConnecting);
    return () => {
      off1();
      off2();
      off3();
      off4();
    };
  }, [refresh]);

  const switchTo = useCallback(
    async (codigo) => {
      try {
        const res = await SwitchToCanal(codigo);
        if (res === 'OK') {
          setSelectedCode(codigo);
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
      if (connectedCodes.includes(codigo)) {
        notify(`Ya estás conectado a ${codigo}.`, 'success');
        return;
      }
      if (connectingCodes.includes(codigo)) return;
      setConnectingCodes((current) => (current.includes(codigo) ? current : [...current, codigo]));
      try {
        const switchResult = await SwitchToCanal(codigo);
        if (switchResult !== 'OK') {
          setConnectingCodes((current) => current.filter((item) => item !== codigo));
          notify(switchResult || `No se pudo cambiar al canal ${codigo}`, 'error');
          return;
        }
        setSelectedCode(codigo);
        const res = await ConnectToPeer(codigo);
        if (res && res.startsWith('Solicitud enviada')) {
          notify(`Conectando a ${codigo}...`, 'success');
        } else if (res && res.startsWith('Ya estás conectado')) {
          setConnectingCodes((current) => current.filter((item) => item !== codigo));
          notify(res, 'success');
        } else if (res && res.startsWith('La conexión')) {
          notify(res, 'success');
        } else if (res) {
          setConnectingCodes((current) => current.filter((item) => item !== codigo));
          notify(res, 'error');
        } else {
          setConnectingCodes((current) => current.filter((item) => item !== codigo));
        }
      } catch (err) {
        setConnectingCodes((current) => current.filter((item) => item !== codigo));
        notify(`No se pudo conectar: ${err}`, 'error');
      }
    },
    [notify, connectedCodes, connectingCodes]
  );

  return { channels, personalCode, selectedCode, connectingCodes, refresh, switchTo, connectTo };
}
