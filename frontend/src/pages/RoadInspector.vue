<script setup>
import { computed, ref } from 'vue'
import { roadPoints, routePoints, svgPoints } from '../scene/roads.js'

const props = defineProps({ scene:Object, route:Object, revision:Number })
defineEmits(['close'])
const selection = ref('')
const labels = ref(true)
const historical = ref(false)
const nodeIndex = computed(() => Object.fromEntries(props.scene.nodes.map(n => [n.id,n])))
const chosen = computed(() => props.scene.edges.find(edge => edge.id === selection.value))
const current = computed(() => new Set(props.route?.edges ?? []))
const routeNodes = computed(() => new Set(props.route?.points.map(n => n.id) ?? []))
const connected = computed(() => {
  const adjacent = new Map(props.scene.nodes.map(n => [n.id,[]]))
  for (const edge of props.scene.edges) {
    if (!edge.open || edge.walkable===false) continue
    adjacent.get(edge.a).push(edge.b)
    adjacent.get(edge.b).push(edge.a)
  }
  const start = props.scene.places.find(p => p.id==='gate')?.entry ?? props.scene.nodes[0]?.id
  const visited = new Set(start ? [start] : [])
  for (const id of visited) for (const neighbor of adjacent.get(id)) visited.add(neighbor)
  return visited
})
const disconnected = computed(() => props.scene.places.filter(p => !connected.value.has(p.entry)))
const visible = computed(() => props.scene.edges.filter(e => historical.value || e.walkable!==false))
function color(edge) {
  if (current.value.has(edge.id)) return '#ad500d'
  if (edge.walkable===false) return '#89928d'
  if (!edge.open) return '#ab3f48'
  if (!connected.value.has(edge.a)) return '#7d52a0'
  return '#376a5e'
}
</script>

<template>
  <div class="road-scrim" @click.self="$emit('close')">
    <section class="road-check" role="dialog" aria-modal="true" aria-labelledby="road-title" @keydown.esc="$emit('close')">
      <header><h2 id="road-title">路网检查 · 地图 v{{ revision }}</h2><button autofocus @click="$emit('close')">关闭</button></header>
      <div class="road-options">
        <label><input v-model="labels" type="checkbox">节点编号</label>
        <label><input v-model="historical" type="checkbox">停用历史边</label>
        <span>↑ 北 · 橙色为当前路线，红色为关闭，紫色为与北门断开，蓝环为入口接入点</span>
      </div>
      <div class="road-content">
        <svg viewBox="-140 -152 300 300" role="img" aria-label="北向上路网与路线">
          <polygon :points="svgPoints(scene.boundary)" fill="#e8ead9" />
          <polygon :points="svgPoints(scene.water)" fill="#a5c6d0" />
          <rect v-for="p in scene.places.filter(p=>p.w>0)" :key="p.id"
            :x="p.x-p.w/2" :y="p.z-p.d/2" :width="p.w" :height="p.d"
            :transform="'rotate('+(-p.angle)+' '+p.x+' '+p.z+')'" :fill="p.h?'#cbc3b5':'#d4dec6'">
            <title>{{ p.name }}</title>
          </rect>
          <polyline v-for="e in visible" :key="e.id" :points="svgPoints(roadPoints(e,nodeIndex))" fill="none"
            :stroke="color(e)" :stroke-width="selection===e.id?2.7:1.25" :stroke-dasharray="e.walkable===false?'2 2':null"
            stroke-linejoin="round" class="road-edge" @click="selection=e.id"><title>{{ e.id }} {{ e.evidence }}</title></polyline>
          <polyline :points="svgPoints(routePoints(route))" fill="none" stroke="#ad500d" stroke-width="1.75" stroke-linejoin="round" pointer-events="none" />
          <g v-for="n in scene.nodes" :key="n.id" pointer-events="none">
            <circle :cx="n.x" :cy="n.z" :r="routeNodes.has(n.id)?1.45:.8" :fill="routeNodes.has(n.id)?'#8d3f07':connected.has(n.id)?'#234d45':'#7d52a0'" />
            <text v-if="labels" :x="n.x+1.7" :y="n.z-1.6" :class="{active:routeNodes.has(n.id)}">{{ n.id }}</text>
          </g>
          <circle v-for="p in scene.places" :key="'entry-'+p.id" :cx="nodeIndex[p.entry].x" :cy="nodeIndex[p.entry].z"
            r="2.2" fill="none" stroke="#205c87" stroke-width=".72"><title>{{ p.name }} · {{ p.entry }} · 道路接入点</title></circle>
        </svg>
        <aside>
          <label>选择道路边<select v-model="selection"><option value="">请选择</option>
            <option v-for="e in visible" :key="e.id" :value="e.id">{{ e.id }}</option>
          </select></label>
          <template v-if="chosen">
            <p>{{ chosen.a }} → {{ chosen.b }} · {{ chosen.walkable===false?'资料待查，已停用':chosen.open?'开放':'关闭' }}</p>
            <p>{{ chosen.evidence || '沿用原道路位置，现场通行条件待核实' }}</p>
          </template>
          <p>与北门断开的入口 {{ disconnected.length }}</p>
          <ul><li v-for="p in disconnected" :key="p.id">{{ p.name }} · {{ p.entry }}</li></ul>
          <template v-if="route?.points.length">
            <p>当前路线 · {{ route.meters }} m（估算）</p>
            <ol><li v-for="(edge,i) in route.edges" :key="i"><button @click="selection=edge">{{ edge }}</button></li></ol>
          </template>
        </aside>
      </div>
    </section>
  </div>
</template>

<style scoped>
.road-scrim{position:fixed;inset:0;z-index:90;background:#18332888;display:grid;place-items:center;padding:1rem}
.road-check{background:#f8faf4;color:#22473d;border-radius:16px;width:min(980px,100%);max-height:94vh;overflow:auto;padding:1.1rem}
.road-check header,.road-options{display:flex;align-items:center;gap:.8rem;flex-wrap:wrap}
.road-check header{justify-content:space-between}.road-check h2{margin:0}
.road-options{font-size:.8rem;margin:.6rem 0}.road-options label{display:inline-flex;flex-flow:row;align-items:center;gap:.25rem}
.road-content{display:grid;grid-template-columns:minmax(0,1fr) minmax(155px,24%);gap:1rem}
.road-content svg{display:block;width:100%;height:min(69vh,690px);background:#f0f2e7;border-radius:10px}
.road-content text{paint-order:stroke;stroke:#f6f7ec;stroke-width:.8px;font-size:2.9px;fill:#173e37}
.road-content text.active{font-weight:700;fill:#823a07}.road-edge{cursor:pointer}
.road-content aside{font-size:.8rem;overflow:auto;max-height:69vh}.road-content aside li button{font-size:.72rem;padding:.2rem .35rem}
@media(max-width:660px){.road-content{grid-template-columns:1fr}.road-content svg{height:51vh}}
</style>
