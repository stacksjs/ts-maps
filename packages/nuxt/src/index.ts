// Import the module function
import tsMapsModuleFunction from './module'

// Export components from the local nuxt package
export { default as VectorMap } from './components/VectorMap.vue'
export { default as Canada } from './components/VectorMaps/Canada.vue'
export { default as UnitedStates } from './components/VectorMaps/UnitedStates.vue'

// Export the Nuxt module function
export { default as tsMapsModule } from './module'

// Re-export types from ts-maps
export type { MapData, MapOptions, MarkerConfig } from 'ts-maps'

// Default export for the module - explicitly typed
export default function tsMapsNuxtModule(options?: any): ReturnType<typeof tsMapsModuleFunction> {
  return tsMapsModuleFunction(options)
}
