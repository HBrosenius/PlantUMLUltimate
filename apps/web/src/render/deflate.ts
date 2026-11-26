// A small synchronous deflate (RFC 1951) for the sprite PNG writer: LZ77 with a hash chain, coded with the fixed
// Huffman code. CompressionStream is asynchronous and the engine's canvas calls are not, so the worker cannot
// use it. Sprites are tens of pixels wide, so the simple encoder is plenty: it is deterministic (the same bytes
// in always give the same bytes out), and it only ever reads the buffer it is given.

const LENGTH_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258,
];
const LENGTH_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DISTANCE_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145,
  8193, 12289, 16385, 24577,
];
const DISTANCE_EXTRA = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13,
];

const WINDOW = 32768;
const MAX_MATCH = 258;
const MAX_CHAIN = 24;
const HASH_SIZE = 1 << 15;

function reverseBits(code: number, bits: number): number {
  let result = 0;
  for (let i = 0; i < bits; i++) result |= ((code >> i) & 1) << (bits - 1 - i);
  return result;
}

// The fixed literal/length code (RFC 1951 section 3.2.6), already bit reversed for an LSB-first writer.
const LITERAL_CODE = new Uint16Array(288);
const LITERAL_BITS = new Uint8Array(288);
for (let symbol = 0; symbol < 288; symbol++) {
  const [code, bits] =
    symbol < 144
      ? [0x30 + symbol, 8]
      : symbol < 256
        ? [0x190 + symbol - 144, 9]
        : symbol < 280
          ? [symbol - 256, 7]
          : [0xc0 + symbol - 280, 8];
  LITERAL_CODE[symbol] = reverseBits(code!, bits!);
  LITERAL_BITS[symbol] = bits!;
}
const LENGTH_SYMBOL = new Uint8Array(MAX_MATCH + 1);
for (let symbol = 0; symbol < LENGTH_BASE.length; symbol++) {
  const next = symbol + 1 < LENGTH_BASE.length ? LENGTH_BASE[symbol + 1]! : MAX_MATCH + 1;
  for (let length = LENGTH_BASE[symbol]!; length < next; length++) LENGTH_SYMBOL[length] = symbol;
}
LENGTH_SYMBOL[MAX_MATCH] = 28;

class BitWriter {
  private bytes = new Uint8Array(1024);
  private length = 0;
  private buffer = 0;
  private count = 0;

  write(value: number, bits: number): void {
    this.buffer |= value << this.count;
    this.count += bits;
    while (this.count >= 8) {
      this.push(this.buffer & 0xff);
      this.buffer >>>= 8;
      this.count -= 8;
    }
  }

  private push(byte: number): void {
    if (this.length === this.bytes.length) {
      const grown = new Uint8Array(this.bytes.length * 2);
      grown.set(this.bytes);
      this.bytes = grown;
    }
    this.bytes[this.length++] = byte;
  }

  finish(): Uint8Array {
    if (this.count > 0) this.push(this.buffer & 0xff);
    return this.bytes.slice(0, this.length);
  }
}

/** Raw deflate (no zlib header) of `data`, as one final block with the fixed Huffman code. */
export function deflateRaw(data: Uint8Array): Uint8Array {
  const out = new BitWriter();
  out.write(1, 1); // final block
  out.write(1, 2); // fixed Huffman
  const head = new Int32Array(HASH_SIZE).fill(-1);
  const previous = new Int32Array(data.length);
  const hashAt = (i: number) => ((data[i]! << 10) ^ (data[i + 1]! << 5) ^ data[i + 2]!) & (HASH_SIZE - 1);
  const insert = (i: number) => {
    if (i + 2 >= data.length) return;
    const hash = hashAt(i);
    previous[i] = head[hash]!;
    head[hash] = i;
  };
  let i = 0;
  while (i < data.length) {
    let bestLength = 0;
    let bestDistance = 0;
    if (i + 2 < data.length) {
      const limit = Math.min(MAX_MATCH, data.length - i);
      let candidate = head[hashAt(i)]!;
      for (let chain = 0; candidate >= 0 && chain < MAX_CHAIN && i - candidate <= WINDOW; chain++) {
        let length = 0;
        while (length < limit && data[candidate + length] === data[i + length]) length++;
        if (length > bestLength) {
          bestLength = length;
          bestDistance = i - candidate;
          if (length === limit) break;
        }
        candidate = previous[candidate]!;
      }
    }
    if (bestLength >= 3) {
      const lengthSymbol = LENGTH_SYMBOL[bestLength]!;
      out.write(LITERAL_CODE[257 + lengthSymbol]!, LITERAL_BITS[257 + lengthSymbol]!);
      if (LENGTH_EXTRA[lengthSymbol]) out.write(bestLength - LENGTH_BASE[lengthSymbol]!, LENGTH_EXTRA[lengthSymbol]!);
      let distanceSymbol = DISTANCE_BASE.length - 1;
      while (DISTANCE_BASE[distanceSymbol]! > bestDistance) distanceSymbol--;
      out.write(reverseBits(distanceSymbol, 5), 5);
      if (DISTANCE_EXTRA[distanceSymbol])
        out.write(bestDistance - DISTANCE_BASE[distanceSymbol]!, DISTANCE_EXTRA[distanceSymbol]!);
      for (let k = 0; k < bestLength; k++) insert(i + k);
      i += bestLength;
    } else {
      out.write(LITERAL_CODE[data[i]!]!, LITERAL_BITS[data[i]!]!);
      insert(i);
      i += 1;
    }
  }
  out.write(LITERAL_CODE[256]!, LITERAL_BITS[256]!);
  return out.finish();
}
