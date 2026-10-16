import { useState, useEffect, useRef } from 'react';
import { GetAudioPrefs, SetAudioPrefs } from '../../wailsjs/go/main/App';

export function useAudioPrefs() {
  const [micGain, setMicGain] = useState(1);
  const [playbackGain, setPlaybackGain] = useState(1);
  const loadedRef = useRef(false);

  useEffect(() => {
    GetAudioPrefs()
      .then((prefs) => {
        if (typeof prefs?.micGain === 'number') setMicGain(prefs.micGain);
        if (typeof prefs?.playbackGain === 'number') setPlaybackGain(prefs.playbackGain);
      })
      .catch((err) => console.error('Error cargando volúmenes:', err))
      .finally(() => {
        loadedRef.current = true;
      });
  }, []);

  // Guardado con debounce: los sliders disparan muchos eventos
  useEffect(() => {
    if (!loadedRef.current) return;
    const t = setTimeout(() => {
      SetAudioPrefs(micGain, playbackGain).catch((err) =>
        console.error('Error guardando volúmenes:', err)
      );
    }, 300);
    return () => clearTimeout(t);
  }, [micGain, playbackGain]);

  return { micGain, setMicGain, playbackGain, setPlaybackGain };
}
