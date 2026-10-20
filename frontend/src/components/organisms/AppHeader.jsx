import { Button } from '../atoms';

export function AppHeader({ onRefreshMods, onOpenMods, onOpenSettings, channel }) {
  const icono = channel?.icono || '🐙';
  return (
    <header className="app-header">
      <div className="app-header__identity">
        {icono.startsWith('data:image') ? (
          <img className="app-header__icon-img" src={icono} alt="" />
        ) : (
          <span className="app-header__icon" aria-hidden="true">{icono}</span>
        )}
        <div className="app-header__text">
          <h2 className="app-header__title">{channel?.nombre || 'Chat P2P'}</h2>
          {channel?.subtitulo && <p className="app-header__subtitle">{channel.subtitulo}</p>}
        </div>
      </div>
      <div className="app-header__actions">
        <Button variant="secondary" onClick={onOpenSettings} title="Configuración de usuario">
          ⚙️ Perfil
        </Button>
        <Button variant="success" onClick={onRefreshMods} title="Recargar CSS y Layout sin reiniciar">
          🔄 Actualizar Mod
        </Button>
        <Button variant="secondary" onClick={onOpenMods}>
          📁 Abrir carpeta de Mods
        </Button>
      </div>
    </header>
  );
}
