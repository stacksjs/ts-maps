import type { App, Plugin } from 'vue'
import GoogleMap from './components/GoogleMap.vue'
import VectorMap from './components/VectorMap.vue'

const plugin: Plugin = {
  install: (app: App) => {
    app.component('VectorMap', VectorMap)
    app.component('GoogleMap', GoogleMap)
  },
}

export default plugin

export { GoogleMap, VectorMap }
export type { MapOptions } from '../../ts-maps/src/types'
