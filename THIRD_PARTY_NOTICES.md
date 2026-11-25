# Third-party notices

Mergen Scope is licensed under the Apache License, Version 2.0 (see `LICENSE`).
This file lists third-party material that is included in this repository, and
projects whose public documentation or reference readers were used to check the
file-format decoders. No third-party source code is copied into `src/`.

## Included material

### Tektronix `.wfm` sample waveforms

- Location: `tests/fixtures/tek-wfm/` (test fixtures only; not part of the built app)
- Source: https://github.com/tektronix/tm_data_types, commit `7a0bfc4d4fd23cfff0b70296431f6d2252a3dce1`
- Copyright Tektronix, Inc.
- License: Apache License, Version 2.0 (`tests/fixtures/tek-wfm/LICENSE.md`)
- Details and checksums: `tests/fixtures/tek-wfm/SOURCE.md`

## Format references (no code copied)

| Format | Reference | License of the reference |
| --- | --- | --- |
| Tektronix `.wfm` (`WFM#001`–`WFM#003`) | Tektronix, *Performance Oscilloscope Reference Waveform File Format*, 077-0220-05 | Tektronix documentation |
| Tektronix `.wfm` (expected values in tests) | `tm_data_types` 0.6.0, https://github.com/tektronix/tm_data_types | Apache-2.0 |
