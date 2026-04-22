/**
 * Report writer — formats `BenchmarkResult[]` as a human table and
 * a machine-readable JSON document.
 *
 * JSON reports go to `bench/reports/<timestamp>.json` and are also
 * copied to `bench/reports/latest.json` so CI can diff the latest
 * run against a baseline without date-string gymnastics.
 */

import type { BenchmarkResult } from './runner'
import { cpus, totalmem } from 'node:os'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface ReportMeta {
  timestamp: string
  cpuModel: string
  cpuCount: number
  totalMemGb: number
  bunVersion?: string
  nodeVersion?: string
  commitSha?: string
  platform: string
  arch: string
}

export interface Report {
  meta: ReportMeta
  results: BenchmarkResult[]
}

function readCommitSha(): string | undefined {
  try {
    // `Bun.spawnSync` is available when running under Bun. When absent
    // (unlikely for this harness, but guarded), we swallow and move on.
    const bunAny: any = typeof Bun !== 'undefined' ? Bun : null
    if (!bunAny || typeof bunAny.spawnSync !== 'function')
      return undefined
    const proc = bunAny.spawnSync(['git', 'rev-parse', '--short', 'HEAD'])
    if (proc.exitCode !== 0)
      return undefined
    const out = new TextDecoder().decode(proc.stdout).trim()
    return out || undefined
  }
  catch {
    return undefined
  }
}

export function collectMeta(): ReportMeta {
  const cpuList = cpus()
  const bunAny: any = typeof Bun !== 'undefined' ? Bun : null
  return {
    timestamp: new Date().toISOString(),
    cpuModel: cpuList[0]?.model ?? 'unknown',
    cpuCount: cpuList.length,
    totalMemGb: Math.round((totalmem() / (1024 ** 3)) * 10) / 10,
    bunVersion: bunAny?.version,
    nodeVersion: typeof process !== 'undefined' ? process.versions?.node : undefined,
    commitSha: readCommitSha(),
    platform: typeof process !== 'undefined' ? process.platform : 'unknown',
    arch: typeof process !== 'undefined' ? process.arch : 'unknown',
  }
}

function formatTime(us: number): string {
  if (us < 1)
    return `${us.toFixed(3)}us`
  if (us < 1000)
    return `${us.toFixed(2)}us`
  const ms = us / 1000
  if (ms < 1000)
    return `${ms.toFixed(2)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function formatOps(ops: number): string {
  if (ops >= 1e9)
    return `${(ops / 1e9).toFixed(2)}B`
  if (ops >= 1e6)
    return `${(ops / 1e6).toFixed(2)}M`
  if (ops >= 1e3)
    return `${(ops / 1e3).toFixed(2)}K`
  return ops.toFixed(0)
}

function pad(s: string, width: number, align: 'left' | 'right' = 'left'): string {
  if (s.length >= width)
    return s
  const fill = ' '.repeat(width - s.length)
  return align === 'left' ? s + fill : fill + s
}

export function formatTable(results: BenchmarkResult[]): string {
  const lines: string[] = []
  const nameW = Math.max(30, ...results.map(r => r.name.length))
  const cols = [
    pad('Benchmark', nameW),
    pad('p50', 10, 'right'),
    pad('p95', 10, 'right'),
    pad('p99', 10, 'right'),
    pad('ops/sec', 12, 'right'),
    pad('iters', 8, 'right'),
  ]
  lines.push(cols.join('  '))
  lines.push('-'.repeat(cols.join('  ').length))

  for (const r of results) {
    const row = [
      pad(r.name, nameW),
      pad(formatTime(r.p50Us), 10, 'right'),
      pad(formatTime(r.p95Us), 10, 'right'),
      pad(formatTime(r.p99Us), 10, 'right'),
      pad(formatOps(r.opsPerSec), 12, 'right'),
      pad(String(r.iterations), 8, 'right'),
    ]
    lines.push(row.join('  '))
  }
  return lines.join('\n')
}

function tsStamp(d: Date): string {
  // YYYY-MM-DD-HHMMSS in local time — readable in a filename.
  const pad2 = (n: number): string => String(n).padStart(2, '0')
  return [
    d.getFullYear(),
    pad2(d.getMonth() + 1),
    pad2(d.getDate()),
  ].join('-')
  + '-'
  + [pad2(d.getHours()), pad2(d.getMinutes()), pad2(d.getSeconds())].join('')
}

export function reportsDir(): string {
  // Resolve relative to this source file so the harness works no
  // matter where it's invoked from.
  const here = dirname(fileURLToPath(import.meta.url))
  return resolve(here, 'reports')
}

export interface WriteReportResult {
  reportPath: string
  latestPath: string
}

export function writeReport(report: Report): WriteReportResult {
  const dir = reportsDir()
  mkdirSync(dir, { recursive: true })

  const stamp = tsStamp(new Date(report.meta.timestamp))
  const reportPath = join(dir, `${stamp}.json`)
  const latestPath = join(dir, 'latest.json')

  const json = JSON.stringify(report, null, 2)
  writeFileSync(reportPath, json, 'utf8')
  writeFileSync(latestPath, json, 'utf8')

  return { reportPath, latestPath }
}
