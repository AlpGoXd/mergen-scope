# Colour values

## Normal contrast

Surface, border, plot and text roles share their lightness and chroma across tints. Mist uses zero chroma for those roles and a low-chroma cool silver for selection. Sand and Ocean use their listed light accent and on-ink chroma. Raised surfaces are used for small controls, file cards and headers. Plot is used by live Chart, Smith and Table panes, with border-coloured grids and muted axes. Selection and links follow the tint. Toolbar zones and the Left and Analysis chips keep their own tones. The target pane has a tinted header, a 2 px accent top edge, and a bold name. The header-only treatment keeps the other three edges in the plain border colour.

Storm (hue 255):
  --bg: oklch(0.985 0.006 255) | oklch(0.170 0.014 255)
  --panel: oklch(0.965 0.012 255) | oklch(0.200 0.016 255)
  --raised: oklch(0.978 0.012 255) | oklch(0.250 0.020 255)
  --plot: oklch(0.996 0.003 255) | oklch(0.150 0.008 255)
  --border: oklch(0.900 0.016 255) | oklch(0.310 0.020 255)
  --border-strong: oklch(0.780 0.022 255) | oklch(0.420 0.022 255)
  --text: oklch(0.220 0.016 255) | oklch(0.930 0.012 255)
  --text-muted: oklch(0.500 0.012 255) | oklch(0.720 0.014 255)
  --accent: oklch(0.500 0.130 255) | oklch(0.740 0.110 255)
  --on-fill: oklch(0.920 0.035 255) | oklch(0.340 0.050 255)
  --on-ink: oklch(0.320 0.070 255) | oklch(0.930 0.030 255)
  --on-line: oklch(0.800 0.050 255) | oklch(0.500 0.070 255)

Sand (hue 70):
  --bg: oklch(0.985 0.006 70) | oklch(0.170 0.014 70)
  --panel: oklch(0.965 0.012 70) | oklch(0.200 0.016 70)
  --raised: oklch(0.978 0.012 70) | oklch(0.250 0.020 70)
  --plot: oklch(0.996 0.003 70) | oklch(0.150 0.008 70)
  --border: oklch(0.900 0.016 70) | oklch(0.310 0.020 70)
  --border-strong: oklch(0.780 0.022 70) | oklch(0.420 0.022 70)
  --text: oklch(0.220 0.016 70) | oklch(0.930 0.012 70)
  --text-muted: oklch(0.500 0.012 70) | oklch(0.720 0.014 70)
  --accent: oklch(0.500 0.108 70) | oklch(0.740 0.110 70)
  --on-fill: oklch(0.920 0.035 70) | oklch(0.340 0.050 70)
  --on-ink: oklch(0.320 0.068 70) | oklch(0.930 0.030 70)
  --on-line: oklch(0.800 0.050 70) | oklch(0.500 0.070 70)

Mist (hue 255):
  --bg: oklch(0.985 0.000 255) | oklch(0.170 0.000 255)
  --panel: oklch(0.965 0.000 255) | oklch(0.200 0.000 255)
  --raised: oklch(0.978 0.000 255) | oklch(0.250 0.000 255)
  --plot: oklch(0.996 0.000 255) | oklch(0.150 0.000 255)
  --border: oklch(0.900 0.000 255) | oklch(0.310 0.000 255)
  --border-strong: oklch(0.780 0.000 255) | oklch(0.420 0.000 255)
  --text: oklch(0.220 0.000 255) | oklch(0.930 0.000 255)
  --text-muted: oklch(0.500 0.000 255) | oklch(0.720 0.000 255)
  --accent: oklch(0.500 0.026 255) | oklch(0.740 0.022 255)
  --on-fill: oklch(0.920 0.007 255) | oklch(0.340 0.010 255)
  --on-ink: oklch(0.320 0.014 255) | oklch(0.930 0.006 255)
  --on-line: oklch(0.800 0.010 255) | oklch(0.500 0.014 255)

