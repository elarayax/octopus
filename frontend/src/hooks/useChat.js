import { useState, useEffect, useCallback } from 'react';
import { SendMessage, SendImageFromDialog, GetChatHistory } from '../../wailsjs/go/main/App';
import { EventsOn } from '../../wailsjs/runtime/runtime';

export function useChat({ notify }) {
  const [messages, setMessages] = useState([]);

  const reload = useCallback(() => {
    GetChatHistory()
      .then((history) => {
        setMessages(history || []);
      })
      .catch((err) => console.error('Error cargando historial de SQLite:', err));
  }, []);

  useEffect(() => {
    reload();

    const offMsg = EventsOn('receive_message', (msg) => {
      setMessages((prev) => [...prev, msg]);
    });
    // Al conectar con un peer se fusionan los historiales: recargar
    const offSync = EventsOn('history_synced', () => {
      reload();
    });
    // Al cambiar de canal: recargar mensajes del canal activo
    const offSwitch = EventsOn('channel_switched', () => {
      reload();
    });
    return () => {
      offMsg();
      offSync();
      offSwitch();
    };
  }, [reload]);

  const send = useCallback(
    async (text) => {
      if (!text.trim()) return;
      try {
        const res = await SendMessage(text);
        if (res !== 'Enviado') notify(res, 'error');
      } catch (err) {
        notify(`No se pudo enviar el mensaje: ${err}`, 'error');
      }
    },
    [notify]
  );

  const sendImage = useCallback(async () => {
    try {
      const res = await SendImageFromDialog();
      if (!res) return; // usuario canceló el diálogo
      if (res !== 'Enviado') notify(res, 'error');
    } catch (err) {
      notify(`No se pudo enviar la imagen: ${err}`, 'error');
    }
  }, [notify]);

  return { messages, send, sendImage, reload };
}
