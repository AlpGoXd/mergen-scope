import { Sec } from 'mergen-scope';

export function Default() {
  return (
    <div style={{ display: 'grid', gap: '10px', minWidth: '220px' }}>
      <Sec first>Trace Data</Sec>
      <div style={{ color: 'var(--text)', fontSize: 'var(--font-label)' }}>Section content goes here.</div>
      <Sec>Markers</Sec>
      <div style={{ color: 'var(--text)', fontSize: 'var(--font-label)' }}>More section content.</div>
    </div>
  );
}

export function StandaloneLabels() {
  return (
    <div style={{ display: 'grid', gap: '14px', minWidth: '220px' }}>
      <Sec first>Reference Lines</Sec>
      <Sec>Analysis</Sec>
      <Sec>Import / Export</Sec>
    </div>
  );
}
