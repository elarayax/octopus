import { useState } from 'react';
import { Button } from '../atoms';
import { InputWithButton } from '../molecules';

export function ChatInput({ onSend, onSendImage }) {
  const [text, setText] = useState('');

  const submit = async () => {
    if (!text.trim()) return;
    const current = text;
    setText('');
    await onSend(current);
  };

  return (
    <div className="chat-input">
      <Button
        variant="secondary"
        className="chat-input__attach"
        onClick={onSendImage}
        title="Enviar imagen (PNG, JPG, GIF, WebP)"
      >
        📎
      </Button>
      <InputWithButton
        value={text}
        onChange={setText}
        placeholder="Escribe un mensaje..."
        buttonLabel="Enviar"
        variant="primary"
        onSubmit={submit}
        submitOnEnter
      />
    </div>
  );
}
