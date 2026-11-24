import { useState, useEffect, useCallback } from 'react';
import {
  GetCanales,
  GetCurrentChannelCode,
  GetPersonalChannelCode,
  SwitchToCanal,
  ConnectToPeer,
  LeaveChannel,
  DeleteChannel,
} from '../../wailsjs/go/main/App';
import { EventsOn } from '../../wailsjs/runtime/runtime';

/**
 * Historial de canales recientes. Permite cambiar de canal (sin conectar)
 * o conectarse directamente a uno.
 */
export function useChannels({ onSwitch, onDeleted, notify, p2pStatus, connectedCodes = [] }) {
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
          // Al entrar al canal, quitar el «…» de «conectando» de esa fila
          setConnectingCodes((current) => current.filter((item) => item !== codigo));
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
          // Si el otro lado no responde, liberar el botón tras 20 s (si no, se queda en «…»)
          setTimeout(() => {
            setConnectingCodes((current) => current.filter((item) => item !== codigo));
          }, 20000);
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

  // Abandonar: corta la conexión con el canal; el canal y su historial se quedan en la lista
  const leave = useCallback(
    async (codigo) => {
      try {
        const res = await LeaveChannel(codigo);
        if (res === 'OK') {
          setConnectingCodes((current) => current.filter((item) => item !== codigo));
          notify(`Has abandonado el canal ${codigo}`, 'success');
          refresh();
        } else {
          notify(res, 'error');
        }
      } catch (err) {
        notify(`No se pudo abandonar el canal: ${err}`, 'error');
      }
    },
    [notify, refresh]
  );

  // Borrar: abandona (si estaba conectado) y elimina el canal con todo su historial
  const remove = useCallback(
    async (codigo) => {
      const wasSelected = codigo === selectedCode;
      try {
        const res = await DeleteChannel(codigo);
        if (res !== 'OK') {
          notify(res, 'error');
          return;
        }
        setConnectingCodes((current) => current.filter((item) => item !== codigo));
        if (onDeleted) onDeleted(codigo);
        // Si era el canal visible, Go ya pasó a otro: resincronizar selección, chat y usuarios
        const current = await GetCurrentChannelCode();
        setSelectedCode(current || '');
        refresh();
        if (wasSelected && onSwitch) onSwitch();
        notify('Canal borrado', 'success');
      } catch (err) {
        notify(`No se pudo borrar el canal: ${err}`, 'error');
      }
    },
    [notify, refresh, selectedCode, onSwitch, onDeleted]
  );

  return { channels, personalCode, selectedCode, connectingCodes, refresh, switchTo, connectTo, leave, remove };
}