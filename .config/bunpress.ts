import type { BunPressConfig } from 'bunpress'

const config: BunPressConfig = {
  name: 'ts-maps',
  description: 'A modern vector map library for TypeScript',
  url: 'https://ts-maps.stacksjs.org',

  theme: {
    primaryColor: '#3b82f6',
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
        { text: 'Vue Integration', link: '/guide/vue' },
        { text: 'React Integration', link: '/guide/react' },
        { text: 'Nuxt Module', link: '/guide/nuxt' },
      ],
    },
    {
      text: 'Features',
      items: [
        { text: 'Markers & Pins', link: '/features/markers' },
        { text: 'Regions & Layers', link: '/features/regions' },
        { text: 'Zoom Controls', link: '/features/zoom' },
        { text: 'Tooltips', link: '/features/tooltips' },
      ],
    },
    {
      text: 'Advanced',
      items: [
        { text: 'Custom Projections', link: '/advanced/projections' },
        { text: 'Data Visualization', link: '/advanced/data-viz' },
        { text: 'Performance', link: '/advanced/performance' },
        { text: 'Custom Styling', link: '/advanced/styling' },
      ],
    },
  ],

  navbar: [
    { text: 'Home', link: '/' },
    { text: 'Guide', link: '/guide/getting-started' },
    { text: 'GitHub', link: 'https://github.com/stacksjs/ts-maps' },
  ],

  socialLinks: [
    { icon: 'github', link: 'https://github.com/stacksjs/ts-maps' },
    { icon: 'discord', link: 'https://discord.gg/stacksjs' },
    { icon: 'twitter', link: 'https://twitter.com/stacksjs' },
  ],
}

export default config
