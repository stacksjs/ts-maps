import type { App, Plugin } from 'vue'
import GoogleMap from './components/GoogleMap.vue'
import VectorMap from './components/VectorMap.vue'
import Canada from './components/VectorMaps/Canada.vue'
import UnitedStates from './components/VectorMaps/UnitedStates.vue'

const plugin: Plugin = {
  install: (app: App) => {
    app.component('VectorMap', VectorMap)
    app.component('GoogleMap', GoogleMap)
    app.component('UnitedStates', UnitedStates)
    app.component('Canada', Canada)
  },
}

export default plugin

export { Canada, GoogleMap, UnitedStates, VectorMap }
export type { MapOptions } from '../../ts-maps/src/types'
