# Analysis tools

Open **+ Add analysis** in the Analysis panel. The list shows every tool that can be added; a tool that cannot run on the selected trace is disabled and says why. Each card repeats the reason when its input stops fitting (for example after you change the trace).

Tools come in two kinds:

- **Measure** tools report numbers or a table, and draw outlines on the chart while the card is open.
- **Math** tools create a new trace. See [Trace math](trace-math.md) for the one that combines two traces.

Several tools have a **Range** setting: *visible* uses only the X range currently shown in the trace's pane, *all* uses every sample.

## Spectrum and RF

| Tool | Needs | Settings | Reports |
| --- | --- | --- | --- |
| **Peak Table** | any trace | Minimum spacing (X units, default 0), Count (1 to 50, default 10) | Ranked peaks with X and Y. Numbered triangles on the chart. |
| **Range Statistics** | any trace | Range | Max and min (each with its X), average, span, sample count. |
| **Bandwidth** | any trace | Drop (dB, default 3) | Width at the drop below the trace's highest point, plus centre, left and right edges. A band with edge ticks on the chart. |
| **Ripple** | any trace | none | Peak-to-peak variation (max − min), with max, min and span. |
| **Threshold crossings** | any trace | Level | Every X where the trace crosses the level. |
| **Line crossings** | a reference line | none | Intersections of a reference line with the traces, per pane. Created from a reference line, so it is not in the Add analysis list. |
| **Noise PSD** | a spectrum trace | Filter: Gaussian, Flat-top, 5-pole Sync | Peak, average and minimum of the noise density, and the RBW. The density curve is overlaid. |
| **Channel power** | a trace in dBm/Hz or dBW/Hz | Bandwidth (Hz); 0 means the whole trace, otherwise a window centred on the trace | Total power in dBm and dBW. |
| **Occupied bandwidth** | a trace in dBm or dBW | Percent (default 99) | Lower and upper edge and the bandwidth that contains that percentage of the power. |
| **IP3** | four role markers: F1, F2, IM3L, IM3U | Gain (dB, default 0) | OIP3 from each side and the average, the IM3 frequencies and the tone-to-product differences. IIP3 is OIP3 minus the gain. |
| **Harmonics** | a spectrum in dB, V or W units | Harmonics (5, 10 or all), Fundamental (auto, or the largest tone near a frequency) | THD, SFDR, noise floor and the level of each harmonic in dBc; harmonics folded above Nyquist are flagged as aliased. See below for SNR, SINAD, ENOB. |

Notes:

- **Noise PSD** subtracts `10·log10(k·RBW)` from each sample, with k = 1.128 (Gaussian), 1.0 (Flat-top) or 1.047 (5-pole Sync). The RBW is taken from the median spacing of the X values, so it is an estimate for traces that do not carry it.
- **Channel power** and **Occupied bandwidth** convert the samples to linear power and integrate along X. They state the unit they need rather than guessing: Channel power asks for a density (dBm/Hz or dBW/Hz), Occupied bandwidth for a power level (dBm or dBW). Occupied bandwidth falls back to 99 % if the percentage is outside 0 to 100 (exclusive).
- **IP3** reads the four role markers (F1, F2, IM3L, IM3U). If they are missing, the card asks for them and offers **Auto-place markers**, which finds the two tones and their third-order products. Each marker belongs to one trace, so each pane can have its own IP3.
- **Harmonics** reads a tone two ways. On an FFT made by this app's FFT card, it knows the window, so it also reports **THD+N, SNR, SINAD and ENOB**. On any other spectrum, such as an analyzer sweep, the peak bin is the tone's power (as an analyzer reads it) and the noise bandwidth per bin is unknown, so those four are not reported. THD, SFDR and the noise floor are always given.

## Time domain

| Tool | Needs | Settings | Output |
| --- | --- | --- | --- |
| **Waveform** | a time trace | Range | Frequency, period, peak-to-peak, max, min, mean, RMS, rise and fall time, overshoot, duty cycle, sample count. Outlines the 10 % and 90 % levels around one rising edge and one measured period. |
| **Resample** | a time trace | Method: linear or cubic | A new, evenly spaced copy of the trace. |
| **FFT** | a time trace with evenly spaced samples | see below | A new spectrum trace plus the numbers that describe it. |

**FFT** settings:

- **Window:** Hann (default), rectangular, Hamming, Blackman, Blackman-Harris (3, 4 or 7 terms), Nuttall, Blackman-Nuttall, flat-top, Kaiser (β), Gaussian (σ), Tukey (α), Chebyshev (sidelobe level).
- **Points:** auto, or 64 up to 65536.
- **Averages:** off, 4, 16, 64, or max hold.
- **Range:** visible or all.
- **Scale:** dBV (default), V, dBm, dBmV, dBµV, dBV/Hz, V/√Hz, dBm/Hz. The dBm scales use an **Impedance** (default 50 Ω).
- **Detrend:** off, remove DC, or remove a linear trend.

Samples are read as volts; a trace in mV, µV or kV is scaled first. The card reports the fundamental, the bin width, the number of points and segments, and the window's ENBW, coherent gain, scalloping loss and sidelobe level. The created spectrum remembers its window so that **Harmonics** can compute exact tone power and noise from it.

A typical chain: `Time capture → Resample if needed → FFT → Harmonics / Peak Table / Channel power`.

## Networks (Touchstone)

Both tools need a **2-port** network and otherwise say *Requires a 2-port Touchstone network.*

| Tool | Reports |
| --- | --- |
| **Reciprocity / Isolation** | The worst reciprocity error (the largest gap between the S21 and S12 magnitudes, in dB, across frequency) with the average error; and the worst isolation, which is minus the larger of S21 and S12 in dB, so a larger number means better isolation. |
| **Stability** | The minimum Rollett K, the minimum μ and μ′, and the smallest and largest magnitude of Δ over frequency, plus how many frequency points are not unconditionally stable. |

The Smith chart, VSWR, return loss and group delay are pane views rather than cards; they get their own guide page.

## Trace transforms (math tools)

| Tool | Settings | Output |
| --- | --- | --- |
| **Offset / Scale** | Offset (default 0), Scale (default 1) | A trace with `y × scale + offset`. |
| **Smooth** | Method: none, moving average, median, Savitzky-Golay; Window (default 11); SG order (default 2) | A smoothed copy of the trace. |
| **Trace math** | Operation, Points, Fill gaps | Two traces combined. Has its own page: [Trace math](trace-math.md). |

Like every math tool, these update when their input trace or settings change; **⋯ › Freeze as a copy** makes a fixed copy.
