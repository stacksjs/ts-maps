import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const distDir = './dist'

// Clean dist folder
try {
  rmSync(distDir, { recursive: true, force: true })
}
catch {
  // Ignore if dist doesn't exist
}

// Ensure dist exists
mkdirSync(distDir, { recursive: true })

// Build TypeScript files
await Bun.build({
  entrypoints: ['./src/index.ts'],
  outdir: distDir,
  format: 'esm',
  target: 'browser',
  splitting: true,
  minify: false,
  sourcemap: 'external',
  external: ['ts-maps', '@stacksjs/stx'],
})

// Generate declaration files
const proc = Bun.spawn(['bunx', 'tsc', '--emitDeclarationOnly'], {
  cwd: import.meta.dir,
  stdout: 'inherit',
  stderr: 'inherit',
})

await proc.exited

// Move the index.d.ts from the nested structure to the root dist folder
const nestedDtsPath = join(distDir, 'stx/src/index.d.ts')
const rootDtsPath = join(distDir, 'index.d.ts')

if (existsSync(nestedDtsPath)) {
  const dtsContent = await Bun.file(nestedDtsPath).text()
  writeFileSync(rootDtsPath, dtsContent)

  // Clean up nested directories
  rmSync(join(distDir, 'stx'), { recursive: true, force: true })
  rmSync(join(distDir, 'ts-maps'), { recursive: true, force: true })
}

// Copy STX components to dist for consumption
const componentsDir = './src/components'
const distComponentsDir = join(distDir, 'components')

if (existsSync(componentsDir)) {
  cpSync(componentsDir, distComponentsDir, { recursive: true })
}

console.log('Build complete!')
