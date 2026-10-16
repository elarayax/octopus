import { useState, useEffect, useCallback } from 'react';
import { SendMessage, GetChatHistory } from '../../wailsjs/go/main/App';
import { EventsOn } from '../../wailsjs/runtime/runtime';

export function useChat({ notify }) {
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    GetChatHistory()
      .then((history) => {
        if (history && history.length > 0) setMessages(history);
      })
      .catch((err) => console.error('Error cargando historial de SQLite:', err));

    const off = EventsOn('receive_message', (msg) => {
      setMessages((prev) => [...prev, msg]);
    });
    return off;
  }, []);

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

  return { messages, send };
}
