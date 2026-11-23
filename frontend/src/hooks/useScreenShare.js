import { useState, useRef, useCallback, useEffect } from 'react';
import { SendVideo } from '../../wailsjs/go/main/App';
import {
  WindowShow,
  WindowUnminimise,
  WindowSetAlwaysOnTop,
  WindowIsMinimised,
  WindowIsMaximised,
  WindowMaximise,
} from '../../wailsjs/runtime/runtime';
import { startFrameLoop } from '../utils/frameLoop';

// La pantalla necesita más resolución que la cámara para leerse, pero menos fps.
const W = 960;
const H = 540;
const FPS = 5;
const QUALITY = 0.6;

// Al elegir qué compartir, Windows suele dar el foco a la ventana elegida.
// Traemos octopus al frente para ver la transmisión sin salir de la app.
// OJO: WindowUnminimise() en Windows hace "restaurar", y eso ACHICA una ventana maximizada.
// Por eso solo se llama si de verdad está minimizada, y si estaba maximizada se vuelve a maximizar.
async function bringToFront(wasMaximised = false) {
  try {
    const [minimised, maximised] = await Promise.all([WindowIsMinimised(), WindowIsMaximised()]);
    if (minimised) WindowUnminimise();
    WindowShow();
    // wasMaximised se leyó ANTES de abrir el selector: si ya no está maximizada, se vuelve a maximizar
    if (wasMaximised || maximised) WindowMaximise();
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
  const [starting, setStarting] = useState(false);
  const streamRef = useRef(null);
  const stopLoopRef = useRef(null);
  const runRef = useRef(0); // ver useVideoCall: cancela intentos que siguen esperando

  const stop = useCallback(() => {
    runRef.current += 1;
    stopLoopRef.current?.();
    stopLoopRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setStream(null);
    setOn(false);
    setStarting(false);
  }, []);

  const start = useCallback(async () => {
    stop();
    const myRun = runRef.current;
    setStarting(true);
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        const e = new Error('no getDisplayMedia');
        e.name = 'NotSupportedError';
        throw e;
      }
      // Recordar si octopus estaba maximizada antes de abrir el selector de pantalla
      const wasMaximised = await Promise.resolve(WindowIsMaximised()).catch(() => false);
      const media = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: FPS }, width: { ideal: 1920 } },
        audio: false,
      });
      if (runRef.current !== myRun) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = media;
      setStream(media);
      setOn(true);
      setStarting(false);
      bringToFront(wasMaximised);

      // El botón "Dejar de compartir" del sistema también debe apagar todo
      // (solo si este intento sigue siendo el vigente)
      media.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (runRef.current === myRun) stop();
      });

      // Mismo sistema de frames que la cámara, marcado como "screen"
      const stopLoop = await startFrameLoop(media, {
        width: W,
        height: H,
        fps: FPS,
        quality: QUALITY,
        fit: 'contain',
        send: (b64) => SendVideo('screen', b64),
      });
      if (runRef.current !== myRun) {
        stopLoop();
        return;
      }
      stopLoopRef.current = stopLoop;
    } catch (err) {
      if (runRef.current === myRun) {
        stop();
        // Cancelar el selector no es un error que merezca aviso
        if (err?.name !== 'NotAllowedError') notify(explainError(err), 'error');
      }
    }
  }, [stop, notify]);

  const toggle = useCallback(() => (on || starting ? stop() : start()), [on, starting, start, stop]);

  useEffect(() => stop, [stop]);

  return { on, starting, stream, toggle };
}