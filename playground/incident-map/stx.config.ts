/**
 * The demo is an stx app living inside the ts-maps repo, so it points at a
 * checkout of stx rather than an installed package — see README.md for why,
 * and for the `STX_COMPONENTS` override when your checkout lives elsewhere.
 */
const COMPONENTS_PLUGIN = process.env.STX_COMPONENTS
  ?? '/Users/chris/Code/Tools/stx/packages/components/stx-plugin.ts'

// The map components ship with ts-maps itself, from this same repo.
const MAP_PLUGIN = '../../packages/stx/stx-plugin.ts'

export default {
  app: {
    head: {
      title: 'Incident Map — built on ts-maps',
      meta: [
        { name: 'theme-color', content: '#0c0d11' },
        // The map is a full-bleed phone layout; without viewport-fit the safe
        // areas the tab bar relies on are always reported as zero.
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      ],
    },
  },
  pagesDir: 'pages',
  componentsDir: 'components',
  layoutsDir: 'layouts',
  storesDir: 'stores',
  publicDir: 'public',
  plugins: [COMPONENTS_PLUGIN, MAP_PLUGIN],
  skipDefaultSeoTags: true,
  cache: false,
}