Ocean (hue 222):
  --bg: oklch(0.985 0.006 222) | oklch(0.170 0.014 222)
  --panel: oklch(0.965 0.012 222) | oklch(0.200 0.016 222)
  --raised: oklch(0.978 0.012 222) | oklch(0.250 0.020 222)
  --plot: oklch(0.996 0.003 222) | oklch(0.150 0.008 222)
  --border: oklch(0.900 0.016 222) | oklch(0.310 0.020 222)
  --border-strong: oklch(0.780 0.022 222) | oklch(0.420 0.022 222)
  --text: oklch(0.220 0.016 222) | oklch(0.930 0.012 222)
  --text-muted: oklch(0.500 0.012 222) | oklch(0.720 0.014 222)
  --accent: oklch(0.500 0.092 222) | oklch(0.740 0.110 222)
  --on-fill: oklch(0.920 0.035 222) | oklch(0.340 0.050 222)
  --on-ink: oklch(0.320 0.058 222) | oklch(0.930 0.030 222)
  --on-line: oklch(0.800 0.050 222) | oklch(0.500 0.070 222)

Moss (hue 150):
  --bg: oklch(0.985 0.006 150) | oklch(0.170 0.014 150)
  --panel: oklch(0.965 0.012 150) | oklch(0.200 0.016 150)
  --raised: oklch(0.978 0.012 150) | oklch(0.250 0.020 150)
  --plot: oklch(0.996 0.003 150) | oklch(0.150 0.008 150)
  --border: oklch(0.900 0.016 150) | oklch(0.310 0.020 150)
  --border-strong: oklch(0.780 0.022 150) | oklch(0.420 0.022 150)
  --text: oklch(0.220 0.016 150) | oklch(0.930 0.012 150)
  --text-muted: oklch(0.500 0.012 150) | oklch(0.720 0.014 150)
  --accent: oklch(0.500 0.130 150) | oklch(0.740 0.110 150)
  --on-fill: oklch(0.920 0.035 150) | oklch(0.340 0.050 150)
  --on-ink: oklch(0.320 0.070 150) | oklch(0.930 0.030 150)
  --on-line: oklch(0.800 0.050 150) | oklch(0.500 0.070 150)

Amethyst (hue 300):
  --bg: oklch(0.985 0.006 300) | oklch(0.170 0.014 300)
  --panel: oklch(0.965 0.012 300) | oklch(0.200 0.016 300)
  --raised: oklch(0.978 0.012 300) | oklch(0.250 0.020 300)
  --plot: oklch(0.996 0.003 300) | oklch(0.150 0.008 300)
  --border: oklch(0.900 0.016 300) | oklch(0.310 0.020 300)
  --border-strong: oklch(0.780 0.022 300) | oklch(0.420 0.022 300)
  --text: oklch(0.220 0.016 300) | oklch(0.930 0.012 300)
  --text-muted: oklch(0.500 0.012 300) | oklch(0.720 0.014 300)
  --accent: oklch(0.500 0.130 300) | oklch(0.740 0.110 300)
  --on-fill: oklch(0.920 0.035 300) | oklch(0.340 0.050 300)
  --on-ink: oklch(0.320 0.070 300) | oklch(0.930 0.030 300)
  --on-line: oklch(0.800 0.050 300) | oklch(0.500 0.070 300)

Sakura (hue 355):
  --bg: oklch(0.985 0.006 355) | oklch(0.170 0.014 355)
  --panel: oklch(0.965 0.012 355) | oklch(0.200 0.016 355)
  --raised: oklch(0.978 0.012 355) | oklch(0.250 0.020 355)
  --plot: oklch(0.996 0.003 355) | oklch(0.150 0.008 355)
  --border: oklch(0.900 0.016 355) | oklch(0.310 0.020 355)
  --border-strong: oklch(0.780 0.022 355) | oklch(0.420 0.022 355)
  --text: oklch(0.220 0.016 355) | oklch(0.930 0.012 355)
  --text-muted: oklch(0.500 0.012 355) | oklch(0.720 0.014 355)
  --accent: oklch(0.500 0.130 355) | oklch(0.740 0.110 355)
  --on-fill: oklch(0.920 0.035 355) | oklch(0.340 0.050 355)
  --on-ink: oklch(0.320 0.070 355) | oklch(0.930 0.030 355)
  --on-line: oklch(0.800 0.050 355) | oklch(0.500 0.070 355)

