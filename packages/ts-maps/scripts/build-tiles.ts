#!/usr/bin/env bun
/* eslint-disable no-console */
// Build an OpenMapTiles-schema basemap as a single .pmtiles archive, ready for
// `createTileServer` from `ts-maps/server`.
//
//   bun scripts/build-tiles.ts --area=california --out=california.pmtiles
//   bun scripts/build-tiles.ts --area=monaco --lite          # 5-second smoke test
//
// The heavy lifting is planetiler (https://github.com/onthegomap/planetiler),
// which reads an OpenStreetMap extract and writes OpenMapTiles-schema vector
// tiles — `water`, `transportation`, `place`, `building`, `poi`, … — the schema
// `styles/basemap.ts` is written against, and the one OpenFreeMap serves.
// (Protomaps' planet builds use a different schema; do not swap one for the
// other without restyling.) planetiler is a single Java jar; this script
// fetches a pinned release, runs it, then opens the result with the in-house
// PMTiles reader and decodes a tile to prove the layers are there.
//
// Options:
//   --area=NAME         Geofabrik extract: monaco, california, us-west, us, planet, …
//   --out=FILE          Output archive. Default: <area>.pmtiles
//   --workdir=DIR       Jar, sources and temp files. Default: .tiles-build
//   --memory=SIZE       Java heap (-Xmx). Default: 4g. California is happy
//                       with 4g, the US wants 16g+, the planet 64g+ (or add
//                       `-- --storage=mmap` to trade RAM for disk).
//   --java=PATH         java binary (21+). Default: $JAVA_HOME, then PATH.
//   --fetch-java        No Java installed? Download a portable Temurin 21 JRE
//                       (~50 MB) into the workdir instead of installing one.
//   --lite              Skip planetiler's three global side sources (~1.4 GB:
//                       ocean polygons, Natural Earth, lake centerlines) and
//                       feed it empty stand-ins. OSM-derived layers are all
//                       present; the open sea and the z0-6 Natural Earth
//                       layers are not. For smoke tests and CI, not production.
//   -- ARGS             Passed straight to planetiler (e.g. `-- --maxzoom=15`).

import { Database } from 'bun:sqlite'
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { VectorTile } from '../src/core-map/mvt'
import { Pbf } from '../src/core-map/proto'
import { createTileServer, tileIdToZxy } from '../src/server'

const PLANETILER_VERSION = '0.10.2'
const PLANETILER_URL = `https://github.com/onthegomap/planetiler/releases/download/v${PLANETILER_VERSION}/planetiler.jar`

// ---------- arguments ----------

const argv = process.argv.slice(2)
const split = argv.indexOf('--')
const ours = split === -1 ? argv : argv.slice(0, split)
const passthrough = split === -1 ? [] : argv.slice(split + 1)

function option(name: string): string | undefined {
  const hit = ours.find(a => a === `--${name}` || a.startsWith(`--${name}=`))
  if (!hit)
    return undefined
  return hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : 'true'
}

const area = option('area')
if (!area) {
  console.error('Usage: bun scripts/build-tiles.ts --area=california [--out=california.pmtiles] [--lite] [--memory=4g] [--fetch-java]')
  process.exit(1)
}
const workdir = resolve(option('workdir') ?? '.tiles-build')
const out = resolve(option('out') ?? `${area.replace(/[^\w-]+/g, '-')}.pmtiles`)
const memory = option('memory') ?? '4g'
const lite = option('lite') === 'true'
mkdirSync(workdir, { recursive: true })

// ---------- java ----------

