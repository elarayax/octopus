import { useState, useRef, useEffect, useCallback } from 'react';
import { SendVideo } from '../../wailsjs/go/main/App';
import { EventsOn } from '../../wailsjs/runtime/runtime';
import { startFrameLoop } from '../utils/frameLoop';

const W = 320; // resolución enviada (ancho)
const H = 240; // resolución enviada (alto)
const FPS = 8; // frames por segundo
const QUALITY = 0.55; // calidad JPEG (0-1)
const STALE_MS = 2500; // sin frames por este tiempo = esa fuente (cámara o pantalla) ya no emite
const STORAGE_KEY = 'octopus.cameraId';

// Recordar la última cámara elegida (si el almacenamiento falla, no pasa nada)
function readSavedId() {
  try {
    return localStorage.getItem(STORAGE_KEY) || '';
  } catch {
    return '';
  }
}
function saveId(id) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* sin almacenamiento: se ignora */
  }
}

// Mensajes claros según el tipo de error de la cámara
function explainError(err) {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Permiso de cámara denegado. Actívalo en los ajustes de privacidad del sistema.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'No se encontró ninguna cámara en este dispositivo.';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'La cámara está siendo usada por otra aplicación.';
    default:
      return err?.message || 'No se pudo abrir la cámara.';
  }
}

// Abre la cámara probando de lo más específico a lo más general:
// 1) la cámara elegida, 2) la cámara por defecto con la resolución ideal, 3) cualquier cámara
async function openCamera(deviceId) {
  if (!navigator.mediaDevices?.getUserMedia) {
    const e = new Error('Este dispositivo no permite usar la cámara.');
    e.name = 'NotFoundError';
    throw e;
  }
  const base = { width: { ideal: W }, height: { ideal: H } };
  const attempts = [];
  if (deviceId) attempts.push({ video: { ...base, deviceId: { exact: deviceId } } });
  attempts.push({ video: base });
  attempts.push({ video: true });

  let lastErr;
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      lastErr = err;
      // Si el permiso fue denegado, reintentar no sirve
      if (err.name === 'NotAllowedError' || err.name === 'SecurityError') break;
    }
  }
  throw lastErr;
}

export function useVideoCall({ notify }) {
  const [on, setOn] = useState(false);
  const [stream, setStream] = useState(null);
  // { 'nombre|cam' | 'nombre|screen': { name, kind, src, ts } }
  const [remote, setRemote] = useState({});
  const [devices, setDevices] = useState([]); // cámaras disponibles
  const [selectedId, setSelectedId] = useState(readSavedId);
  const streamRef = useRef(null);
  const stopLoopRef = useRef(null);

  // Lista de cámaras (los nombres aparecen después de dar permiso)
  const refreshDevices = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setDevices(all.filter((d) => d.kind === 'videoinput'));
    } catch {
      setDevices([]);
    }
  }, []);

  // Recibir frames de los demás + limpiar a quien dejó de enviar
  useEffect(() => {
    // kind llega vacío desde versiones anteriores: eso es cámara
    const off = EventsOn('receive_video', (sender, frame, kind) => {
      const k = kind === 'screen' ? 'screen' : 'cam';
      setRemote((prev) => ({
        ...prev,
        [`${sender}|${k}`]: { name: sender, kind: k, src: `data:image/jpeg;base64,${frame}`, ts: Date.now() },
      }));
    });
    const gc = setInterval(() => {
      setRemote((prev) => {
        const now = Date.now();
        const next = Object.fromEntries(Object.entries(prev).filter(([, v]) => now - v.ts < STALE_MS));
        return Object.keys(next).length === Object.keys(prev).length ? prev : next;
      });
    }, 1000);
    return () => {
      off();
      clearInterval(gc);
    };
  }, []);

  const stop = useCallback(() => {
    stopLoopRef.current?.();
    stopLoopRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setStream(null);
    setOn(false);
  }, []);

  const start = useCallback(
    async (deviceId) => {
      stop();
      try {
        const media = await openCamera(deviceId);
        streamRef.current = media;
        setStream(media);
        setOn(true);

        // Recordar qué cámara quedó realmente en uso
        const usedId = media.getVideoTracks()[0]?.getSettings?.().deviceId;
        if (usedId) {
          setSelectedId(usedId);
          saveId(usedId);
        }
        refreshDevices(); // tras el permiso aparecen los nombres de las cámaras

        // Cada frame sale como JPEG por el canal "video" (kind 'cam')
        stopLoopRef.current = await startFrameLoop(media, {
          width: W,
          height: H,
          fps: FPS,
          quality: QUALITY,
          fit: 'cover',
          send: (b64) => SendVideo('cam', b64),
        });
      } catch (err) {
        stop();
        notify(explainError(err), 'error');
      }
    },
    [stop, notify, refreshDevices]
  );

  const toggle = useCallback(() => (on ? stop() : start(selectedId)), [on, start, stop, selectedId]);

  // Cambiar de cámara (si está encendida, se reinicia con la nueva)
  const changeDevice = useCallback(
    (id) => {
      setSelectedId(id);
      saveId(id);
      if (streamRef.current) start(id);
    },
    [start]
  );

  // Si conectan o desconectan una cámara, actualizar la lista;
  // si se desconectó la que estaba en uso, apagar
  useEffect(() => {
    const md = navigator.mediaDevices;
    if (!md?.addEventListener) return undefined;
    const onChange = async () => {
      await refreshDevices();
      const track = streamRef.current?.getVideoTracks()[0];
      if (streamRef.current && (!track || track.readyState === 'ended')) {
        stop();
        notify('La cámara se desconectó', 'error');
      }
    };
    md.addEventListener('devicechange', onChange);
    return () => md.removeEventListener('devicechange', onChange);
  }, [refreshDevices, stop, notify]);

  useEffect(() => {
    refreshDevices();
  }, [refreshDevices]);

  // Apagar la cámara al desmontar
  useEffect(() => stop, [stop]);

  return { on, stream, remote, toggle, devices, selectedId, changeDevice };
}