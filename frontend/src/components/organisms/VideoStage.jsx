import { useEffect, useMemo, useRef, useState } from 'react';
import { Avatar } from '../atoms';

/** <video> que asigna el MediaStream y fuerza play() (cámara propia y pantalla propia). */
function StreamVideo({ stream }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    el.play?.().catch(() => {});
    // Al quitar el stream (o desmontar), soltarlo del <video>: en WebKit/macOS un <video>
    // que aún lo referencia puede dejar la luz de la cámara encendida
    return () => {
      el.pause?.();
      el.srcObject = null;
    };
  }, [stream]);
  return <video ref={ref} autoPlay muted playsInline />;
}

/** Imagen de una fuente: stream local (video) o frame remoto (img base64). */
function Media({ item }) {
  return item.stream ? <StreamVideo stream={item.stream} /> : <img src={item.src} alt={item.name} />;
}

/**
 * Zona de videollamada estilo Discord.
 *  - Sin pantalla compartida: cuadrícula de cámaras / avatares.
 *  - Con pantalla compartida: aparece como tarjeta; clic = se abre grande sobre el chat,
 *    ⛶ = pantalla completa real, 🗗 = ventana flotante, Esc / ✕ = cerrar.
 * Los mods de video solo afectan a las CÁMARAS (.video-tile, .video-tile--self, .video-tile__name,
 * .video-stage__camera). La pantalla compartida usa sus propias clases (.screen-*).
 */
