#!/usr/bin/env bun
/* eslint-disable ts/no-top-level-await */
/**
 * Chained build across every publishable workspace package. ts-maps ships
 * first — the others depend on its built output (or, in dev, its source
 * through workspace links + `"bun"` export condition).
 *
 * Any individual package missing a `build` script or a `package.json` is
 * skipped with a warning rather than aborting the whole chain.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

interface Pkg {
  name: string
  dir: string
  scripts: Record<string, string>
}

const ROOT = new URL('..', import.meta.url).pathname

// Order matters: ts-maps builds first, then the bindings that depend on it.
// `nuxt` depends on `vue`, so it comes after.
const BUILD_ORDER = ['ts-maps', 'vue', 'react', 'react-native', 'svelte', 'solid', 'nuxt']

function loadPkg(name: string): Pkg | null {
  const dir = join(ROOT, 'packages', name)
  const pkgPath = join(dir, 'package.json')
  if (!existsSync(pkgPath))
    return null
  try {
    const json = JSON.parse(readFileSync(pkgPath, 'utf8')) as { name?: string, scripts?: Record<string, string> }
    return { name: json.name ?? name, dir, scripts: json.scripts ?? {} }
  }
  catch (err) {
    console.warn(`[build-all] could not parse ${pkgPath}:`, err)
    return null
  }
}

async function buildOne(pkg: Pkg): Promise<void> {
  const buildScript = pkg.scripts.build
  if (!buildScript) {
    console.warn(`[build-all] ${pkg.name} has no "build" script — skipping`)
    return
  }

  console.log(`\n=== [build-all] ${pkg.name} ===`)
  const start = performance.now()
  const proc = Bun.spawn({
    cmd: ['bun', 'run', 'build'],
    cwd: pkg.dir,
    stdout: 'inherit',
    stderr: 'inherit',
  })
  const code = await proc.exited
  const ms = Math.round(performance.now() - start)
  if (code !== 0)
    throw new Error(`[build-all] ${pkg.name} build failed with exit code ${code}`)
  console.log(`[build-all] ${pkg.name} built in ${ms}ms`)
}

async function main(): Promise<void> {
  const available = new Set(
    readdirSync(join(ROOT, 'packages'))
      .filter(f => statSync(join(ROOT, 'packages', f)).isDirectory()),
  )

  const ordered: Pkg[] = []
  for (const name of BUILD_ORDER) {
    if (!available.has(name))
      continue
    const pkg = loadPkg(name)
    if (pkg)
      ordered.push(pkg)
  }
  // Catch any package not in BUILD_ORDER so new additions don't silently drop.
  for (const name of available) {
    if (BUILD_ORDER.includes(name))
      continue
    const pkg = loadPkg(name)
    if (pkg && pkg.scripts.build) {
      console.warn(`[build-all] ${pkg.name} is not in BUILD_ORDER — adding last; update scripts/build-all.ts`)
      ordered.push(pkg)
    }
  }

  for (const pkg of ordered)
    await buildOne(pkg)

  console.log(`\n[build-all] ✓ built ${ordered.length} package(s)`)
}

await main()
