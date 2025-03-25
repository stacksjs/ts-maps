import type { App, Plugin } from 'vue'
import VectorMap from './components/VectorMap.vue'

const plugin: Plugin = {
  install: (app: App) => {
    app.component('VectorMap', VectorMap)
  },
}

export default plugin

export { VectorMap }
export type { MapOptions } from '../../ts-maps/src/types'
