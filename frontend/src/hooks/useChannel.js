import { useState, useEffect, useCallback } from 'react';
import { GetChannelInfo, SetChannelInfo } from '../../wailsjs/go/main/App';
import { EventsOn } from '../../wailsjs/runtime/runtime';

const DEFAULT_CHANNEL = { nombre: 'Chat P2P', subtitulo: 'Texto & Voz en Vivo', icono: '🐙' };

/**
 * Identidad del canal (nombre, subtítulo, ícono): persiste en SQLite,
 * el host la comparte con los peers al conectarse.
 */
export function useChannel() {
  const [channel, setChannel] = useState(DEFAULT_CHANNEL);

  useEffect(() => {
    GetChannelInfo()
      .then((info) => info && info.nombre && applyInfo(info))
      .catch((err) => console.error('Error cargando canal:', err));

    const off = EventsOn('channel_info', (info) => info && info.nombre && applyInfo(info));
    return off;
  }, []);

  const applyInfo = (info) => {
    setChannel(info);
    document.title = info.nombre;
  };

  const save = useCallback(async (nombre, subtitulo, icono) => {
    try {
      const info = await SetChannelInfo(nombre, subtitulo, icono);
      if (info && info.nombre) applyInfo(info);
      return info;
    } catch (err) {
      console.error('Error guardando canal:', err);
      return null;
    }
  }, []);

  return { channel, save };
}
