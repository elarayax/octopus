import { Button } from '../atoms';
import { DeviceSelect, LevelMeter, SliderRow, VoiceStatus } from '../molecules';
import { useVoiceNotifications } from '../../hooks/useVoiceNotifications';
import voiceJoinSound from '../../assets/sounds/voice-join.mp3';
import voiceLeaveSound from '../../assets/sounds/voice-leave.mp3';

export function VoicePanel({ call }) {
  useVoiceNotifications();
  const { active, muted, remoteSpeaking, join, leave, toggleMute } = call;

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

  const classes = [
    'voice-panel',
    active && 'voice-panel--active',
    remoteSpeaking && 'voice-panel--speaking',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <section className={classes}>
      <div className="voice-header">
        <div className="voice-info">
          <strong className="voice-info__title">📞 Canal de Voz en Vivo</strong>
          <VoiceStatus active={active} muted={muted} remoteSpeaking={remoteSpeaking} />
        </div>

        <div className="voice-actions">
          {!active ? (
            <Button variant="success" className="voice-btn-join" onClick={handleJoin}>
              🎙️ Unirse a Voz
            </Button>
          ) : (
            <>
              <Button
                variant={muted ? 'danger' : 'secondary'}
                className="voice-btn-mute"
                onClick={toggleMute}
              >
                {muted ? '🔇 Desmutear' : '🎙️ Mutear'}
              </Button>
              <Button variant="danger" className="voice-btn-leave" onClick={handleLeave}>
                Salir
              </Button>
            </>
          )}
        </div>
      </div>

      <details className="voice-config">
        <summary className="voice-config__summary">⚙️ Configuración de micrófono y volúmenes</summary>
        <div className="voice-config__body">
          <DeviceSelect
            devices={call.devices}
            value={call.selectedId}
            onChange={call.changeDevice}
            onRefresh={call.refreshDevices}
          />
          <LevelMeter ref={call.meterRef} />
          <SliderRow
            id="mic-gain"
            label="🎙️ Tu volumen"
            value={call.micGain}
            onChange={call.setMicGain}
            accent="var(--color-success-bright)"
          />
          <SliderRow
            id="playback-gain"
            label="🔊 Voz recibida"
            value={call.playbackGain}
            onChange={call.setPlaybackGain}
            accent="var(--color-info-soft)"
          />
        </div>
      </details>
    </section>
  );
}
