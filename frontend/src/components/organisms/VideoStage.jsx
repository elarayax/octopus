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

/** Íconos SVG pequeños (heredan el color con currentColor). */
function MicOffIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
      <path d="M3 3l18 18" />
    </svg>
  );
}

function HeadphonesOffIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 15v-3a8 8 0 0 1 16 0v3" />
      <rect x="3" y="14" width="4" height="6" rx="1.5" />
      <rect x="17" y="14" width="4" height="6" rx="1.5" />
      <path d="M3 3l18 18" />
    </svg>
  );
}

/** Banderas de micrófono / audio silenciado sobre una tarjeta. */
function VoiceFlags({ state }) {
  if (!state || (!state.muted && !state.deafened)) return null;
  return (
    <span className="video-tile__flags">
      {state.muted && (
        <span className="video-tile__flag" title="Micrófono silenciado">
          <MicOffIcon />
        </span>
      )}
      {state.deafened && (
        <span className="video-tile__flag" title="Audio silenciado">
          <HeadphonesOffIcon />
        </span>
      )}
    </span>
  );
}

/**
 * Zona de videollamada estilo Discord.
 *  - Sin pantalla compartida: cuadrícula de cámaras / avatares.
 *  - Con pantalla compartida: aparece como tarjeta; clic = se abre grande sobre el chat,
 *    ⛶ = pantalla completa real, 🗗 = ventana flotante, Esc / ✕ = cerrar.
 *  - Con muchas personas: modo compacto (vista normal) y columna lateral (modo cine).
 * Los mods de video solo afectan a las CÁMARAS (.video-tile, .video-tile--self, .video-tile__name,
 * .video-stage__camera). La pantalla compartida usa sus propias clases (.screen-*).
 *
 * voiceStates: { [nombre]: { muted, deafened } } de quienes están en la llamada de voz,
 * incluido tú (ChatPage agrega tu propia entrada con selfName).
 */
export function VideoStage({
  video,
  screen,
  participants = [],
  avatars = {},
  selfName = 'Tú',
  voiceStates = {},
  cfg,
}) {
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

  // Muchas tarjetas: modo compacto (vista normal) y columna lateral (modo cine)
  const compact = tiles.length > 4 || (screens.length > 0 && tiles.length > 2);
  const crowded = tiles.length + Math.max(screens.length - 1, 0) > 4;

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
    const flags = <VoiceFlags state={voiceStates[t.name]} />;
    if (t.isAvatar) {
      return (
        <div className="video-tile video-tile--avatar" key={t.key}>
          <Avatar name={t.name} src={t.avatar} size={compact ? 44 : 64} />
          {showNames && <span className="video-tile__name">{t.name}</span>}
          {flags}
        </div>
      );
    }
    return (
      <div className={`video-tile ${t.self ? 'video-tile--self' : ''}`} key={t.key}>
        <Media item={t} />
        {showNames && <span className="video-tile__name">{t.name}</span>}
        {flags}
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
      <section
        className="video-stage"
        data-mode={mode}
        data-shape={shape}
        data-mirror={String(mirror)}
        data-compact={String(compact)}
      >
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
      data-crowded={String(crowded)}
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