import { defineStore } from 'pinia'

export const categories = {
  teaching: '教学', library: '阅读', food: '餐饮',
  housing: '住宿', sports: '运动', service: '服务'
}
export const statusNames = { pending: '待处理', working: '处理中', resolved: '已处理' }

export async function api(path, method = 'GET', body) {
  const headers = {}
  if (method !== 'GET') {
    const csrf = await fetch('/api/csrf', { cache: 'no-store' })
    if (!csrf.ok) throw new Error('无法创建会话')
    const { header, token } = await csrf.json()
    headers[header] = token
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const response = await fetch('/api' + path, { method, headers, body: JSON.stringify(body), cache: 'no-store' })
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}))
    const fallback = { 401: '请先登录', 403: '权限不足', 404: '记录不存在', 500: '服务暂不可用' }
    throw new Error(detail.message || fallback[response.status] || '请求失败（' + response.status + '）')
  }
  if (response.status === 204) return
  return response.json()
}

const kinds = ['favorite', 'route', 'schedule', 'progress', 'feedback', 'itinerary']
const emptyRecords = () => Object.fromEntries(kinds.map(kind => [kind, []]))

export const useCampus = defineStore('campus', {
  state: () => ({ snapshot: null, selected: '', session: { signedIn: false }, records: emptyRecords(),
    loading: false, failure: '', message: '', route: null, simulation: 'idle', position: null }),
  getters: {
    places: state => state.snapshot?.scene.places || [],
    selectedPlace: state => state.snapshot?.scene.places.find(p => p.id === state.selected)
  },
  actions: {
    async loadScene() {
      this.loading = true
      this.failure = ''
      try { this.applyScene(await api('/scene')) }
      catch (error) { this.failure = error.message }
      finally { this.loading = false }
    },
    applyScene(snapshot) {
      if (this.snapshot?.revision !== snapshot.revision) {
        this.route = null
        this.simulation = 'idle'
      }
      this.snapshot = snapshot
      if (!this.places.some(place => place.id === this.selected)) this.selected = ''
    },
    async refreshSession() {
      const session = await api('/session')
      this.session = session
      await this.refreshRecords()
    },
    async refreshRecords() {
      if (!this.session.signedIn) { this.records = emptyRecords(); return }
      const username = this.session.username
      const values = await Promise.all(kinds.map(kind => api('/me/' + kind)))
      if (this.session.username === username) this.records = Object.fromEntries(kinds.map((kind, i) => [kind, values[i]]))
    },
    async save(kind, data, id) {
      await api('/me/' + kind + (id ? '/' + id : ''), id ? 'PUT' : 'POST', data)
      await this.refreshRecords()
    },
    async remove(kind, id) {
      await api('/me/' + kind + '/' + id, 'DELETE')
      await this.refreshRecords()
    },
    notify(message) { this.message = message }
  }
})
