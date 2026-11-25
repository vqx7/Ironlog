/* MD5 of a text, as the account's rows keep one of each copy (SUPABASE.md, Part 8: the `sum` column, which the
   database works out itself). The phone works out the same one to see whether the account holds the copy it holds.
   A checksum for comparing copies, never a secret's hash. */

/** The left rotation of each of the 64 steps. */
const SHIFT: readonly number[] = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4,
  11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21
];
/** 2^32: the values a word holds. */
const WORD_SPAN = 2 ** 32;
/** The constant added in each step: the whole part of 2^32 times the sine of the step's number. */
const ADD: readonly number[] = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * WORD_SPAN));
/** A byte's bits, a word's bytes, a block's words, and the steps of a block: 16 in each of 4 rounds. */
const BITS = 8,
  WORD = 4,
  BLOCK = 16,
  STEPS = 64;
/** A byte's highest value, and the byte with only its top bit set that ends the message. */
const BYTE = 255,
  END = 128;
/** What turns a byte count into a count of blocks (2^6 bytes each), and the room the end bit and the length need. */
const BLOCK_SHIFT = 6,
  TAIL = 8;
/** 2^29: the bytes at which the length in bits passes one word. */
const HIGH = 2 ** 29;
/** The four starting words. */
const START: readonly [number, number, number, number] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];
/** Each round's word order: the message word of step i is (MUL * i + PLUS) mod 16. */
const ORDER: readonly (readonly [number, number])[] = [
  [1, 0],
  [5, 1],
  [3, 5],
  [7, 0]
];
/** A 32-bit word as its four bytes in hex, lowest first. */
const hexLE = (w: number): string => {
  let out = '';
  for (let i = 0; i < WORD; i++) out += ((w >>> (BITS * i)) & BYTE).toString(BLOCK).padStart(2, '0');
  return out;
};

/** The MD5 of a text's UTF-8 bytes, in hex: what Postgres's md5(text) gives for the same text. */
export function md5(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const n = bytes.length;
  // The message in 32-bit words, lowest byte first, then a 1 bit, zeros, and its length in bits in the last two words.
  const words = new Uint32Array((((n + TAIL) >>> BLOCK_SHIFT) + 1) * BLOCK);
  for (let i = 0; i < n; i++) words[i >> 2] = (words[i >> 2] ?? 0) | ((bytes[i] ?? 0) << ((i % WORD) * BITS));
  words[n >> 2] = (words[n >> 2] ?? 0) | (END << ((n % WORD) * BITS));
  words[words.length - 2] = (n * BITS) >>> 0;
  words[words.length - 1] = Math.floor(n / HIGH);
  let [a0, b0, c0, d0] = START;
  for (let off = 0; off < words.length; off += BLOCK) {
    let A = a0,
      B = b0,
      C = c0,
      D = d0;
    for (let i = 0; i < STEPS; i++) {
      const round = Math.floor(i / BLOCK);
      const [mul, plus] = ORDER[round] ?? [1, 0];
      const g = (mul * i + plus) % BLOCK;
      let F: number;
      if (round === 0) F = (B & C) | (~B & D);
      else if (round === 1) F = (D & B) | (~D & C);
      else if (round === 2) F = B ^ C ^ D;
      else F = C ^ (B | ~D);
      F = (F + A + (ADD[i] ?? 0) + (words[off + g] ?? 0)) >>> 0;
      const s = SHIFT[i] ?? 0;
      A = D;
      D = C;
      C = B;
      B = (B + ((F << s) | (F >>> (WORD * BITS - s)))) >>> 0;
    }
    a0 = (a0 + A) >>> 0;
    b0 = (b0 + B) >>> 0;
    c0 = (c0 + C) >>> 0;
    d0 = (d0 + D) >>> 0;
  }
  return hexLE(a0) + hexLE(b0) + hexLE(c0) + hexLE(d0);
}
