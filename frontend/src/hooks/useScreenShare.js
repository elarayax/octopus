import { useState, useRef, useCallback, useEffect } from 'react';
import { SendVideo } from '../../wailsjs/go/main/App';
import { WindowShow, WindowUnminimise, WindowSetAlwaysOnTop } from '../../wailsjs/runtime/runtime';
import { startFrameLoop } from '../utils/frameLoop';

// La pantalla necesita más resolución que la cámara para leerse, pero menos fps.
const W = 960;
const H = 540;
const FPS = 5;
const QUALITY = 0.6;

// Al elegir qué compartir, Windows suele dar el foco a la ventana elegida.
// Traemos octopus al frente para ver la transmisión sin salir de la app.
function bringToFront() {
  try {
    WindowUnminimise();
    WindowShow();
    WindowSetAlwaysOnTop(true);
    setTimeout(() => WindowSetAlwaysOnTop(false), 400);
  } catch {
    /* fuera de Wails: se ignora */
  }
}

function explainError(err) {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Compartir pantalla fue cancelado o no tiene permiso.';
    case 'NotSupportedError':
    case 'TypeError':
      return 'Este sistema no permite compartir pantalla desde la aplicación.';
    default:
      return err?.message || 'No se pudo compartir la pantalla.';
  }
}

export function useScreenShare({ notify }) {
  const [on, setOn] = useState(false);
  const [stream, setStream] = useState(null);
  const streamRef = useRef(null);
  const stopLoopRef = useRef(null);

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

  const start = useCallback(async () => {
    stop();
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        const e = new Error('no getDisplayMedia');
        e.name = 'NotSupportedError';
        throw e;
      }
      const media = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: FPS }, width: { ideal: 1920 } },
        audio: false,
      });
      streamRef.current = media;
      setStream(media);
      setOn(true);
      bringToFront();

      // El botón "Dejar de compartir" del sistema también debe apagar todo
      media.getVideoTracks()[0]?.addEventListener('ended', stop);

      // Mismo sistema de frames que la cámara, marcado como "screen"
      stopLoopRef.current = await startFrameLoop(media, {
        width: W,
        height: H,
        fps: FPS,
        quality: QUALITY,
        fit: 'contain',
        send: (b64) => SendVideo('screen', b64),
      });
    } catch (err) {
      stop();
      // Cancelar el selector no es un error que merezca aviso
      if (err?.name !== 'NotAllowedError') notify(explainError(err), 'error');
    }
  }, [stop, notify]);

  const toggle = useCallback(() => (on ? stop() : start()), [on, start, stop]);

  useEffect(() => stop, [stop]);

  return { on, stream, toggle };
}