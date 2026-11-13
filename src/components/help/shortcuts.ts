export const APP_VERSION = '1.0.0-beta.1';
/** Keyboard shortcuts and mouse hints live in src/domain/shortcuts.ts (one registry for binding and Help). */
export function feedbackUrl(kind: 'problem' | 'idea'): string {
  const title = kind === 'problem' ? 'Problem: ' : 'Idea: ';
  const prompt = kind === 'problem' ? 'What happened?\n\nWhat did you expect?' : 'Describe your idea:';
  const body = `${prompt}\n\nApp version: ${APP_VERSION}\nBrowser / OS: ${navigator.userAgent}`;
  return `https://github.com/AlpGoXd/mergen-scope/issues/new?${new URLSearchParams({ title, body })}`;
}
