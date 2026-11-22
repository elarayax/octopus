/**
 * AudioWorklet del micrófono.
 *
 * Vive en el hilo de audio (no en el principal), así que no sufre los tirones
 * de React ni los re-renders de la UI. Hace dos cosas:
 *
 *  1. Remuestrea de la tasa real del AudioContext a 16 kHz. El AudioContext
 *     no siempre respeta `sampleRate: 16000`: en macOS/WKWebView lo normal es
 *     que se quede en 48 kHz. Enviar esos bloques como si fueran de 16 kHz
 *     hacía que el receptor los reprodujera 3× más lentos y que su cola
 *     creciera sin parar (voz grave, entrecortada y con retraso).
 *
 *  2. Emite bloques de tamaño fijo (512 muestras = 32 ms) para que el
 *     receptor los programe con un paso constante.
 *
 * El remuestreo usa un filtro de caja: cada muestra de salida es la media de
 * las muestras de entrada que caen en su periodo. Al bajar de 48 a 16 kHz hay
 * que quitar antes las frecuencias > 8 kHz o se pliegan sobre la voz
 * (aliasing); la media es un paso-bajo barato y suficiente para voz.
 */
const TARGET_RATE = 16000;
const CHUNK_SIZE = 512;

class MicProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = (options && options.processorOptions) || {};
    this.targetRate = opts.targetRate || TARGET_RATE;
    this.chunkSize = opts.chunkSize || CHUNK_SIZE;

    // Muestras de salida que corresponden a cada muestra de entrada.
    this.step = this.targetRate / sampleRate;
    this.downsample = sampleRate > this.targetRate;

    this.acc = 0; // posición fraccionaria dentro del periodo de salida
    this.sum = 0; // suma de las muestras de entrada del periodo
    this.count = 0; // cuántas muestras de entrada lleva el periodo
    this.out = new Float32Array(this.chunkSize);
    this.n = 0; // muestras ya escritas en this.out
  }

  emit(value) {
    this.out[this.n++] = value;
    if (this.n === this.chunkSize) {
      // Copia: el buffer se reutiliza y el receptor se queda con el bloque.
      this.port.postMessage(this.out.slice(0));
      this.n = 0;
    }
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel || channel.length === 0) return true;

    if (!this.downsample) {
      if (sampleRate === this.targetRate) {
        // El contexto ya está a 16 kHz: solo trocear.
        for (let i = 0; i < channel.length; i++) this.emit(channel[i]);
      } else {
        // Contexto por debajo de 16 kHz (raro): repetir cada muestra.
        for (let i = 0; i < channel.length; i++) {
          this.acc += this.step;
          while (this.acc >= 1) {
            this.acc -= 1;
            this.emit(channel[i]);
          }
        }
      }
      return true;
    }

    for (let i = 0; i < channel.length; i++) {
      this.sum += channel[i];
      this.count++;
      this.acc += this.step;

      // Cada periodo completo de salida → media de las muestras de entrada.
      if (this.acc >= 1) {
        this.acc -= 1;
        this.emit(this.count > 0 ? this.sum / this.count : 0);
        this.sum = 0;
        this.count = 0;
      }
    }
    return true;
  }
}

registerProcessor('mic-processor', MicProcessor);
