import { useEffect, useRef, useState } from 'react';
import { Avatar, Icon } from '../atoms';

function Menu({ items }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="menu" ref={ref}>
      <button className="menu__trigger" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((o) => !o)}>
        Menú
      </button>
      {open && (
        <div className="menu__popover" role="menu">
          {items.map((it, i) =>
            it === 'sep' ? (
              <div key={i} className="menu__sep" />
            ) : (
              <button
                key={it.label}
                role="menuitem"
                className="menu__item"
                onClick={() => {
                  setOpen(false);
                  it.onClick();
                }}
              >
                <Icon name={it.icon} size={16} />
                {it.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

export function AppHeader({
  channel,
  channelMuted = false,
  onToggleChannelMute,
  onlineUsers = [],
  serverStarted,
  onOpenSettings,
  onOpenServer,
  onRefreshMods,
  onOpenMods,
}) {
  const icono = channel?.icono || '🐙';
  const shown = onlineUsers.slice(0, 4);

  const items = [
    { icon: 'user', label: 'Perfil y audio', onClick: onOpenSettings },
    {
      icon: serverStarted ? 'server' : 'play',
      label: serverStarted ? 'Editar canal' : 'Iniciar servidor…',
      onClick: onOpenServer,
    },
    {
      icon: channelMuted ? 'bell' : 'bell-off',
      label: channelMuted ? 'Activar notificaciones del canal' : 'Silenciar canal',
      onClick: onToggleChannelMute,
    },
    'sep',
    { icon: 'refresh', label: 'Actualizar mod', onClick: onRefreshMods },
    { icon: 'folder', label: 'Abrir carpeta de mods', onClick: onOpenMods },
  ];

  return (
    <header className="app-header">
      <div className="app-header__identity">
        {icono.startsWith('data:image') ? (
          <img className="app-header__icon-img" src={icono} alt="" />
        ) : (
          <span className="app-header__icon" aria-hidden="true">{icono}</span>
        )}
        <div className="app-header__text">
          <h2 className="app-header__title">
            {channel?.nombre || 'Chat P2P'}
            {channelMuted && <Icon name="bell-off" size={15} className="app-header__muted" title="Canal silenciado" />}
          </h2>
          <p className="app-header__subtitle">
            {channel?.subtitulo}
            {channel?.subtitulo && <span className="app-header__sep">·</span>}
            <code>P2P WebRTC</code>
          </p>
        </div>
      </div>

      <div className="app-header__actions">
        {onToggleChannelMute && (
          <button
            className={`icon-btn icon-btn--ghost ${channelMuted ? 'icon-btn--danger' : ''}`}
            onClick={onToggleChannelMute}
            title={channelMuted ? 'Activar notificaciones del canal (Alt+N)' : 'Silenciar canal (Alt+N)'}
            aria-pressed={channelMuted}
          >
            <Icon name={channelMuted ? 'bell-off' : 'bell'} size={18} />
          </button>
        )}
        {shown.length > 0 && (
          <div className="avatar-stack" aria-label={`${onlineUsers.length} conectados`}>
            {shown.map((u, i) => (
              <Avatar key={`${u.name}-${i}`} name={u.name} src={u.avatar} size={28} />
            ))}
          </div>
        )}
        <Menu items={items} />
      </div>
    </header>
  );
}