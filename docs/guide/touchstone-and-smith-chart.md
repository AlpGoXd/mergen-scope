# Touchstone files and the Smith chart

Mergen Scope opens Touchstone S-parameter files from a VNA, from `.s1p` through `.s16p`.

## Network views

- S, Y and Z parameters, and ABCD for two-port networks.
- Display formats: dB, magnitude and phase.
- VSWR, return loss and group delay are also available as views.

## Smith chart

A Smith pane shows reflections (S11, S22, ...) as impedance. It has a frequency range bar and readouts of impedance Z, reflection coefficient Γ and VSWR as you point at a trace.

Γ is the reflection coefficient, Γ = (Z − Z₀) / (Z + Z₀), shown as magnitude ∠ angle and referred to the reference impedance Z₀ (50 Ω unless the file says otherwise). The readouts show Z₀ next to it. The Z grid and the Y grid are two views of the same Γ: the Y grid is the Z grid rotated 180°, so the value of Γ does not change when you switch between them. With the Z + Y grid, the hover readout shows both Z and Y.

## Network analysis

For two-port networks, **Stability** reports K and μ, and **Reciprocity / Isolation** compares S21 and S12. See [Analysis tools](analysis-tools.md) for details and limits.

## Related

- [User guide](README.md)
- [Opening an oscilloscope CSV file](oscilloscope-csv.md)
- [R&S spectrum analyzer .DAT files](rs-spectrum-analyzer-dat.md)
