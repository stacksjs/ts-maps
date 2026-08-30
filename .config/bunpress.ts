import type { BunPressConfig } from '@stacksjs/bunpress'

const config: BunPressConfig = {
  title: 'ts-maps',
  description: 'A modern vector map library for TypeScript',
  url: 'https://ts-maps.stacksjs.org',

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
      link: '/',
    },
    {
      text: 'Guide',
      items: [
        { text: 'Getting Started', link: '/guide/getting-started' },
        { text: 'Framework Bindings', link: '/guide/framework-bindings' },
        { text: 'stx Components', link: '/guide/stx' },
        { text: 'Vue Integration', link: '/guide/vue' },
        { text: 'React Integration', link: '/guide/react' },
        { text: 'Nuxt Module', link: '/guide/nuxt' },
      ],
    },
    {
      text: 'Concepts',
      items: [
        { text: 'The Map', link: '/concepts/map' },
        { text: 'Layers', link: '/concepts/layers' },
        { text: 'Controls', link: '/concepts/controls' },
        { text: 'Styles & Theming', link: '/concepts/styles-and-theming' },
        { text: 'Style Spec', link: '/concepts/style-spec' },
        { text: 'Vector Tiles', link: '/concepts/vector-tiles' },
        { text: '3D & Terrain', link: '/concepts/3d' },
        { text: 'Terrain', link: '/concepts/terrain' },
        { text: 'Territory Capture', link: '/concepts/territory-capture' },
        { text: 'Services', link: '/concepts/services' },
        { text: 'Offline', link: '/concepts/offline' },
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
      link: '/examples/',
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
    { text: 'Guide', link: '/guide/getting-started' },
    { text: 'Examples', link: '/examples/' },
    { text: 'API', link: '/api/' },
    { text: 'GitHub', link: 'https://github.com/stacksjs/ts-maps' },
  ],

}

export default config