async function works(java: string): Promise<boolean> {
  try {
    const proc = Bun.spawn([java, '-version'], { stdout: 'ignore', stderr: 'pipe' })
    const text = await new Response(proc.stderr).text()
    if (await proc.exited !== 0)
      return false
    // planetiler needs Java 21+.
    const major = Number(/version "(\d+)/.exec(text)?.[1] ?? 0)
    return major >= 21
  }
  catch {
    return false
  }
}

async function fetchJava(): Promise<string> {
  const os = process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'windows' : 'linux'
  const arch = process.arch === 'arm64' ? 'aarch64' : 'x64'
  const dir = join(workdir, 'jre')
  const find = (): string | undefined => {
    if (!existsSync(dir))
      return undefined
    for (const entry of readdirSync(dir)) {
      for (const candidate of [join(dir, entry, 'Contents/Home/bin/java'), join(dir, entry, 'bin/java')]) {
        if (existsSync(candidate))
          return candidate
      }
    }
    return undefined
  }
  const existing = find()
  if (existing)
    return existing
  const url = `https://api.adoptium.net/v3/binary/latest/21/ga/${os}/${arch}/jre/hotspot/normal/eclipse`
  console.log(`Downloading a portable Temurin 21 JRE from ${url}`)
  mkdirSync(dir, { recursive: true })
  const archive = join(dir, 'jre.tar.gz')
  await Bun.write(archive, await fetch(url))
  await Bun.$`tar xzf ${archive} -C ${dir} && rm ${archive}`
  const java = find()
  if (!java)
    throw new Error('Downloaded JRE has no java binary')
  return java
}

async function resolveJava(): Promise<string> {
  const candidates = [option('java'), process.env.JAVA_HOME && join(process.env.JAVA_HOME, 'bin/java'), 'java'].filter(Boolean) as string[]
  for (const candidate of candidates) {
    if (await works(candidate))
      return candidate
  }
  if (option('fetch-java') === 'true')
    return fetchJava()
  console.error('planetiler needs Java 21+, and none was found. Install one (e.g. Temurin 21 from https://adoptium.net),')
  console.error('set JAVA_HOME / --java=PATH, or rerun with --fetch-java to download a portable JRE into the workdir.')
  process.exit(1)
}

// ---------- planetiler ----------

async function ensureJar(): Promise<string> {
  const jar = join(workdir, `planetiler-${PLANETILER_VERSION}.jar`)
  if (!existsSync(jar)) {
    console.log(`Downloading planetiler ${PLANETILER_VERSION} (~90 MB)`)
    const response = await fetch(PLANETILER_URL)
    if (!response.ok)
      throw new Error(`planetiler download failed: HTTP ${response.status}`)
    await Bun.write(jar, response)
  }
  return jar
}

/**
 * Empty stand-ins for the three global sources, for `--lite`: a shapefile
 * with a header and no records (plus its .prj, which planetiler needs to set
 * up the reprojection even for zero features), and an SQLite file with no
 * Natural Earth tables in it.
 */
async function writeStubs(dir: string): Promise<string[]> {
  mkdirSync(dir, { recursive: true })
  const shpHeader = (shapeType: number): Uint8Array => {
    const bytes = new Uint8Array(100)
    const view = new DataView(bytes.buffer)
    view.setInt32(0, 9994, false) // file code
    view.setInt32(24, 50, false) // file length in 16-bit words: header only
    view.setInt32(28, 1000, true) // version
    view.setInt32(32, shapeType, true)
    return bytes
  }
  const dbf = (): Uint8Array => {
    // dBASE III: 32-byte header, one 32-byte field descriptor (FID, numeric),
    // terminator, zero records, EOF marker.
    const bytes = new Uint8Array(66)
    const view = new DataView(bytes.buffer)
    bytes.set([0x03, 126, 1, 1])
    view.setUint16(8, 65, true)
    view.setUint16(10, 11, true)
    bytes.set(new TextEncoder().encode('FID'), 32)
    bytes[43] = 'N'.charCodeAt(0)
    bytes[48] = 10
    bytes[64] = 0x0D
    bytes[65] = 0x1A
    return bytes
  }
  const wgs84 = 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]'
  const webMercator = `PROJCS["WGS_84_Pseudo_Mercator",${wgs84},PROJECTION["Mercator"],PARAMETER["False_Easting",0.0],PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",0.0],PARAMETER["Standard_Parallel_1",0.0],UNIT["Meter",1.0]]`

  for (const [name, shapeType, prj] of [['water_polygons', 5, webMercator], ['lake_centerline', 3, wgs84]] as const) {
    await Bun.write(join(dir, `${name}.shp`), shpHeader(shapeType))
    await Bun.write(join(dir, `${name}.shx`), shpHeader(shapeType))
    await Bun.write(join(dir, `${name}.dbf`), dbf())
    await Bun.write(join(dir, `${name}.prj`), prj)
  }
  const sqlite = join(dir, 'natural_earth.sqlite')
  new Database(sqlite, { create: true }).exec('CREATE TABLE IF NOT EXISTS empty (id INTEGER)')

  return [
    `--water_polygons_path=${join(dir, 'water_polygons.shp')}`,
    `--lake_centerlines_path=${join(dir, 'lake_centerline.shp')}`,
    `--natural_earth_path=${sqlite}`,
  ]
}

