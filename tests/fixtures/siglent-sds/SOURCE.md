# Siglent SDS `.bin` sample files

These `.bin` files are unmodified copies of the Siglent captures in the RigolWFM test suite:

- Repository: https://github.com/scottprahl/RigolWFM
- Commit: `9e6f993103f773f81df409fc65c2cc359d7bd249`
- Path: `tests/files/bin/SDS814X-*.bin`
- Copyright (c) 2020-23, Scott Prahl. Licensed under the BSD 3-Clause License (see `LICENSE.txt` in this folder).

RigolWFM describes them as real captures from a Siglent SDS814X HD. All are
Siglent **Binary Format V4.0** (version 4, 4 KiB header, data at byte 4096),
16-bit little-endian samples, 7680 codes per division, 10 horizontal divisions.

| File | SHA-256 | Contents |
| --- | --- | --- |
| `SDS814X-3v0-probe1x.bin` | `6804c02a8c2f32b2240230a34c90d03e2a9a3dc0218d820277084696ee879c70` | Signal with a 3.0 V high level, 1× probe, 1 V/div, 2000 points |
| `SDS814X-3v0-probe10x.bin` | `b221851039da0302e276241265fd1d2ffa6a2bf8e3e4c1341d31489eabc53ac1` | Same signal, 10× probe (0.1 V/div stored, 1 V/div shown) |
| `SDS814X-4v5-dc.bin` | `b84539c1e361a2d095cb0e32b1736b5ef3ebdb0da674a98fa1e990775583a970` | Flat 4.5 V DC, 10× probe, non-zero trigger delay, 10000 points |
| `SDS814X-amps-300ma.bin` | `adbd7e5718fb59b596561d0d8b5f640902c39025f5004648b2e3bed80d3e58de` | 300 mA level with the channel unit set to amps |
| `SDS814X-math-c1.bin` | `c03b6a254a84c6f00e5e8138a2d7b8480c20135176a4b159b9717490b8d5dd8e` | CH1 source of the math capture, 10000 points |
| `SDS814X-math-f1.bin` | `f77bdd487644583799b4cdf1f37c839a2716b1126ce56320a25b8a0452168030` | Math trace F1 = −2 × C1 saved on its own (all channels off) |
| `SDS814X-zoom-z1.bin` | `528ce4d0ce42b559f9bcc97db2c06c4ac3e4fc30fa35466be55d4dabc9c27364` | Zoom window Z1 save, 200 points, zoom timebase |

## Reference values

The format layout comes from Siglent's application note *How to Extract Data
from the Binary File of Siglent Oscilloscope* (2024 revision, section
"Binary Format V4.0"). Expected values in the unit tests were produced by
reading these files with RigolWFM 1.6.0 (`RigolWFM.wfm.Wfm.from_file(path, "auto")`),
an independent reader; no RigolWFM code is copied into Mergen Scope.

Two points where the real captures disagree with the application note:

- The vertical offset is **subtracted**: `volts = (code − 32768) × V/div × probe / codes_per_div − offset × probe`.
  The note prints `+ ch_vert_offset`, but then the 4.5 V DC capture would not read 4.5 V.
- In a zoom save the first sample is at `−zoom_time_div × 10 / 2 + zoom_delay`
  (+5 ms in `SDS814X-zoom-z1.bin`), while the main timebase uses `− time_delay`.
