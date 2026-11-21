import { Fragment } from 'react';

/**
 * Template: solo decide DÓNDE va cada cosa.
 * - `layout` viene del mod (sidebarPosition + panels habilitados).
 * - `panels` es un registro { clave: nodo } para el centro del sidebar;
 *   una clave con `false` en el mod se oculta.
 *   (`connection` y `nodeInfo` del layout.json antiguo ocultan el panel `invite`.)
 */
export function MainLayout({ layout, brand, search, panels, voice, header, chat }) {
  const { sidebarPosition = 'left', panels: enabled = {} } = layout;

  const inviteHidden = enabled.invite === false || (enabled.connection === false && enabled.nodeInfo === false);
  const visible = Object.entries(panels).filter(
    ([key, node]) => node && enabled[key] !== false && !(key === 'invite' && inviteHidden)
  );

  return (
    <div className={`main-layout main-layout--sidebar-${sidebarPosition}`}>
      <aside className="sidebar">
        <div className="sidebar__top">
          {brand}
          {search}
        </div>
        <div className="sidebar__scroll">
          {visible.map(([key, node]) => (
            <Fragment key={key}>{node}</Fragment>
          ))}
        </div>
        {voice && enabled.voice !== false && <div className="sidebar__dock">{voice}</div>}
      </aside>

      <section className="main-layout__main">
        <div className="main-layout__header">{header}</div>
        <main className="main-layout__chat">{chat}</main>
      </section>
    </div>
  );
}