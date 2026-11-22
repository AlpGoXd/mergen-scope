# Mergen Scope user guide

The guide describes what the app does and why it refuses or warns when it does. The [project README](../../README.md) is the short version; [`docs/design/`](../design/) holds internal design rationale and is not part of this guide.

## Pages

| Page | What it covers |
| --- | --- |
| [Opening an oscilloscope CSV file](oscilloscope-csv.md) | Importing CSV, TXT and TSV waveform or column data with the import wizard, then measuring it. |
| [Touchstone files and the Smith chart](touchstone-and-smith-chart.md) | `.s1p`–`.s16p` networks: S/Y/Z/ABCD views, the Smith chart and its readouts, two-port network tools. |
| [R&S spectrum analyzer .DAT files](rs-spectrum-analyzer-dat.md) | What is read from an R&S export, which instruments are tested, and the spectrum tools. |
| [Trace math](trace-math.md) | Combining two traces with +, −, ×, ÷: lining up different X points, and the unit rules that warn you about nonsense such as dBm + dBm. |
| [Analysis tools](analysis-tools.md) | Every tool in **+ Add analysis**: what it needs, what it reports, and the reason it gives when it cannot run. |

More pages (markers and lines, panes and layout, export, shortcuts, workspaces) are still to be written.

## How the pieces fit

- **Analysis cards** live in the right-hand Analysis panel. **+ Add analysis** lists only the tools that make sense for the selected trace; a tool that cannot run says why instead of failing silently.
- **Measure tools** (peak table, bandwidth, harmonics, ...) report numbers and draw hollow outlines on the chart while the card is open. They never place markers on their own.
- **Math tools** (FFT, resample, smooth, offset/scale, trace math) produce a new trace. The trace follows its inputs and settings; use the card's **⋯ › Freeze as a copy** to keep a fixed copy.
