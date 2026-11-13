// The Mergen Scope logo mark: two tones forming an M, with a marker on the first tone.
// Same drawing as the favicon (landing-assets/brand); sized in em so it follows the app size setting.
export function BrandMark() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      style={{ width: '1.4em', height: '1.4em', flexShrink: 0, display: 'block' }}
    >
      <path
        d="M0.75 21.05 1.1 21 1.45 20.95 1.8 20.88 2.16 20.81 2.51 20.73 2.86 20.63 3.21 20.51 3.56 20.37 3.91 20.21 4.27 20 4.62 19.73 4.97 19.39 5.32 18.95 5.67 18.35 6.02 17.53 6.38 16.38 6.73 14.74 7.08 12.49 7.43 9.77 7.78 7.47 8.13 6.95 8.48 7.39 8.84 8.3 9.19 9.47 9.54 10.68 9.89 11.81 10.24 12.78 10.59 13.56 10.95 14.15 11.3 14.56 11.65 14.8 12 14.88 12.35 14.8 12.7 14.56 13.05 14.15 13.41 13.56 13.76 12.78 14.11 11.81 14.46 10.68 14.81 9.47 15.16 8.3 15.52 7.39 15.87 6.95 16.22 7.47 16.57 9.77 16.92 12.49 17.27 14.74 17.62 16.38 17.98 17.53 18.33 18.35 18.68 18.95 19.03 19.39 19.38 19.73 19.73 20 20.09 20.21 20.44 20.37 20.79 20.51 21.14 20.63 21.49 20.73 21.84 20.81 22.2 20.88 22.55 20.95 22.9 21 23.25 21.05"
        fill="none"
        stroke="var(--accent)"
        strokeWidth={1.85}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M5.75 1.3 10.25 1.3 8 4.99Z" fill="var(--brand-marker)" stroke="var(--brand-marker)" strokeWidth={0.8} strokeLinejoin="round" />
    </svg>
  );
}
