import type { MapInterface, MarkerConfig } from '../types'

interface MarkerConstructorConfig {
  index: string
  map: MapInterface
  label?: boolean
  labelsGroup?: any
  cx: number
  cy: number
  group?: any
  config: MarkerConfig
  isRecentlyCreated?: boolean
}

interface MarkerStyle {
  initial?: {
    fill?: string
    stroke?: string
    strokeWidth?: number
    r?: number
    [key: string]: any
  }
  hover?: {
    fill?: string
    stroke?: string
    strokeWidth?: number
    r?: number
    [key: string]: any
  }
  selected?: {
    fill?: string
    stroke?: string
    strokeWidth?: number
    r?: number
    [key: string]: any
  }
  selectedHover?: {
    fill?: string
    stroke?: string
    strokeWidth?: number
    r?: number
    [key: string]: any
  }
}

export default class Marker {
  constructor(config: MarkerConstructorConfig, style: MarkerStyle)
  select(state: boolean): void
  isSelected: boolean
  remove(): void
  setStyle(property: string, value: string | number): void;
  [key: string]: any;
}
