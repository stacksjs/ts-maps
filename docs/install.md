# Installation

Installing `ts-maps` is straightforward. You can install it via your preferred package manager.

## Package Managers

Choose your preferred package manager:

::: code-group

```sh [npm]
# Install the package
npm install @stacksjs/ts-maps

# Or install with TypeScript development dependencies
npm install @stacksjs/ts-maps typescript @types/node --save-dev
```

```sh [pnpm]
# Install the package
pnpm add @stacksjs/ts-maps

# Or install with TypeScript development dependencies
pnpm add @stacksjs/ts-maps typescript @types/node -D
```

```sh [yarn]
# Install the package
yarn add @stacksjs/ts-maps

# Or install with TypeScript development dependencies
yarn add @stacksjs/ts-maps typescript @types/node --dev
```

```sh [bun]
# Install the package
bun add @stacksjs/ts-maps

# Or install with TypeScript development dependencies
bun add -d @stacksjs/ts-maps typescript @types/node
```

:::

## TypeScript Configuration

ts-maps is built with TypeScript and includes type definitions. For the best development experience, ensure your `tsconfig.json` includes:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

## Quick Start

After installation, you can import and use ts-maps in your TypeScript project:

```typescript
import { VectorMap } from '@stacksjs/ts-maps'

// Create a new map instance
const map = new VectorMap({
  container: 'map-container',
  map: 'world',
  theme: 'light',
})

// Add interactivity
map.on('regionClick', (event, region) => {
  console.log(`Clicked region: ${region.id}`)
})
```

## Requirements

- Node.js 16.x or higher
- TypeScript 4.7 or higher

## Next Steps

- Check out the [Usage Guide](/usage) to learn how to use ts-maps
- View [Examples](/examples) for common mapping scenarios
- Explore the [API Reference](/api) for detailed documentation
