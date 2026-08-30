// Test harness for @ts-maps/svelte.
//
// A `.svelte` file is not JavaScript — it has to go through Svelte's own
// compiler before anything can run it, which is why this package had a
// typecheck and nothing else. A typecheck cannot tell you whether a component
// mounts, whether the map it creates is torn down, or whether a child ever
// sees the map through context, and those are the three ways a binding
// actually breaks.
//
// The plugin below compiles each component the way a bundler would.
// TypeScript in `<script lang="ts">` is stripped first, through Svelte's
// preprocessor hook — the compiler parses JavaScript, not TypeScript, and
// Bun's own transpiler does that job without pulling in another toolchain.

import { plugin } from 'bun'
import { compile, preprocess } from 'svelte/compiler'
import { GlobalRegistrator } from 'very-happy-dom'

GlobalRegistrator.register()

// Svelte's client runtime caches `firstChild` and `nextSibling` by reading
// their descriptors off `Node.prototype`. The DOM used here defines them as
// instance properties instead, which is legal but leaves those descriptors
// undefined and makes `mount` throw before a component ever runs. Forwarding
// them to the prototype is enough — the behaviour is the same, only the shape
// of the definition differs.
for (const name of ['firstChild', 'nextSibling'] as const) {
  if (Object.getOwnPropertyDescriptor(Node.prototype, name)?.get)
    continue
  Object.defineProperty(Node.prototype, name, {
    configurable: true,
    get(this: Node) {
      return name === 'firstChild'
        ? this.childNodes[0] ?? null
        : parentChildren(this)[indexIn(this) + 1] ?? null
    },
  })
}

function parentChildren(node: Node): Node[] {
  return node.parentNode ? Array.from(node.parentNode.childNodes) : []
}

function indexIn(node: Node): number {
  return parentChildren(node).indexOf(node)
}

const stripTypes = new Bun.Transpiler({ loader: 'ts' })

plugin({
  name: 'svelte',
  setup(build) {
    build.onLoad({ filter: /\.svelte$/ }, async (args) => {
      const source = await Bun.file(args.path).text()

      const processed = await preprocess(source, {
        script: async ({ content, attributes }) => {
          if (attributes.lang !== 'ts')
            return { code: content }
          return { code: await stripTypes.transform(content) }
        },
      }, { filename: args.path })

      const { js } = compile(processed.code, {
        filename: args.path,
        // Components are mounted into a real DOM here, not rendered to a
        // string, so the client compiler is the one under test.
        generate: 'client',
        dev: true,
      })

      return { contents: js.code, loader: 'js' }
    })
  },
})
