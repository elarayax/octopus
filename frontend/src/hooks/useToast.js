import { useState, useRef, useCallback, useEffect } from 'react';

export function useToast(duration = 3000) {
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);

  const notify = useCallback(
    (message, type = 'info') => {
      clearTimeout(timerRef.current);
      setToast({ message, type });
      timerRef.current = setTimeout(() => setToast(null), duration);
    },
    [duration]
  );

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return { toast, notify };
}
