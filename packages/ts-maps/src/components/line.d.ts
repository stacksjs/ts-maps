import type { LineConfig, MapInterface } from '../types'

interface LineConstructorConfig {
  index: string
  map: MapInterface
  group: any
  config: LineConfig
  x1: number
  y1: number
  x2: number
  y2: number
  [key: string]: any
}

interface LineStyle {
  initial?: {
    stroke?: string
    strokeWidth?: number
    strokeLinecap?: string
    [key: string]: any
  }
}

export default class Line {
  constructor(config: LineConstructorConfig, style: LineStyle)
  remove(): void
  setStyle(property: string, value: string | number): void;
  [key: string]: any;
}
