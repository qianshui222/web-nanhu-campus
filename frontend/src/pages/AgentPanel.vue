<script setup>
import { onMounted, ref } from 'vue'
import { api,useCampus } from '../store.js'
import TimedPlanCard from './TimedPlanCard.vue'

const props=defineProps({initial:Object, perform:Function,showPlan:Function,showRoute:Function,askLogin:Function})
const store=useCampus()
const defaultForm=()=>({start:store.selected&&!['canteen','complex'].includes(store.selected)?store.selected:'gate',end:'complex',dayOffset:1,startTime:'12:45',deadlineTime:'14:00',
  stops:[{place:'canteen',minutes:10}],avoidStairs:false,preferShelter:true})
const input=ref(props.initial?.input?JSON.parse(JSON.stringify(props.initial.input)):defaultForm())
const message=ref(''),history=ref([]),status=ref(null), trace=ref([])
const tab=ref(props.initial?'form':'chat'), name=ref(''), result=ref(props.initial||null), error=ref(''), busy=ref(false)
const confirmation=ref(false)

async function send(){
  busy.value=true;error.value=''
  const user=message.value.trim()
  try{
    const data=await api('/agent','POST',{message:user,selected:store.selected||null,hasRoute:!!store.route,hasPlan:!!result.value,history:history.value})
    history.value.push({role:'user',content:user})
    trace.value=data.trace
    if(data.route) await props.showRoute(data.route)
    if(data.plan) {result.value=data.plan;await props.showPlan(data.plan)}
    for(const action of data.actions){
      if(action.kind==='save'){confirmation.value=true;continue}
      await props.perform(action)
    }
    history.value.push({role:'assistant',content:data.text||'操作已完成。'})
    message.value=''
  }catch(e){error.value=e.message}
  finally{busy.value=false}
}
async function plan(){
  busy.value=true;error.value=''
  try{
    const data=await api('/agent/plan','POST',input.value)
    await props.showPlan(data)
    result.value=data
  }catch(e){error.value=e.message}
  finally{busy.value=false}
}
async function save(){
  if(!store.session.signedIn){props.askLogin();return}
  busy.value=true;error.value=''
  try{
    await api('/agent/save','POST',{plan:result.value.input,revision:result.value.revision,name:name.value.trim()||'时间约束行程'})
    await store.refreshRecords()
    confirmation.value=false
    store.notify('时间约束行程已保存')
  }catch(e){error.value=e.message}
  finally{busy.value=false}
}
onMounted(async()=>{try{status.value=await api('/agent/status')}catch(e){error.value=e.message}})
</script>
<template>
  <span class="eyebrow">校园助手</span><h2>校园 Agent</h2>
  <nav class="actions" aria-label="校园助手模式">
    <button :class="{chosen:tab==='chat'}" @click="tab='chat'">自然语言</button>
    <button :class="{chosen:tab==='form'}" @click="tab='form'">时间行程表单</button>
  </nav>
  <div v-if="tab==='chat'">
    <p v-if="status" class="muted">{{ status.message }}</p>
    <p class="muted">例：定位南湖综合楼。或从北门出发，明天 12:45 去食堂停十分钟，14:00 前到综合楼。</p>
    <ul v-if="history.length" class="agent-chat">
      <li v-for="(line,i) in history" :key="i" :class="line.role">{{line.content}}</li>
    </ul>
    <form class="stack" @submit.prevent="send">
      <label>给校园助手的指令<textarea v-model="message" required maxlength="600" rows="3"></textarea></label>
      <button class="primary" :disabled="busy||!status?.configured">{{busy?'正在处理…':'发送指令'}}</button>
    </form>
    <details v-if="trace?.length"><summary>工具执行记录</summary><ul class="plan-notes">
      <li v-for="(step,i) in trace" :key="i">{{step.tool}} · {{step.ok?'通过':'未通过'}} · {{step.millis}} ms</li>
    </ul></details>
  </div>
  <form v-else class="stack agent-form" @submit.prevent="plan">
    <label>时间行程起点<select v-model="input.start"><option v-for="p in store.places" :key="p.id" :value="p.id">{{p.name}}</option></select></label>
    <label>时间行程终点<select v-model="input.end"><option v-for="p in store.places" :key="p.id" :value="p.id">{{p.name}}</option></select></label>
    <label>出发日期<select v-model.number="input.dayOffset" @change="input.date=null"><option :value="0">今天</option><option :value="1">明天</option><option :value="2">后天</option></select></label>
    <label>指定日期（可选）<input v-model="input.date" type="date"></label>
    <div class="field-grid">
      <label>出发（北京）<input v-model="input.startTime" type="time" required></label>
      <label>截止（北京）<input v-model="input.deadlineTime" type="time" required></label>
    </div>
    <div v-for="(stop,i) in input.stops" :key="i" class="field-grid">
      <label>时间行程站点 {{i+1}}<select v-model="stop.place"><option v-for="p in store.places" :key="p.id" :value="p.id">{{p.name}}</option></select></label>
      <label>停留（分钟）<input v-model.number="stop.minutes" type="number" min="0" max="180" required></label>
      <button type="button" @click="input.stops.splice(i,1)">移除站点</button>
    </div>
    <label class="check"><input v-model="input.preferShelter" type="checkbox"> 优先已知遮蔽路段</label>
    <label class="check"><input v-model="input.avoidStairs" type="checkbox"> 排除台阶</label>
    <div class="actions">
      <button type="button" :disabled="input.stops.length>=6" @click="input.stops.push({place:'canteen',minutes:10})">增加停留点</button>
      <button class="primary" :disabled="busy">计算时间行程</button>
    </div>
  </form>
  <p v-if="error" class="error" role="alert">{{error}}</p>
  <TimedPlanCard :plan="result"/>
  <form v-if="result?.feasible" class="stack" @submit.prevent="save">
    <label>行程标题<input v-model="name" maxlength="80" placeholder="时间约束行程"></label>
    <button :disabled="busy">{{confirmation?'确认保存到个人空间':'保存时间行程'}}</button>
  </form>
</template>
