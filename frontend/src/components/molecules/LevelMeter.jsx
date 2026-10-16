import { forwardRef } from 'react';
import { Label } from '../atoms';

// El ref apunta a la barra: useMicCapture la actualiza directo en el DOM
export const LevelMeter = forwardRef(function LevelMeter({ label = '🎚️ Nivel:' }, ref) {
  return (
    <div className="level-meter">
      <Label>{label}</Label>
      <div className="level-meter__track">
        <div ref={ref} className="level-meter__bar" />
      </div>
    </div>
  );
});
