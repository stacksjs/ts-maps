/**
 * Just enough glTF 2.0 to stand a landmark on the map.
 *
 * A landmark is a model someone made of a building: a `.glb` (or a `.gltf`
 * and its buffers) from Blender, SketchUp or a photogrammetry pipeline. This
 * reads its triangles, the node transforms placing them, and the colour of
 * each: vertex colours and `baseColorFactor`. Textures are left out; the
 * building pass lights by colour, as Apple's own landmarks are mostly
 * coloured, not photographed. So are Draco and meshopt compression, which
 * need decoders this library does not carry.
 *
 * glTF is in metres, Y up, the model facing +Z. On the map that is: X east,
 * Y up, Z south, so a model made facing the viewer faces south, and
 * `rotation` turns it from there.
 */

export interface GltfJson {
  asset?: { version?: string }
  scene?: number
  scenes?: Array<{ nodes?: number[] }>
  nodes?: Array<{ mesh?: number, children?: number[], matrix?: number[], translation?: number[], rotation?: number[], scale?: number[] }>
  meshes?: Array<{ primitives: Array<{ attributes: Record<string, number>, indices?: number, material?: number, mode?: number }> }>
  materials?: Array<{ pbrMetallicRoughness?: { baseColorFactor?: number[] } }>
  accessors?: Array<{ bufferView?: number, byteOffset?: number, componentType: number, normalized?: boolean, count: number, type: string }>
  bufferViews?: Array<{ buffer: number, byteOffset?: number, byteLength: number, byteStride?: number }>
  buffers?: Array<{ uri?: string, byteLength: number }>
  extensionsRequired?: string[]
}

/**
 * A model's triangles, three vertices each, on the map's axes: x east, y
 * south, z up, in metres from the model's origin.
 */
export interface LandmarkModel {
  positions: Float32Array
  /** Unit normals, same axes. */
  normals: Float32Array
  /** 0–1 RGBA per vertex. */
  colors: Float32Array
  count: number
  /** [minX, minY, minZ, maxX, maxY, maxZ]. */
  bounds: [number, number, number, number, number, number]
}

const GLB_MAGIC = 0x46546C67
const CHUNK_JSON = 0x4E4F534A
const CHUNK_BIN = 0x004E4942

/** A `.glb`'s JSON and its binary chunk. */
export function parseGLB(data: ArrayBuffer | Uint8Array): { json: GltfJson, bin?: Uint8Array } {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes.byteLength < 20 || view.getUint32(0, true) !== GLB_MAGIC)
    throw new Error('Not a GLB file')
  if (view.getUint32(4, true) !== 2)
    throw new Error(`GLB version ${view.getUint32(4, true)} is not supported; only glTF 2.0`)
  const length = Math.min(view.getUint32(8, true), bytes.byteLength)
  let json: GltfJson | undefined
  let bin: Uint8Array | undefined
  for (let offset = 12; offset + 8 <= length;) {
    const chunkLength = view.getUint32(offset, true)
    const type = view.getUint32(offset + 4, true)
    const chunk = bytes.subarray(offset + 8, offset + 8 + chunkLength)
    if (type === CHUNK_JSON)
      json = JSON.parse(new TextDecoder().decode(chunk))
    else if (type === CHUNK_BIN && !bin)
      bin = chunk
    offset += 8 + chunkLength
  }
  if (!json)
    throw new Error('GLB has no JSON chunk')
  return { json, bin }
}

export interface LoadModelOptions {
  /** Injectable for tests. */
  fetch?: typeof fetch
  signal?: AbortSignal
}

/** A `.glb` or `.gltf` URL, a `.glb`'s bytes, or a parsed glTF (with its buffers inline). */
export type ModelSource = string | ArrayBuffer | Uint8Array | GltfJson | LandmarkModel

/** Read a model from a URL, bytes or glTF JSON. */
export async function loadModel(source: ModelSource, options: LoadModelOptions = {}): Promise<LandmarkModel> {
  if (isModel(source))
    return source
  const get = options.fetch ?? fetch
  if (typeof source === 'string') {
    const response = await get(source, { signal: options.signal })
    if (!response.ok)
      throw new Error(`Model request failed: ${response.status} ${response.statusText}`)
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (isGLB(bytes)) {
      const { json, bin } = parseGLB(bytes)
      return modelFromGltf(json, await buffersOf(json, bin, source, get, options.signal))
    }
    const json = JSON.parse(new TextDecoder().decode(bytes)) as GltfJson
    return modelFromGltf(json, await buffersOf(json, undefined, source, get, options.signal))
  }
  if (source instanceof ArrayBuffer || source instanceof Uint8Array) {
    const { json, bin } = parseGLB(source)
    return modelFromGltf(json, await buffersOf(json, bin, undefined, get, options.signal))
  }
  return modelFromGltf(source, await buffersOf(source, undefined, undefined, get, options.signal))
}

