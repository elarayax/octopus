import { Icon } from '../atoms';

/**
 * Pestañas del sidebar (Canales | Usuarios).
 * tabs: [{ key, label, icon, count?, title? }]
 * Accesible: role="tablist" y flechas ← → para moverse entre pestañas.
 */
export function SidebarTabs({ tabs, active, onChange }) {
  const onKeyDown = (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = tabs.findIndex((t) => t.key === active);
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    onChange(next.key);
  };

  return (
    <div className="sidebar-tabs" role="tablist" onKeyDown={onKeyDown}>
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={t.key === active}
          tabIndex={t.key === active ? 0 : -1}
          className={`sidebar-tabs__tab ${t.key === active ? 'is-active' : ''}`}
          onClick={() => onChange(t.key)}
          title={t.title}
        >
          <Icon name={t.icon} size={15} />
          <span>{t.label}</span>
          {t.count !== undefined && <span className="sidebar-tabs__count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}