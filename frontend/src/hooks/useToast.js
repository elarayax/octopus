import { useState, useRef, useCallback, useEffect } from 'react';

export function useToast(duration = 3000) {
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);

  const notify = useCallback(
    (message, type = 'info') => {
      clearTimeout(timerRef.current);
      setToast({ message, type });
      // Los mensajes largos necesitan más tiempo de lectura (≈ 50 ms por carácter, máx. 9 s)
      const ms = Math.max(duration, Math.min(9000, String(message ?? '').length * 50));
      timerRef.current = setTimeout(() => setToast(null), ms);
    },
    [duration]
  );

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return { toast, notify };
}