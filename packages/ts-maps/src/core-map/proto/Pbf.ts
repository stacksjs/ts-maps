// Protobuf decoder — in-house, zero-dep.
// Inspired by the wire-format descriptions in mapbox/pbf (BSD-3-Clause);
// this implementation is an independent TypeScript rewrite.
//
// Implements the subset of the protobuf wire format needed to read
// Mapbox Vector Tiles v2 (plus symmetric write support for fixtures
// and debug tooling). Groups (wire types 3 and 4) are not supported.
// See https://protobuf.dev/programming-guides/encoding/ for details.

// Wire types, per the protobuf spec.
export const PBF_VARINT: number = 0
export const PBF_FIXED64: number = 1
export const PBF_BYTES: number = 2
export const PBF_FIXED32: number = 5

const SHIFT_LEFT_32 = (1 << 16) * (1 << 16)
const SHIFT_RIGHT_32 = 1 / SHIFT_LEFT_32

// 2^53 - 1, the largest safely-representable integer in a JS Number.
const MAX_SAFE = Number.MAX_SAFE_INTEGER

const utf8Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null
const utf8Encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null

// eslint-disable-next-line no-unused-vars
export type PbfReadFieldFn<T> = (tag: number, result: T, pbf: Pbf) => void
// eslint-disable-next-line no-unused-vars
export type PbfWriteFn<V> = (value: V, pbf: Pbf) => void

export class Pbf {
  buf: Uint8Array
  pos: number
  type: number
  length: number

  private _view: DataView

  constructor(buf?: Uint8Array | ArrayBuffer) {
    if (buf instanceof Uint8Array) {
      this.buf = buf
    }
    else if (buf instanceof ArrayBuffer) {
      this.buf = new Uint8Array(buf)
    }
    else {
      this.buf = new Uint8Array(0)
    }
    this.pos = 0
    this.type = 0
    this.length = this.buf.length
    this._view = new DataView(this.buf.buffer, this.buf.byteOffset, this.buf.byteLength)
  }

  // ---------- field dispatch ----------

  readFields<T>(readField: PbfReadFieldFn<T>, result: T, end?: number): T {
    const endPos = end === undefined ? this.length : end
    while (this.pos < endPos) {
      const val = this.readVarint()
      const tag = val >> 3
      const startPos = this.pos
      this.type = val & 0x7
      readField(tag, result, this)
      // If the user callback didn't advance the cursor, skip the field so we
      // don't loop forever on unknown tags.
      if (this.pos === startPos)
        this.skip(val)
    }
    return result
  }

  readMessage<T>(readField: PbfReadFieldFn<T>, result: T): T {
    return this.readFields(readField, result, this.readVarint() + this.pos)
  }

  // ---------- fixed-width reads ----------

  readFixed32(): number {
    const val = this._view.getUint32(this.pos, true)
    this.pos += 4
    return val
  }

  readSFixed32(): number {
    const val = this._view.getInt32(this.pos, true)
    this.pos += 4
    return val
  }

  readFixed64(): number {
    const lo = this._view.getUint32(this.pos, true)
    const hi = this._view.getUint32(this.pos + 4, true)
    this.pos += 8
    return hi * SHIFT_LEFT_32 + lo
  }

  readSFixed64(): number {
    const lo = this._view.getUint32(this.pos, true)
    const hi = this._view.getInt32(this.pos + 4, true)
    this.pos += 8
    return hi * SHIFT_LEFT_32 + lo
  }

  readFloat(): number {
    const val = this._view.getFloat32(this.pos, true)
    this.pos += 4
    return val
  }

  readDouble(): number {
    const val = this._view.getFloat64(this.pos, true)
    this.pos += 8
    return val
  }

  // ---------- varint ----------

