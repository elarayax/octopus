import { Icon, Equalizer } from '../atoms';
import { useVoiceNotifications } from '../../hooks/useVoiceNotifications';
import voiceJoinSound from '../../assets/sounds/voice-join.mp3';
import voiceLeaveSound from '../../assets/sounds/voice-leave.mp3';

/**
 * Botón de control con ícono + texto debajo (así no hay que adivinar qué hace cada ícono).
 * state: 'off' (rojo: algo está apagado/silenciado) | 'on' (verde: activo, ej. cámara encendida)
 */
function Control({ icon, label, state, title, onClick, disabled }) {
  return (
    <button
      type="button"
      className={`vc-btn ${state ? `vc-btn--${state}` : ''}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={!!state}
    >
      <Icon name={icon} size={20} />
      <span className="vc-btn__label">{label}</span>
    </button>
  );
}

/**
 * Dock de voz fijo al pie del sidebar.
 *  - Sin conectar: un solo botón grande "Unirse a la voz" (+ cámara y pantalla opcionales).
 *  - Conectado: 4 controles con texto (micrófono, audio, cámara, pantalla) y "Salir".
 * speakerName: nombre de quien habla (si se conoce). othersInCall: cuántos más hay en la llamada.
 */
export function VoicePanel({ call, video, screen, channelName, speakerName, othersInCall = 0, onOpenSettings }) {
  const { active, muted, deafened, remoteSpeaking, join, leave, toggleMute, toggleDeafen } = call;
  useVoiceNotifications();

  const playLocalSound = (source) => {
    try {
      const playback = new Audio(source).play();
      playback?.catch((error) => console.debug('No se pudo reproducir el sonido de voz:', error));
    } catch (error) {
      console.debug('No se pudo iniciar el sonido de voz:', error);
    }
  };

  const handleJoin = () => {
    playLocalSound(voiceJoinSound);
    join();
  };

  const handleLeave = () => {
    playLocalSound(voiceLeaveSound);
    leave();
  };

  // Texto de estado: dice lo más importante en lenguaje simple
  let title;
  let sub;
  if (!active) {
    title = 'Llamada de voz';
    sub =
      othersInCall > 0
        ? `${othersInCall} ${othersInCall === 1 ? 'persona' : 'personas'} en la llamada`
        : 'Nadie ha entrado todavía';
  } else {
    title = 'Conectado a la voz';
    if (remoteSpeaking) sub = speakerName ? `${speakerName} está hablando` : 'Alguien está hablando';
    else if (deafened) sub = 'No estás escuchando la llamada';
    else if (muted) sub = 'Micrófono silenciado';
    else sub = `${channelName} · ${othersInCall + 1} en la llamada`;
  }

  const cameraState = video?.on ? 'on' : undefined;
  const screenState = screen?.on ? 'on' : undefined;
  const cameraLabel = video?.on ? 'Encendida' : video?.starting ? 'Abriendo…' : 'Cámara';
  const cameraTitle = video?.on
    ? 'Apagar cámara'
    : video?.starting
      ? 'Abriendo cámara… (clic para cancelar)'
      : 'Encender cámara';

  return (
    <section className={`voice-dock ${active ? 'voice-dock--active' : ''}`}>
      <div className="voice-dock__head">
        <span className="voice-dock__icon">
          {active ? <Equalizer idle={!remoteSpeaking} /> : <Icon name="mic" size={18} />}
        </span>
        <div className="voice-dock__text">
          <div className="voice-dock__title">{title}</div>
          <div className="voice-dock__sub" title={sub}>{sub}</div>
        </div>
        <button className="icon-btn icon-btn--ghost voice-dock__gear" onClick={onOpenSettings} title="Ajustes de audio y perfil">
          <Icon name="gear" size={18} />
        </button>
      </div>

      {!active && (
        <button className="voice-dock__main voice-dock__main--join" onClick={handleJoin}>
          <Icon name="mic" size={18} />
          Unirse a la voz
        </button>
      )}

      <div className={`voice-controls ${active ? 'voice-controls--4' : 'voice-controls--2'}`}>
        {active && (
          <>
            <Control
              icon={muted ? 'mic-off' : 'mic'}
              label={muted ? 'Silenciado' : 'Micrófono'}
              state={muted ? 'off' : undefined}
              onClick={toggleMute}
              title={muted ? 'Activar micrófono (Alt+M)' : 'Silenciar micrófono (Alt+M)'}
            />
            <Control
              icon={deafened ? 'volume-off' : 'volume'}
              label={deafened ? 'Sin audio' : 'Audio'}
              state={deafened ? 'off' : undefined}
              onClick={toggleDeafen}
              title={deafened ? 'Volver a escuchar la llamada (Alt+D)' : 'Dejar de escuchar la llamada (Alt+D)'}
            />
          </>
        )}
        {video && (
          <Control
            icon="video"
            label={cameraLabel}
            state={cameraState}
            onClick={video.toggle}
            title={cameraTitle}
          />
        )}
        {screen && (
          <Control
            icon="screen"
            label={screen.on ? 'En vivo' : 'Pantalla'}
            state={screenState}
            onClick={screen.toggle}
            title={screen.on ? 'Dejar de compartir pantalla' : 'Compartir pantalla'}
          />
        )}
      </div>

      {active && (
        <button className="voice-dock__main voice-dock__main--leave" onClick={handleLeave}>
          Salir de la voz
        </button>
      )}
    </section>
  );
}