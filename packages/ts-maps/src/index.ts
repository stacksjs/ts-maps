import { VectorMap } from './vector-map'

export * from './types'

if (typeof window !== 'undefined') {
  window.VectorMap = VectorMap
}

export { VectorMap }

export default VectorMap
