import type { PickierConfig } from 'pickier'
import { defaultConfig } from 'pickier'

const config: PickierConfig = {
  ...defaultConfig,
  // CHANGELOG.md is written by logsmith on release, one set of headings per
  // version, so its headings repeat by design.
  ignores: [...defaultConfig.ignores, '**/CHANGELOG.md'],
  // Lint is clean, so keep it that way: a warning fails CI like an error.
  lint: { ...defaultConfig.lint, maxWarnings: 0 },
  pluginRules: {
    ...defaultConfig.pluginRules,
    // Lint runs before the build, in CI and on a fresh clone, when no
    // package's dist exists yet. The build checks its own outputs
    // (packages/ts-maps/scripts/verify-package.ts).
    'publint/file-does-not-exist': 'off',
  },
}

export default config
