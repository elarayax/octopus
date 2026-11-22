import { useRef, useEffect, useCallback } from 'react';
import { SendAudio } from '../../wailsjs/go/main/App';
import {
  CHUNK_SIZE,
  SAMPLE_RATE,
  createAudioContext,
  createResampler,
  floatToInt16,
  int16ToBase64,
  rms,
  updateMeter,
} from '../utils/audio';

const WORKLET_URL = `${import.meta.env.BASE_URL}mic-processor.js`;

export function useMicCapture({ gain, muted }) {
  const meterRef = useRef(null);
  const streamRef = useRef(null);
  const ctxRef = useRef(null);
  const nodeRef = useRef(null);
  const gainRef = useRef(gain);
  const mutedRef = useRef(muted);
  // Muestras a 16 kHz que aún no completan un bloque de CHUNK_SIZE
  const pendingRef = useRef(new Float32Array(0));

  useEffect(() => {
    gainRef.current = gain;
  }, [gain]);

  useEffect(() => {
    mutedRef.current = muted;
    if (muted) updateMeter(meterRef.current, 0);
  }, [muted]);

  // Envía un bloque ya a 16 kHz. El try/catch envuelve también la llamada al
  // binding: si SendAudio no existiera (bindings viejos), el throw mataría el
  // callback de audio y dejaría de capturarse para siempre.
  const handleChunk = useCallback((input) => {
    if (mutedRef.current) {
      updateMeter(meterRef.current, 0);
      return;
    }
    updateMeter(meterRef.current, rms(input));
    const b64 = int16ToBase64(floatToInt16(input, gainRef.current));
    try {
      Promise.resolve(SendAudio(b64)).catch((err) => console.error('SendAudio:', err));
    } catch (err) {
      console.error('SendAudio:', err);
    }
  }, []);

  // Acumula muestras a 16 kHz y las emite en bloques de CHUNK_SIZE.
  // Así el tamaño de bloque no depende de la tasa real del AudioContext.
  const feed = useCallback(
    (samples) => {
      if (!samples || samples.length === 0) return;
      let buf = samples;
      if (pendingRef.current.length > 0) {
        const merged = new Float32Array(pendingRef.current.length + samples.length);
        merged.set(pendingRef.current, 0);
        merged.set(samples, pendingRef.current.length);
        buf = merged;
      }
      let off = 0;
      while (buf.length - off >= CHUNK_SIZE) {
        handleChunk(buf.subarray(off, off + CHUNK_SIZE));
        off += CHUNK_SIZE;
      }
      // Copia: evita retener el buffer grande (subarray comparte memoria)
      pendingRef.current = buf.slice(off);
    },
    [handleChunk]
  );

  const stop = useCallback(() => {
    const node = nodeRef.current;
    if (node) {
      if (node.port) node.port.onmessage = null;
      node.onaudioprocess = null;
      node.disconnect();
      nodeRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (ctxRef.current) {
      ctxRef.current.close();
      ctxRef.current = null;
    }
    pendingRef.current = new Float32Array(0);
    updateMeter(meterRef.current, 0);
  }, []);

  const start = useCallback(
    async (deviceId) => {
      stop();

      const constraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      };
      if (deviceId) constraints.deviceId = { ideal: deviceId };

      const stream = await navigator.mediaDevices.getUserMedia({ audio: constraints });
      streamRef.current = stream;

      const ctx = createAudioContext();
      ctxRef.current = ctx;
      if (ctx.state === 'suspended') await ctx.resume();

      // Diagnóstico: si WKWebView ignoró los 16 kHz, aquí se ve la tasa real.
      if (ctx.sampleRate !== SAMPLE_RATE) {
        console.info(`[audio] AudioContext a ${ctx.sampleRate} Hz; remuestreando a ${SAMPLE_RATE} Hz`);
      }

      const source = ctx.createMediaStreamSource(stream);
      const silent = ctx.createGain();
      silent.gain.value = 0;

      // AudioWorklet (fuera del hilo principal); fallback a ScriptProcessor
      let node = null;
      if (ctx.audioWorklet) {
        try {
          await ctx.audioWorklet.addModule(WORKLET_URL);
          node = new AudioWorkletNode(ctx, 'mic-processor', {
            processorOptions: { targetRate: SAMPLE_RATE, chunkSize: CHUNK_SIZE },
          });
          // El worklet ya entrega bloques de CHUNK_SIZE a 16 kHz
          node.port.onmessage = (e) => handleChunk(e.data);
        } catch (err) {
          console.warn('AudioWorklet no disponible, usando ScriptProcessor:', err);
          node = null;
        }
      }
      if (!node) {
        node = ctx.createScriptProcessor(CHUNK_SIZE, 1, 1);
        // ScriptProcessor entrega la tasa del contexto (48 kHz en macOS):
        // remuestrear aquí es lo que evita el audio lento y la cola creciente.
        // El remuestreador es con estado (arrastra la fracción sobrante).
        const resample = createResampler(ctx.sampleRate);
        node.onaudioprocess = (e) => {
          feed(resample(e.inputBuffer.getChannelData(0)));
        };
      }

      nodeRef.current = node;
      source.connect(node);
      node.connect(silent);
      silent.connect(ctx.destination);
    },
    [stop, handleChunk, feed]
  );

  useEffect(() => stop, [stop]);

  return { meterRef, start, stop };
}
