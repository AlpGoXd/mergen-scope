# Tektronix `.wfm` sample files

These `.wfm` files are unmodified copies of the test waveforms in Tektronix's
`tm_data_types` repository:

- Repository: https://github.com/tektronix/tm_data_types
- Commit: `7a0bfc4d4fd23cfff0b70296431f6d2252a3dce1`
- Paths: `tests/waveforms/*.wfm` and `tests/waveforms/fastframe/FF5MhzX100From5Series.wfm`
- Copyright Tektronix, Inc. Licensed under the Apache License, Version 2.0 (see `LICENSE.md` in this folder).

| File | SHA-256 | Contents |
| --- | --- | --- |
| `golden_analog.wfm` | `07a54541e1d8ce064fe7de8ee552d9efe670d768e4a3c7d1965b81441d5c4ba6` | 6-point int16 analog record, no pre/postcharge |
| `data_test_waveform.wfm` | `668b7460a2a31c70a26dae1c8176762040594478bba3592f496cdf932ca675bc` | 1000-point int16 analog record |
| `analog_waveform.wfm` | `20e58a5c0d5f22b6fd294125c529ae0d29e880d76f886933ef98305a82fc169a` | 50 000-point int16 analog record from an MSO64, 32 precharge and 32 postcharge points |
| `FF5MhzX100From5Series.wfm` | `329ab3c4c0a5ae2ed182d4bc6728cdeb4e38f248df21f60efa24c72d7bf2a745` | FastFrame set, 100 frames × 2500 int8 points |
| `digital_waveform.wfm` | `3061fc4b491d8a32381fe5df6e7992ce527e09ef709584194c1b4038b6b3fa04` | Digital (MSO) waveform; used to test rejection |
| `iq_waveform.wfm` | `5325da1be865512b90bc69e8341be18d12fbe0b30f6fae8b67762c4b48046525` | I/Q waveform (interleaved storage); used to test rejection |

All files are `WFM#003`, little-endian (`0x0F0F`), and carry Tektronix's optional
`tekmeta!` metadata block after the file checksum.

## Reference values

The unit tests compare the TypeScript decoder with two independent references:

1. **Tektronix's own Python reader**, `tm_data_types` 0.6.0 (`read_file(path)`,
   `normalized_vertical_values`, `x_axis_spacing`). It places sample 0 at the
   implicit-dimension offset and ignores the fractional trigger offset (`tt offset`).
2. **The MSO64's CSV export of `analog_waveform`** (`tests/waveforms/analog_waveform.csv`
   in the same repository, not copied here because it is 1.5 MB). Its header says
   `Sample Interval 4.00000000e-11`, `Record Length 50000`, `Zero Index 24999.16015625`,
   and its first rows are `-9.99966406e-07,-0.148`, `-9.99926406e-07,-0.148`,
   `-9.99886406e-07,-0.152`. The last row is `9.99993594e-07,0.144`.
   The instrument therefore places sample 0 at `offset + tt × scale`
   (−1 µs + 0.83984375 × 40 ps). Mergen Scope follows the instrument.

The format layout comes from the Tektronix *Performance Oscilloscope Reference
Waveform File Format* manual, 077-0220-05 (https://download.tek.com/manual/077022005Web_1.pdf).
No code from `tm_data_types` is copied into Mergen Scope.
