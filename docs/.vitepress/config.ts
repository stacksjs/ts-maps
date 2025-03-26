import type { HeadConfig } from 'vitepress'
import { transformerTwoslash } from '@shikijs/vitepress-twoslash'
import { withPwa } from '@vite-pwa/vitepress'
import { defineConfig } from 'vitepress'

import vite from './vite.config'

// https://vitepress.dev/reference/site-config

const analyticsHead: HeadConfig[] = [
  [
    'script',
    {
      'src': 'https://cdn.usefathom.com/script.js',
      'data-site': 'DCOEHMGA',
      'defer': '',
    },
  ],
]

const nav = [
  { text: 'Home', link: '/' },
  { text: 'Guide', link: '/intro' },
  { text: 'API', link: '/api/' },
  { text: 'Playground', link: '/playground' },
]

const sidebar = [
  {
    text: 'Guide',
    items: [
      { text: 'Introduction', link: '/intro' },
      { text: 'Installation', link: '/install' },
      { text: 'Usage', link: '/usage' },
    ],
  },
  {
    text: 'Features',
    items: [
      { text: 'Vector Maps', link: '/features/vector-map' },
      { text: 'Markers', link: '/features/markers' },
      { text: 'Data Visualization', link: '/features/data-visualization' },
      { text: 'Events', link: '/features/events' },
    ],
  },
  {
    text: 'API Reference',
    items: [
      { text: 'VectorMap', link: '/api' },
      { text: 'Types', link: '/api/#types' },
    ],
  },
]

const description = 'Modern & lightweight Typescript library. Easily create pretty & interactive vector maps.'
const title = 'ts-maps | Beautiful Vector Maps Made Simple'

export default withPwa(
  defineConfig({
    lang: 'en-US',
    title: 'ts-maps',
    description,
    metaChunk: true,
    cleanUrls: true,
    lastUpdated: true,

    head: [
      ['link', { rel: 'icon', type: 'image/svg+xml', href: './images/logo-mini.svg' }],
      ['link', { rel: 'icon', type: 'image/png', href: './images/logo.png' }],
      ['meta', { name: 'theme-color', content: '#0A0ABC' }],
      ['meta', { name: 'title', content: title }],
      ['meta', { name: 'description', content: description }],
      ['meta', { name: 'author', content: 'Stacks.js, Inc.' }],
      ['meta', {
        name: 'tags',
        content: 'ts-maps, typescript, mapping, type-safe, react, vue, framework-agnostic, zero-dependencies',
      }],

      ['meta', { property: 'og:type', content: 'website' }],
      ['meta', { property: 'og:locale', content: 'en' }],
      ['meta', { property: 'og:title', content: title }],
      ['meta', { property: 'og:description', content: description }],

      ['meta', { property: 'og:site_name', content: 'ts-maps' }],
      ['meta', { property: 'og:image', content: './images/og-image.png' }],
      ['meta', { property: 'og:url', content: 'ts-maps.netlify.app/' }],
      // ['script', { 'src': 'https://cdn.usefathom.com/script.js', 'data-site': '', 'data-spa': 'auto', 'defer': '' }],
      ...analyticsHead,
    ],

    themeConfig: {
      search: {
        provider: 'local',
      },
      logo: {
        light: './images/logo-transparent.svg',
        dark: './images/logo-white-transparent.svg',
      },

      nav,
      sidebar,

      editLink: {
        pattern: 'https://github.com/stacksjs/stacks/edit/main/docs/docs/:path',
        text: 'Edit this page on GitHub',
      },

      footer: {
        message: 'Released under the MIT License.',
        copyright: 'Copyright © 2024-present Stacks.js, Inc.',
      },

      socialLinks: [
        { icon: 'github', link: 'https://github.com/stacksjs/ts-maps' },
      ],

      // algolia: services.algolia,

      // carbonAds: {
      //   code: '',
      //   placement: '',
      // },
    },

    pwa: {
      manifest: {
        theme_color: '#0A0ABC',
      },
    },

    markdown: {
      theme: {
        light: 'github-light',
        dark: 'github-dark',
      },

      codeTransformers: [
        transformerTwoslash(),
      ],
    },

    vite,
  }),
)
