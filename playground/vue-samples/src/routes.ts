import type { RouteRecordRaw } from 'vue-router'
import Canada from './pages/canada.vue'
import IndexPage from './pages/index.vue'
import UnitedStates from './pages/usa.vue'

export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'Index',
    component: IndexPage,
    meta: {
      title: 'TS Maps Playground',
      description: 'Interactive maps playground with ts-maps',
    },
  },
  {
    path: '/usa',
    name: 'USA',
    component: UnitedStates,
    meta: {
      title: 'TS Maps Playground',
      description: 'Interactive maps playground with ts-maps',
    },
  },
  {
    path: '/canada',
    name: 'Canada',
    component: Canada,
    meta: {
      title: 'TS Maps Playground',
      description: 'Interactive maps playground with ts-maps',
    },
  },
]

export default routes
