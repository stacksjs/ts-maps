import type { RouteRecordRaw } from 'vue-router'
import Brasil from './pages/brasil.vue'
import Canada from './pages/canada.vue'
import IndexPage from './pages/index.vue'
import Iraq from './pages/iraq.vue'
import Italy from './pages/italy.vue'
import Russia from './pages/russia.vue'
import UnitedStates from './pages/usa.vue'
import WorldMap from './pages/world.vue'

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
  {
    path: '/russia',
    name: 'Russia',
    component: Russia,
    meta: {
      title: 'TS Maps Playground',
      description: 'Interactive maps playground with ts-maps',
    },
  },
  {
    path: '/world',
    name: 'World',
    component: WorldMap,
  },
  {
    path: '/brasil',
    name: 'Brasil',
    component: Brasil,
  },
]

export default routes
