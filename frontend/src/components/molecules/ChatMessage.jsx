import { Avatar } from '../atoms';

/**
 * Grupo de burbujas consecutivas del mismo autor.
 * items: [{ text, image }]
 */
export function ChatMessage({ sender, isSelf, time, avatar, items }) {
  const name = sender || '?';
  return (
    <div className={`chat-message ${isSelf ? 'chat-message--self' : ''}`}>
      <Avatar name={name} src={avatar} size={40} />
      <div className="chat-message__body">
        <div className="chat-message__meta">
          <strong className="chat-message__sender">{isSelf ? 'Tú' : name}</strong>
          {time && <span className="chat-message__time">{time}</span>}
        </div>
        {items.map((it, i) =>
          it.image ? (
            <div key={i} className="chat-message__bubble chat-message__bubble--image">
              <img className="chat-message__image" src={it.image} alt={`Imagen enviada por ${name}`} />
            </div>
          ) : (
            <div key={i} className="chat-message__bubble">
              {it.text}
            </div>
          )
        )}
      </div>
    </div>
  );
}

export function DayDivider({ label }) {
  return <div className="day-divider">{label}</div>;
}