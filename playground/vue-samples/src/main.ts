import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import routes from './routes'

// Create router instance
const router = createRouter({
  history: createWebHistory(),
  routes,
})

// Create and mount app with router
createApp(App)
  .use(router)
  .mount('#app')
