import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Button } from '../atoms';
import { ChatMessage, DayDivider } from '../molecules';
import { parseMsgTime, formatClock, formatDayLabel, dayKey } from '../../utils/time';

const GROUP_GAP_MS = 5 * 60 * 1000;

/**
 * Agrupa mensajes consecutivos del mismo autor (misma jornada, < 5 min entre sí)
 * e intercala separadores de día.
 */
function buildBlocks(messages) {
  const blocks = [];
  let group = null;
  let lastDay = null;

  messages.forEach((m, i) => {
    const date = parseMsgTime(m.time);
    const day = date ? dayKey(date) : null;

    if (day && day !== lastDay) {
      blocks.push({ type: 'day', key: `day-${day}-${i}`, label: formatDayLabel(date) });
      lastDay = day;
      group = null;
    }

    const prev = group?.lastDate;
    const sameGroup =
      group &&
      group.sender === m.sender &&
      (!date || !prev || date - prev < GROUP_GAP_MS);

    if (!sameGroup) {
      group = {
        type: 'group',
        key: `g-${m.id ?? i}`,
        sender: m.sender,
        time: date ? formatClock(date) : '',
        items: [],
        lastDate: date,
      };
      blocks.push(group);
    }
    group.items.push({ id: m.id, text: m.text, image: m.image, replyTo: m.replyTo, reactions: m.reactions });
    if (date) group.lastDate = date;
  });

  return blocks;
}

export function ChatHistory({ messages, avatars = {}, selfName, serverStarted, onStart, onReply, onReact }) {
  const endRef = useRef(null);
  const blocks = useMemo(() => buildBlocks(messages), [messages]);

  // Para mostrar la cita de una respuesta
  const byId = useMemo(() => new Map(messages.filter((m) => m.id).map((m) => [m.id, m])), [messages]);
  const getMessage = useCallback((id) => byId.get(id), [byId]);

  // Saltar al mensaje citado y resaltarlo un momento
  const jumpTo = useCallback((id) => {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.add('is-flash');
    setTimeout(() => el.classList.remove('is-flash'), 1400);
  }, []);

  // Autoscroll solo cuando llegan mensajes nuevos (no al reaccionar a uno antiguo)
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  return (
    <div className="chat-history">
      <div className="chat-history__inner">
        {messages.length === 0 ? (
          <div className="chat-history__empty">
            <span>
              {serverStarted
                ? 'No hay mensajes aún. Comparte tu ID e invita a tus amigos.'
                : 'No hay mensajes aún. ¡Inicia el servidor y conéctate con tus amigos!'}
            </span>
            {!serverStarted && onStart && (
              <Button variant="primary" onClick={onStart}>
                Iniciar servidor
              </Button>
            )}
          </div>
        ) : (
          blocks.map((b) =>
            b.type === 'day' ? (
              <DayDivider key={b.key} label={b.label} />
            ) : (
              <ChatMessage
                key={b.key}
                sender={b.sender}
                isSelf={!!selfName && b.sender === selfName}
                time={b.time}
                avatar={avatars[b.sender]}
                items={b.items}
                selfName={selfName}
                getMessage={getMessage}
                onReply={onReply}
                onReact={onReact}
                onJump={jumpTo}
              />
            )
          )
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}