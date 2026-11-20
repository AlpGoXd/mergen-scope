const CRC = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  return value;
});

/** Uncompressed ZIP for the generated .tex and .dat files. ZIP readers validate each entry with CRC-32. */
export function exportZip(files: readonly { name: string; text: string }[]): Blob {
  const encode = new TextEncoder();
  const entries: BlobPart[] = [];
  const directory: BlobPart[] = [];
  let offset = 0;
  let directorySize = 0;
  for (const file of files) {
    const name = encode.encode(file.name);
    const data = encode.encode(file.text);
    let crc = 0xffffffff;
    for (const byte of data) crc = (crc >>> 8) ^ (CRC[(crc ^ byte) & 0xff] ?? 0);
    crc = (crc ^ 0xffffffff) >>> 0;

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true);
    local.setUint16(12, 33, true); // DOS date: 1980-01-01.
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    entries.push(local.buffer, name, data);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(8, 0x0800, true);
    central.setUint16(14, 33, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, data.length, true);
    central.setUint32(24, data.length, true);
    central.setUint16(28, name.length, true);
    central.setUint32(42, offset, true);
    directory.push(central.buffer, name);
    offset += local.byteLength + name.length + data.length;
    directorySize += central.byteLength + name.length;
  }
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, directorySize, true);
  end.setUint32(16, offset, true);
  return new Blob([...entries, ...directory, end.buffer], { type: 'application/zip' });
}