  // Reads a varint. Supports up to 64-bit values, but returns them as JS
  // Numbers (safe up to 2^53 - 1). Throws on higher magnitudes.
  readVarint(isSigned?: boolean): number {
    const buf = this.buf
    let val: number
    let b: number

    b = buf[this.pos++]
    val = b & 0x7F
    if (b < 0x80)
      return val
    b = buf[this.pos++]
    val |= (b & 0x7F) << 7
    if (b < 0x80)
      return val
    b = buf[this.pos++]
    val |= (b & 0x7F) << 14
    if (b < 0x80)
      return val
    b = buf[this.pos++]
    val |= (b & 0x7F) << 21
    if (b < 0x80)
      return val >>> 0
    // From here we need to work in floating-point to avoid bit-shift overflow.
    b = buf[this.pos]
    // Low 28 bits already accumulated in `val` (but bit 31 may have sign-bit
    // issues via `<< 21`); rebuild cleanly.
    return readVarintRemainder(val >>> 0, isSigned === true, this)
  }

  // Deprecated alias kept for API compatibility.
  readVarint64(): number {
    return this.readVarint(true)
  }

  // Zigzag-decoded signed varint.
  readSVarint(): number {
    const n = this.readVarint()
    // Branch once to keep things 53-bit-safe for large values.
    return n % 2 === 1 ? (n + 1) / -2 : n / 2
  }

  readBoolean(): boolean {
    return Boolean(this.readVarint())
  }

  readString(): string {
    const end = this.readVarint() + this.pos
    const start = this.pos
    this.pos = end
    if (utf8Decoder !== null) {
      return utf8Decoder.decode(this.buf.subarray(start, end))
    }
    // Fallback: manual UTF-8 decode for environments without TextDecoder.
    return manualUtf8Decode(this.buf, start, end)
  }

  readBytes(): Uint8Array {
    const end = this.readVarint() + this.pos
    const bytes = this.buf.subarray(this.pos, end)
    this.pos = end
    // Copy so callers can safely retain it across buffer reuses.
    return new Uint8Array(bytes)
  }

  // ---------- packed repeated ----------
  //
  // Each helper delegates to `readPacked`, which handles the two cases
  // required by proto3: an already-packed field (wire type 2) and the
  // fallback single-value form emitted by older proto2 encoders.

  readPackedVarint(arr?: number[], isSigned?: boolean): number[] {
    return readPacked<number>(this, arr, p => p.readVarint(isSigned))
  }

  readPackedSVarint(arr?: number[]): number[] {
    return readPacked<number>(this, arr, p => p.readSVarint())
  }

  readPackedBoolean(arr?: boolean[]): boolean[] {
    return readPacked<boolean>(this, arr, p => p.readBoolean())
  }

  readPackedFloat(arr?: number[]): number[] {
    return readPacked<number>(this, arr, p => p.readFloat())
  }

  readPackedDouble(arr?: number[]): number[] {
    return readPacked<number>(this, arr, p => p.readDouble())
  }

  readPackedFixed32(arr?: number[]): number[] {
    return readPacked<number>(this, arr, p => p.readFixed32())
  }

  readPackedSFixed32(arr?: number[]): number[] {
    return readPacked<number>(this, arr, p => p.readSFixed32())
  }

  readPackedFixed64(arr?: number[]): number[] {
    return readPacked<number>(this, arr, p => p.readFixed64())
  }

  readPackedSFixed64(arr?: number[]): number[] {
    return readPacked<number>(this, arr, p => p.readSFixed64())
  }

  // ---------- navigation ----------

  skip(val: number): void {
    const type = val & 0x7
    if (type === PBF_VARINT) {
      while (this.buf[this.pos++] >= 0x80) {}
    }
    else if (type === PBF_BYTES) {
      this.pos = this.readVarint() + this.pos
    }
    else if (type === PBF_FIXED32) {
      this.pos += 4
    }
    else if (type === PBF_FIXED64) {
      this.pos += 8
    }
    else {
      throw new Error(`Unimplemented wire type: ${type}`)
    }
  }

  // ---------- writes ----------

  writeTag(tag: number, type: number): void {
    this.writeVarint((tag << 3) | type)
  }

  // Reserve `n` bytes in the buffer, growing as needed.
  realloc(min: number): void {
    let length = Math.max(this.length, 16)
    while (length < this.pos + min)
      length *= 2
    if (length !== this.buf.length) {
      const next = new Uint8Array(length)
      next.set(this.buf)
      this.buf = next
      this._view = new DataView(next.buffer)
      this.length = length
    }
  }

