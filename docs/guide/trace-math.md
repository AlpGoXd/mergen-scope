# Trace math

Trace math combines two traces point by point: **A + B**, **A − B**, **A × B**, **A ÷ B**. It is a math tool, so the result is a new trace, not a number.

What sets it apart is that it checks your units. Adding two dBm traces is a classic mistake (dB values are logarithmic, so the sum is not a power), and Mergen Scope tells you so. **It warns; it never blocks.** The result is still computed, but its unit is left empty so nothing downstream treats it as a trusted quantity.

## Using it

1. In the Analysis panel choose **+ Add analysis › Trace math**.
2. Pick **Trace A** and **Trace B**, then the **Operation**. Until both are picked the card says *Pick trace A and trace B.*
3. If the traces do not share the same X points, choose **Points** and **Fill gaps** (see below).
4. Click **Create trace**. The new trace appears under its input trace, in the same panes.

The created trace updates when its inputs or settings change. To keep a fixed copy, use the card's **⋯ › Freeze as a copy**.

## Lining up the X axes

- **Same X points:** the traces are combined point by point and nothing else is asked.
- **Different X points:** the card shows a *Stimulus mismatch* message with each trace's point count and X range, and you must choose:
  - **Points**: use **A**'s points, **B**'s points, or **Both** (the union of the two sets).
  - **Fill gaps**: how the other trace is sampled at those X values: **linear**, **cubic**, **nearest**, **previous**, **next** or **sinc**.

  There is no default; the card does not guess for you.
- **Overlap only:** a result is computed only where both traces exist. Nothing is extrapolated.
- **Refused outright**, with the reason on the card:
  - A time trace (s) with a frequency trace (Hz): *Cannot combine a time trace (s) with a frequency trace (Hz).*
  - Traces that do not overlap in X: *The traces do not overlap in X, nothing to combine.*
- **Skipped points:** a point is dropped when the result is not a finite number, and division drops points where B is exactly 0. If nothing is left the card says *No valid points to combine.*
- **Touchstone traces:** a trace taken straight from S-parameter data has its gaps filled on the complex values, which are then converted to the displayed view (magnitude in dB or linear, phase, real, imaginary, VSWR, return loss). Interpolating dB or degrees directly would give the wrong curve.

## Unit rules

The output unit follows from the two input units. Units are compared ignoring case and spaces. "Level" means a dB value with a reference; "ratio" means plain **dB** (a gain or loss).

Recognised level units: **dBm**, **dBW**, **dBV**, **dBmV**, **dBµV**.

### Logarithmic (dB) traces

| A | op | B | Result |
| --- | --- | --- | --- |
| dB (ratio) | + | dB | **dB** (gain + gain) |
| level | + | dB | **the level's unit** (power + gain) |
| dB | + | level | **the level's unit** |
| level | + | level | warning: *convert to linear (W) first to add powers* |
| dB | − | dB | **dB** |
| level | − | dB | **the level's unit** (power − gain) |
| level | − | level, same unit | **dB** (a difference between two levels is a ratio) |
| level | − | level, different units | warning: *have different references* (for example dBm − dBW) |
| dB | − | level | warning, no unit |
| anything dB | × or ÷ | anything | warning: *values in dB are added and subtracted, not multiplied or divided* |

### Linear traces

| A | op | B | Result |
| --- | --- | --- | --- |
| V | + or − | V | **V** |
| V | × | V | **V²** |
| V | ÷ | V | **no unit** (a plain ratio) |
| V | any | W (a different unit) | warning, no unit |

The same rule holds for any unit: both sides must be the same unit. Prefixed units are not converted, so `V + mV` warns instead of rescaling; convert one side first.

### Missing units

- Neither trace has a unit: the result is a plain number.
- Only one has a unit: warning (*one trace has no unit*), no unit on the output.

### What the warning looks like

Examples of the message shown on the card:

- `dBm + dBm has no meaningful unit: convert to linear (W) first to add powers.`
- `V + A has no meaningful unit.`
- `dBm − dBW has no meaningful unit: dBm and dBW have different references.`

When a combination has no meaningful unit, the result trace has no unit and its axis shows "–".

## Why these rules

dB is a logarithm, so adding two dBm values multiplies their powers, which is almost never what you want. Gains and losses (dB) do add to a level, and the difference of two levels is a ratio in dB. For linear units the dimensional rules from physics apply: V × V is V², V ÷ V has no unit.

The rules live in one place, `src/domain/trace-math-units.ts`, and are covered by the unit tests `tests/unit/trace-math-units*.test.ts`. If you change the rules, update this page as well.
