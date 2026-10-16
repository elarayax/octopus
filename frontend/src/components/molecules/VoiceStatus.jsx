export function VoiceStatus({ active, muted, remoteSpeaking }) {
  return (
    <div className={`voice-status ${active ? 'voice-status--active' : ''}`}>
      {active ? (
        <span>🟢 En llamada continua {muted ? '(🔇 Micrófono Silenciado)' : '(🎙️ Micrófono Abierto)'}</span>
      ) : (
        <span>⚪ Fuera de llamada</span>
      )}
      {remoteSpeaking && <span className="voice-status__remote">🔊 Alguien está hablando...</span>}
    </div>
  );
}
