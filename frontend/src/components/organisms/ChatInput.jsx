import { useState } from 'react';
import { Icon } from '../atoms';
import { slugify } from '../../utils/time';

export function ChatInput({ onSend, onSendImage, channelName }) {
  const [text, setText] = useState('');
  const ready = text.trim().length > 0;

  const submit = async () => {
    if (!ready) return;
    const current = text;
    setText('');
    await onSend(current);
  };

  return (
    <div className="chat-input">
      <button
        className="chat-input__attach"
        onClick={onSendImage}
        title="Enviar imagen (PNG, JPG, GIF, WebP)"
        aria-label="Adjuntar imagen"
      >
        <Icon name="clip" size={18} />
      </button>
      <input
        className="chat-input__field"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && submit()}
        placeholder={`Escribe un mensaje en #${slugify(channelName)}...`}
      />
      <button
        className={`chat-input__send ${ready ? 'chat-input__send--ready' : ''}`}
        onClick={submit}
        disabled={!ready}
      >
        Enviar
      </button>
    </div>
  );
}