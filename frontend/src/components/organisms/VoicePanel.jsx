import { Icon, Equalizer } from '../atoms';
import { useVoiceNotifications } from '../../hooks/useVoiceNotifications';
import voiceJoinSound from '../../assets/sounds/voice-join.mp3';
import voiceLeaveSound from '../../assets/sounds/voice-leave.mp3';

/**
 * Dock de voz fijo al pie del sidebar.
 * speakerName: nombre de quien habla (si se conoce) para el subtítulo.
 */
export function VoicePanel({ call, video, screen, channelName, speakerName, onOpenSettings }) {
  const { active, muted, remoteSpeaking, join, leave, toggleMute } = call;
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

  let sub;
  if (!active) sub = 'Únete para hablar con el canal';
  else if (remoteSpeaking) sub = `${channelName} · ${speakerName ? `${speakerName} hablando` : 'alguien habla'}`;
  else sub = `${channelName} · ${muted ? 'micrófono silenciado' : 'micrófono abierto'}`;

  return (
    <section className={`voice-dock ${active ? 'voice-dock--active' : ''}`}>
      <div className="voice-dock__info">
        <span className="voice-dock__icon">
          {active ? <Equalizer idle={!remoteSpeaking} /> : <Icon name="mic" size={18} />}
        </span>
        <div className="voice-dock__text">
          <div className="voice-dock__title">{active ? 'Voz conectada' : 'Voz desconectada'}</div>
          <div className="voice-dock__sub" title={sub}>{sub}</div>
        </div>
      </div>

      <div className="voice-dock__actions">
        <button
          className={`icon-btn ${active && muted ? 'icon-btn--danger' : ''}`}
          onClick={toggleMute}
          disabled={!active}
          title={muted ? 'Activar micrófono' : 'Silenciar micrófono'}
          aria-pressed={muted}
        >
          <Icon name={muted ? 'mic-off' : 'mic'} size={18} />
        </button>
        {video && (
          <button
            className={`icon-btn ${video.on ? 'icon-btn--danger' : ''}`}
            onClick={video.toggle}
            title={video.on ? 'Apagar cámara' : 'Encender cámara'}
            aria-pressed={video.on}
          >
            {video.on ? '📷' : '🎥'}
          </button>
        )}
        {screen && (
          <button
            className={`icon-btn ${screen.on ? 'icon-btn--danger' : ''}`}
            onClick={screen.toggle}
            title={screen.on ? 'Dejar de compartir pantalla' : 'Compartir pantalla'}
            aria-pressed={screen.on}
          >
            <Icon name="screen" size={18} />
          </button>
        )}
        <button className="icon-btn" onClick={onOpenSettings} title="Ajustes de audio y perfil">
          <Icon name="gear" size={18} />
        </button>
        {active ? (
          <button className="voice-dock__main voice-dock__main--leave" onClick={handleLeave}>
            Salir
          </button>
        ) : (
          <button className="voice-dock__main voice-dock__main--join" onClick={handleJoin}>
            Unirse
          </button>
        )}
      </div>
    </section>
  );
}