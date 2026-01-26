# React Integration

ts-maps provides a dedicated React package with pre-built components and hooks.

## Installation

::: code-group

```sh [npm]
npm install @ts-maps/react
```

```sh [pnpm]
pnpm add @ts-maps/react
```

```sh [bun]
bun add @ts-maps/react
```

:::

## Available Components

The React package exports the following components:

- `VectorMap` - Base vector map component
- `WorldMap` - World map preset
- `UnitedStates` - US map preset
- `Canada` - Canada map preset
- `Brasil` - Brazil map preset
- `Italy` - Italy map preset
- `Spain` - Spain map preset
- `Russia` - Russia map preset
- `Iraq` - Iraq map preset

## Basic Usage

### VectorMap Component

```tsx
import { VectorMap } from '@ts-maps/react'
import type { VectorMapProps } from '@ts-maps/react'

function App() {
  const handleRegionClick = (event: MouseEvent, code: string) => {
    console.log(`Clicked region: ${code}`)
  }

  return (
    <VectorMap
      map={{ name: 'world', projection: 'mercator' }}
      backgroundColor="#1e293b"
      draggable
      zoomButtons
      regionStyle={{
        initial: {
          fill: '#334155',
          stroke: '#1e293b',
          strokeWidth: 0.5,
        },
        hover: {
          fill: '#3b82f6',
        },
        selected: {
          fill: '#2563eb',
        },
      }}
      onRegionClick={handleRegionClick}
    />
  )
}

export default App
```

### WorldMap Component

```tsx
import { WorldMap } from '@ts-maps/react'
import type { WorldMapProps } from '@ts-maps/react'

function GlobalView() {
  return (
    <WorldMap
      draggable
      zoomButtons
      showTooltip
      regionStyle={{
        initial: { fill: '#e2e8f0' },
        hover: { fill: '#3b82f6' },
      }}
      onRegionClick={(event, code) => {
        console.log(`Country: ${code}`)
      }}
    />
  )
}
```

### Country-Specific Maps

```tsx
import {
  UnitedStates,
  Canada,
  Brasil,
  Italy,
  Spain,
  Russia,
  Iraq,
} from '@ts-maps/react'

function CountryMaps() {
  return (
    <div className="grid grid-cols-3 gap-4">
      <UnitedStates
        draggable
        regionsSelectable
        selectedRegions={['CA', 'TX', 'NY']}
      />
      <Canada draggable />
      <Brasil draggable />
      <Italy draggable />
      <Spain draggable />
      <Russia draggable />
      <Iraq draggable />
    </div>
  )
}
```

## Adding Markers

```tsx
import { useState } from 'react'
import { VectorMap } from '@ts-maps/react'

interface Marker {
  name: string
  coords: [number, number]
}

function MapWithMarkers() {
  const [markers] = useState<Marker[]>([
    { name: 'New York', coords: [40.7128, -74.0060] },
    { name: 'London', coords: [51.5074, -0.1278] },
    { name: 'Tokyo', coords: [35.6762, 139.6503] },
    { name: 'Sydney', coords: [-33.8688, 151.2093] },
  ])

  return (
    <VectorMap
      map={{ name: 'world', projection: 'mercator' }}
      markers={markers}
      markerStyle={{
        initial: {
          fill: '#ef4444',
          stroke: '#ffffff',
          strokeWidth: 2,
          r: 6,
        },
        hover: {
          fill: '#f97316',
          r: 8,
        },
      }}
      onMarkerClick={(event, index) => {
        console.log(`Clicked: ${markers[parseInt(index)].name}`)
      }}
    />
  )
}
```

## Drawing Lines Between Markers

```tsx
import { VectorMap } from '@ts-maps/react'

function FlightRoutes() {
  const markers = [
    { name: 'JFK', coords: [40.6413, -73.7781] as [number, number] },
    { name: 'LHR', coords: [51.4700, -0.4543] as [number, number] },
    { name: 'CDG', coords: [49.0097, 2.5479] as [number, number] },
  ]

  return (
    <VectorMap
      map={{ name: 'world', projection: 'mercator' }}
      markers={markers}
      lines={{
        elements: [
          { from: 'JFK', to: 'LHR' },
          { from: 'LHR', to: 'CDG' },
        ],
        style: {
          stroke: '#3b82f6',
          strokeWidth: 2,
          strokeLinecap: 'round',
        },
        curvature: 0.5,
      }}
    />
  )
}
```

## Data Visualization

