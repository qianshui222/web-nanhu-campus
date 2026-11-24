<script setup>
import { computed, ref, watch } from 'vue'
import { api, useCampus } from '../store.js'
import AlgorithmStats from './AlgorithmStats.vue'

const props=defineProps({ initial:Object })
const emit=defineEmits(['result','login','invalidate'])
const store=useCampus()
const stops=ref(['gate','complex','canteen']), optimize=ref(true), avoidStairs=ref(false)
const name=ref(''), result=ref(null), busy=ref(false), issue=ref('')
const placeName=id=>store.places.find(place=>place.id===id)?.name||id
const labels={fixed:'保留指定顺序',exact:'精确优化 · Held–Karp', 'nearest-2opt':'最近邻 + 2-opt · 启发式'}
const payload=computed(()=>({stops:[...stops.value],optimize:optimize.value,avoidStairs:avoidStairs.value}))

function reset() {
  result.value=null
  issue.value=''
  emit('invalidate')
}
async function plan() {
  busy.value=true
  reset()
  const input=payload.value
  try {
    const data=await api('/itinerary/plan','POST',input)
    const snapshot=await api('/scene')
    if (snapshot.revision!==data.revision) throw new Error('规划期间地图已更新，请重新计算')
    if (JSON.stringify(input)!==JSON.stringify(payload.value)) return
    store.applyScene(snapshot)
    result.value=data
    emit('result',data.result.route)
  } catch(error) {issue.value=error.message}
  finally {busy.value=false}
}
async function save() {
  if (!store.session.signedIn) {emit('login');return}
  busy.value=true
  try {
    await store.save('itinerary',{...payload.value,name:name.value.trim()||'我的校园行程'})
    store.notify('多站行程已保存')
  } catch(error) {issue.value=error.message}
  finally {busy.value=false}
}
watch([stops,optimize,avoidStairs],reset,{deep:true})
watch(()=>props.initial,data=>{
  if (!data) return
  stops.value=[...data.stops]
  avoidStairs.value=data.avoidStairs
  optimize.value=data.optimize
  name.value=data.name
},{immediate:true})
</script>

<template>
  <span class="eyebrow">多站点步行</span><h2>行程优化</h2>
  <p class="muted">固定起点与终点，只优化中间站。距离取自当前版入口道路图。</p>
  <form class="stack" @submit.prevent="plan">
    <div class="via-row" v-for="(_,i) in stops" :key="i">
      <label>{{ i===0?'起点':i===stops.length-1?'终点':'中间站 '+i }}
        <select v-model="stops[i]" required>
          <option value="" disabled>选择地点</option>
          <option v-for="place in store.places" :key="place.id" :value="place.id">{{ place.name }}</option>
        </select>
      </label>
      <button v-if="i>0&&i<stops.length-1" type="button" :aria-label="'删除中间站 '+i" @click="stops.splice(i,1)">×</button>
    </div>
    <label class="check"><input type="checkbox" v-model="optimize"> 自动优化中间站顺序</label>
    <label class="check"><input type="checkbox" v-model="avoidStairs"> 排除含台阶路段</label>
    <div class="actions">
      <button type="button" :disabled="stops.length>=14" @click="stops.splice(stops.length-1,0,'')">添加中间站</button>
      <button class="primary" :disabled="busy">生成行程</button>
    </div>
  </form>
  <p v-if="issue" role="alert" class="error">{{ issue }}</p>
  <template v-if="result">
    <section class="itinerary-result" aria-label="行程优化结果">
      <strong>{{ labels[result.method] }}</strong>
      <dl><dt>原顺序 · {{ result.beforeDistance }} m</dt><dd>{{ result.before.map(placeName).join(' → ') }}</dd>
        <dt>采用顺序 · {{ result.afterDistance }} m</dt><dd>{{ result.after.map(placeName).join(' → ') }}</dd></dl>
      <span class="muted">预计减少 {{ (result.beforeDistance-result.afterDistance).toFixed(1) }} m</span>
    </section>
    <AlgorithmStats :result="result.result"/>
    <form class="stack" @submit.prevent="save">
      <label>行程名称<input v-model="name" maxlength="80" placeholder="我的校园行程"></label>
      <button :disabled="busy">保存多站行程</button>
    </form>
  </template>
</template>
