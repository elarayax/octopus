import { useState, useEffect, useCallback } from 'react';
import { StartServer, ConnectToPeer, GetNodeInfo } from '../../wailsjs/go/main/App';
import { EventsOn } from '../../wailsjs/runtime/runtime';
import channelConnectSound from '../assets/sounds/channel-connect.mp3';

export const STATUS = {
  IDLE: 'idle',
  LISTENING: 'listening',
  CONNECTING: 'connecting',
  ONLINE: 'online',
};

export function useP2P({ notify }) {
  const [port, setPort] = useState('8080');
  const [status, setStatus] = useState(STATUS.IDLE);
  const [peers, setPeers] = useState([]);
  const [nodeInfo, setNodeInfo] = useState({ code: '', multiAddr: '' });

  useEffect(() => {
    const offConn = EventsOn('peer_connected', (msg) => {
      setPeers((prev) => (prev.includes(msg) ? prev : [...prev, msg]));
      setStatus(STATUS.ONLINE);
      try {
        const playback = new Audio(channelConnectSound).play();
        playback?.catch((error) => console.debug('No se pudo reproducir el sonido de conexión:', error));
      } catch (error) {
        console.debug('No se pudo iniciar el sonido de conexión:', error);
      }
    });
    const offDisconn = EventsOn('peer_disconnected', (peerId) => {
      setPeers((prev) => prev.filter((p) => p !== peerId));
    });
    return () => {
      offConn();
      offDisconn();
    };
  }, []);

  const startServer = useCallback(async () => {
    setStatus(STATUS.LISTENING);
    try {
      const res = await StartServer(port);
      notify(res);
      setNodeInfo(await GetNodeInfo());
    } catch (err) {
      setStatus(STATUS.IDLE);
      notify(`No se pudo iniciar el servidor: ${err}`, 'error');
    }
  }, [port, notify]);

  const connect = useCallback(
    async (address) => {
      if (!address.trim()) return;
      setStatus(STATUS.CONNECTING);
      try {
        const res = await ConnectToPeer(address);
        if (res?.startsWith('Ya estás conectado')) {
          setStatus(STATUS.ONLINE);
          notify(res, 'success');
          return;
        }
        if (res?.startsWith('La conexión')) {
          notify(res, 'success');
          return;
        }
        // ConnectToPeer devuelve un mensaje de texto: si es un error hay que
        // volver al estado anterior y avisar (si no, la app se queda en
        // "Conectando con peer..." para siempre).
        if (res && (res.includes('Error') || res.includes('No puedes') || res.includes('inválido') || res.includes('Debes iniciar'))) {
          setStatus(nodeInfo.code ? STATUS.LISTENING : STATUS.IDLE);
          notify(res, 'error');
          return;
        }
        notify(res);
      } catch (err) {
        setStatus(nodeInfo.code ? STATUS.LISTENING : STATUS.IDLE);
        notify(`No se pudo conectar: ${err}`, 'error');
      }
    },
    [notify, nodeInfo.code]
  );

  return { port, setPort, status, peers, nodeInfo, startServer, connect };
}
