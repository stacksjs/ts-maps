import type { App } from 'vue'
import VectorMap from './components/VectorMap.vue'

export { VectorMap }

// Vue plugin
export default {
  install: (app: App) => {
    app.component('VectorMap', VectorMap)
  },
}

// Type exports
export type { MapOptions } from 'ts-maps'
