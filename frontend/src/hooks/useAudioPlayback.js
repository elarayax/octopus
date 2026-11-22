import { useEffect, useRef, useState, useCallback } from 'react';
import { EventsOn } from '../../wailsjs/runtime/runtime';
import { SAMPLE_RATE, createAudioContext, base64ToFloat32 } from '../utils/audio';

// Si la cola de audio pendiente supera ~150 ms (ráfagas, micro-cortes) se
// descarta lo que aún no ha sonado y se retoma casi en vivo. El bloque que
// está sonando NO se corta: cortarlo produce un chasquido.
const MAX_LATENCY = 0.15;
const START_OFFSET = 0.03;

export function useAudioPlayback(gain) {
  const [remoteSpeaking, setRemoteSpeaking] = useState(false);
  const ctxRef = useRef(null);
  const gainNodeRef = useRef(null);
  const nextTimeRef = useRef(0);
  const startedRef = useRef(false);
  // [{ src, start }] de las fuentes programadas y aún no terminadas
  const sourcesRef = useRef([]);
  const speakingTimerRef = useRef(null);
  const gainRef = useRef(gain);

  useEffect(() => {
    const ctx = createAudioContext();
    const gainNode = ctx.createGain();
    gainNode.gain.value = gainRef.current;
    gainNode.connect(ctx.destination);

    ctxRef.current = ctx;
    gainNodeRef.current = gainNode;
    nextTimeRef.current = 0;
    startedRef.current = false;
    sourcesRef.current = [];

    // Descarta lo agendado que todavía no ha empezado a sonar.
    // Web Audio no cancela solo lo que está en el futuro: sin este stop(),
    // al re-sincronizar el bloque nuevo sonaría ENCIMA del anterior (eco).
    const dropPending = (now) => {
      const keep = [];
      for (const item of sourcesRef.current) {
        if (item.start > now) {
          try {
            item.src.stop();
          } catch {
            /* ya terminó */
          }
        } else {
          keep.push(item);
        }
      }
      sourcesRef.current = keep;
    };

    const stopAll = () => {
      for (const item of sourcesRef.current) {
        try {
          item.src.stop();
        } catch {
          /* ya terminó */
        }
      }
      sourcesRef.current = [];
    };

    const off = EventsOn('receive_audio', (b64) => {
      try {
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});

        setRemoteSpeaking(true);
        clearTimeout(speakingTimerRef.current);
        speakingTimerRef.current = setTimeout(() => setRemoteSpeaking(false), 500);

        const samples = base64ToFloat32(b64);
        if (!samples.length) return;

        // El buffer se declara SIEMPRE a 16 kHz: el navegador lo remuestrea
        // a la tasa real del contexto al reproducirlo.
        const buffer = ctx.createBuffer(1, samples.length, SAMPLE_RATE);
        buffer.copyToChannel(samples, 0);

        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(gainNode);

        const now = ctx.currentTime;
        if (!startedRef.current) {
          // Primera muestra tras unirnos: fijar la referencia temporal.
          startedRef.current = true;
          nextTimeRef.current = now + START_OFFSET;
        } else if (nextTimeRef.current < now) {
          // Nos pasó el turno (pérdida o silencio): reenganchar sin hueco.
          nextTimeRef.current = now + START_OFFSET;
        } else if (nextTimeRef.current - now > MAX_LATENCY) {
          // Cola acumulada: tirar lo que aún no ha sonado y saltar al
          // presente. Es preferible un corte corto a arrastrar el retraso.
          dropPending(now);
          nextTimeRef.current = now + START_OFFSET;
        }

        const start = nextTimeRef.current;
        src.start(start);
        nextTimeRef.current = start + buffer.duration;

        sourcesRef.current.push({ src, start });
        src.onended = () => {
          sourcesRef.current = sourcesRef.current.filter((it) => it.src !== src);
        };
      } catch (err) {
        console.error('Error procesando audio recibido:', err);
      }
    });

    return () => {
      off();
      clearTimeout(speakingTimerRef.current);
      stopAll();
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
    // No heredar atraso de una llamada anterior.
    for (const item of sourcesRef.current) {
      try {
        item.src.stop();
      } catch {
        /* ya terminó */
      }
    }
    sourcesRef.current = [];
    nextTimeRef.current = ctx.currentTime + START_OFFSET;
    startedRef.current = true;
  }, []);

  return { remoteSpeaking, resume };
}
