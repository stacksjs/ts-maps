import type { MapInterface, RegionLabelStyle, RegionStyle } from '../types'

interface RegionConstructorConfig {
  map: MapInterface
  code: string
  path: string
  style: RegionStyle
  labelStyle?: RegionLabelStyle
  labelsGroup?: any
  label?: boolean
}

export default class Region {
  constructor(config: RegionConstructorConfig)
  select(state: boolean): void
  isSelected: boolean
  setStyle(property: string, value: string | number): void
  getLabelText(): string
  updateLabelPosition(): void
  element: any;
  [key: string]: any;
}
