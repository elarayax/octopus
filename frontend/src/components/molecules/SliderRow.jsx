import { Label, Slider } from '../atoms';

export function SliderRow({ id, label, value, onChange, accent }) {
  return (
    <div className="slider-row">
      <Label htmlFor={id}>{label}</Label>
      <Slider id={id} value={value} onChange={onChange} accent={accent} />
      <span className="slider-row__value">{Math.round(value * 100)}%</span>
    </div>
  );
}
