# R&S spectrum analyzer .DAT files

Drop a Rohde & Schwarz spectrum analyzer `.DAT` export into the workspace to open it. The parser reads the traces and their metadata, including centre, span, RBW and detector. Files with several traces open as several traces.

This path is tested with R&S FSVA3044 exports. Other instruments may work but are untested. If a file doesn't open as expected, [open an issue](https://github.com/AlpGoXd/mergen-scope/issues/new/choose) and attach the file if you can (attached files are public).

## Analyze a spectrum

Use markers and peak search, or add analysis cards such as **IP3**, **Channel power**, **Occupied bandwidth** and **Noise PSD**. Each tool has input requirements; see [Analysis tools](analysis-tools.md).

## Related

- [User guide](README.md)
- [Opening an oscilloscope CSV file](oscilloscope-csv.md)
- [Touchstone files and the Smith chart](touchstone-and-smith-chart.md)