function isModel(source: ModelSource): source is LandmarkModel {
  return typeof source === 'object' && source !== null && 'positions' in source && (source as LandmarkModel).positions instanceof Float32Array
}

function isGLB(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 4 && new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, true) === GLB_MAGIC
}

async function buffersOf(json: GltfJson, bin: Uint8Array | undefined, base: string | undefined, get: typeof fetch, signal?: AbortSignal): Promise<Uint8Array[]> {
  return Promise.all((json.buffers ?? []).map(async (buffer, i) => {
    if (!buffer.uri) {
      if (i === 0 && bin)
        return bin
      throw new Error(`glTF buffer ${i} has no data`)
    }
    if (buffer.uri.startsWith('data:')) {
      const comma = buffer.uri.indexOf(',')
      const binary = atob(buffer.uri.slice(comma + 1))
      const out = new Uint8Array(binary.length)
      for (let n = 0; n < binary.length; n++)
        out[n] = binary.charCodeAt(n)
      return out
    }
    const url = base ? new URL(buffer.uri, new URL(base, globalThis.location?.href ?? 'http://localhost/')).href : buffer.uri
    const response = await get(url, { signal })
    if (!response.ok)
      throw new Error(`glTF buffer request failed: ${response.status} ${response.statusText}`)
    return new Uint8Array(await response.arrayBuffer())
  }))
}

const COMPONENTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }
const BYTES: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }

/** An accessor's values as numbers, normalized integers scaled to 0–1 (or −1–1). */
function readAccessor(json: GltfJson, buffers: Uint8Array[], index: number): { values: Float64Array, size: number } {
  const accessor = json.accessors?.[index]
  if (!accessor)
    throw new Error(`glTF accessor ${index} is missing`)
  const size = COMPONENTS[accessor.type] ?? 1
  const values = new Float64Array(accessor.count * size)
  if (accessor.bufferView === undefined)
    return { values, size }
  const view = json.bufferViews![accessor.bufferView]!
  const buffer = buffers[view.buffer]!
  const bytes = BYTES[accessor.componentType]!
  const stride = view.byteStride || bytes * size
  const data = new DataView(buffer.buffer, buffer.byteOffset + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0))
  const scale = accessor.normalized ? ({ 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 } as Record<number, number>)[accessor.componentType] ?? 1 : 1
  for (let i = 0; i < accessor.count; i++) {
    for (let c = 0; c < size; c++) {
      const at = i * stride + c * bytes
      const v = read(data, accessor.componentType, at)
      values[i * size + c] = scale === 1 ? v : Math.max(-1, v / scale)
    }
  }
  return { values, size }
}

function read(data: DataView, type: number, at: number): number {
  switch (type) {
    case 5120:
      return data.getInt8(at)
    case 5121:
      return data.getUint8(at)
    case 5122:
      return data.getInt16(at, true)
    case 5123:
      return data.getUint16(at, true)
    case 5125:
      return data.getUint32(at, true)
    default:
      return data.getFloat32(at, true)
  }
}

type Mat4 = Float64Array

function identity(): Mat4 {
  const m = new Float64Array(16)
  m[0] = m[5] = m[10] = m[15] = 1
  return m
}

/** a·b, column-major. */
function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Float64Array(16)
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let sum = 0
      for (let k = 0; k < 4; k++)
        sum += a[k * 4 + r]! * b[c * 4 + k]!
      out[c * 4 + r] = sum
    }
  }
  return out
}

function nodeMatrix(node: NonNullable<GltfJson['nodes']>[number]): Mat4 {
  if (node.matrix?.length === 16)
    return Float64Array.from(node.matrix)
  const [tx, ty, tz] = node.translation ?? [0, 0, 0]
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1]
  const [sx, sy, sz] = node.scale ?? [1, 1, 1]
  // T·R·S.
  return Float64Array.from([
    (1 - 2 * (y! * y! + z! * z!)) * sx!, 2 * (x! * y! + z! * w!) * sx!, 2 * (x! * z! - y! * w!) * sx!, 0,
    2 * (x! * y! - z! * w!) * sy!, (1 - 2 * (x! * x! + z! * z!)) * sy!, 2 * (y! * z! + x! * w!) * sy!, 0,
    2 * (x! * z! + y! * w!) * sz!, 2 * (y! * z! - x! * w!) * sz!, (1 - 2 * (x! * x! + y! * y!)) * sz!, 0,
    tx!, ty!, tz!, 1,
  ])
}

