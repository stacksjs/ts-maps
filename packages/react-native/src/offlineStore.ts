import type { KeyValueStorage } from 'ts-maps'

/**
 * Downloaded maps kept in the app's own files, for `MapView`'s
 * `offlineStore`.
 *
 * Each key is one file in a folder of the app's documents, which the OS
 * leaves alone and the app can measure, back up or clear. Neither adapter
 * imports its library: the app passes in the module it already uses, so
 * this package depends on neither.
 */

/** A key as a file name: letters, digits, `.`, `_` and `-` as they are, the rest spelled out. Long keys are hashed. */
export function fileNameFor(key: string): string {
  const safe = key.replace(/[^\w.-]/g, c => `~${c.charCodeAt(0).toString(16).padStart(4, '0')}`)
  return safe.length <= 200 ? safe : `~h${hash(key)}-${key.length}`
}

/** cyrb53: 53 bits, so two tile URLs will not share a file. */
function hash(text: string): string {
  let h1 = 0xDEADBEEF
  let h2 = 0x41C6CE57
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

/** The parts of `expo-file-system/legacy` this uses. */
export interface ExpoFileSystemLike {
  documentDirectory: string | null
  readAsStringAsync: (uri: string) => Promise<string>
  writeAsStringAsync: (uri: string, contents: string) => Promise<void>
  deleteAsync: (uri: string, options?: { idempotent?: boolean }) => Promise<void>
  getInfoAsync: (uri: string) => Promise<{ exists: boolean }>
  makeDirectoryAsync: (uri: string, options?: { intermediates?: boolean }) => Promise<void>
}

/**
 * Keep downloaded maps with Expo's file system.
 *
 * ```ts
 * import * as FileSystem from 'expo-file-system/legacy'
 * <MapView offlineStore={expoFileSystemStore(FileSystem)} … />
 * ```
 */
export function expoFileSystemStore(fs: ExpoFileSystemLike, folder: string = 'ts-maps-offline'): KeyValueStorage {
  const dir = `${fs.documentDirectory ?? ''}${folder}/`
  let made: Promise<void> | undefined
  const ready = (): Promise<void> => (made ??= fs.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {}))
  return {
    async get(key) {
      const uri = dir + fileNameFor(key)
      if (!(await fs.getInfoAsync(uri)).exists)
        return undefined
      return fs.readAsStringAsync(uri)
    },
    async set(key, value) {
      await ready()
      await fs.writeAsStringAsync(dir + fileNameFor(key), value)
    },
    async delete(key) {
      await fs.deleteAsync(dir + fileNameFor(key), { idempotent: true })
    },
  }
}

/** The parts of `react-native-fs` this uses. */
export interface ReactNativeFsLike {
  DocumentDirectoryPath: string
  readFile: (path: string, encoding?: string) => Promise<string>
  writeFile: (path: string, contents: string, encoding?: string) => Promise<void>
  unlink: (path: string) => Promise<void>
  exists: (path: string) => Promise<boolean>
  mkdir: (path: string) => Promise<void>
}

/**
 * Keep downloaded maps with `react-native-fs`.
 *
 * ```ts
 * import RNFS from 'react-native-fs'
 * <MapView offlineStore={reactNativeFsStore(RNFS)} … />
 * ```
 */
export function reactNativeFsStore(fs: ReactNativeFsLike, folder: string = 'ts-maps-offline'): KeyValueStorage {
  const dir = `${fs.DocumentDirectoryPath}/${folder}`
  let made: Promise<void> | undefined
  const ready = (): Promise<void> => (made ??= fs.mkdir(dir).catch(() => {}))
  return {
    async get(key) {
      const path = `${dir}/${fileNameFor(key)}`
      if (!(await fs.exists(path)))
        return undefined
      return fs.readFile(path, 'utf8')
    },
    async set(key, value) {
      await ready()
      await fs.writeFile(`${dir}/${fileNameFor(key)}`, value, 'utf8')
    },
    async delete(key) {
      const path = `${dir}/${fileNameFor(key)}`
      if (await fs.exists(path))
        await fs.unlink(path)
    },
  }
}
