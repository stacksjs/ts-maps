// PMTiles v3 directories — in-house, zero-dep.
// Independent TypeScript implementation of the directory encoding in
// https://github.com/protomaps/PMTiles/blob/main/spec/v3/spec.md.
//
// A directory is a sorted list of entries, each saying "tile ids
// [tileId, tileId + runLength) live at bytes [offset, offset + length)":
//
//   interface Entry { tileId, offset, length, runLength }
//
// Two tricks keep it small:
//
// - **Run lengths.** A run of identical tiles — the open ocean at zoom 14 is
//   millions of copies of one empty-water tile — is a single entry. `runLength`
//   is how many consecutive ids share the bytes.
// - **Leaf pointers.** An entry with `runLength === 0` does not point at tile
//   data at all: it points at another directory (a *leaf*) covering the ids
//   from `tileId` up to the next entry. The root stays under 16 KiB however big
//   the archive gets; a planet archive is root → leaves, never deeper than that
//   in practice (the spec allows a depth of 3).
//
// On the wire the entries are stored column by column, each column as varints,
// which turns the sorted, mostly-adjacent values into tiny deltas:
//
//   numEntries
//   tileId    × n   delta from the previous entry's tileId
//   runLength × n
//   length    × n
//   offset    × n   0 = "immediately after the previous entry's bytes",
//                   otherwise offset + 1
//
// The `offset + 1` convention exists because the common case in a clustered
// archive is "contiguous with the previous tile", which then costs one byte.
// The whole blob is then compressed with the header's `internalCompression`.

import { Pbf } from '../proto/Pbf'

export interface Entry {
  tileId: number
  /** Byte offset — into tile data, or into the leaf section when `runLength === 0`. */
  offset: number
  length: number
  /** Consecutive tile ids sharing these bytes; `0` marks a leaf-directory pointer. */
  runLength: number
}

/** Decode an (already decompressed) directory. */
export function decodeDirectory(bytes: Uint8Array): Entry[] {
  const pbf = new Pbf(bytes)
  const read = (): number => {
    if (pbf.pos >= bytes.length)
      throw new RangeError('PMTiles: directory is truncated')
    let value: number
    try {
      value = pbf.readVarint()
    }
    catch {
      value = Number.NaN
    }
    // A varint cut off mid-way reads past the end instead of stopping there.
    if (pbf.pos > bytes.length || Number.isNaN(value))
      throw new RangeError('PMTiles: directory is truncated')
    return value
  }

  const count = read()
  // Every entry costs at least four varint bytes; a count that cannot fit is
  // corruption, and refusing it here avoids a giant allocation.
  if (count * 4 > bytes.length)
    throw new RangeError(`PMTiles: directory claims ${count} entries in ${bytes.length} bytes`)

  const entries: Entry[] = Array.from({ length: count })
  let lastId = 0
  for (let i = 0; i < count; i++) {
    lastId += read()
    entries[i] = { tileId: lastId, offset: 0, length: 0, runLength: 1 }
  }
  for (let i = 0; i < count; i++)
    entries[i]!.runLength = read()
  for (let i = 0; i < count; i++)
    entries[i]!.length = read()
  for (let i = 0; i < count; i++) {
    const value = read()
    const entry = entries[i]!
    if (value === 0 && i > 0) {
      const prev = entries[i - 1]!
      entry.offset = prev.offset + prev.length
    }
    else {
      entry.offset = value - 1
    }
  }
  return entries
}

/** Encode `entries` (sorted by tileId) into the uncompressed wire form. */
export function encodeDirectory(entries: readonly Entry[]): Uint8Array {
  const pbf = new Pbf()
  pbf.writeVarint(entries.length)
  let lastId = 0
  for (const entry of entries) {
    pbf.writeVarint(entry.tileId - lastId)
    lastId = entry.tileId
  }
  for (const entry of entries)
    pbf.writeVarint(entry.runLength)
  for (const entry of entries)
    pbf.writeVarint(entry.length)
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!
    const prev = entries[i - 1]
    if (i > 0 && prev && entry.offset === prev.offset + prev.length)
      pbf.writeVarint(0)
    else
      pbf.writeVarint(entry.offset + 1)
  }
  return pbf.finish().slice()
}

/**
 * The entry that answers `tileId` within one directory, or `undefined`.
 *
 * Binary search for the last entry whose `tileId` is ≤ the target. That entry
 * either covers the target with its run, or is a leaf pointer (whose range
 * extends to the next entry, so it is the only leaf that can hold the
 * target), or the target falls in a gap — an empty tile.
 */
export function findTile(entries: readonly Entry[], tileId: number): Entry | undefined {
  let lo = 0
  let hi = entries.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const cmp = tileId - entries[mid]!.tileId
    if (cmp > 0)
      lo = mid + 1
    else if (cmp < 0)
      hi = mid - 1
    else
      return entries[mid]
  }
  // `hi` is now the last entry with tileId < target.
  if (hi >= 0) {
    const entry = entries[hi]!
    if (entry.runLength === 0)
      return entry
    if (tileId - entry.tileId < entry.runLength)
      return entry
  }
  return undefined
}
