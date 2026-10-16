import { Label, Select, Button } from '../atoms';

export function DeviceSelect({ devices, value, onChange, onRefresh }) {
  return (
    <div className="voice-device-selector">
      <Label htmlFor="mic-select">🎙️ Micrófono:</Label>
      <Select id="mic-select" className="voice-select" value={value} onChange={(e) => onChange(e.target.value)}>
        {devices.length === 0 ? (
          <option value="">Por defecto del sistema</option>
        ) : (
          devices.map((dev, idx) => (
            <option key={dev.deviceId || idx} value={dev.deviceId}>
              {dev.label || (idx === 0 ? 'Micrófono predeterminado' : `Micrófono ${idx + 1}`)}
            </option>
          ))
        )}
      </Select>
      <Button
        variant="secondary"
        size="sm"
        className="voice-btn-refresh"
        onClick={onRefresh}
        title="Recargar lista de micrófonos"
      >
        🔄
      </Button>
    </div>
  );
}
