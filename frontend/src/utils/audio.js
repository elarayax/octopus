export const SAMPLE_RATE = 16000;
export const CHUNK_SIZE = 512; // 32 ms @ 16 kHz

/**
 * Crea el AudioContext a 16 kHz si el navegador lo permite.
 *
 * Por qué el try/catch: la spec permite lanzar NotSupportedError si la tasa
 * pedida no existe en el hardware. WKWebView (macOS) además puede ignorarla
 * en silencio y quedarse con 44.1/48 kHz. Por eso el resto del código nunca
 * asume 16 kHz: siempre mira `ctx.sampleRate` y remuestrea si hace falta.
 */
export function createAudioContext() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  try {
    return new Ctx({ sampleRate: SAMPLE_RATE, latencyHint: 'interactive' });
  } catch (err) {
    console.warn('AudioContext a 16 kHz no soportado; usando la tasa del sistema:', err);
    return new Ctx({ latencyHint: 'interactive' });
  }
}

/**
 * Crea un remuestreador con estado de `fromRate` a 16 kHz.
 *
 * Devuelve una función que recibe un bloque Float32 y devuelve otro a 16 kHz.
 *
 * Por qué existe: si el AudioContext corre a 48 kHz (macOS suele ignorar la
 * petición de 16 kHz) y enviamos sus bloques como si ya fueran de 16 kHz, el
 * receptor los reproduce 3× más lentos y la cola de reproducción crece 3×
 * más rápido de lo que se vacía. Resultado: voz grave, entrecortada y con
 * retraso creciente. Ese era el síntoma del micrófono "que no funciona".
 *
 * Por qué con estado y no bloque a bloque: al dividir 512 muestras entre 3
 * sobran 2; si se tiran en cada bloque, la tasa efectiva baja ~0.4 % y el
 * receptor acaba con micro-cortes cada pocos segundos. El remuestreador
 * conserva la posición fraccionaria y la suma parcial entre bloques, así que
 * la tasa queda exacta (y es el mismo algoritmo que el AudioWorklet).
 *
 * Por qué un filtro de caja (media del periodo) y no tomar 1 de cada N: al
 * bajar de 48 a 16 kHz hay que eliminar antes las frecuencias > 8 kHz, o se
 * pliegan sobre la voz (aliasing). La media de las muestras del periodo es
 * un paso-bajo barato y suficiente para voz.
 */
export function createResampler(fromRate = SAMPLE_RATE) {
  // Muestras de salida que corresponden a cada muestra de entrada.
  const step = SAMPLE_RATE / fromRate;
  let acc = 0; // posición fraccionaria dentro del periodo de salida
  let sum = 0; // suma de las muestras de entrada del periodo
  let count = 0; // cuántas muestras de entrada lleva el periodo

  return function resample(block) {
    if (!block || block.length === 0) return new Float32Array(0);
    if (!fromRate || fromRate === SAMPLE_RATE) return block;

    // Cota superior: como máximo una salida por muestra de entrada + la que
    // pueda completarse al principio por el estado pendiente.
    const out = new Float32Array(Math.ceil(block.length * step) + 1);
    let n = 0;

    // Contexto por debajo de 16 kHz (raro): repetir cada muestra las veces
    // necesarias. Sin filtro: se está añadiendo información, no quitando.
    if (step > 1) {
      for (let i = 0; i < block.length; i++) {
        acc += step;
        while (acc >= 1) {
          acc -= 1;
          out[n++] = block[i];
        }
      }
      return out.subarray(0, n);
    }

    // Descendente: media del periodo (paso-bajo antialiasing).
    for (let i = 0; i < block.length; i++) {
      sum += block[i];
      count++;
      acc += step;

      // Cada periodo completo de salida → media de las muestras de entrada.
      if (acc >= 1) {
        acc -= 1;
        out[n++] = count > 0 ? sum / count : 0;
        sum = 0;
        count = 0;
      }
    }

    return out.subarray(0, n);
  };
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
