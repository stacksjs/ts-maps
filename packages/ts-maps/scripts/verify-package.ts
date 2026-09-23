#!/usr/bin/env bun
/* eslint-disable no-console */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

interface ConditionalExport {
  bun?: string
  import?: string
  types?: string
}

interface PackageManifest {
  exports: Record<string, string | ConditionalExport>
  files: string[]
  main?: string
  module?: string
  types?: string
}

const packageRoot = resolve(import.meta.dir, '..')
const manifest = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8')) as PackageManifest
const missing: string[] = []

function requireTarget(label: string, target: string | undefined): void {
  if (!target || target.includes('*'))
    return
  if (!existsSync(resolve(packageRoot, target)))
    missing.push(`${label}: ${target}`)
}

/**
 * Bun resolves the `bun` condition before `import`, so a `bun` target that is
 * not in `files` exists here and nowhere else: every Bun consumer got
 * "Cannot find module 'ts-maps/services'" while this repo's own tests passed.
 */
function requirePublished(label: string, target: string | undefined): void {
  if (!target)
    return
  requireTarget(label, target)
  const path = target.replace(/^\.\//, '')
  const published = manifest.files.some(entry => path === entry || path.startsWith(`${entry.replace(/\/$/, '')}/`))
  if (!published)
    missing.push(`${label}: ${target} is not in files, so it is missing from the published package`)
}

requireTarget('main', manifest.main)
requireTarget('module', manifest.module)
requireTarget('types', manifest.types)

for (const [specifier, target] of Object.entries(manifest.exports)) {
  if (typeof target === 'string') {
    requireTarget(specifier, target)
    continue
  }
  requireTarget(`${specifier} import`, target.import)
  requireTarget(`${specifier} types`, target.types)
  requirePublished(`${specifier} bun`, target.bun)
}

if (!manifest.files.includes('dist'))
  missing.push('files must include dist')

function declarationFiles(directory: string): string[] {
  if (!existsSync(directory))
    return []
  return readdirSync(directory).flatMap((entry) => {
    const path = resolve(directory, entry)
    return statSync(path).isDirectory()
      ? declarationFiles(path)
      : entry.endsWith('.d.ts') ? [path] : []
  })
}

const declarations = declarationFiles(resolve(packageRoot, 'dist'))
  .map(path => readFileSync(path, 'utf8'))
  .join('\n')
for (const symbol of ['TsMap', 'CircleMarker', 'Polygon', 'Polyline', 'tileLayer']) {
  if (!new RegExp(`\\b${symbol}\\b`).test(declarations))
    missing.push(`declarations do not expose ${symbol}`)
}

if (missing.length) {
  for (const problem of missing)
    console.error(`[package] ${problem}`)
  process.exit(1)
}

console.log(`[package] verified ${Object.keys(manifest.exports).length} exports and root declarations`)
