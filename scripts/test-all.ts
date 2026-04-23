#!/usr/bin/env bun
/* eslint-disable ts/no-top-level-await, no-console */
/**
 * Runs `bun test` across every workspace package that has tests. Scoping
 * by package avoids dragging in the vendored `pantry/` test fixtures at
 * the repo root, which ship broken assertions we have no business fixing.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const PKGS_DIR = join(ROOT, 'packages')

interface Pkg {
  name: string
  dir: string
  hasTests: boolean
}

function loadPkgs(): Pkg[] {
  const out: Pkg[] = []
  if (!existsSync(PKGS_DIR))
    return out
  for (const entry of readdirSync(PKGS_DIR)) {
    const dir = join(PKGS_DIR, entry)
    if (!statSync(dir).isDirectory())
      continue
    const pkgJson = join(dir, 'package.json')
    if (!existsSync(pkgJson))
      continue
    const json = JSON.parse(readFileSync(pkgJson, 'utf8')) as { name?: string }
    const hasTests = existsSync(join(dir, 'test')) || existsSync(join(dir, 'tests'))
    out.push({ name: json.name ?? entry, dir, hasTests })
  }
  return out
}

async function main(): Promise<void> {
  const pkgs = loadPkgs().filter(p => p.hasTests)
  if (pkgs.length === 0) {
    console.log('[test-all] no workspace packages with tests found')
    return
  }

  let failed = 0
  for (const pkg of pkgs) {
    console.log(`\n=== [test-all] ${pkg.name} ===`)
    const proc = Bun.spawn({
      cmd: ['bun', 'test'],
      cwd: pkg.dir,
      stdout: 'inherit',
      stderr: 'inherit',
    })
    const code = await proc.exited
    if (code !== 0) {
      failed++
      console.error(`[test-all] ${pkg.name} failed with code ${code}`)
    }
  }

  if (failed > 0) {
    console.error(`\n[test-all] ✗ ${failed} package(s) had failing tests`)
    process.exit(1)
  }
  console.log(`\n[test-all] ✓ ${pkgs.length} package(s) green`)
}

await main()