  finish(): Uint8Array {
    this.length = this.pos
    this.pos = 0
    return this.buf.subarray(0, this.length)
  }

  destroy(): void {
    this.buf = new Uint8Array(0)
    this._view = new DataView(this.buf.buffer)
    this.pos = 0
    this.length = 0
    this.type = 0
  }

  // -- varints --

  writeVarint(val: number): void {
    if (val > 0xFFFFFFF || val < 0) {
      writeBigVarint(val, this)
      return
    }
    this.realloc(4)
    const v = val | 0
    this.buf[this.pos++] = v & 0x7F | (v > 0x7F ? 0x80 : 0)
    if (v <= 0x7F)
      return
    this.buf[this.pos++] = ((v >>> 7) & 0x7F) | (v > 0x3FFF ? 0x80 : 0)
    if (v <= 0x3FFF)
      return
    this.buf[this.pos++] = ((v >>> 14) & 0x7F) | (v > 0x1FFFFF ? 0x80 : 0)
    if (v <= 0x1FFFFF)
      return
    this.buf[this.pos++] = ((v >>> 21) & 0x7F) | (v > 0xFFFFFFF ? 0x80 : 0)
    if (v <= 0xFFFFFFF)
      return
    // unreachable; covered by the >0xFFFFFFF branch at the top
  }

  writeSVarint(val: number): void {
    this.writeVarint(val < 0 ? -val * 2 - 1 : val * 2)
  }

  writeBoolean(val: boolean): void {
    this.writeVarint(val ? 1 : 0)
  }

  writeString(str: string): void {
    const bytes = utf8Encoder !== null ? utf8Encoder.encode(str) : manualUtf8Encode(str)
    this.writeVarint(bytes.length)
    this.realloc(bytes.length)
    this.buf.set(bytes, this.pos)
    this.pos += bytes.length
  }

  writeFloat(val: number): void {
    this.realloc(4)
    this._view.setFloat32(this.pos, val, true)
    this.pos += 4
  }

  writeDouble(val: number): void {
    this.realloc(8)
    this._view.setFloat64(this.pos, val, true)
    this.pos += 8
  }

  writeBytes(bytes: Uint8Array): void {
    this.writeVarint(bytes.length)
    this.realloc(bytes.length)
    this.buf.set(bytes, this.pos)
    this.pos += bytes.length
  }

  writeRawFixed32(val: number): void {
    this.realloc(4)
    this._view.setUint32(this.pos, val >>> 0, true)
    this.pos += 4
  }

  writeRawSFixed32(val: number): void {
    this.realloc(4)
    this._view.setInt32(this.pos, val | 0, true)
    this.pos += 4
  }

  writeRawFixed64(val: number): void {
    this.realloc(8)
    const lo = val >>> 0
    const hi = Math.floor(val * SHIFT_RIGHT_32) >>> 0
    this._view.setUint32(this.pos, lo, true)
    this._view.setUint32(this.pos + 4, hi, true)
    this.pos += 8
  }

  writeRawSFixed64(val: number): void {
    this.realloc(8)
    const lo = val >>> 0
    const hi = Math.floor(val * SHIFT_RIGHT_32) | 0
    this._view.setUint32(this.pos, lo, true)
    this._view.setInt32(this.pos + 4, hi, true)
    this.pos += 8
  }

  // writeMessage: reserve space for the varint length prefix, call `fn`, then
  // back-patch the length. We reserve 1 byte up front and, if the payload
  // grows past 127, shift bytes to accommodate the longer prefix.
  writeMessage<V>(tag: number, fn: PbfWriteFn<V>, value: V): void {
    this.writeTag(tag, PBF_BYTES)
    // Reserve a single byte; we'll expand if the message turns out larger.
    const headPos = this.pos
    this.pos++
    const startMessage = this.pos
    fn(value, this)
    const len = this.pos - startMessage
    if (len >= 0x80) {
      // Figure out how many bytes the varint length takes and shift the
      // payload to make room.
      const varintLen = varintLength(len)
      this.realloc(varintLen - 1)
      // Shift payload right by (varintLen - 1).
      this.buf.copyWithin(startMessage + varintLen - 1, startMessage, startMessage + len)
      this.pos = headPos
      this.writeVarint(len)
      this.pos = startMessage + varintLen - 1 + len
    }
    else {
      this.buf[headPos] = len
    }
  }

