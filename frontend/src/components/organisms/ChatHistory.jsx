import { useEffect, useRef } from 'react';
import { ChatMessage } from '../molecules';

export function ChatHistory({ messages, avatars = {} }) {
  const endRef = useRef(null);

  // Autoscroll al último mensaje
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  return (
    <div className="chat-history">
      {messages.length === 0 ? (
        <div className="chat-history__empty">
          No hay mensajes aún. ¡Inicia el servidor y conéctate con tus amigos!
        </div>
      ) : (
        messages.map((m, i) => (
          <ChatMessage
            key={m.id ?? i}
            sender={m.sender}
            text={m.text}
            avatar={avatars[m.sender]}
            image={m.image}
          />
        ))
      )}
      <div ref={endRef} />
    </div>
  );
}