Ember (hue 25):
  --bg: oklch(0.985 0.006 25) | oklch(0.170 0.014 25)
  --panel: oklch(0.965 0.012 25) | oklch(0.200 0.016 25)
  --raised: oklch(0.978 0.012 25) | oklch(0.250 0.020 25)
  --plot: oklch(0.996 0.003 25) | oklch(0.150 0.008 25)
  --border: oklch(0.900 0.016 25) | oklch(0.310 0.020 25)
  --border-strong: oklch(0.780 0.022 25) | oklch(0.420 0.022 25)
  --text: oklch(0.220 0.016 25) | oklch(0.930 0.012 25)
  --text-muted: oklch(0.500 0.012 25) | oklch(0.720 0.014 25)
  --accent: oklch(0.500 0.130 25) | oklch(0.740 0.110 25)
  --on-fill: oklch(0.920 0.035 25) | oklch(0.340 0.050 25)
  --on-ink: oklch(0.320 0.070 25) | oklch(0.930 0.030 25)
  --on-line: oklch(0.800 0.050 25) | oklch(0.500 0.070 25)

## High contrast

Plot uses the background. Small on controls use the high-contrast tinted accent fill and border, background-coloured labels and bold weight (WCAG AAA ≥ 10:1). Larger selections keep their regular text and swatches with a 2 px accent border. The target header uses accent fill and background-coloured labels within a 1.5 px accent pane border. Focus rings are 3 px with a 2 px offset, and links are underlined in the accent colour. Matrix diagonals have a strong border and bold label. Unavailable cells are striped and struck through, with the reason retained. Count badges use the inverted accent colours. The mark and Scope word use the accent colour, with a 2.2 stroke and Scope at weight 800.

Storm:
  --bg: oklch(0.990 0.003 255) | oklch(0.100 0.008 255)
  --panel: oklch(0.970 0.005 255) | oklch(0.140 0.008 255)
  --raised: oklch(1.000 0.001 255) | oklch(0.180 0.008 255)
  --border: oklch(0.620 0.005 255) | oklch(0.620 0.008 255)
  --border-strong: oklch(0.450 0.005 255) | oklch(0.800 0.008 255)
  --text: oklch(0.120 0.007 255) | oklch(0.980 0.008 255)
  --text-muted: oklch(0.300 0.005 255) | oklch(0.860 0.008 255)
  --accent: oklch(0.350 0.115 255) | oklch(0.840 0.080 255)

Sand:
  --bg: oklch(0.990 0.003 70) | oklch(0.100 0.006 70)
  --panel: oklch(0.970 0.004 70) | oklch(0.140 0.006 70)
  --raised: oklch(1.000 0.000 70) | oklch(0.180 0.006 70)
  --border: oklch(0.620 0.004 70) | oklch(0.620 0.006 70)
  --border-strong: oklch(0.450 0.004 70) | oklch(0.800 0.006 70)
  --text: oklch(0.120 0.006 70) | oklch(0.980 0.006 70)
  --text-muted: oklch(0.300 0.004 70) | oklch(0.860 0.006 70)
  --accent: oklch(0.350 0.075 70) | oklch(0.840 0.110 70)

