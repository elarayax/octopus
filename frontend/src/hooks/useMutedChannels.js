import { useState, useEffect, useCallback } from 'react';

const KEY = 'octopus.mutedChannels'; // clave en localStorage

function load() {
  try {
    // Leer la lista guardada ('[]' si no hay nada)
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(list) ? list : []; // si está corrupta, vacía
  } catch {
    return [];
  }
}

export function useMutedChannels() {
  // useState(load): pasar la función (sin paréntesis) hace que load() corra solo 1 vez
  const [muted, setMuted] = useState(load);

  // Cada vez que cambia la lista, se guarda
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(muted));
    } catch {
      /* sin almacenamiento: se pierde al cerrar, no pasa nada */
    }
  }, [muted]);

  // ¿Este canal está silenciado? (!!code evita true con código vacío)
  const isMuted = useCallback((code) => !!code && muted.includes(code), [muted]);

  // Silenciar / des-silenciar: si está, lo saca; si no está, lo agrega
  const toggle = useCallback((code) => {
    if (!code) return;
    setMuted((cur) => (cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code]));
  }, []);

  // Olvidar un canal (p. ej. al borrarlo): sale de la lista de silenciados
  const forget = useCallback((code) => {
    if (!code) return;
    setMuted((cur) => cur.filter((c) => c !== code));
  }, []);

  return { muted, isMuted, toggle, forget };
}