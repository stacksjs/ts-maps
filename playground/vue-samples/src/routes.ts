import type { RouteRecordRaw } from 'vue-router'
import Canada from './pages/canada.vue'
import IndexPage from './pages/index.vue'
import Iraq from './pages/iraq.vue'
import Italy from './pages/italy.vue'
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
  {
    path: '/italy',
    name: 'Italy',
    component: Italy,
    meta: {
      title: 'TS Maps Playground',
      description: 'Interactive maps playground with ts-maps',
    },
  },
  {
    path: '/iraq',
    name: 'Iraq',
    component: Iraq,
    meta: {
      title: 'TS Maps Playground',
      description: 'Interactive maps playground with ts-maps',
    },
  },
]

export default routes
