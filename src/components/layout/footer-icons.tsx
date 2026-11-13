// Footer icons: 16 px line icons, 24 x 24 viewBox, 1.75 stroke, currentColor (same pattern as pane-type-icons.tsx).
export type FooterIconName = 'shield' | 'feedback' | 'settings' | 'help';

const PATHS: Record<FooterIconName, string> = {
  shield: 'M12 3l7 3v5c0 4.5-2.9 8.2-7 10-4.1-1.8-7-5.5-7-10V6zM9 12l2 2 4-4',
  feedback: 'M4 5h16v11H9l-5 4zM8 9.5h8M8 12.5h5',
  settings: 'M12 15.5a3.5 3.5 0 1 0 0.01 0M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14.2 3h-4.4l-.4 2.6a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2 1.2l.4 2.6h4.4l.4-2.6a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z',
  help: 'M12 21a9 9 0 1 0 0.01 0M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1.9-1.1 1.8M12 16.8v.2',
};

export function FooterIcon({ name }: { name: FooterIconName }) {
  return (
    <svg className="footer-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} />
    </svg>
  );
}