/** The triangles of a glTF's default scene, every node's transform applied, on the map's axes. */
export function modelFromGltf(json: GltfJson, buffers: Uint8Array[] = []): LandmarkModel {
  const unsupported = (json.extensionsRequired ?? []).filter(e => e !== 'KHR_materials_unlit')
  if (unsupported.length)
    throw new Error(`glTF needs ${unsupported.join(', ')}, which ts-maps does not read`)
  const positions: number[] = []
  const normals: number[] = []
  const colors: number[] = []

  const draw = (meshIndex: number, matrix: Mat4): void => {
    const mesh = json.meshes?.[meshIndex]
    for (const primitive of mesh?.primitives ?? []) {
      if ((primitive.mode ?? 4) !== 4 || primitive.attributes.POSITION === undefined)
        continue
      const pos = readAccessor(json, buffers, primitive.attributes.POSITION)
      const nor = primitive.attributes.NORMAL !== undefined ? readAccessor(json, buffers, primitive.attributes.NORMAL) : undefined
      const col = primitive.attributes.COLOR_0 !== undefined ? readAccessor(json, buffers, primitive.attributes.COLOR_0) : undefined
      const factor = json.materials?.[primitive.material ?? -1]?.pbrMetallicRoughness?.baseColorFactor ?? [1, 1, 1, 1]
      const count = pos.values.length / 3
      const order = primitive.indices !== undefined ? readAccessor(json, buffers, primitive.indices).values : Float64Array.from({ length: count }, (_, i) => i)
      // Normals go through the inverse transpose; for the rotations and
      // scales models use, the matrix with each axis renormalised will do,
      // and a mirrored node flips the winding back.
      const det = matrix[0]! * (matrix[5]! * matrix[10]! - matrix[9]! * matrix[6]!)
        - matrix[4]! * (matrix[1]! * matrix[10]! - matrix[9]! * matrix[2]!)
        + matrix[8]! * (matrix[1]! * matrix[6]! - matrix[5]! * matrix[2]!)
      const mirrored = det < 0
      const point = (i: number): [number, number, number] => {
        const x = pos.values[i * 3]!
        const y = pos.values[i * 3 + 1]!
        const z = pos.values[i * 3 + 2]!
        return [
          matrix[0]! * x + matrix[4]! * y + matrix[8]! * z + matrix[12]!,
          matrix[1]! * x + matrix[5]! * y + matrix[9]! * z + matrix[13]!,
          matrix[2]! * x + matrix[6]! * y + matrix[10]! * z + matrix[14]!,
        ]
      }
      for (let t = 0; t + 2 < order.length; t += 3) {
        const ids = mirrored ? [order[t]!, order[t + 2]!, order[t + 1]!] : [order[t]!, order[t + 1]!, order[t + 2]!]
        const corners = ids.map(point)
        // The face's own normal, where the model has none.
        const [a, b, c] = corners as [[number, number, number], [number, number, number], [number, number, number]]
        const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
        const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
        let face = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!]
        const length = Math.hypot(face[0]!, face[1]!, face[2]!)
        if (!length)
          continue
        face = face.map(f => f / length)
        ids.forEach((id, n) => {
          const [x, y, z] = corners[n]!
          // glTF X, Y, Z → east, south, up.
          positions.push(x, z, y)
          let nx = face[0]!
          let ny = face[1]!
          let nz = face[2]!
          if (nor) {
            const ox = nor.values[id * 3]!
            const oy = nor.values[id * 3 + 1]!
            const oz = nor.values[id * 3 + 2]!
            nx = matrix[0]! * ox + matrix[4]! * oy + matrix[8]! * oz
            ny = matrix[1]! * ox + matrix[5]! * oy + matrix[9]! * oz
            nz = matrix[2]! * ox + matrix[6]! * oy + matrix[10]! * oz
            const l = Math.hypot(nx, ny, nz) || 1
            nx /= l
            ny /= l
            nz /= l
          }
          normals.push(nx, nz, ny)
          const r = col ? col.values[id * col.size]! : 1
          const g = col ? col.values[id * col.size + 1]! : 1
          const bl = col ? col.values[id * col.size + 2]! : 1
          const al = col && col.size === 4 ? col.values[id * col.size + 3]! : 1
          colors.push(r * factor[0]!, g * factor[1]!, bl * factor[2]!, al * (factor[3] ?? 1))
        })
      }
    }
  }

  const visit = (index: number, parent: Mat4): void => {
    const node = json.nodes?.[index]
    if (!node)
      return
    const matrix = multiply(parent, nodeMatrix(node))
    if (node.mesh !== undefined)
      draw(node.mesh, matrix)
    for (const child of node.children ?? [])
      visit(child, matrix)
  }
  const scene = json.scenes?.[json.scene ?? 0]
  if (scene) {
    for (const root of scene.nodes ?? [])
      visit(root, identity())
  }
  else {
    // No scene: every mesh as it is.
    json.meshes?.forEach((_, i) => draw(i, identity()))
  }

  const bounds: LandmarkModel['bounds'] = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]
  for (let i = 0; i < positions.length; i += 3) {
    for (let c = 0; c < 3; c++) {
      bounds[c] = Math.min(bounds[c]!, positions[i + c]!)
      bounds[c + 3] = Math.max(bounds[c + 3]!, positions[i + c]!)
    }
  }
  return {
    positions: Float32Array.from(positions),
    normals: Float32Array.from(normals),
    colors: Float32Array.from(colors),
    count: positions.length / 3,
    bounds,
  }
}
