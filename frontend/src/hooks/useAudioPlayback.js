import { useEffect, useRef, useState, useCallback } from 'react';
import { EventsOn } from '../../wailsjs/runtime/runtime';
import { SAMPLE_RATE, createAudioContext, base64ToFloat32 } from '../utils/audio';

// Si la cola supera ~150 ms (ráfagas, micro-cortes) se descarta el atraso
// y se retoma casi en vivo en vez de acumular delay.
const MAX_LATENCY = 0.15;
const START_OFFSET = 0.03;

export function useAudioPlayback(gain) {
  const [remoteSpeaking, setRemoteSpeaking] = useState(false);
  const ctxRef = useRef(null);
  const gainNodeRef = useRef(null);
  const nextTimeRef = useRef(0);
  const speakingTimerRef = useRef(null);
  const gainRef = useRef(gain);

  useEffect(() => {
    const ctx = createAudioContext();
    const gainNode = ctx.createGain();
    gainNode.gain.value = gainRef.current;
    gainNode.connect(ctx.destination);

    ctxRef.current = ctx;
    gainNodeRef.current = gainNode;
    nextTimeRef.current = ctx.currentTime;

    const off = EventsOn('receive_audio', (b64) => {
      try {
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});

        setRemoteSpeaking(true);
        clearTimeout(speakingTimerRef.current);
        speakingTimerRef.current = setTimeout(() => setRemoteSpeaking(false), 500);

        const samples = base64ToFloat32(b64);
        const buffer = ctx.createBuffer(1, samples.length, SAMPLE_RATE);
        buffer.copyToChannel(samples, 0);

        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(gainNode);

        const now = ctx.currentTime;
        if (nextTimeRef.current < now || nextTimeRef.current - now > MAX_LATENCY) {
          nextTimeRef.current = now + START_OFFSET;
        }
        src.start(nextTimeRef.current);
        nextTimeRef.current += buffer.duration;
      } catch (err) {
        console.error('Error procesando audio recibido:', err);
      }
    });

    return () => {
      off();
      clearTimeout(speakingTimerRef.current);
      ctx.close();
    };
  }, []);

  // El volumen vive en su propio efecto: sin closures viejas
  useEffect(() => {
    gainRef.current = gain;
    if (gainNodeRef.current) gainNodeRef.current.gain.value = gain;
  }, [gain]);

  /** Llamar desde un gesto del usuario (WKWebView deja el contexto suspendido) */
  const resume = useCallback(async () => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    if (ctx.state === 'suspended') await ctx.resume();
    nextTimeRef.current = ctx.currentTime; // no heredar atraso de una llamada anterior
  }, []);

  return { remoteSpeaking, resume };
}
