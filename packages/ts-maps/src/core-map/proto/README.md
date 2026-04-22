# `proto/` — in-house Protobuf reader

A minimal, zero-dependency decoder for the [protobuf wire format][encoding],
just enough to read [Mapbox Vector Tiles v2][mvt]. Written in idiomatic
TypeScript to keep `ts-maps` dependency-free.

## Why not `protobufjs` / `pbf`

- `ts-maps` ships zero runtime deps by design.
- Vector tiles use a very narrow subset of protobuf (no groups, no maps, no

  unknowns beyond skip). A ~600-line hand-rolled reader easily covers it.

- Keeping the wire-format code in-tree lets us inline hot paths (varint

  decoding, packed-repeated geometry commands) without a library boundary.

## What's supported

| Feature | Wire type | Supported |
| ------- | --------- | --------- |
| `int32` / `int64` / `uint32` / `uint64` / `bool` / `enum` varints | 0 | yes |
| `sint32` / `sint64` (zigzag) | 0 | yes |
| `fixed64` / `sfixed64` / `double` | 1 | yes |
| length-delimited (bytes / string / nested message / packed) | 2 | yes |
| `fixed32` / `sfixed32` / `float` | 5 | yes |
| group start / end | 3 / 4 | no (deprecated in proto3) |

## API sketch

```ts
import { Pbf } from 'ts-maps/core-map/proto'

const pbf = new Pbf(bytes)
const tile = pbf.readFields(readTile, { layers: [] as Layer[] })

function readTile(tag: number, tile: Tile, pbf: Pbf): void {
  if (tag === 3)
    tile.layers.push(pbf.readMessage(readLayer, { features: [] } as Layer))
}
```

Reading tagged fields:

- `readFields(cb, result, end?)` iterates fields until `end` (or buffer end).
- On each field, `pbf.type` and the numeric tag are populated, then `cb` is

  invoked. If the callback doesn't advance `pbf.pos`, the field is skipped.

- `readMessage(cb, result)` = read a length-delimited submessage.

Reading values:

- `readVarint(isSigned?)` — returns a `Number`, safe up to `2^53 - 1`. Throws

  on anything larger.

- `readSVarint()` — zigzag-decoded signed varint.
- `readFixed32()`, `readSFixed32()`, `readFixed64()`, `readSFixed64()`,

  `readFloat()`, `readDouble()`, `readString()`, `readBytes()`, `readBoolean()`.

- `readPacked*` — loops until the packed message end.

Writing (used by tests and future debug tooling):

- `writeVarintField(tag, val)`, `writeStringField(tag, str)`, …
- `writeMessage(tag, fn, value)` — reserves a length prefix, back-patches on

  exit. `writePacked*` reuses this to produce packed repeated fields.

- `finish()` returns a trimmed `Uint8Array` at `buf[0..pos]`.

## Acknowledgement

This decoder is an independent rewrite. We looked at
[mapbox/pbf][mapbox-pbf] (BSD-3-Clause) for wire-format correctness — in
particular the 10-byte varint edge cases and zigzag convention — but no code
was copied. Credit to its authors for the clearest existing reference on the
spec.

[encoding]: https://protobuf.dev/programming-guides/encoding/
[mvt]: https://github.com/mapbox/vector-tile-spec/tree/master/2.1
[mapbox-pbf]: https://github.com/mapbox/pbf
