NEUTRAL TINTS (token -> light | dark). strong = --border-strong, muted = --text-muted.
Slate:
  --bg: light oklch(0.985 0.006 255) | dark oklch(0.170 0.016 255)
  --panel: light oklch(0.965 0.010 255) | dark oklch(0.200 0.016 255)
  --raised: light oklch(0.997 0.001 255) | dark oklch(0.240 0.016 255)
  --border: light oklch(0.900 0.010 255) | dark oklch(0.310 0.016 255)
  --strong: light oklch(0.780 0.010 255) | dark oklch(0.420 0.016 255)
  --text: light oklch(0.220 0.015 255) | dark oklch(0.930 0.016 255)
  --muted: light oklch(0.500 0.010 255) | dark oklch(0.720 0.016 255)
Stone:
  --bg: light oklch(0.985 0.005 70) | dark oklch(0.170 0.013 70)
  --panel: light oklch(0.965 0.008 70) | dark oklch(0.200 0.013 70)
  --raised: light oklch(0.997 0.000 70) | dark oklch(0.240 0.013 70)
  --border: light oklch(0.900 0.008 70) | dark oklch(0.310 0.013 70)
  --strong: light oklch(0.780 0.008 70) | dark oklch(0.420 0.013 70)
  --text: light oklch(0.220 0.012 70) | dark oklch(0.930 0.013 70)
  --muted: light oklch(0.500 0.008 70) | dark oklch(0.720 0.013 70)
Zinc:
  --bg: light oklch(0.985 0 0) | dark oklch(0.170 0 0)
  --panel: light oklch(0.965 0 0) | dark oklch(0.200 0 0)
  --raised: light oklch(0.997 0 0) | dark oklch(0.240 0 0)
  --border: light oklch(0.900 0 0) | dark oklch(0.310 0 0)
  --strong: light oklch(0.780 0 0) | dark oklch(0.420 0 0)
  --text: light oklch(0.220 0 0) | dark oklch(0.930 0 0)
  --muted: light oklch(0.500 0 0) | dark oklch(0.720 0 0)
Ocean:
  --bg: light oklch(0.985 0.010 222) | dark oklch(0.170 0.032 222)
  --panel: light oklch(0.965 0.022 222) | dark oklch(0.200 0.036 222)
  --raised: light oklch(0.997 0.001 222) | dark oklch(0.240 0.044 222)
  --border: light oklch(0.900 0.030 222) | dark oklch(0.310 0.048 222)
  --strong: light oklch(0.780 0.030 222) | dark oklch(0.420 0.048 222)
  --text: light oklch(0.220 0.024 222) | dark oklch(0.930 0.026 222)
  --muted: light oklch(0.500 0.016 222) | dark oklch(0.720 0.026 222)
Moss:
  --bg: light oklch(0.985 0.016 150) | dark oklch(0.170 0.042 150)
  --panel: light oklch(0.965 0.026 150) | dark oklch(0.200 0.042 150)
  --raised: light oklch(0.997 0.004 150) | dark oklch(0.240 0.042 150)
  --border: light oklch(0.900 0.026 150) | dark oklch(0.310 0.042 150)
  --strong: light oklch(0.780 0.026 150) | dark oklch(0.420 0.042 150)
  --text: light oklch(0.220 0.021 150) | dark oklch(0.930 0.022 150)
  --muted: light oklch(0.500 0.014 150) | dark oklch(0.720 0.022 150)
Purple:
  --bg: light oklch(0.975 0.012 300) | dark oklch(0.170 0.051 300)
  --panel: light oklch(0.935 0.036 300) | dark oklch(0.200 0.051 300)
  --raised: light oklch(0.990 0.004 300) | dark oklch(0.240 0.051 300)
  --border: light oklch(0.860 0.055 300) | dark oklch(0.310 0.051 300)
  --strong: light oklch(0.720 0.075 300) | dark oklch(0.420 0.051 300)
  --text: light oklch(0.220 0.025 300) | dark oklch(0.930 0.027 300)
  --muted: light oklch(0.500 0.017 300) | dark oklch(0.720 0.027 300)
Pink:
  --bg: light oklch(0.978 0.012 355) | dark oklch(0.170 0.045 355)
  --panel: light oklch(0.940 0.032 355) | dark oklch(0.200 0.045 355)
  --raised: light oklch(0.990 0.004 355) | dark oklch(0.240 0.045 355)
  --border: light oklch(0.870 0.048 355) | dark oklch(0.310 0.045 355)
  --strong: light oklch(0.740 0.065 355) | dark oklch(0.420 0.045 355)
  --text: light oklch(0.220 0.022 355) | dark oklch(0.930 0.024 355)
  --muted: light oklch(0.500 0.015 355) | dark oklch(0.720 0.024 355)

HIGH CONTRAST (lightness values below; hue = the current tint's hue, chroma = half of that tint's chroma for the same token and theme; Zinc stays 0)
  --bg: light L 0.990 | dark L 0.100
  --panel: light L 0.970 | dark L 0.140
  --raised: light L 1.000 | dark L 0.180
  --border: light L 0.620 | dark L 0.620
  --strong: light L 0.450 | dark L 0.800
  --text: light L 0.120 | dark L 0.980
  --muted: light L 0.300 | dark L 0.860
  (Slate example, light: --bg oklch(0.990 0.003 255), --text oklch(0.120 0.008 255).)

COLOUR-BLIND PALETTE A, light theme, assignment order (source -> created trace):
  1. oklch(0.655 0.160 244) -> oklch(0.495 0.122 244)
  2. oklch(0.379 0.102 48) -> oklch(0.539 0.102 48)
  3. oklch(0.571 0.120 105) -> oklch(0.411 0.086 105)
  4. oklch(0.456 0.098 236) -> oklch(0.316 0.068 236)
  5. oklch(0.470 0.098 77) -> oklch(0.650 0.098 77)
  6. oklch(0.656 0 0) -> oklch(0.456 0 0)
  7. oklch(0.539 0.112 165) -> oklch(0.379 0.078 165)
  8. oklch(0.479 0.170 346) -> oklch(0.339 0.142 346)

COLOUR-BLIND PALETTE A, dark theme, assignment order (source -> created trace):
  1. oklch(0.695 0.170 244) -> oklch(0.495 0.122 244)
  2. oklch(0.888 0.098 77) -> oklch(0.648 0.098 77)
  3. oklch(0.745 0.158 105) -> oklch(0.505 0.106 105)
  4. oklch(0.839 0.092 236) -> oklch(0.679 0.092 236)
  5. oklch(0.726 0.170 346) -> oklch(0.526 0.170 346)
  6. oklch(0.822 0 0) -> oklch(0.622 0 0)
  7. oklch(0.807 0.118 48) -> oklch(0.587 0.118 48)
  8. oklch(0.920 0.122 165) -> oklch(0.760 0.122 165)
