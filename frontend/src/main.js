import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHashHistory } from 'vue-router'
import App from './App.vue'
import './style.css'

const Empty = { template: '<span />' }
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home' },
    { path: '/campus', name: 'campus' },
    { path: '/space', name: 'space' },
    { path: '/admin', name: 'admin' },
  ].map(route => ({ ...route, component: Empty })),
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition
    if (to.hash && to.name === 'home') {
      const target = document.getElementById(to.hash.slice(1))
      if (target) return { el: target, top: 84 }
    }
    if (to.path !== from.path || !to.hash) return { top: 0 }
  },
})
router.beforeEach(to => {
  if (to.name === 'home' && typeof to.query.place === 'string') {
    return { name: 'campus', query: to.query, replace: true }
  }
})
createApp(App).use(createPinia()).use(router).mount('#app')

import './campus-hud.css'
import './paper-ui.css'
import './site.css'
