// Minimal deterministic ZIP writer: one stored-or-deflated entry, no extra fields.
import zlib from 'node:zlib';
import { gzip as zopfliGzip } from '@gfx/zopfli';

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (let i = 0; i < buffer.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buffer[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

// Zopfli only emits gzip/zlib/deflate streams through this binding; peel the
// 10-byte gzip header and 8-byte trailer back off to get the raw deflate body.
function zopfliRaw(buffer, iterations) {
  return new Promise((resolve) => {
    zopfliGzip(buffer, { numiterations: iterations }, (error, output) => {
      if (error || !output) return resolve(null);
      let start = 10;
      const flags = output[3];
      if (flags & 4) start += 2 + output.readUInt16LE(start);
      if (flags & 8) while (output[start++] !== 0);
      if (flags & 16) while (output[start++] !== 0);
      if (flags & 2) start += 2;
      resolve(output.subarray(start, output.length - 8));
    });
  });
}

/** Smallest deflate stream we can produce for `buffer`, trying every strategy. */
export async function bestDeflate(buffer, { zopfliIterations = 200 } = {}) {
  const candidates = [];
  for (const strategy of [zlib.constants.Z_DEFAULT_STRATEGY, zlib.constants.Z_FILTERED, zlib.constants.Z_RLE]) {
    candidates.push(zlib.deflateRawSync(buffer, { level: 9, memLevel: 9, strategy, windowBits: 15 }));
  }
  const zopfli = await zopfliRaw(buffer, zopfliIterations);
  if (zopfli) candidates.push(zopfli);
  return candidates.reduce((best, next) => (next.length < best.length ? next : best));
}

/**
 * Pack a single file into a ZIP archive.
 *
 * js13kGames requires `index.html` at the archive root, so the name is fixed and
 * costs 20 bytes across the two headers. Everything else here is the floor: no
 * data descriptor, no extra fields, zeroed timestamps for reproducible output.
 */
export async function zipSingleFile(name, contents, options = {}) {
  const data = Buffer.from(contents);
  const deflated = await bestDeflate(data, options);
  const stored = deflated.length >= data.length;
  const body = stored ? data : deflated;
  const method = stored ? 0 : 8;
  const nameBytes = Buffer.from(name, 'utf8');
  const crc = crc32(data);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(method, 8);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(body.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBytes.length, 26);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(method, 10);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(body.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(nameBytes.length, 28);

  const centralOffset = local.length + nameBytes.length + body.length;
  const centralSize = central.length + nameBytes.length;

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralOffset, 16);

  return {
    archive: Buffer.concat([local, nameBytes, body, central, nameBytes, end]),
    stored,
    rawBytes: data.length,
    deflatedBytes: body.length,
  };
}
