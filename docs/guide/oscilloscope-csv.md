# Opening an oscilloscope CSV file

Mergen Scope opens oscilloscope waveform exports and other column data saved as CSV, TXT or TSV. Nothing is uploaded: the file is read in your browser.

## Import a waveform

1. [Open the app](https://mergenscope.com/app.html) and drop the file into the workspace (or use **Open**).
2. The import wizard detects the delimiter (comma, semicolon or tab) and the header rows to skip. Check both in the preview.
3. Choose the X column and one or more Y columns. Set units and multipliers, and pick the time or frequency domain.

A typical two-channel export looks like this:

```text
time,signal_1kHz,signal_5kHz
0.000000,0.000000,0.000000
0.000100,0.628319,0.951057
0.000200,0.951057,0.587785
```

Blank or non-numeric cells are skipped: a row without a valid X value is dropped, and a missing Y value drops only that channel's point. Files over 50 MB ask before opening, and files over 500 MB are refused.

## Inspect and analyze

- Place markers on the traces and read values in the sidebar.
- **Waveform** measures time-domain traces.
- Evenly spaced time samples can go through **FFT**; analyze the resulting spectrum with **Harmonics**.
- [Trace math](trace-math.md) combines two traces.
- Export plots (PNG, SVG, PDF, LaTeX) or the data as CSV.

Each analysis tool has input requirements and says why when it can't run; see [Analysis tools](analysis-tools.md).

## Related

- [User guide](README.md)
- [Touchstone files and the Smith chart](touchstone-and-smith-chart.md)
- [R&S spectrum analyzer .DAT files](rs-spectrum-analyzer-dat.md)
