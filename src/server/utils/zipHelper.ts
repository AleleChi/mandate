/**
 * Pure TypeScript ZIP file generator for bundling reports (0 external dependencies).
 * Generates standard PKZIP 2.0 archives compatible with Windows, macOS, Linux, and mobile OS.
 */

const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
  }
  crcTable[i] = c >>> 0;
}

export function calculateCrc32(buf: Buffer): number {
  let crc = 0 ^ (-1);
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xFF];
  }
  return (crc ^ (-1)) >>> 0;
}

export interface ZipFileInput {
  name: string;
  buffer: Buffer;
}

export function createZipArchive(files: ZipFileInput[]): Buffer {
  const localHeaders: Buffer[] = [];
  const centralHeaders: Buffer[] = [];
  let offset = 0;

  // Modern DOS date/time (2026-09-07 12:00:00)
  const dosTime = (12 << 11) | (0 << 5) | (0 >> 1); // 12:00:00
  const dosDate = ((2026 - 1980) << 9) | (9 << 5) | 7; // 2026-09-07

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, 'utf8');
    const dataBuf = file.buffer;
    const crc = calculateCrc32(dataBuf);

    // 1. Local file header (30 bytes + filename)
    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0); // signature PK\x03\x04
    local.writeUInt16LE(20, 4); // version needed (2.0)
    local.writeUInt16LE(0, 6); // general purpose bit flag
    local.writeUInt16LE(0, 8); // compression method (0 = store)
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(dataBuf.length, 18); // compressed size
    local.writeUInt32LE(dataBuf.length, 22); // uncompressed size
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra field length
    nameBuf.copy(local, 30);

    localHeaders.push(local, dataBuf);

    // 2. Central directory header (46 bytes + filename)
    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0); // signature PK\x01\x02
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0, 8); // general purpose bit flag
    central.writeUInt16LE(0, 10); // compression method (0 = store)
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(dataBuf.length, 20); // compressed size
    central.writeUInt32LE(dataBuf.length, 24); // uncompressed size
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30); // extra field length
    central.writeUInt16LE(0, 32); // comment length
    central.writeUInt16LE(0, 34); // disk start
    central.writeUInt16LE(0, 36); // internal file attributes
    central.writeUInt32LE(0, 38); // external file attributes
    central.writeUInt32LE(offset, 42); // relative offset of local header
    nameBuf.copy(central, 46);

    centralHeaders.push(central);
    offset += local.length + dataBuf.length;
  }

  const centralSize = centralHeaders.reduce((sum, h) => sum + h.length, 0);
  const cdOffset = offset;

  // 3. End of central directory record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // signature PK\x05\x06
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // start disk
  eocd.writeUInt16LE(files.length, 8); // entries on disk
  eocd.writeUInt16LE(files.length, 10); // total entries
  eocd.writeUInt32LE(centralSize, 12); // size of central directory
  eocd.writeUInt32LE(cdOffset, 16); // offset of central directory
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...localHeaders, ...centralHeaders, eocd]);
}