Mist:
  --bg: oklch(0.990 0.000 255) | oklch(0.100 0.000 255)
  --panel: oklch(0.970 0.000 255) | oklch(0.140 0.000 255)
  --raised: oklch(1.000 0.000 255) | oklch(0.180 0.000 255)
  --border: oklch(0.620 0.000 255) | oklch(0.620 0.000 255)
  --border-strong: oklch(0.450 0.000 255) | oklch(0.800 0.000 255)
  --text: oklch(0.120 0.000 255) | oklch(0.980 0.000 255)
  --text-muted: oklch(0.300 0.000 255) | oklch(0.860 0.000 255)
  --accent: oklch(0.350 0.020 255) | oklch(0.840 0.020 255)

Ocean:
  --bg: oklch(0.990 0.005 222) | oklch(0.100 0.016 222)
  --panel: oklch(0.970 0.011 222) | oklch(0.140 0.018 222)
  --raised: oklch(1.000 0.001 222) | oklch(0.180 0.022 222)
  --border: oklch(0.620 0.015 222) | oklch(0.620 0.024 222)
  --border-strong: oklch(0.450 0.015 222) | oklch(0.800 0.024 222)
  --text: oklch(0.120 0.012 222) | oklch(0.980 0.013 222)
  --text-muted: oklch(0.300 0.008 222) | oklch(0.860 0.013 222)
  --accent: oklch(0.350 0.064 222) | oklch(0.840 0.110 222)

Moss:
  --bg: oklch(0.990 0.008 150) | oklch(0.100 0.021 150)
  --panel: oklch(0.970 0.013 150) | oklch(0.140 0.021 150)
  --raised: oklch(1.000 0.002 150) | oklch(0.180 0.021 150)
  --border: oklch(0.620 0.013 150) | oklch(0.620 0.021 150)
  --border-strong: oklch(0.450 0.013 150) | oklch(0.800 0.021 150)
  --text: oklch(0.120 0.011 150) | oklch(0.980 0.011 150)
  --text-muted: oklch(0.300 0.007 150) | oklch(0.860 0.011 150)
  --accent: oklch(0.350 0.096 150) | oklch(0.840 0.110 150)

Amethyst:
  --bg: oklch(0.990 0.006 300) | oklch(0.100 0.025 300)
  --panel: oklch(0.970 0.018 300) | oklch(0.140 0.025 300)
  --raised: oklch(1.000 0.002 300) | oklch(0.180 0.025 300)
  --border: oklch(0.620 0.028 300) | oklch(0.620 0.025 300)
  --border-strong: oklch(0.450 0.037 300) | oklch(0.800 0.025 300)
  --text: oklch(0.120 0.013 300) | oklch(0.980 0.013 300)
  --text-muted: oklch(0.300 0.009 300) | oklch(0.860 0.013 300)
  --accent: oklch(0.350 0.130 300) | oklch(0.840 0.093 300)

Sakura:
  --bg: oklch(0.990 0.006 355) | oklch(0.100 0.022 355)
  --panel: oklch(0.970 0.016 355) | oklch(0.140 0.022 355)
  --raised: oklch(1.000 0.002 355) | oklch(0.180 0.022 355)
  --border: oklch(0.620 0.024 355) | oklch(0.620 0.022 355)
  --border-strong: oklch(0.450 0.033 355) | oklch(0.800 0.022 355)
  --text: oklch(0.120 0.011 355) | oklch(0.980 0.012 355)
  --text-muted: oklch(0.300 0.007 355) | oklch(0.860 0.012 355)
  --accent: oklch(0.350 0.130 355) | oklch(0.840 0.099 355)

Ember:
  --bg: oklch(0.990 0.006 25) | oklch(0.100 0.022 25)
  --panel: oklch(0.970 0.016 25) | oklch(0.140 0.022 25)
  --raised: oklch(1.000 0.002 25) | oklch(0.180 0.022 25)
  --border: oklch(0.620 0.024 25) | oklch(0.620 0.022 25)
  --border-strong: oklch(0.450 0.033 25) | oklch(0.800 0.022 25)
  --text: oklch(0.120 0.011 25) | oklch(0.980 0.012 25)
  --text-muted: oklch(0.300 0.007 25) | oklch(0.860 0.012 25)
  --accent: oklch(0.350 0.130 25) | oklch(0.840 0.087 25)

