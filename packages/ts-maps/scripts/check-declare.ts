#!/usr/bin/env bun
/*
 * Guards the class-field invariant: subclasses of Class / Evented / Layer /
 * Handler / Control must declare uninitialized fields with `declare`, not
 * `!:` or `?:`. Otherwise the TypeScript-emitted class-field initialiser
 * runs AFTER super() (which calls this.initialize(...)) and silently wipes
 * anything the base constructor set.
 *
 * We also flag arrow-function class fields on those subclasses — the field
 * initializer assigns `undefined` at class-evaluation time, so the base's
 * `this.on(events, this)` wires a no-op. Convert to ordinary methods.
 *
 * Runs via `bun scripts/check-declare.ts`. Exit code 1 on any violation.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = join(import.meta.dir, '..', 'src', 'core-map')
const BASE_CLASSES = ['Class', 'Evented', 'Layer', 'Handler', 'Control', 'LayerGroup', 'FeatureGroup', 'DivOverlay', 'GridLayer', 'TileLayer', 'Path', 'Polyline', 'Polygon', 'CircleMarker', 'Circle', 'ImageOverlay', 'BlanketOverlay', 'Renderer']

interface Violation {
  file: string
  line: number
  kind: 'field-bang' | 'field-optional' | 'arrow-field'
  text: string
}

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const s = statSync(full)
    if (s.isDirectory()) walk(full, out)
    else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) out.push(full)
  }
}

function checkFile(file: string): Violation[] {
  const src = readFileSync(file, 'utf8')
  const lines = src.split('\n')
  const violations: Violation[] = []

  // Simple brace-matching class scan. For each `class Foo extends Bar` that
  // extends a known base, walk its body (balanced braces) looking for field
  // declarations matching the banned patterns.
  const classRe = /^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+(\w+)\s+extends\s+(\w+)/gm
  let match: RegExpExecArray | null

  // eslint-disable-next-line no-cond-assign
  while ((match = classRe.exec(src)) !== null) {
    const parent = match[2]!
    if (!BASE_CLASSES.includes(parent)) continue

    // Find opening brace of the class body.
    const startIdx = src.indexOf('{', match.index)
    if (startIdx < 0) continue

    // Walk until matching closing brace.
    let depth = 0
    let endIdx = startIdx
    for (let i = startIdx; i < src.length; i++) {
      const ch = src[i]
      if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        if (depth === 0) {
          endIdx = i
          break
        }
      }
    }

    const body = src.slice(startIdx, endIdx)
    const bodyStartLine = src.slice(0, startIdx).split('\n').length

    // Only inspect top-level lines of the class body (brace depth 0 and
    // paren depth 0 relative to the class body — otherwise we're inside a
    // method signature's parameter list or a method body).
    let braceDepth = 0
    let parenDepth = 0
    let accLineStart = 0
    for (let i = 1; i < body.length; i++) {
      const ch = body[i]
      if (ch === '{') braceDepth++
      else if (ch === '}') braceDepth--
      else if (ch === '(') parenDepth++
      else if (ch === ')') parenDepth--
      if (ch === '\n') accLineStart = i + 1
      if (braceDepth !== 0 || parenDepth !== 0) continue

      if (ch === '\n') {
        const nextNewline = body.indexOf('\n', accLineStart + 1)
        const line = body.slice(accLineStart, nextNewline < 0 ? undefined : nextNewline).trim()
        if (!line) continue

        const absoluteLine = bodyStartLine + (body.slice(0, accLineStart).match(/\n/g)?.length ?? 0)

        // `foo!: T` — bang-field, no initializer.
        if (/^[_a-zA-Z][\w$]*!\s*:/.test(line)) {
          violations.push({ file, line: absoluteLine, kind: 'field-bang', text: line })
          continue
        }
        // `foo?: T` — optional field, no initializer, that's declared (not
        // a method signature with `?()`). Skip method signatures.
        if (/^[_a-zA-Z][\w$]*\?\s*:\s/.test(line) && !line.includes('=')) {
          // Allow `declare foo?: T`.
          if (!line.startsWith('declare ')) {
            violations.push({ file, line: absoluteLine, kind: 'field-optional', text: line })
          }
          continue
        }
        // `foo = (args...) => {...}` arrow-function class field.
        if (/^[_a-zA-Z][\w$]*\s*=\s*(?:async\s*)?(?:<[^>]*>\s*)?\(/.test(line) && line.includes('=>')) {
          violations.push({ file, line: absoluteLine, kind: 'arrow-field', text: line })
        }
      }
    }
  }

  return violations
}

function main(): number {
  const files: string[] = []
  walk(ROOT, files)

  const all: Violation[] = []
  for (const f of files) {
    all.push(...checkFile(f))
  }

  if (all.length === 0) {
    console.log(`✓ class-field invariant holds across ${files.length} files`)
    return 0
  }

  console.error(`✗ class-field invariant violated in ${all.length} spot(s):\n`)
  for (const v of all) {
    const rel = relative(process.cwd(), v.file)
    console.error(`  ${rel}:${v.line}  [${v.kind}]`)
    console.error(`    ${v.text}`)
  }
  console.error(`\nFix: use \`declare foo?: T\` for type-only fields; convert arrow-function fields to ordinary methods and pass an explicit context to on()/off().`)
  return 1
}

process.exit(main())
