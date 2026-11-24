import { describe, expect, it } from "vitest";
import {
  analyzeDecodedQuality,
  decodeFloat16,
  inspectBinaryCursor,
  readInt24,
  readUint24,
} from "../../src/domain/parsers/binary-inspect.ts";

describe("binary-inspect", () => {
  describe("decodeFloat16", () => {
    it("decodes +0 and -0 preserving sign", () => {
      expect(Object.is(decodeFloat16(0x0000), 0)).toBe(true);
      expect(Object.is(decodeFloat16(0x8000), -0)).toBe(true);
    });

    it("decodes normal values including 1.0, -2.5, and max normal 65504", () => {
      expect(decodeFloat16(0x3c00)).toBe(1.0);
      expect(decodeFloat16(0xc100)).toBe(-2.5);
      expect(decodeFloat16(0x7bff)).toBe(65504);
      expect(decodeFloat16(0xfbff)).toBe(-65504);
    });

    it("decodes subnormal values accurately", () => {
      expect(decodeFloat16(0x0001)).toBeCloseTo(2 ** -24, 15);
      expect(decodeFloat16(0x8001)).toBeCloseTo(-(2 ** -24), 15);
      expect(decodeFloat16(0x03ff)).toBeCloseTo((2 ** -14) * (1023 / 1024), 15);
    });

    it("decodes +Infinity, -Infinity, and NaN", () => {
      expect(decodeFloat16(0x7c00)).toBe(Infinity);
      expect(decodeFloat16(0xfc00)).toBe(-Infinity);
      expect(Number.isNaN(decodeFloat16(0x7e00))).toBe(true);
      expect(Number.isNaN(decodeFloat16(0x7c01))).toBe(true);
      expect(Number.isNaN(decodeFloat16(0xffff))).toBe(true);
    });
  });

  describe("readUint24 and readInt24", () => {
    it("reads unsigned 24-bit integers in both LE and BE", () => {
      const bytes = new Uint8Array([0x56, 0x34, 0x12, 0xff, 0xff, 0xff]);
      const view = new DataView(bytes.buffer);

      expect(readUint24(view, 0, true)).toBe(0x123456);
      expect(readUint24(view, 0, false)).toBe(0x563412);
      expect(readUint24(view, 3, true)).toBe(16777215);
      expect(readUint24(view, 3, false)).toBe(16777215);
    });

    it("reads signed two's-complement 24-bit integers including min, max, and -1", () => {
      // LE: [0xff, 0xff, 0xff] = -1; [0x00, 0x00, 0x80] = -8388608; [0xff, 0xff, 0x7f] = 8388607
      const leBuf = new Uint8Array([0xff, 0xff, 0xff, 0x00, 0x00, 0x80, 0xff, 0xff, 0x7f]);
      const leView = new DataView(leBuf.buffer);
      expect(readInt24(leView, 0, true)).toBe(-1);
      expect(readInt24(leView, 3, true)).toBe(-8388608);
      expect(readInt24(leView, 6, true)).toBe(8388607);

      // BE: [0xff, 0xff, 0xff] = -1; [0x80, 0x00, 0x00] = -8388608; [0x7f, 0xff, 0xff] = 8388607
      const beBuf = new Uint8Array([0xff, 0xff, 0xff, 0x80, 0x00, 0x00, 0x7f, 0xff, 0xff]);
      const beView = new DataView(beBuf.buffer);
      expect(readInt24(beView, 0, false)).toBe(-1);
      expect(readInt24(beView, 3, false)).toBe(-8388608);
      expect(readInt24(beView, 6, false)).toBe(8388607);
    });

    it("throws RangeError when reading past view bounds", () => {
      const view = new DataView(new ArrayBuffer(2));
      expect(() => readUint24(view, 0, true)).toThrow(RangeError);
      expect(() => readInt24(view, -1, false)).toThrow(RangeError);
    });
  });

  describe("inspectBinaryCursor", () => {
    it("decodes all types at start of buffer in LE and BE", () => {
      const buf = new ArrayBuffer(12);
      const view = new DataView(buf);
      view.setFloat64(0, -12.5, true);
      view.setUint32(8, 0x41424344, false); // "ABCD"

      const le = inspectBinaryCursor(buf, 0, "le");
      expect(le.offset).toBe(0);
      expect(le.f64).toBe(-12.5);
      expect(le.u8).toBe(view.getUint8(0));
      expect(le.i8).toBe(view.getInt8(0));
      expect(le.u16).toBe(view.getUint16(0, true));
      expect(le.i16).toBe(view.getInt16(0, true));
      expect(le.u24).toBe(readUint24(view, 0, true));
      expect(le.i24).toBe(readInt24(view, 0, true));
      expect(le.u32).toBe(view.getUint32(0, true));
      expect(le.i32).toBe(view.getInt32(0, true));
      expect(le.f16).toBe(decodeFloat16(view.getUint16(0, true)));
      expect(le.f32).toBe(view.getFloat32(0, true));

      const midBe = inspectBinaryCursor(buf, 8, "be");
      expect(midBe.offset).toBe(8);
      expect(midBe.byteHex).toBe("41");
      expect(midBe.ascii).toBe("A");
      expect(midBe.u8).toBe(0x41);
      expect(midBe.u16).toBe(0x4142);
      expect(midBe.u24).toBe(0x414243);
      expect(midBe.u32).toBe(0x41424344);
      expect(midBe.f64).toBeNull();
    });

    it("returns null for types that exceed remaining bytes near EOF without throwing", () => {
      const bytes = new Uint8Array([0x00, 0x3c, 0x80]); // 3 bytes; first 2 bytes LE = float16 1.0
      const at0 = inspectBinaryCursor(bytes.buffer, 0, "le");
      expect(at0.byteHex).toBe("00");
      expect(at0.ascii).toBe(".");
      expect(at0.u8).toBe(0x00);
      expect(at0.u16).toBe(0x3c00);
      expect(at0.f16).toBe(1.0);
      expect(at0.u24).toBe(0x803c00);
      expect(at0.i24).toBe(0x803c00 - 0x1000000);
      expect(at0.u32).toBeNull();
      expect(at0.i32).toBeNull();
      expect(at0.f32).toBeNull();
      expect(at0.f64).toBeNull();

      const at2 = inspectBinaryCursor(bytes.buffer, 2, "le");
      expect(at2.byteHex).toBe("80");
      expect(at2.ascii).toBe(".");
      expect(at2.u8).toBe(128);
      expect(at2.i8).toBe(-128);
      expect(at2.u16).toBeNull();
      expect(at2.i16).toBeNull();
      expect(at2.u24).toBeNull();
      expect(at2.i24).toBeNull();
      expect(at2.f16).toBeNull();
      expect(at2.f32).toBeNull();
      expect(at2.f64).toBeNull();

      const atEof = inspectBinaryCursor(bytes.buffer, 3, "le");
      expect(atEof.u8).toBeNull();
      expect(atEof.byteHex).toBeNull();
      expect(atEof.ascii).toBeNull();
      expect(atEof.f64).toBeNull();

      const negative = inspectBinaryCursor(bytes.buffer, -1, "le");
      expect(negative.u8).toBeNull();
      expect(negative.f64).toBeNull();

      const empty = inspectBinaryCursor(new ArrayBuffer(0), 0, "le");
      expect(empty.u8).toBeNull();
      expect(empty.byteHex).toBeNull();
    });
  });

  describe("analyzeDecodedQuality", () => {
    it("returns null for empty or clean float samples", () => {
      expect(analyzeDecodedQuality([], "float32")).toBeNull();
      expect(analyzeDecodedQuality([0, 0.5, -1.25, 3.14159, 1e-6], "float32")).toBeNull();
      expect(analyzeDecodedQuality([0, 1.0, -2.5], "float16")).toBeNull();
      expect(analyzeDecodedQuality([1e10, -1e-10], "float64")).toBeNull();
    });

    it("warns when NaN or Infinity values are present", () => {
      const nanWarn = analyzeDecodedQuality([1, 2, Number.NaN, 4], "float32");
      expect(nanWarn).not.toBeNull();
      expect(nanWarn?.severity).toBe("warning");
      expect(nanWarn?.message).toContain("NaN or Infinity");

      const infWarn = analyzeDecodedQuality([1, Infinity, 3], "float64");
      expect(infWarn).not.toBeNull();
      expect(infWarn?.message).toContain("NaN or Infinity");
    });

    it("warns on byte-swapped Float32 producing extreme exponents (1e+35 / 1e-38)", () => {
      // Encode clean LE float32 values, then read them as BE (byte-swapped).
      const clean = [0.25, 0.5, 0.75, 1.25, 1.5, 2.5, 3.5, 4.5];
      const buf = new ArrayBuffer(clean.length * 4);
      const view = new DataView(buf);
      clean.forEach((v, i) => view.setFloat32(i * 4, v, true));
      const swapped = clean.map((_, i) => view.getFloat32(i * 4, false));

      const warn = analyzeDecodedQuality(swapped, "float32");
      expect(warn).not.toBeNull();
      expect(warn?.severity).toBe("warning");
      expect(warn?.message).toContain("extreme exponents");

      // Also verify direct 1e+35 / 1e-38 sample values trigger the warning.
      const syntheticWarn = analyzeDecodedQuality([1e35, 1e-38, 0.5, 1.0], "float32");
      expect(syntheticWarn).not.toBeNull();
      expect(syntheticWarn?.message).toContain("extreme exponents");
    });

    it("does not trigger extreme-exponent float warning for clean large integer values", () => {
      const largeInts = [2_000_000_000, -2_147_483_648, 1_500_000_000, 1e16, 2e16];
      expect(analyzeDecodedQuality(largeInts, "int32")).toBeNull();
      expect(analyzeDecodedQuality(largeInts, "uint32")).toBeNull();
      expect(analyzeDecodedQuality(largeInts, "int16")).toBeNull();
    });

    it("respects the 15% / minimum 2 count threshold for float exponent warnings", () => {
      // Only 1 extreme value out of 10 should not warn (below min count 2 and 15%).
      const singleOutlier = [1e20, 1, 2, 3, 4, 5, 6, 7, 8, 9];
      expect(analyzeDecodedQuality(singleOutlier, "float32")).toBeNull();
    });
  });
});