// ---------- verification ----------

/**
 * Serve the archive in-process, fetch its TileJSON and its densest max-zoom
 * tile (the city centre, not the empty middle of a bounding box), decode it.
 */
async function verify(path: string): Promise<void> {
  const server = createTileServer({ archive: path, revalidate: false })
  const tileJSON = await server.tileJSON('http://localhost')
  const header = await server.archive.getHeader()

  let densest = { tileId: 0, length: -1 }
  for await (const entry of server.archive.entries()) {
    if (tileIdToZxy(entry.tileId)[0] === header.maxZoom && entry.length > densest.length)
      densest = entry
  }
  const [z, x, y] = tileIdToZxy(densest.tileId)
  const response = await server.fetch(new Request(`http://localhost/${z}/${x}/${y}.pbf`))
  const tile = response.status === 200 ? new VectorTile(new Pbf(new Uint8Array(await response.arrayBuffer()))) : undefined
  await server.close()

  const declared = (tileJSON.vector_layers as Array<{ id: string }> | undefined ?? []).map(l => l.id)
  const layers = Object.entries(tile?.layers ?? {}).map(([name, layer]) => `${name} (${layer.length})`)
  console.log(`\n${path}`)
  console.log(`  ${(statSync(path).size / 1e6).toFixed(1)} MB, zoom ${tileJSON.minzoom}-${tileJSON.maxzoom}, ${header.numAddressedTiles.toLocaleString()} tiles (${header.numTileContents.toLocaleString()} unique)`)
  console.log(`  bounds ${tileJSON.bounds.map(v => v.toFixed(3)).join(', ')}`)
  console.log(`  declared layers: ${declared.join(', ')}`)
  console.log(`  densest tile ${z}/${x}/${y} -> HTTP ${response.status}, features per layer: ${layers.join(', ') || '(none)'}`)
  const missing = ['water', 'transportation', 'place'].filter(l => !declared.includes(l))
  if (missing.length)
    throw new Error(`Archive is missing OpenMapTiles layers: ${missing.join(', ')}`)
}

// ---------- run ----------

const java = await resolveJava()
const jar = await ensureJar()
const sources = lite ? await writeStubs(join(workdir, 'stubs')) : ['--download']
const args = [
  java,
  `-Xmx${memory}`,
  '-jar',
  jar,
  `--area=${area}`,
  `--output=${out}`,
  `--download_dir=${join(workdir, 'sources')}`,
  `--tmpdir=${join(workdir, 'tmp')}`,
  '--force',
  ...sources,
  ...passthrough,
]
console.log(`$ ${args.join(' ')}`)
const started = performance.now()
const proc = Bun.spawn(args, { stdout: 'inherit', stderr: 'inherit', cwd: workdir })
if (await proc.exited !== 0)
  process.exit(1)
console.log(`\nplanetiler finished in ${((performance.now() - started) / 1000).toFixed(1)} s`)
await verify(out)
