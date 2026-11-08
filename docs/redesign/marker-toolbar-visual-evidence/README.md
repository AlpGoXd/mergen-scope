# Marker toolbar visual comparison

Captured Chromium at 1440 × 900 using system light and dark themes. `comparison-{empty,populated,armed}.png` places board 40-T1 alongside both captures; the individual PNGs retain full resolution. The populated and armed captures use `cascaded chain.s2p`, so chart data differs from the reference. Reference README, 00–03, 40-T1 and spec-v3 were consulted.

- Fixed: hint reservation follows actual longest hint text; long trace names no longer widen the selector indefinitely. All groups fit one row in these 1440 px captures, and marker and line arming preserve positions.
- Fixed: Escape cancels marker or line placement while a toolbar button has focus. The global keyboard handler otherwise ignores native controls.
- Intentional: strip height follows the written 32 px requirement rather than 40-T1's taller drawing; the capped selector may abbreviate a long selected trace name.
- Deferred to integrated Phase 7E: unlike 40-T1, empty hint space remains visible so controls do not jump; at narrower widths groups can wrap earlier than the board. The delta hint lacks the marker/reference identity shown in 03; footer wording differs from strip hint, and a chart ghost is not shown in this stationary cursor capture. The surrounding top bar still includes Right and Clear All, and layout/export are disabled. Responsive 1024/1280 and delta-armed comparisons remain unverified.
- Test: `marker-toolbar-visual.spec.ts` checks light/dark 1440 px populated row fit, stable marker/line positions, pressed state and Escape cancellation; it does not cover delta wording or all focus contexts.
