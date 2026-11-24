<script setup>
import { roadPoints, svgPoints } from '../scene/roads.js'
import { computed, ref } from 'vue'
import reference from '../scene/calibration-anchors.json'
import baseline from '../scene/calibration-baseline.json'

const props=defineProps({ snapshot:Object })
const emit=defineEmits(['close'])
const overlay=ref(true)
const additions=ref(false)
const maps=computed(()=>[
 {name:'整改前 · 基线',scene:baseline},
 {name:'当前 · v'+props.snapshot.revision,scene:props.snapshot.scene}
])
const selectedIds=new Set(['gate','east','west','complex','library','canteen','hall','track','d11','d14','d15'])
const anchorNames={gate:'北门',east:'东门',west:'西门',complex:'综合楼',library:'图书馆翼楼',canteen:'食堂',
 hall:'体育馆',track:'运动场',d11:'11 栋',d14:'14 栋',d15:'15 栋'}
const polygon=points=>points?.map(p=>p.x+','+p.z).join(' ')
const edges=scene=>{
 const node=Object.fromEntries(scene.nodes.map(n=>[n.id,n]))
 return scene.edges.filter(e=>e.walkable!==false).map(e=>({...e,points:svgPoints(roadPoints(e,node))}))
}
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <section class="modal calibration-modal" role="dialog" aria-modal="true" aria-label="地图校准">
      <button class="close" aria-label="关闭校准" @click="emit('close')">×</button>
      <span class="eyebrow">坐标与路网</span><h2>北向校准对照</h2>
      <p>同一局部坐标范围，北向上。红色锚点取自官方 GIS 斜视地面近似校正，用于比较位置与邻接。</p>
      <label class="check"><input type="checkbox" v-model="overlay"> 叠加 GIS 地标和位移线</label>
      <label class="check"><input type="checkbox" v-model="additions" :disabled="!overlay"> 显示本轮补录建筑锚点</label>
      <div class="calibration-maps">
        <article v-for="map in maps" :key="map.name">
          <strong>{{ map.name }}</strong>
          <svg viewBox="-156 -158 314 320" :aria-label="map.name">
            <rect x="-156" y="-158" width="314" height="320" fill="#e0e5d8"/>
            <path v-for="n in [-150,-100,-50,0,50,100,150]" :key="n" :d="'M '+n+' -158 V162 M -156 '+n+' H158'" fill="none" stroke="#cbd5c8" stroke-width=".4"/>
            <polygon v-if="map.scene.boundary" :points="polygon(map.scene.boundary)" fill="#c9d8be" stroke="#83987d"/>
            <polygon :points="polygon(map.scene.water)" fill="#7eacad"/>
            <polyline v-for="e in edges(map.scene)" :key="e.id" :points="e.points" fill="none"
              :stroke="e.open?'#718578':'#b26d58'" stroke-width="1.2"/>
            <g v-for="p in map.scene.places" :key="p.id" :transform="'translate('+p.x+' '+p.z+') rotate('+(-p.angle)+')'">
              <rect :x="-Math.max(p.w,4)/2" :y="-Math.max(p.d,4)/2" :width="Math.max(p.w,4)" :height="Math.max(p.d,4)"
                :fill="p.color" stroke="#354e40" stroke-width=".68"/>
            </g>
            <g v-if="overlay">
              <g v-for="p in reference.points.filter(a=>selectedIds.has(a.id)||additions&&a.added)" :key="p.id">
                <line :x1="p.projected[0]" :y1="p.projected[1]" :x2="(map.scene.places.find(x=>x.id===p.id)?.x ?? p.projected[0])"
                  :y2="(map.scene.places.find(x=>x.id===p.id)?.z ?? p.projected[1])" stroke="#b05949" stroke-width=".75" stroke-dasharray="2 1.6"/>
                <circle :cx="p.projected[0]" :cy="p.projected[1]" r="2.3" fill="#f8e7cf" stroke="#b05949" stroke-width="1.06"/>
                <text :x="p.projected[0]+3.5" :y="p.projected[1]-3.4" font-size="5.3" fill="#733d36"
                  paint-order="stroke" stroke="#f0f0e5" stroke-width=".7">{{ anchorNames[p.id] || p.label }}</text>
              </g>
            </g>
            <path d="M -145 -125 v-17 l-2.5 5 m2.5 -5 l2.5 5 M -145 148 h50" stroke="#37554b" stroke-width="1.35" fill="none"/>
            <text x="-147" y="-144" font-size="6" fill="#2d4f42">北</text>
            <text x="-145" y="157" font-size="5.2" fill="#2d4f42">50 局部单位</text>
          </svg>
        </article>
      </div>
      <p class="muted">地图校准为课程估算。西门现行开放、入口精确几何和楼体高度仍待现场核对。</p>
    </section>
  </div>
</template>
