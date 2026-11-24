<script setup>
import {computed,ref,watch} from 'vue'
import {useRoute} from 'vue-router'
import {statusNames,useCampus} from '../store.js'

const store=useCampus(), page=useRoute()
const emit=defineEmits(['locate','navigate','route','itinerary'])
const tabs={schedule:'行程',itinerary:'多站行程',favorite:'收藏地点',route:'保存路线',progress:'导览进度',feedback:'我的反馈'}
const weekday=['周一','周二','周三','周四','周五','周六','周日']
const localDate=()=>{
  const now=new Date()
  return [now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-')
}
const today=localDate()
const tab=ref('schedule'), date=ref(today), editId=ref(''), form=ref(null), repeat=ref(false), issue=ref(''), busy=ref(false)
const placeName=id=>store.places.find(p=>p.id===id)?.name||id
const dayOf=value=>(new Date(value+'T12:00:00').getDay()+6)%7+1
const rows=computed(()=>store.records.schedule.filter(i=>i.data.date ? i.data.date===date.value : i.data.day===dayOf(date.value))
  .sort((a,b)=>a.data.start.localeCompare(b.data.start)))
const savedSchedules=computed(()=>[...store.records.schedule].sort((a,b)=>a.data.start.localeCompare(b.data.start)))
function edit(item,place) {
  issue.value=''
  editId.value=item?.id||''
  form.value=item ? {...item.data} : {name:'',place:place || store.places[0]?.id || '',date:date.value,day:dayOf(date.value),start:'08:00',end:'09:00'}
  repeat.value=Boolean(item?.data.day)
}
async function submit() {
  if (busy.value) return
  busy.value=true
  issue.value=''
  try {
    const data={...form.value,date:repeat.value?'':form.value.date,day:repeat.value?form.value.day:0}
    await store.save('schedule',data,editId.value||undefined)
    if (data.date) date.value=data.date
    form.value=null
    store.notify('行程已保存')
  } catch (error) { issue.value=error.message }
  finally { busy.value=false }
}
async function remove(kind,id) {
  try { await store.remove(kind,id); store.notify('已移除') }
  catch (error) { store.notify(error.message) }
}
watch(()=>page.query.place,id=>{ if (typeof id==='string') {tab.value='schedule';edit(null,id)} },{immediate:true})
</script>

<template>
  <main class="document-page">
    <header class="page-heading"><span class="eyebrow">个人空间</span><h1>我的南湖</h1><p>{{ store.session.username }} 的校园计划和记录</p></header>
    <nav class="tabs" aria-label="个人空间栏目">
      <button v-for="(title,id) in tabs" :key="id" :class="{chosen:tab===id}" @click="tab=id">{{ title }}</button>
    </nav>
    <section v-if="tab==='schedule'" class="space-grid">
      <article class="paper">
        <div class="section-head"><h2>{{ date===today?'今日行程':'当天行程' }}</h2><input v-model="date" type="date" aria-label="查看日期" required><button class="primary" @click="edit()">新增行程</button></div>
        <p v-if="!rows.length" class="empty">这一天没有安排</p>
        <ul class="record-list">
          <li v-for="i in rows" :key="i.id">
            <time>{{ i.data.start }}–{{ i.data.end }}</time><div><strong>{{ i.data.name }}</strong><p>{{ placeName(i.data.place) }}</p></div>
            <div class="actions"><button @click="emit('locate',i.data.place)">地图定位</button><button @click="emit('navigate',i.data.place)">导航</button></div>
          </li>
        </ul>
        <h3>所有安排</h3>
        <ul class="record-list"><li v-for="i in savedSchedules" :key="i.id">
          <div><strong>{{ i.data.name }}</strong><p>{{ i.data.date || '每'+weekday[i.data.day-1].slice(1) }} · {{ i.data.start }}–{{ i.data.end }}</p></div>
          <div class="actions"><button @click="edit(i)">编辑</button><button @click="remove('schedule',i.id)">删除</button></div>
        </li></ul>
        <p v-if="!savedSchedules.length" class="empty">暂无行程</p>
      </article>
      <article v-if="form" class="paper">
        <h2>{{ editId?'编辑行程':'新增行程' }}</h2>
        <form class="stack" @submit.prevent="submit">
          <label>名称<input v-model.trim="form.name" maxlength="100" required></label>
          <label>关联地点<select v-model="form.place" required><option v-for="p in store.places" :key="p.id" :value="p.id">{{ p.name }}</option></select></label>
          <label class="check"><input type="checkbox" v-model="repeat"> 每周重复</label>
          <label v-if="repeat">星期<select v-model.number="form.day"><option v-for="(title,i) in weekday" :key="title" :value="i+1">{{ title }}</option></select></label>
          <label v-else>日期<input v-model="form.date" type="date" required></label>
          <div class="field-grid"><label>开始<input v-model="form.start" type="time" required></label><label>结束<input v-model="form.end" type="time" required></label></div>
          <p v-if="issue" class="error" role="alert">{{ issue }}</p>
          <div class="actions"><button class="primary" :disabled="busy">保存行程</button><button type="button" @click="form=null">取消</button></div>
        </form>
      </article>
    </section>
    <section v-else class="paper">
      <h2>{{ tabs[tab] }}</h2>
      <p v-if="!store.records[tab].length" class="empty">暂无记录</p>
      <ul class="record-list"><li v-for="i in store.records[tab]" :key="i.id">
        <template v-if="tab==='favorite'">
          <strong>{{ placeName(i.data.place) }}</strong>
          <div class="actions"><button @click="emit('locate',i.data.place)">地图定位</button><button @click="remove(tab,i.id)">取消收藏</button></div>
        </template>
        <template v-else-if="tab==='route'">
          <div><strong>{{ i.data.name }}</strong><p>{{ [i.data.start,...i.data.via,i.data.end].map(placeName).join(' → ') }}</p></div>
          <div class="actions"><button @click="emit('route',i.data)">重新规划</button><button @click="remove(tab,i.id)">移除</button></div>
        </template>
        <template v-else-if="tab==='progress'">
          <div><strong>{{ store.snapshot?.scene.tours.find(t=>t.id===i.id)?.name || i.id }}</strong>
            <p>已完成 {{ i.data.completed }} 站</p></div>
        </template>
        <template v-else-if="tab==='itinerary'">
          <div><strong>{{ i.data.name }}</strong><p>{{ i.data.lastOrder.map(placeName).join(' → ') }}</p>
            <p>保存时地图 v{{ i.data.sceneRevision }} · 估算 {{ i.data.lastDistance }} m</p></div>
          <div class="actions"><button @click="emit('itinerary',i.data)">打开行程</button><button @click="remove(tab,i.id)">移除</button></div>
        </template>
        <template v-else>
          <div><strong>{{ i.data.description }}</strong>
            <p v-if="i.data.type==='place'">{{ placeName(i.data.target) }}</p>
            <p v-else>{{ i.data.type==='road'?'道路':'地图位置' }}</p>
            <p v-if="i.data.reply">管理员回复 · {{ i.data.reply }}</p>
            <p v-if="i.data.publishedRevision">关联地图发布 v{{ i.data.publishedRevision }}</p>
          </div><span class="status">{{ statusNames[i.data.status] }}</span>
        </template>
      </li></ul>
    </section>
  </main>
</template>
