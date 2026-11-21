const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const maxSize = 64 * 1024 * 1024;

function checksum(data) {
  let crc = -1;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ -1) >>> 0;
}

function header(length, fields) {
  const bytes = new Uint8Array(length);
  const view = new DataView(bytes.buffer);
  for (const [offset, size, value] of fields) {
    if (size === 2) view.setUint16(offset, value, true);
    else view.setUint32(offset, value, true);
  }
  return bytes;
}

export function encodeZip(entries) {
  if (entries.size > 2000) throw new Error('Too many package entries.');
  const local = [], central = [];
  let offset = 0, directorySize = 0;
  for (const [name, data] of entries) {
    const path = encoder.encode(name), crc = checksum(data), size = data.byteLength;
    if (offset + size + directorySize + 22 + 76 + 2 * path.length > maxSize) throw new Error('Package exceeds the 64 MB limit.');
    local.push(header(30, [[0,4,0x04034b50],[4,2,20],[6,2,2048],[12,2,33],[14,4,crc],[18,4,size],[22,4,size],[26,2,path.length]]), path, data);
    central.push(header(46, [[0,4,0x02014b50],[4,2,20],[6,2,20],[8,2,2048],[14,2,33],[16,4,crc],[20,4,size],[24,4,size],[28,2,path.length],[42,4,offset]]), path);
    offset += 30 + path.length + size;
    directorySize += 46 + path.length;
  }
  const end = header(22, [[0,4,0x06054b50],[8,2,entries.size],[10,2,entries.size],[12,4,directorySize],[16,4,offset]]);
  return new Blob([...local, ...central, end], { type: 'application/zip' });
}

async function inflate(bytes, size) {
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const decoded = new Uint8Array(size);
  let offset = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (offset + value.length > size) throw new Error('ZIP entry exceeds its declared size.');
      decoded.set(value, offset);
      offset += value.length;
    }
  } finally {
    await reader.cancel();
  }
  if (offset !== size) throw new Error('ZIP entry size mismatch.');
  return decoded;
}

export async function decodeZip(blob) {
  if (blob.size > maxSize || blob.size < 22) throw new Error('Invalid package size.');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(bytes.buffer);
  const short = offset => view.getUint16(offset, true);
  const int = offset => view.getUint32(offset, true);
  let end = bytes.length - 22;
  while (end >= Math.max(0, bytes.length - 65557)
    && (int(end) !== 0x06054b50 || end + 22 + short(end + 20) !== bytes.length)) end--;
  if (end < Math.max(0, bytes.length - 65557) || short(end + 4) || short(end + 6)) throw new Error('Invalid ZIP directory.');
  const count = short(end + 10), directory = int(end + 16);
  if (count > 2000 || short(end + 8) !== count || directory + int(end + 12) !== end) throw new Error('Invalid ZIP directory.');
  let total = 0, position = directory;
  const entries = new Map();
  for (let index = 0; index < count; index++) {
    if (position + 46 > end || int(position) !== 0x02014b50) throw new Error('Invalid ZIP entry.');
    const flags = short(position + 8), method = short(position + 10), crc = int(position + 16);
    const compressed = int(position + 20), size = int(position + 24), length = short(position + 28);
    const local = int(position + 42), next = position + 46 + length + short(position + 30) + short(position + 32);
    total += size;
    if (next > end || total > maxSize || (flags & 1) || ![0, 8].includes(method)
      || local + 30 > directory || int(local) !== 0x04034b50) throw new Error('Unsupported ZIP entry.');
    const path = decoder.decode(bytes.subarray(position + 46, position + 46 + length));
    const start = local + 30 + short(local + 26) + short(local + 28);
    if (!/^[\w./-]+$/.test(path) || path.startsWith('/') || path.split('/').includes('..')
      || entries.has(path) || start + compressed > directory) throw new Error('Invalid ZIP entry path or size.');
    const raw = bytes.subarray(start, start + compressed);
    const data = method === 0 ? raw : await inflate(raw, size);
    if (data.length !== size || checksum(data) !== crc) throw new Error('ZIP entry failed its integrity check.');
    entries.set(path, data);
    position = next;
  }
  if (position !== end) throw new Error('Invalid ZIP directory length.');
  return entries;
}
