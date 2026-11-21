/**
 * Bucle de frames compartido por la cámara y la pantalla compartida.
 *   fit: 'cover'   → recorte centrado al tamaño exacto width×height (cámara)
 *   fit: 'contain' → reduce manteniendo proporción, sin recortar (pantalla)
 * Devuelve una función `stop()`.
 */
export async function startFrameLoop(stream, { width, height, fps, quality, fit = 'cover', send }) {
  const vid = document.createElement('video');
  vid.srcObject = stream;
  vid.muted = true;
  await vid.play();

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  let busy = false;

  const resize = (w, h) => {
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  };

  const timer = setInterval(() => {
    if (busy || vid.readyState < 2) return;
    const vw = vid.videoWidth || width;
    const vh = vid.videoHeight || height;

    if (fit === 'cover') {
      resize(width, height);
      const scale = Math.max(width / vw, height / vh);
      const sw = width / scale;
      const sh = height / scale;
      ctx.drawImage(vid, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, width, height);
    } else {
      const scale = Math.min(width / vw, height / vh, 1);
      const cw = Math.max(2, Math.round(vw * scale));
      const ch = Math.max(2, Math.round(vh * scale));
      resize(cw, ch);
      ctx.drawImage(vid, 0, 0, cw, ch);
    }

    const b64 = canvas.toDataURL('image/jpeg', quality).split(',')[1];
    busy = true;
    Promise.resolve(send(b64))
      .catch(() => {})
      .finally(() => {
        busy = false;
      });
  }, 1000 / fps);

  return () => {
    clearInterval(timer);
    vid.pause();
    vid.srcObject = null;
  };
}