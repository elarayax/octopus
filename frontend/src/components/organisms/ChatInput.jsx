import { useState } from 'react';
import { InputWithButton } from '../molecules';

export function ChatInput({ onSend }) {
  const [text, setText] = useState('');

  const submit = async () => {
    if (!text.trim()) return;
    const current = text;
    setText('');
    await onSend(current);
  };

  return (
    <div className="chat-input">
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