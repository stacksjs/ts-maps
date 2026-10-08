#!/usr/bin/env bun
/* eslint-disable no-console */
/**
 * Publish every package in packages/ to npm: the core and each framework
 * binding, at the version the release gave them all.
 *
 *   bun scripts/publish-packages.ts [--dry-run]
 *
 * Run after `bun run build`, by the release workflow on a tag. A version
 * already on npm is skipped, so running it again — after one package failed,
 * or to publish packages a release left out — only publishes what's missing.
 *
 * The packages depend on each other as `workspace:*`, which means nothing
 * outside this repo. While each is published its package.json names the real
 * version instead (`^0.4.0`), and is put back after. They go in dependency
 * order, so `ts-maps` is on npm before the bindings that need it, and
 * `@ts-maps/vue` before the Nuxt module.
 *
 * `--dry-run` packs each package and lists what would go up, publishing
 * nothing.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dir, '..')
const ORDER = ['ts-maps', 'react', 'vue', 'svelte', 'solid', 'stx', 'react-native', 'nuxt']
const REGISTRY = 'https://registry.npmjs.org'
const DRY = process.argv.includes('--dry-run')

interface Manifest {
  name: string
  version: string
  private?: boolean
  [section: string]: unknown
}

const read = (dir: string): Manifest => JSON.parse(readFileSync(join(ROOT, 'packages', dir, 'package.json'), 'utf8'))
const versions = new Map(ORDER.map((dir) => {
  const pkg = read(dir)
  return [pkg.name, pkg.version]
}))

/** `workspace:*` and friends, as the version range npm will understand. */
function resolveWorkspace(name: string, range: string): string {
  const version = versions.get(name)
  if (!version)
    throw new Error(`${name} is a workspace dependency, but no package here is called that`)
  const spec = range.slice('workspace:'.length)
  if (spec === '*' || spec === '^')
    return `^${version}`
  if (spec === '~')
    return `~${version}`
  return spec
}

async function published(name: string, version: string): Promise<boolean> {
  const res = await fetch(`${REGISTRY}/${name.replace('/', '%2f')}/${version}`)
  return res.ok
}

async function run(cmd: string[], cwd: string): Promise<boolean> {
  const proc = Bun.spawn(cmd, { cwd, stdout: 'inherit', stderr: 'inherit', env: process.env })
  return (await proc.exited) === 0
}

const failed: string[] = []
for (const dir of ORDER) {
  const file = join(ROOT, 'packages', dir, 'package.json')
  const original = readFileSync(file, 'utf8')
  const pkg = JSON.parse(original) as Manifest
  const id = `${pkg.name}@${pkg.version}`
  if (pkg.private) {
    console.log(`[publish] ${pkg.name} is private, skipped`)
    continue
  }
  if (!DRY && await published(pkg.name, pkg.version)) {
    console.log(`[publish] ${id} is already on npm, skipped`)
    continue
  }

  for (const section of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
    const deps = pkg[section] as Record<string, string> | undefined
    for (const [name, range] of Object.entries(deps ?? {})) {
      if (range.startsWith('workspace:'))
        deps![name] = resolveWorkspace(name, range)
    }
  }

  console.log(`[publish] ${DRY ? 'packing' : 'publishing'} ${id}`)
  try {
    writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`)
    const ok = await run(DRY ? ['bun', 'pm', 'pack', '--dry-run'] : ['pantry', 'publish', '--npm', '--access', 'public'], join(ROOT, 'packages', dir))
    if (!ok)
      failed.push(id)
  }
  finally {
    writeFileSync(file, original)
  }
}

if (failed.length) {
  console.error(`[publish] failed: ${failed.join(', ')}`)
  process.exit(1)
}
console.log(`[publish] done`)
