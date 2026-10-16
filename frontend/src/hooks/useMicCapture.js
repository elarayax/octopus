import { useRef, useEffect, useCallback } from 'react';
import { SendAudio } from '../../wailsjs/go/main/App';
import {
  CHUNK_SIZE,
  createAudioContext,
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

  useEffect(() => {
    gainRef.current = gain;
  }, [gain]);

  useEffect(() => {
    mutedRef.current = muted;
    if (muted) updateMeter(meterRef.current, 0);
  }, [muted]);

  const handleChunk = useCallback((input) => {
    if (mutedRef.current) {
      updateMeter(meterRef.current, 0);
      return;
    }
    updateMeter(meterRef.current, rms(input));
    const b64 = int16ToBase64(floatToInt16(input, gainRef.current));
    Promise.resolve(SendAudio(b64)).catch((err) => console.error('SendAudio:', err));
  }, []);

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

      const source = ctx.createMediaStreamSource(stream);
      const silent = ctx.createGain();
      silent.gain.value = 0;

      // AudioWorklet (fuera del hilo principal); fallback a ScriptProcessor
      let node = null;
      if (ctx.audioWorklet) {
        try {
          await ctx.audioWorklet.addModule(WORKLET_URL);
          node = new AudioWorkletNode(ctx, 'mic-processor');
          node.port.onmessage = (e) => handleChunk(e.data);
        } catch (err) {
          console.warn('AudioWorklet no disponible, usando ScriptProcessor:', err);
          node = null;
        }
      }
      if (!node) {
        node = ctx.createScriptProcessor(CHUNK_SIZE, 1, 1);
        node.onaudioprocess = (e) => handleChunk(e.inputBuffer.getChannelData(0));
      }

      nodeRef.current = node;
      source.connect(node);
      node.connect(silent);
      silent.connect(ctx.destination);
    },
    [stop, handleChunk]
  );

  useEffect(() => stop, [stop]);

  return { meterRef, start, stop };
}
