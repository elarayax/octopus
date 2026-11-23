import { useEffect, useRef, useState, useCallback } from 'react';
import { EventsOn } from '../../wailsjs/runtime/runtime';
import { SAMPLE_RATE, createAudioContext, base64ToFloat32 } from '../utils/audio';

// Cada hablante remoto tiene su propio reloj de reproducción. El motivo es
// importante: con 2 personas hay UNA fuente remota y un único búfer basta;
// con 3 personas hay DOS fuentes y, si comparten el mismo `nextTime`, el
// receptor recibe el doble de audio del que puede sonar en tiempo real (2 ×
// 32 ms por cada 32 ms reales). La cola crece 32 ms por cada 32 ms y en
// ~5 bloques supera MAX_LATENCY → se vacía y se vuelve a llenar en bucle →
// cortes periódicos de 32 ms que suenan robóticos.
//
// Por qué un umbral y no dejar crecer: en una llamada de voz el retraso
// acumulado no se puede "recuperar" más que descartando. Pero ahora cada
// búfer avanza al ritmo real de su hablante, así que en régimen estable
// `nextTime` solo se mantiene ~START_OFFSET por delante de `now` y no se
// descarta nada.
const MAX_LATENCY = 0.18; // cola objetivo por hablante (~180 ms)
const HARD_RESET = 0.5; // por encima: algo fue mal; reiniciar ese búfer
const START_OFFSET = 0.03;

/** Detiene las fuentes de un búfer que aún no han empezado a sonar */
function dropPending(buf, now) {
  const keep = [];
  for (const item of buf.sources) {
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
  buf.sources = keep;
}

/** Detiene todas las fuentes programadas de un búfer */
function stopSources(buf) {
  for (const item of buf.sources) {
    try {
      item.src.stop();
    } catch {
      /* ya terminó */
    }
  }
  buf.sources = [];
}

export function useAudioPlayback(gain) {
  const [remoteSpeaking, setRemoteSpeaking] = useState(false);
  const ctxRef = useRef(null);
  const gainNodeRef = useRef(null);
  // Map<código de hablante, { nextTime, started, sources: [] }>
  const bufsRef = useRef(new Map());
  const speakingRef = useRef(false);
  const speakingTimerRef = useRef(null);
  const gainRef = useRef(gain);

  useEffect(() => {
    const ctx = createAudioContext();
    const gainNode = ctx.createGain();
    gainNode.gain.value = gainRef.current;
    gainNode.connect(ctx.destination);

    ctxRef.current = ctx;
    gainNodeRef.current = gainNode;
    bufsRef.current = new Map();

    const markSpeaking = () => {
      if (!speakingRef.current) {
        speakingRef.current = true;
        setRemoteSpeaking(true);
      }
      clearTimeout(speakingTimerRef.current);
      speakingTimerRef.current = setTimeout(() => {
        speakingRef.current = false;
        setRemoteSpeaking(false);
      }, 500);
    };

    const off = EventsOn('receive_audio', (code, b64) => {
      try {
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});

        markSpeaking();

        const samples = base64ToFloat32(b64);
        if (!samples.length) return;

        // El buffer se declara SIEMPRE a 16 kHz: el navegador lo remuestrea
        // a la tasa real del contexto al reproducirlo.
        const buffer = ctx.createBuffer(1, samples.length, SAMPLE_RATE);
        buffer.copyToChannel(samples, 0);

        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(gainNode);

        // Cada hablante tiene su reloj; el mismo emisor reutiliza el suyo.
        let buf = bufsRef.current.get(code);
        if (!buf) {
          buf = { nextTime: 0, started: false, sources: [] };
          bufsRef.current.set(code, buf);
        }

        const now = ctx.currentTime;
        if (!buf.started) {
          // Primera muestra de este hablante: fijar su referencia temporal.
          buf.started = true;
          buf.nextTime = now + START_OFFSET;
        } else if (buf.nextTime < now) {
          // Se quedó atrás (pérdida, silencio o pausa larga): reenganchar
          // sin hueco. No hay nada agendado que valga la pena conservar.
          buf.nextTime = now + START_OFFSET;
        } else if (buf.nextTime - now > HARD_RESET) {
          // Cola absurda (p. ej. el hilo principal se bloqueó varios
          // segundos): aquí sí conviene tirar lo pendiente y empezar de cero,
          // aunque eso deje un hueco.
          dropPending(buf, now);
          buf.nextTime = now + START_OFFSET;
          console.warn(`[audio] re-sincronización dura del hablante ${code}`);
        } else if (buf.nextTime - now > MAX_LATENCY) {
          // Cola llena (ráfaga de bloques): descartar ESTE bloque y no tocar
          // lo ya agendado. Lo ya agendado suena seguido; descartarlo (como
          // se hacía antes) creaba un hueco de 32 ms con ritmo fijo.
          return;
        }

        const start = buf.nextTime;
        src.start(start);
        buf.nextTime = start + buffer.duration;
        buf.sources.push({ src, start });
        src.onended = () => {
          buf.sources = buf.sources.filter((it) => it.src !== src);
        };
      } catch (err) {
        console.error('Error procesando audio recibido:', err);
      }
    });

    // Limpieza al irse un peer: si no, su búfer quedaría con un reloj viejo
    // y, si vuelve con el mismo código, arrancaría con atraso heredado.
    const forgetSpeaker = (code) => {
      const buf = bufsRef.current.get(code);
      if (buf) {
        stopSources(buf);
        bufsRef.current.delete(code);
      }
    };
    const offLeft = EventsOn('voice_peer_left', forgetSpeaker);
    const offDisc = EventsOn('peer_disconnected', forgetSpeaker);

    return () => {
      off();
      offLeft();
      offDisc();
      clearTimeout(speakingTimerRef.current);
      for (const buf of bufsRef.current.values()) stopSources(buf);
      bufsRef.current.clear();
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
    // No heredar atraso de una llamada anterior: cada hablante arranca limpio.
    for (const buf of bufsRef.current.values()) {
      stopSources(buf);
      buf.nextTime = ctx.currentTime + START_OFFSET;
      buf.started = true;
    }
  }, []);

  return { remoteSpeaking, resume };
}
