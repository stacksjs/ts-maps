import type { PickierConfig } from 'pickier'
import { defaultConfig } from 'pickier'

const config: PickierConfig = {
  ...defaultConfig,
  // CHANGELOG.md is written by logsmith on release, one set of headings per
  // version, so its headings repeat by design.
  ignores: [...defaultConfig.ignores, '**/CHANGELOG.md'],
  // Lint is clean, so keep it that way: a warning fails CI like an error.
  lint: { ...defaultConfig.lint, maxWarnings: 0 },
}

export default config
