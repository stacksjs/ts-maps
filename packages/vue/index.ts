import type { App } from 'vue'
import Component, { Namespace } from './component'

export default {
  install(app: App, options = {}): void {
    app.config.globalProperties[Namespace] = options
    app.component('vue-vector-map', Component)
  },
}