  // -- packed writers --

  writePackedVarint(tag: number, arr: number[]): void {
    if (arr.length > 0)
      this.writeMessage(tag, writePackedVarintFn, arr)
  }

  writePackedSVarint(tag: number, arr: number[]): void {
    if (arr.length > 0)
      this.writeMessage(tag, writePackedSVarintFn, arr)
  }

  writePackedBoolean(tag: number, arr: boolean[]): void {
    if (arr.length > 0)
      this.writeMessage(tag, writePackedBooleanFn, arr)
  }

  writePackedFloat(tag: number, arr: number[]): void {
    if (arr.length > 0)
      this.writeMessage(tag, writePackedFloatFn, arr)
  }

  writePackedDouble(tag: number, arr: number[]): void {
    if (arr.length > 0)
      this.writeMessage(tag, writePackedDoubleFn, arr)
  }

  writePackedFixed32(tag: number, arr: number[]): void {
    if (arr.length > 0)
      this.writeMessage(tag, writePackedFixed32Fn, arr)
  }

  writePackedSFixed32(tag: number, arr: number[]): void {
    if (arr.length > 0)
      this.writeMessage(tag, writePackedSFixed32Fn, arr)
  }

  writePackedFixed64(tag: number, arr: number[]): void {
    if (arr.length > 0)
      this.writeMessage(tag, writePackedFixed64Fn, arr)
  }

  writePackedSFixed64(tag: number, arr: number[]): void {
    if (arr.length > 0)
      this.writeMessage(tag, writePackedSFixed64Fn, arr)
  }

  // -- tagged single-field writers --

  writeBytesField(tag: number, buffer: Uint8Array): void {
    this.writeTag(tag, PBF_BYTES)
    this.writeBytes(buffer)
  }

  writeFixed32(tag: number, val: number): void {
    this.writeTag(tag, PBF_FIXED32)
    this.writeRawFixed32(val)
  }

  writeSFixed32(tag: number, val: number): void {
    this.writeTag(tag, PBF_FIXED32)
    this.writeRawSFixed32(val)
  }

  writeFixed64(tag: number, val: number): void {
    this.writeTag(tag, PBF_FIXED64)
    this.writeRawFixed64(val)
  }

  writeSFixed64(tag: number, val: number): void {
    this.writeTag(tag, PBF_FIXED64)
    this.writeRawSFixed64(val)
  }

  writeVarintField(tag: number, val: number): void {
    this.writeTag(tag, PBF_VARINT)
    this.writeVarint(val)
  }

  writeSVarintField(tag: number, val: number): void {
    this.writeTag(tag, PBF_VARINT)
    this.writeSVarint(val)
  }

  writeStringField(tag: number, str: string): void {
    this.writeTag(tag, PBF_BYTES)
    this.writeString(str)
  }

  writeFloatField(tag: number, val: number): void {
    this.writeTag(tag, PBF_FIXED32)
    this.writeFloat(val)
  }

  writeDoubleField(tag: number, val: number): void {
    this.writeTag(tag, PBF_FIXED64)
    this.writeDouble(val)
  }

  writeBooleanField(tag: number, val: boolean): void {
    this.writeVarintField(tag, val ? 1 : 0)
  }
}

// ---------- module-private helpers ----------