export function VideoStage({ video, screen, participants = [], avatars = {}, selfName = 'Tú', cfg }) {
  const { mode = 'grid', shape = 'rounded', mirror = true, showNames = true } = cfg || {};
  const [focusKey, setFocusKey] = useState(null);
  const [theater, setTheater] = useState(false);
  const mainRef = useRef(null);

  const devices = video?.devices || [];

  // Todo lo que hay que pintar, ya normalizado
  const { screens, tiles } = useMemo(() => {
    const remote = Object.values(video?.remote || {});
    const screens = [];
    if (screen?.on && screen.stream) {
      screens.push({ key: 'screen:self', self: true, name: selfName, stream: screen.stream });
    }
    remote
      .filter((r) => r.kind === 'screen')
      .forEach((r) => screens.push({ key: `screen:${r.name}`, name: r.name, src: r.src }));

    const tiles = [];
    const camNames = new Set();
    if (video?.stream) {
      tiles.push({ key: 'cam:self', self: true, name: selfName, stream: video.stream });
      camNames.add(selfName);
    }
    remote
      .filter((r) => r.kind === 'cam')
      .forEach((r) => {
        tiles.push({ key: `cam:${r.name}`, name: r.name, src: r.src });
        camNames.add(r.name);
      });
    // En la llamada pero sin cámara: avatar
    participants
      .filter((p) => !camNames.has(p.name))
      .forEach((p) =>
        tiles.push({ key: `av:${p.name}`, isAvatar: true, self: p.self, name: p.name, avatar: p.avatar || avatars[p.name] })
      );
    return { screens, tiles };
  }, [video?.remote, video?.stream, screen?.on, screen?.stream, participants, avatars, selfName]);

  const focused = screens.find((s) => s.key === focusKey) || screens[0] || null;

  // Sin transmisión no hay modo cine
  useEffect(() => {
    if (!focused) setTheater(false);
  }, [focused]);

  // Esc cierra el modo cine
  useEffect(() => {
    if (!theater) return undefined;
    const onKey = (e) => e.key === 'Escape' && setTheater(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [theater]);

  if (!focused && tiles.length === 0) return null;

  const toggleFullscreen = (e) => {
    e?.stopPropagation();
    if (document.fullscreenElement) document.exitFullscreen();
    else mainRef.current?.requestFullscreen?.();
  };

  // Ventana flotante (Picture-in-Picture): ver tu transmisión aunque estés en otra ventana
  const canPip = typeof document !== 'undefined' && document.pictureInPictureEnabled;
  const togglePip = async (e) => {
    e?.stopPropagation();
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await mainRef.current?.querySelector('video')?.requestPictureInPicture();
    } catch {
      /* el sistema no permite la ventana flotante */
    }
  };

  const camSelect = video?.on && devices.length > 1 && (
    <select
      className="video-stage__camera"
      value={video.selectedId}
      onChange={(e) => video.changeDevice(e.target.value)}
      title="Elegir cámara"
    >
      {devices.map((d, i) => (
        <option key={d.deviceId || i} value={d.deviceId}>
          {d.label || `Cámara ${i + 1}`}
        </option>
      ))}
    </select>
  );

  const renderTile = (t) => {
    if (t.isAvatar) {
      return (
        <div className="video-tile video-tile--avatar" key={t.key}>
          <Avatar name={t.name} src={t.avatar} size={64} />
          {showNames && <span className="video-tile__name">{t.name}</span>}
        </div>
      );
    }
    return (
      <div className={`video-tile ${t.self ? 'video-tile--self' : ''}`} key={t.key}>
        <Media item={t} />
        {showNames && <span className="video-tile__name">{t.name}</span>}
      </div>
    );
  };

  const openStream = (key) => {
    setFocusKey(key);
    setTheater(true);
  };

  // ---------- Normal: cuadrícula con tarjetas de transmisión + cámaras ----------
  if (!theater || !focused) {
    return (
      <section className="video-stage" data-mode={mode} data-shape={shape} data-mirror={String(mirror)}>
        {camSelect}
        {screens.map((s) => (
          <div
            className="screen-card"
            key={s.key}
            role="button"
            tabIndex={0}
            onClick={() => openStream(s.key)}
            onKeyDown={(e) => e.key === 'Enter' && openStream(s.key)}
          >
            <Media item={s} />
            {showNames && (
              <span className="screen-card__name">{s.self ? `${s.name} · tu pantalla` : s.name}</span>
            )}
            <div className="screen-card__overlay">
              <span className="screen-card__watch">▶ {s.self ? 'Ver mi transmisión' : 'Ver transmisión'}</span>
              {s.self && screen?.toggle && (
                <button
                  className="screen-card__stop"
                  onClick={(e) => {
                    e.stopPropagation();
                    screen.toggle();
                  }}
                >
                  Dejar de compartir
                </button>
              )}
            </div>
          </div>
        ))}
        {tiles.map(renderTile)}
      </section>
    );
  }

  // ---------- Ampliado: transmisión grande sobre el chat + tira ----------
  const others = screens.filter((s) => s.key !== focused.key);

  return (
    <section
      className="video-stage"
      data-mode={mode}
      data-shape={shape}
      data-mirror={String(mirror)}
      data-focus="true"
      data-theater="true"
    >
      <div className="screen-main" ref={mainRef}>
        <Media item={focused} />

        <button className="screen-main__close" onClick={() => setTheater(false)} title="Cerrar (Esc)">
          ✕
        </button>

        <div className="screen-main__bar">
          <span className="screen-main__title">
            {focused.self ? 'Estás compartiendo tu pantalla' : `${focused.name} está compartiendo su pantalla`}
          </span>
          <div className="screen-main__actions">
            {canPip && focused.stream && (
              <button className="screen-main__btn" onClick={togglePip} title="Ventana flotante">
                🗗
              </button>
            )}
            <button className="screen-main__btn" onClick={toggleFullscreen} title="Pantalla completa">
              ⛶
            </button>
            {focused.self && screen?.toggle && (
              <button className="screen-main__btn screen-main__btn--stop" onClick={screen.toggle}>
                Dejar de compartir
              </button>
            )}
          </div>
        </div>
      </div>

      {(others.length > 0 || tiles.length > 0) && (
        <div className="video-strip">
          {others.map((s) => (
            <button
              type="button"
              className="screen-thumb"
              key={s.key}
              onClick={() => setFocusKey(s.key)}
              title={`Ver la pantalla de ${s.name}`}
            >
              <Media item={s} />
              {showNames && <span className="screen-card__name">{s.name}</span>}
            </button>
          ))}
          {tiles.map(renderTile)}
        </div>
      )}
    </section>
  );
}