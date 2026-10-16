import { Button } from '../atoms';

export function AppHeader({ onRefreshMods, onOpenMods }) {
  return (
    <header className="app-header">
      <h2 className="app-header__title">Chat P2P - Texto & Voz en Vivo</h2>
      <div className="app-header__actions">
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
