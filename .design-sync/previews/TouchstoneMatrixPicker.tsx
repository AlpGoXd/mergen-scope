import { TouchstoneMatrixPicker } from 'mergen-scope';

export function TwoPort() {
  return (
    <TouchstoneMatrixPicker
      portCount={2}
      family="S"
      view="dB"
      onToggle={() => {}}
    />
  );
}

export function FourPort() {
  return (
    <TouchstoneMatrixPicker
      portCount={4}
      family="S"
      view="Mag"
      onToggle={() => {}}
    />
  );
}
