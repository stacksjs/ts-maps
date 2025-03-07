import type { MapInterface, SeriesConfig } from './types'

export default class Series {
  constructor(
    config: SeriesConfig,
    elements: Record<string, any>,
    map: MapInterface
  )

  setValues(values: Record<string, number>): void
  clear(): void
  scale: string[]
  values: Record<string, number>
  attribute: string;
  [key: string]: any;
}