```tsx
import { useMemo } from 'react'
import { WorldMap } from '@ts-maps/react'

interface CountryData {
  [code: string]: number
}

function PopulationMap() {
  const populationData: CountryData = useMemo(() => ({
    US: 331,
    CN: 1412,
    IN: 1408,
    ID: 273,
    PK: 220,
    BR: 212,
    NG: 211,
    BD: 165,
    RU: 144,
    MX: 128,
  }), [])

  return (
    <WorldMap
      visualizeData={{
        scale: ['#dbeafe', '#1e40af'],
        values: populationData,
      }}
      showTooltip
      onRegionTooltipShow={(event, tooltip, code) => {
        const population = populationData[code]
        if (population) {
          tooltip.innerHTML = `${code}: ${population}M`
        }
      }}
    />
  )
}
```

## Region Selection

```tsx
import { useState, useCallback } from 'react'
import { UnitedStates } from '@ts-maps/react'

function StateSelector() {
  const [selectedStates, setSelectedStates] = useState<string[]>([])

  const handleRegionSelected = useCallback(
    (event: MouseEvent, code: string, isSelected: boolean, regions: string[]) => {
      setSelectedStates(regions)
    },
    []
  )

  return (
    <div>
      <UnitedStates
        regionsSelectable
        selectedRegions={selectedStates}
        regionStyle={{
          initial: { fill: '#f1f5f9' },
          hover: { fill: '#e2e8f0' },
          selected: { fill: '#3b82f6' },
          selectedHover: { fill: '#2563eb' },
        }}
        onRegionSelected={handleRegionSelected}
      />

      <div className="mt-4">
        <h3>Selected States:</h3>
        <p>{selectedStates.join(', ') || 'None'}</p>
        <button onClick={() => setSelectedStates([])}>
          Clear Selection
        </button>
      </div>
    </div>
  )
}
```

## Using Refs for Direct Access

```tsx
import { useRef, useEffect } from 'react'
import { VectorMap } from '@ts-maps/react'

function MapWithRef() {
  const mapRef = useRef<any>(null)

  useEffect(() => {
    // Access the map instance after mount
    const map = mapRef.current?.map

    if (map) {
      // Programmatically focus on a region
      map.setFocus({
        region: 'US',
        scale: 3,
        animate: true,
      })
    }
  }, [])

  return (
    <VectorMap
      ref={mapRef}
      map={{ name: 'world', projection: 'mercator' }}
      draggable
    />
  )
}
```

## TypeScript Support

Full TypeScript support with exported types:

```tsx
import { VectorMap } from '@ts-maps/react'
import type {
  VectorMapProps,
  WorldMapProps,
  UnitedStatesProps,
  CanadaProps,
  BrasilProps,
  ItalyProps,
  SpainProps,
  RussiaProps,
  IraqProps,
} from '@ts-maps/react'

// Fully typed props
const mapProps: VectorMapProps = {
  map: {
    name: 'world',
    projection: 'mercator',
  },
  draggable: true,
  regionStyle: {
    initial: { fill: '#e2e8f0' },
  },
  onRegionClick: (event, code) => {
    // event is MouseEvent, code is string
    console.log(code)
  },
}
```

## Props Reference

### Common Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `map` | `{ name: string, projection: string }` | - | Map configuration |
| `backgroundColor` | `string` | - | Background color |
| `draggable` | `boolean` | `false` | Enable dragging |
| `zoomButtons` | `boolean` | `false` | Show zoom controls |
| `zoomOnScroll` | `boolean` | `false` | Enable scroll zoom |
| `showTooltip` | `boolean` | `false` | Show tooltips |
| `markers` | `Marker[]` | - | Marker configurations |
| `selectedRegions` | `string[]` | - | Pre-selected regions |
| `regionsSelectable` | `boolean` | `false` | Enable region selection |
| `regionStyle` | `RegionStyle` | - | Region styling |
| `markerStyle` | `MarkerStyle` | - | Marker styling |
| `visualizeData` | `{ scale, values }` | - | Data visualization |

### Event Props

| Prop | Type | Description |
|------|------|-------------|
| `onLoaded` | `() => void` | Map loaded |
| `onViewportChange` | `(scale, transX, transY) => void` | Viewport changed |
| `onRegionClick` | `(event, code) => void` | Region clicked |
| `onRegionSelected` | `(event, code, isSelected, regions) => void` | Selection changed |
| `onMarkerClick` | `(event, index) => void` | Marker clicked |
| `onMarkerSelected` | `(event, index, isSelected, markers) => void` | Selection changed |

## Styling

```tsx
function StyledMap() {
  return (
    <div className="w-full h-[500px] rounded-lg overflow-hidden shadow-lg">
      <WorldMap
        draggable
        zoomButtons
        regionStyle={{
          initial: {
            fill: '#e2e8f0',
            stroke: '#cbd5e1',
            strokeWidth: 0.5,
          },
          hover: {
            fill: '#93c5fd',
          },
        }}
      />
    </div>
  )
}
```

## Next Steps

- [Vue Integration](/guide/vue) - Using ts-maps with Vue
- [Nuxt Module](/guide/nuxt) - Using ts-maps as a Nuxt module
