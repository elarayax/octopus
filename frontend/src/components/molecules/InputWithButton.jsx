import { Input, Button } from '../atoms';

export function InputWithButton({
  value,
  onChange,
  placeholder,
  buttonLabel,
  onSubmit,
  variant = 'neutral',
  submitOnEnter = false,
  inputClassName = '',
}) {
  return (
    <div className="input-with-button">
      <Input
        className={inputClassName}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => submitOnEnter && e.key === 'Enter' && onSubmit()}
      />
      <Button variant={variant} onClick={onSubmit}>
        {buttonLabel}
      </Button>
    </div>
  );
}