## Colour-blind Palette A

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

## Logo

Scope uses the accent and Mergen uses the text colour. The favicon uses the Storm pair. The mark uses these line and triangle colours in normal contrast.

| Tint | Light line | Dark line | Light marker | Dark marker |
| --- | --- | --- | --- | --- |
| Storm | `oklch(0.580 0.160 270)` | `oklch(0.750 0.127 270)` | `oklch(0.600 0.180 21)` | `oklch(0.700 0.160 21)` |
| Sand | `oklch(0.580 0.118 90)` | `oklch(0.750 0.127 90)` | `oklch(0.600 0.180 21)` | `oklch(0.700 0.160 21)` |
| Mist | `oklch(0.520 0.026 255)` | `oklch(0.740 0.022 255)` | `oklch(0.600 0.180 21)` | `oklch(0.700 0.160 21)` |
| Ocean | `oklch(0.580 0.108 225)` | `oklch(0.750 0.127 225)` | `oklch(0.600 0.180 21)` | `oklch(0.700 0.160 21)` |
| Moss | `oklch(0.580 0.160 135)` | `oklch(0.750 0.127 135)` | `oklch(0.600 0.180 21)` | `oklch(0.700 0.160 21)` |
| Amethyst | `oklch(0.580 0.160 315)` | `oklch(0.750 0.127 315)` | `oklch(0.600 0.180 21)` | `oklch(0.700 0.160 21)` |
| Sakura | `oklch(0.580 0.160 0)` | `oklch(0.750 0.127 0)` | `oklch(0.580 0.108 225)` | `oklch(0.750 0.127 225)` |
| Ember | `oklch(0.580 0.160 45)` | `oklch(0.750 0.127 45)` | `oklch(0.580 0.108 225)` | `oklch(0.750 0.127 225)` |

## Sharper high-contrast colours

Toolbar and panel tones keep their hues (Marker 20, Lines 80, Search 140, Pane 200, Left 230, Analysis 310, Export 160, Data 350). Light and dark zone L/C values are 0.93/0.05 and 0.22/0.06. Pressed fill uses 0.87/0.09 and 0.32/0.10, 1.5 px borders use 0.42/0.15 and 0.80/0.14, and ink uses 0.28/0.13 and 0.96/0.05. Armed tools use 0.42/0.16 with white text or 0.82/0.15 with 0.12/0.01 ink at the same hue. Danger, Warning, Success and Info use the same tint, line and ink values at their existing hues. Chroma is capped to sRGB.

Standard source strokes keep the original hue order.

| Hue | Light | Dark |
| --- | --- | --- |
| 270 | `oklch(0.480 0.220 270)` | `oklch(0.820 0.088 270)` |
| 0 | `oklch(0.480 0.194 0)` | `oklch(0.820 0.108 0)` |
| 90 | `oklch(0.480 0.098 90)` | `oklch(0.820 0.166 90)` |
| 180 | `oklch(0.480 0.086 180)` | `oklch(0.820 0.148 180)` |
| 315 | `oklch(0.480 0.220 315)` | `oklch(0.820 0.132 315)` |
| 45 | `oklch(0.480 0.136 45)` | `oklch(0.820 0.108 45)` |
| 135 | `oklch(0.480 0.140 135)` | `oklch(0.820 0.180 135)` |
| 225 | `oklch(0.480 0.090 225)` | `oklch(0.820 0.120 225)` |

Palette A sources keep their hue. Lightness drops by 0.06 in light mode (bounded by 0.30 and 0.52) and rises by 0.05 in dark mode (bounded by 0.72 and 0.92). Chroma is multiplied by 1.15 and capped to sRGB. Created traces use the normal lightness step from the sharpened parent. If that step would fall below 4.5:1 against a plot, lightness is adjusted just enough to meet the contrast floor. The export palette is independent of the live contrast setting.
