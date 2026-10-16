export const SAMPLE_RATE = 16000;
export const CHUNK_SIZE = 512; // 32 ms @ 16 kHz

export function createAudioContext() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  return new Ctx({ sampleRate: SAMPLE_RATE, latencyHint: 'interactive' });
}

/** Float32 [-1, 1] -> Int16 aplicando ganancia con clipping */
export function floatToInt16(input, gain = 1) {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i] * gain));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

/** Int16 -> base64 (por bloques, mucho más rápido que concatenar char a char) */
export function int16ToBase64(int16) {
  const bytes = new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength);
  const BLOCK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += BLOCK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + BLOCK));
  }
  return btoa(binary);
}

/** base64 (PCM16 little-endian) -> Float32 [-1, 1] */
export function base64ToFloat32(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const int16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768;
  return float32;
}

export function rms(input) {
  let sum = 0;
  for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
  return Math.sqrt(sum / input.length);
}

/** Actualiza el medidor tocando el DOM directo (sin re-render de React) */
export function updateMeter(el, level) {
  if (!el) return;
  const pct = Math.min(100, Math.round(level * 400));
  el.style.width = pct + '%';
  el.style.backgroundColor =
    pct > 80 ? 'var(--color-danger)' : pct > 50 ? 'var(--color-warning)' : 'var(--color-success-bright)';
}
