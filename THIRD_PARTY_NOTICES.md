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

### Siglent SDS `.bin` sample waveforms

- Location: `tests/fixtures/siglent-sds/` (test fixtures only; not part of the built app)
- Source: https://github.com/scottprahl/RigolWFM, commit `9e6f993103f773f81df409fc65c2cc359d7bd249` (captures from a Siglent SDS814X HD)
- Copyright (c) 2020-23, Scott Prahl
- License: BSD 3-Clause (`tests/fixtures/siglent-sds/LICENSE.txt`)
- Details and checksums: `tests/fixtures/siglent-sds/SOURCE.md`

## Format references (no code copied)

| Format | Reference | License of the reference |
| --- | --- | --- |
| Tektronix `.wfm` (`WFM#001`–`WFM#003`) | Tektronix, *Performance Oscilloscope Reference Waveform File Format*, 077-0220-05 | Tektronix documentation |
| Tektronix `.wfm` (expected values in tests) | `tm_data_types` 0.6.0, https://github.com/tektronix/tm_data_types | Apache-2.0 |
| Siglent SDS `.bin` (Binary Format V4.0) | Siglent, *How to Extract Data from the Binary File of Siglent Oscilloscope* (2024 revision) | Siglent documentation |
| Siglent SDS `.bin` (expected values in tests) | RigolWFM 1.6.0, https://github.com/scottprahl/RigolWFM | BSD-3-Clause |
