import type { App, Plugin } from 'vue'
import GoogleMap from './components/GoogleMap.vue'
import VectorMap from './components/VectorMap.vue'
import Brasil from './components/VectorMaps/Brasil.vue'
import Canada from './components/VectorMaps/Canada.vue'
import Iraq from './components/VectorMaps/Iraq.vue'
import Italy from './components/VectorMaps/Italy.vue'
import Russia from './components/VectorMaps/Russia.vue'
import Spain from './components/VectorMaps/Spain.vue'
import UnitedStates from './components/VectorMaps/UnitedStates.vue'

const plugin: Plugin = {
  install: (app: App) => {
    app.component('VectorMap', VectorMap)
    app.component('GoogleMap', GoogleMap)
    app.component('UnitedStates', UnitedStates)
    app.component('Canada', Canada)
    app.component('Iraq', Iraq)
    app.component('Brasil', Brasil)
    app.component('Italy', Italy)
    app.component('Russia', Russia)
    app.component('Spain', Spain)
  },
}

export default plugin

export { Brasil, Canada, GoogleMap, Iraq, Italy, Russia, Spain, UnitedStates, VectorMap }
export type { MapOptions } from '../../ts-maps/src/types'
