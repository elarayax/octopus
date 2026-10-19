function hueFrom(name = '') {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

export function ChatMessage({ sender, text, avatar, image }) {
  const name = sender || '?';
  return (
    <div className="chat-message" style={{ '--hue': hueFrom(name) }}>
      {avatar ? (
        <img className="chat-message__avatar chat-message__avatar--img" src={avatar} alt="" />
      ) : (
        <span className="chat-message__avatar" aria-hidden="true">
          {name.charAt(0).toUpperCase()}
        </span>
      )}
      <div className="chat-message__body">
        <strong className="chat-message__sender">{name}</strong>
        {image ? (
          <img className="chat-message__image" src={image} alt={`Imagen enviada por ${name}`} />
        ) : (
          <div className="chat-message__text">{text}</div>
        )}
      </div>
    </div>
  );
}
