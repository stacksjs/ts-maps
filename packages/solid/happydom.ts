// Test harness for @ts-maps/solid.
//
// Solid's JSX is not a runtime library call. The Babel preset rewrites it into
// fine-grained DOM updates, and several of the framework's features are that
// rewrite rather than anything a runtime can reproduce — so running these
// components through a hyperscript runtime would be testing a different
// library. The plugin below compiles them exactly the way an application
// would.
//
// Without it this package had a typecheck and nothing else, which cannot tell
// you whether a component mounts, whether the map it creates is torn down, or
// whether a child ever sees the map through context. Those are the three ways
// a binding actually breaks.

import { createRequire } from 'node:module'
import { plugin } from 'bun'
import { GlobalRegistrator } from 'very-happy-dom'

GlobalRegistrator.register()

// Babel's own resolution finds these in the install cache, where their
// dependencies are not reachable. Resolving from this file instead lands on
// the copies in `node_modules`, which are complete.
const require = createRequire(import.meta.url)
const { transformAsync } = require('@babel/core')
const typescript = require('@babel/preset-typescript')
const jsxDomExpressions = require('babel-plugin-jsx-dom-expressions')

// The options `babel-preset-solid` passes for a browser build.
const SOLID_JSX = [jsxDomExpressions.default ?? jsxDomExpressions, {
  moduleName: 'solid-js/web',
  generate: 'dom',
  contextToCustomElements: true,
  wrapConditionals: true,
  builtIns: [
    'For',
    'Show',
    'Switch',
    'Match',
    'Suspense',
    'SuspenseList',
    'Portal',
    'Index',
    'Dynamic',
    'ErrorBoundary',
  ],
}]

plugin({
  name: 'solid-jsx',
  setup(build) {
    build.onLoad({ filter: /\.tsx$/ }, async (args) => {
      const source = await Bun.file(args.path).text()
      const result = await transformAsync(source, {
        filename: args.path,
        // TypeScript syntax comes off first; the `.tsx` extension is what
        // tells the preset to expect JSX.
        presets: [typescript.default ?? typescript],
        plugins: [SOLID_JSX],
        babelrc: false,
        configFile: false,
        sourceMaps: 'inline',
      })
      return { contents: result?.code ?? source, loader: 'js' }
    })
  },
})
