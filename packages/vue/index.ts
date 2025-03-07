import Component, { Namespace } from './component'
import type { App } from 'vue'
import 'ts-maps/scss/vector-map.scss'

export default {
  install(app: App, options = {}): void {
    app.config.globalProperties[Namespace] = options
    app.component('vue-vector-map', Component)
  }
}
