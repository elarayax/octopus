import { Fragment } from 'react';

/**
 * Template: solo decide DÓNDE va cada cosa.
 * - `layout` viene del mod (sidebarPosition + panels habilitados).
 * - `panels` es un registro { clave: nodo }; una clave con `false` en el mod se oculta.
 */
export function MainLayout({ layout, header, status, panels, chat }) {
  const { sidebarPosition = 'left', panels: enabled = {} } = layout;

  const visible = Object.entries(panels).filter(([key, node]) => node && enabled[key] !== false);

  return (
    <div className={`main-layout main-layout--sidebar-${sidebarPosition}`}>
      <div className="main-layout__header">{header}</div>
      <div className="main-layout__status">{status}</div>
      <aside className="main-layout__sidebar">
        {visible.map(([key, node]) => (
          <Fragment key={key}>{node}</Fragment>
        ))}
      </aside>
      <main className="main-layout__chat">{chat}</main>
    </div>
  );
}