// Continue reading a varint that spilled past 28 bits. `low` holds bits
// 0..27 (already masked), `pbf.pos` points at byte 5. This handles up to
// 10-byte varints and throws if the result can't be represented safely as
// a JS Number.
function readVarintRemainder(low: number, isSigned: boolean, pbf: Pbf): number {
  const buf = pbf.buf
  let b: number
  let high = 0

  b = buf[pbf.pos++]
  // bit 28
  low |= (b & 0x0F) << 28
  high = (b & 0x70) >> 4
  if (b < 0x80)
    return toNum(low, high, isSigned)

  b = buf[pbf.pos++]
  high |= (b & 0x7F) << 3
  if (b < 0x80)
    return toNum(low, high, isSigned)

  b = buf[pbf.pos++]
  high |= (b & 0x7F) << 10
  if (b < 0x80)
    return toNum(low, high, isSigned)

  b = buf[pbf.pos++]
  high |= (b & 0x7F) << 17
  if (b < 0x80)
    return toNum(low, high, isSigned)

  b = buf[pbf.pos++]
  high |= (b & 0x7F) << 24
  if (b < 0x80)
    return toNum(low, high, isSigned)

  b = buf[pbf.pos++]
  // 10th byte; protobuf varints never exceed 10 bytes.
  high |= (b & 0x01) << 31
  if (b < 0x80)
    return toNum(low, high, isSigned)

  throw new Error('Expected varint not more than 10 bytes')
}

function toNum(low: number, high: number, isSigned: boolean): number {
  // Low/high are each 32-bit unsigned; treat as signed if asked and top
  // bit is set (two's complement).
  if (isSigned && (high & 0x80000000) !== 0) {
    const negLow = (~low + 1) >>> 0
    let negHigh = (~high) >>> 0
    if (negLow === 0)
      negHigh = (negHigh + 1) >>> 0
    const mag = negHigh * SHIFT_LEFT_32 + negLow
    if (mag > MAX_SAFE)
      throw new Error('Varint exceeds safe integer range')
    return -mag
  }
  const val = (high >>> 0) * SHIFT_LEFT_32 + (low >>> 0)
  if (val > MAX_SAFE)
    throw new Error('Varint exceeds safe integer range')
  return val
}

function readPackedEnd(pbf: Pbf): number {
  return pbf.readVarint() + pbf.pos
}

// eslint-disable-next-line no-unused-vars
function readPacked<V>(pbf: Pbf, arr: V[] | undefined, readOne: (pbf: Pbf) => V): V[] {
  if (pbf.type !== PBF_BYTES) {
    if (arr === undefined)
      return [readOne(pbf)]
    arr.push(readOne(pbf))
    return arr
  }
  const out = arr === undefined ? [] : arr
  const end = readPackedEnd(pbf)
  while (pbf.pos < end)
    out.push(readOne(pbf))
  return out
}

function varintLength(val: number): number {
  let n = 1
  while (val >= 0x80) {
    val = Math.floor(val / 0x80)
    n++
  }
  return n
}

// Slow-path varint writer for values >= 2^28 and for negatives (which
// protobuf encodes as an unsigned 64-bit two's complement, i.e. a full
// 10-byte varint). Works on a pair of 32-bit halves to stay 64-bit-safe.
function writeBigVarint(val: number, pbf: Pbf): void {
  let low: number
  let high: number
  if (val < 0) {
    const mag = -val
    low = ((~(mag >>> 0)) + 1) >>> 0
    high = (~Math.floor(mag / SHIFT_LEFT_32)) >>> 0
    if (low === 0)
      high = (high + 1) >>> 0
  }
  else {
    low = (val >>> 0)
    high = Math.floor(val / SHIFT_LEFT_32) >>> 0
  }
  pbf.realloc(10)
  // Spill 7 bits at a time. Iteration `i` covers bits [i*7, i*7+7).
  for (let i = 0; i < 10; i++) {
    const bit = i * 7
    const chunk = readBits7(low, high, bit)
    const more = bit + 7 < 64 ? readBitsAbove(low, high, bit + 7) : false
    pbf.buf[pbf.pos++] = more ? chunk | 0x80 : chunk
    if (!more)
      break
  }
}

function readBits7(low: number, high: number, bit: number): number {
  if (bit >= 32)
    return (high >>> (bit - 32)) & 0x7F
  if (bit + 7 <= 32)
    return (low >>> bit) & 0x7F
  return ((low >>> bit) | (high << (32 - bit))) & 0x7F
}

