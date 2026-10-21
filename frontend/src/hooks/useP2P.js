import { useState, useEffect, useCallback } from 'react';
import { StartServer, ConnectToPeer, GetNodeInfo } from '../../wailsjs/go/main/App';
import { EventsOn } from '../../wailsjs/runtime/runtime';

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
    });
    const offDisconn = EventsOn('peer_disconnected', (peerId) => {
      setPeers((prev) => prev.filter((p) => !p.includes(peerId)));
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
        // ConnectToPeer devuelve un mensaje de texto: si es un error hay que
        // volver al estado anterior y avisar (si no, la app se queda en
        // "Conectando con peer..." para siempre).
        if (res && (res.includes('Error') || res.includes('No puedes') || res.includes('inválido'))) {
          setStatus(STATUS.LISTENING);
          notify(res, 'error');
          return;
        }
        notify(res);
      } catch (err) {
        setStatus(STATUS.LISTENING);
        notify(`No se pudo conectar: ${err}`, 'error');
      }
    },
    [notify]
  );

  return { port, setPort, status, peers, nodeInfo, startServer, connect };
}
