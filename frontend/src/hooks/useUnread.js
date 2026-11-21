import { useState, useEffect, useRef, useCallback } from 'react';
import { SetUnread, NotifyDesktop } from '../../wailsjs/go/main/App';

function windowFocused() {
  return document.hasFocus() && !document.hidden;
}

function preview(msg) {
  if (msg.kind === 'image' || msg.image) return '📷 Imagen';
  const t = (msg.text || '').trim();
  return t.length > 120 ? `${t.slice(0, 117)}…` : t;
}

/**
 * Contador de mensajes sin leer + notificación del sistema,
 * solo mientras la ventana NO tiene el foco.
 */
export function useUnread() {
  const [count, setCount] = useState(0);
  const focusedRef = useRef(windowFocused());

  useEffect(() => {
    const sync = () => {
      focusedRef.current = windowFocused();
      if (focusedRef.current) setCount(0); // volver a la ventana = leído
    };
    window.addEventListener('focus', sync);
    window.addEventListener('blur', sync);
    document.addEventListener('visibilitychange', sync);
    sync();
    return () => {
      window.removeEventListener('focus', sync);
      window.removeEventListener('blur', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);

  // El título de la ventana es nativo: lo actualiza Go -> "(3) Canal"
  useEffect(() => {
    Promise.resolve(SetUnread(count)).catch(() => {});
  }, [count]);

  const onIncoming = useCallback((msg) => {
    if (focusedRef.current) return;
    setCount((c) => c + 1);
    Promise.resolve(NotifyDesktop(msg.sender || 'Nuevo mensaje', preview(msg))).catch(() => {});
  }, []);

  return { count, onIncoming };
}