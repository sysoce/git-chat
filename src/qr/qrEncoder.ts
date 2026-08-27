const EXP: number[] = new Array(256);
const LOG: number[] = new Array(256);
for (let i = 0, x = 1; i < 256; i++) {
  EXP[i] = x;
  LOG[x] = i;
  x = (x << 1) ^ (x & 128 ? 0x11d : 0);
}

function gfMul(x: number, y: number): number {
  return x === 0 || y === 0 ? 0 : EXP[(LOG[x]! + LOG[y]!) % 255]!;
}

function rsGenPoly(n: number): number[] {
  let poly = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gfMul(poly[j]!, EXP[i]!);
      next[j + 1] ^= poly[j]!;
    }
    poly = next;
  }
  return poly;
}

function rsEncode(data: number[], numEc: number): number[] {
  const gen = rsGenPoly(numEc);
  const res = new Array(numEc).fill(0);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i]! ^ res[0]!;
    res.shift();
    res.push(0);
    for (let j = 0; j < numEc; j++) res[j] ^= gfMul(gen[j]!, factor);
  }
  return res;
}

const VERSIONS = [
  { ver: 1, size: 21, dataCap: 19, ecCount: 7, align: [] },
  { ver: 2, size: 25, dataCap: 34, ecCount: 10, align: [6, 18] },
  { ver: 3, size: 29, dataCap: 55, ecCount: 15, align: [6, 22] },
  { ver: 4, size: 33, dataCap: 80, ecCount: 20, align: [6, 26] },
  { ver: 5, size: 37, dataCap: 108, ecCount: 26, align: [6, 30] },
  { ver: 6, size: 41, dataCap: 136, ecCount: 36, align: [6, 34] },
  { ver: 7, size: 45, dataCap: 156, ecCount: 40, align: [6, 22, 38] },
  { ver: 8, size: 49, dataCap: 194, ecCount: 48, align: [6, 24, 42] },
  { ver: 9, size: 53, dataCap: 232, ecCount: 56, align: [6, 26, 46] },
  { ver: 10, size: 57, dataCap: 274, ecCount: 68, align: [6, 28, 50] },
];

export function generateQrMatrix(text: string): boolean[][] {
  const utf8 = Buffer.from(text, 'utf8');
  const v = VERSIONS.find((entry) => entry.dataCap >= utf8.length + 3) || VERSIONS[VERSIONS.length - 1]!;
  const bits: number[] = [0, 1, 0, 0];
  const lenBits = v.ver < 10 ? 8 : 16;
  for (let i = lenBits - 1; i >= 0; i--) bits.push((utf8.length >> i) & 1);
  for (const byte of utf8) {
    for (let i = 7; i >= 0; i--) bits.push((byte >> i) & 1);
  }
  while (bits.length < v.dataCap * 8 && bits.length % 8 !== 0) bits.push(0);
  const dataBytes: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | (bits[i + j] || 0);
    dataBytes.push(b);
  }
  const pad = [0xec, 0x11];
  let padIdx = 0;
  while (dataBytes.length < v.dataCap) dataBytes.push(pad[padIdx++ % 2]!);

  const ecBytes = rsEncode(dataBytes, v.ecCount);
  const allCodewords = [...dataBytes, ...ecBytes];
  const allBits: number[] = [];
  for (const b of allCodewords) {
    for (let i = 7; i >= 0; i--) allBits.push((b >> i) & 1);
  }

  const mat: Array<Array<boolean | null>> = Array.from({ length: v.size }, () => Array(v.size).fill(null));
  const placeFinder = (r: number, c: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < v.size && nc >= 0 && nc < v.size) {
          if (dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6) {
            mat[nr]![nc] = dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4);
          } else {
            mat[nr]![nc] = false;
          }
        }
      }
    }
  };
  placeFinder(0, 0); placeFinder(0, v.size - 7); placeFinder(v.size - 7, 0);

  for (let i = 8; i < v.size - 8; i++) {
    if (mat[6]![i] === null) mat[6]![i] = i % 2 === 0;
    if (mat[i]![6] === null) mat[i]![6] = i % 2 === 0;
  }

  if (v.align.length) {
    for (const r of v.align) {
      for (const c of v.align) {
        if (mat[r]![c] !== null) continue;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            mat[r + dr]![c + dc] = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
          }
        }
      }
    }
  }

  const fmt = 0x77c4;
  for (let i = 0; i < 15; i++) {
    const bit = ((fmt >> (14 - i)) & 1) === 1;
    const [r, c] = i < 6 ? [i, 8] : i < 8 ? [i + 1, 8] : i === 8 ? [8, 7] : [8, 14 - i];
    mat[r]![c] = bit;
    const [r2, c2] = i < 8 ? [8, v.size - 1 - i] : [v.size - 15 + i, 8];
    mat[r2]![c2] = bit;
  }
  mat[v.size - 8]![8] = true;

  let bitIdx = 0;
  for (let right = v.size - 1; right > 0; right -= 2) {
    if (right === 6) right--;
    const cols = [right, right - 1];
    const rows = ((right + 1) / 2) % 2 === 0 ? Array.from({ length: v.size }, (_, i) => i) : Array.from({ length: v.size }, (_, i) => v.size - 1 - i);
    for (const r of rows) {
      for (const c of cols) {
        if (mat[r]![c] === null) {
          const rawBit = (allBits[bitIdx++] || 0) === 1;
          const mask = (r + c) % 2 === 0;
          mat[r]![c] = rawBit !== mask;
        }
      }
    }
  }

  return mat.map((row) => row.map((cell) => cell ?? false));
}
