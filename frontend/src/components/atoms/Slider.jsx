export function Slider({ value, onChange, accent, min = 0, max = 2, step = 0.1, ...rest }) {
  // --pct pinta la parte "rellena" del riel; --accent define su color
  const pct = ((value - min) / (max - min)) * 100;
  const style = { '--pct': `${pct}%`, ...(accent ? { '--accent': accent } : {}) };

  return (
    <input
      type="range"
      className="slider"
      min={min}
      max={max}
      step={step}
      value={value}
      style={style}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      {...rest}
    />
  );
}