import { useEffect, useRef } from 'react';

/**
 * Atajos globales con Alt (no chocan con Ctrl+K del buscador ni con el navegador).
 *   Alt+M  silenciar / activar micrófono
 *   Alt+D  ensordecer / activar audio de la llamada
 *   Alt+N  silenciar / activar notificaciones del canal
 *   Alt+1  pestaña Canales    Alt+2  pestaña Usuarios
 * Se usa e.code (tecla física) porque en Mac Alt+M produce otro carácter.
 */
export function useShortcuts(actions) {
  const ref = useRef(actions);
  useEffect(() => {
    ref.current = actions;
  });

  useEffect(() => {
    const MAP = {
      KeyM: 'toggleMic',
      KeyD: 'toggleDeafen',
      KeyN: 'toggleChannelMute',
      Digit1: 'showChannels',
      Digit2: 'showUsers',
    };
    const onKey = (e) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const name = MAP[e.code];
      const fn = name && ref.current[name];
      if (!fn) return;
      e.preventDefault();
      fn();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}