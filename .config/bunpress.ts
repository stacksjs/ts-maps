import type { BunPressConfig } from '@stacksjs/bunpress'
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dir, '..')

/** Files named `<number>-<name>.<ext>` in a directory, in number order. */
function numbered(dir: string, ext: string): string[] {
  return readdirSync(join(ROOT, dir))
    .filter(f => new RegExp(`^\\d+-.+\\.${ext}$`).test(f))
    .sort((a, b) => Number.parseInt(a) - Number.parseInt(b))
}

/** The examples, from docs/examples: each page's `# 01 · Title`, without its number. */
function exampleLinks(): Array<{ text: string, link: string }> {
  return numbered('docs/examples', 'md').map((file) => {
    const heading = readFileSync(join(ROOT, 'docs/examples', file), 'utf8').match(/^#\s+(.+)$/m)?.[1] ?? file
    return { text: heading.replace(/^\d+\s*·\s*/, ''), link: `/examples/${file.replace(/\.md$/, '')}` }
  })
}

/**
 * The playground's demos, from their pages' `<title>Title — ts-maps playground</title>`,
 * each at its docs page (scripts/build-demo-pages.ts) so it opens with the sidebar.
 */
function playgroundLinks(): Array<{ text: string, link: string }> {
  const decode = (text: string): string => text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  return numbered('playground/core-map', 'html').map((file) => {
    const title = readFileSync(join(ROOT, 'playground/core-map', file), 'utf8').match(/<title>(.*?)(?: — ts-maps playground)?<\/title>/)?.[1] ?? file
    return { text: decode(title), link: `/demos/${file.replace(/\.html$/, '')}` }
  })
}

const config: BunPressConfig = {
  title: 'ts-maps',
  description: 'A modern vector map library for TypeScript',
  url: 'https://ts-maps.stacksjs.com',

  themeConfig: {
    socialLinks: [
      { icon: 'github', link: 'https://github.com/stacksjs/ts-maps' },
      { icon: 'discord', link: 'https://discord.gg/stacksjs' },
      { icon: 'twitter', link: 'https://twitter.com/stacksjs' },
    ],
    colors: {
      primary: '#3b82f6',
    },
  },

  sidebar: [
    {
      text: 'Introduction',
      items: [
        { text: 'What is ts-maps?', link: '/intro' },
        { text: 'Installation', link: '/install' },
        { text: 'Getting Started', link: '/guide/getting-started' },
      ],
    },
    {
      text: 'Frameworks',
      items: [
        { text: 'Overview', link: '/guide/framework-bindings' },
        { text: 'React', link: '/guide/react' },
        { text: 'Vue', link: '/guide/vue' },
        { text: 'Svelte', link: '/guide/svelte' },
        { text: 'Solid', link: '/guide/solid' },
        { text: 'React Native', link: '/guide/react-native' },
        { text: 'Nuxt', link: '/guide/nuxt' },
        { text: 'stx', link: '/guide/stx' },
      ],
    },
    {
      text: 'Concepts',
      items: [
        { text: 'The Map', link: '/concepts/map' },
        { text: 'Layers', link: '/concepts/layers' },
        { text: 'Styles & Theming', link: '/concepts/styles-and-theming' },
        { text: 'Style Spec', link: '/concepts/style-spec' },
        { text: 'Vector Tiles', link: '/concepts/vector-tiles' },
        { text: 'Self-hosted Tiles', link: '/concepts/tile-server' },
        { text: 'Controls', link: '/concepts/controls' },
        { text: 'Search', link: '/concepts/search' },
        { text: 'Services & Directions', link: '/concepts/services' },
        { text: 'Map Types & Traffic', link: '/concepts/map-types' },
        { text: 'Indoor Maps', link: '/concepts/indoor' },
        { text: 'Look Around', link: '/concepts/look-around' },
        { text: 'Offline Maps', link: '/concepts/offline' },
        { text: '3D & the Globe', link: '/concepts/3d' },
        { text: 'Terrain', link: '/concepts/terrain' },
        { text: 'Localization', link: '/concepts/localization' },
        { text: 'Territory Capture', link: '/concepts/territory-capture' },
      ],
    },
    {
      text: 'API',
      items: [
        { text: 'Overview', link: '/api/' },
        { text: 'TsMap', link: '/api/TsMap' },
        { text: 'Layers', link: '/api/layer' },
        { text: 'Expressions', link: '/api/expressions' },
        { text: 'Geometry', link: '/api/geometry' },
      ],
    },
    {
      text: 'Examples',
      items: [
        { text: 'All examples', link: '/examples/' },
        ...exampleLinks(),
      ],
    },
    {
      text: 'Playground',
      items: [
        { text: 'All demos', link: '/demos/' },
        ...playgroundLinks(),
      ],
    },
    {
      text: 'Migrating',
      items: [
        { text: 'From Leaflet', link: '/migration/from-leaflet' },
        { text: 'From Mapbox GL', link: '/migration/from-mapbox' },
        { text: 'From MapLibre', link: '/migration/from-maplibre' },
      ],
    },
  ],

  nav: [
    { text: 'Home', link: '/' },
    { text: 'Guide', link: '/intro' },
    { text: 'Examples', link: '/examples/' },
    { text: 'Playground', link: '/demos/' },
    { text: 'API', link: '/api/' },
    { text: 'GitHub', link: 'https://github.com/stacksjs/ts-maps' },
  ],

}

export default config
