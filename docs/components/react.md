# React Components

ts-maps provides official React components that make it easy to integrate interactive vector maps into your React applications.

## Installation

Install the React package:

```bash
npm install ts-maps ts-maps-react
```

## Usage

```tsx
import type { MapOptions } from 'ts-maps'
import { VectorMap } from 'ts-maps-react'

const mapOptions: Omit<MapOptions, 'selector'> = {
  backgroundColor: '#f0f0f0',
  zoomOnScroll: true,
  style: {
    regions: {
      fill: '#e4e4e4',
      stroke: '#ffffff',
      strokeWidth: 1,
    },
  },
}

function App() {
  return (
    <VectorMap
      options={mapOptions}
      mapName="world"
      height="500px"
      onRegionClick={(event, code) => console.log(`Clicked: ${code}`)}
    />
  )
}
```

## Documentation

For detailed React components documentation, please refer to the [ts-maps-react package](https://github.com/ts-maps/ts-maps/tree/main/packages/react).