function readBitsAbove(low: number, high: number, startBit: number): boolean {
  if (startBit >= 64)
    return false
  if (startBit >= 32)
    return (high >>> (startBit - 32)) !== 0
  return (low >>> startBit) !== 0 || high !== 0
}

function writePackedVarintFn(arr: number[], pbf: Pbf): void {
  for (let i = 0; i < arr.length; i++) pbf.writeVarint(arr[i])
}
function writePackedSVarintFn(arr: number[], pbf: Pbf): void {
  for (let i = 0; i < arr.length; i++) pbf.writeSVarint(arr[i])
}
function writePackedBooleanFn(arr: boolean[], pbf: Pbf): void {
  for (let i = 0; i < arr.length; i++) pbf.writeBoolean(arr[i])
}
function writePackedFloatFn(arr: number[], pbf: Pbf): void {
  for (let i = 0; i < arr.length; i++) pbf.writeFloat(arr[i])
}
function writePackedDoubleFn(arr: number[], pbf: Pbf): void {
  for (let i = 0; i < arr.length; i++) pbf.writeDouble(arr[i])
}
function writePackedFixed32Fn(arr: number[], pbf: Pbf): void {
  for (let i = 0; i < arr.length; i++) pbf.writeRawFixed32(arr[i])
}
function writePackedSFixed32Fn(arr: number[], pbf: Pbf): void {
  for (let i = 0; i < arr.length; i++) pbf.writeRawSFixed32(arr[i])
}
function writePackedFixed64Fn(arr: number[], pbf: Pbf): void {
  for (let i = 0; i < arr.length; i++) pbf.writeRawFixed64(arr[i])
}
function writePackedSFixed64Fn(arr: number[], pbf: Pbf): void {
  for (let i = 0; i < arr.length; i++) pbf.writeRawSFixed64(arr[i])
}

// Minimal UTF-8 codecs for environments that lack TextEncoder/TextDecoder.
function manualUtf8Decode(buf: Uint8Array, start: number, end: number): string {
  let out = ''
  let i = start
  while (i < end) {
    const b0 = buf[i++]
    if (b0 < 0x80) {
      out += String.fromCharCode(b0)
    }
    else if (b0 < 0xE0) {
      const b1 = buf[i++] & 0x3F
      out += String.fromCharCode(((b0 & 0x1F) << 6) | b1)
    }
    else if (b0 < 0xF0) {
      const b1 = buf[i++] & 0x3F
      const b2 = buf[i++] & 0x3F
      out += String.fromCharCode(((b0 & 0x0F) << 12) | (b1 << 6) | b2)
    }
    else {
      const b1 = buf[i++] & 0x3F
      const b2 = buf[i++] & 0x3F
      const b3 = buf[i++] & 0x3F
      let cp = ((b0 & 0x07) << 18) | (b1 << 12) | (b2 << 6) | b3
      cp -= 0x10000
      out += String.fromCharCode(0xD800 | (cp >> 10))
      out += String.fromCharCode(0xDC00 | (cp & 0x3FF))
    }
  }
  return out
}

function manualUtf8Encode(str: string): Uint8Array {
  const out: number[] = []
  for (let i = 0; i < str.length; i++) {
    let cp = str.charCodeAt(i)
    if (cp >= 0xD800 && cp <= 0xDBFF && i + 1 < str.length) {
      const low = str.charCodeAt(i + 1)
      if (low >= 0xDC00 && low <= 0xDFFF) {
        cp = 0x10000 + (((cp & 0x3FF) << 10) | (low & 0x3FF))
        i++
      }
    }
    if (cp < 0x80) {
      out.push(cp)
    }
    else if (cp < 0x800) {
      out.push(0xC0 | (cp >> 6), 0x80 | (cp & 0x3F))
    }
    else if (cp < 0x10000) {
      out.push(0xE0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3F), 0x80 | (cp & 0x3F))
    }
    else {
      out.push(0xF0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3F), 0x80 | ((cp >> 6) & 0x3F), 0x80 | (cp & 0x3F))
    }
  }
  return new Uint8Array(out)
}
