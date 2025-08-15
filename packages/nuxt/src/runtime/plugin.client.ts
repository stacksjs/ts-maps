import VectorMap from '../components/VectorMap.vue'
import Canada from '../components/VectorMaps/Canada.vue'
import UnitedStates from '../components/VectorMaps/UnitedStates.vue'

// Nuxt plugin to register ts-maps components globally
export default function (nuxtApp: any): any {
  // Register all ts-maps components globally
  nuxtApp.vueApp.component('VectorMap', VectorMap)
  nuxtApp.vueApp.component('UnitedStates', UnitedStates)
  nuxtApp.vueApp.component('Canada', Canada)

  // Provide ts-maps utilities to the app
  return {
    provide: {
      tsMaps: {
        VectorMap,
        UnitedStates,
        Canada,
      },
    },
  }
}
