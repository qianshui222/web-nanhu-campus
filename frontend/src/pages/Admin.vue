<script setup>
import {computed,onMounted,ref} from 'vue'
import {api,categories,statusNames,useCampus} from '../store.js'

const props=defineProps({roadName:Function})
const store=useCampus()
const tabs={places:'建筑与服务',nodes:'入口与路口',edges:'道路',tours:'主题导览',feedback:'反馈处理',history:'地图版本'}
const styles={complex:'综合楼',annex:'附属翼楼',block:'通用楼体',canteen:'食堂',dorm:'宿舍',hall:'场馆',court:'露天球场',track:'田径场',service:'入口标记'}
const tab=ref('places'), draft=ref(null), active=ref(''), issue=ref(''), notice=ref(''), busy=ref(false), items=ref([])
const upload=ref(null), reply=ref({status:'working',reply:''}), ticket=ref(null)
const history=ref([]), draftToken=ref(null), savedAt=ref(''), note=ref(''), linkedTicket=ref(null)
const collection=computed(()=>draft.value?.scene?.[tab.value]||[])
const item=computed(()=>collection.value.find(i=>i.id===active.value))
const isData=computed(()=>['places','nodes','edges','tours'].includes(tab.value))
const dirty=computed(()=>draft.value && JSON.stringify(draft.value)!==JSON.stringify(store.snapshot))
const clone=value=>JSON.parse(JSON.stringify(value))
const placeName=id=>draft.value?.scene.places.find(p=>p.id===id)?.name||id
function nodeName(id) {
  const linked=draft.value?.scene.places.filter(p=>p.entry===id).map(p=>p.name)
  return linked?.length ? linked.join(' / ')+' 入口（'+id+'）' : id
}
function useTab(id) {tab.value=id;active.value='';ticket.value=null;issue.value=''}
function reset() {
  draft.value=store.snapshot ? clone(store.snapshot) : null
  active.value=''
  issue.value=''
  notice.value=''
}
async function refresh() {
  try {
    const [snapshot,saved,feedback,versions]=await Promise.all([
      api('/scene'),api('/admin/scene/draft'),api('/admin/feedback'),api('/admin/scene/history')
    ])
    store.applyScene(snapshot)
    reset()
    if (saved.draft) {
      draft.value={revision:saved.draft.revision,scene:saved.draft.scene}
      draftToken.value=saved.draft.token
      savedAt.value=saved.draft.savedAt
    } else {
      draftToken.value=null
      savedAt.value=''
    }
    items.value=feedback
    history.value=versions
  }
  catch (error) { issue.value=error.message }
}
function add() {
  const id='new-'+crypto.randomUUID().slice(0,8)
  const [place]=draft.value.scene.places
  const [node,next]=draft.value.scene.nodes
  const examples={
    places:{id,name:'新地点',type:'service',x:0,z:0,angle:0,w:0,d:0,h:0,floors:1,color:'#79a392',
      entry:node?.id||'',style:'service',parent:null,description:'待补充简介',service:'现场公告为准',updated:'待维护',photo:''},
    nodes:{id,x:0,z:0},
    edges:{id,a:node?.id||'',b:next?.id||'',open:true,stairs:false},
    tours:{id,name:'新导览',description:'请填写导览说明',stops:place?[{place:place.id,note:'请填写站点介绍'}]:[]}
  }
  collection.value.push(examples[tab.value])
  active.value=id
}
function syncRoadEndpoints() {
  const positions = new Map(draft.value.scene.nodes.map(node => [node.id,node]))
  for (const edge of draft.value.scene.edges) {
    if (!edge.geometry) continue
    const a=positions.get(edge.a), b=positions.get(edge.b)
    if (!a || !b) continue
    edge.geometry[0]={x:a.x,z:a.z}
    edge.geometry[edge.geometry.length-1]={x:b.x,z:b.z}
  }
}
function insertBend(edge) {
  syncRoadEndpoints()
  const a=edge.geometry?.at(-2) ?? draft.value.scene.nodes.find(node=>node.id===edge.a)
  const b=draft.value.scene.nodes.find(node=>node.id===edge.b)
  if(!edge.geometry) edge.geometry=[{x:a.x,z:a.z},{x:b.x,z:b.z}]
  edge.geometry.splice(-1,0,{x:(a.x+b.x)/2,z:(a.z+b.z)/2})
}
function remove() {
  const i=collection.value.indexOf(item.value)
  if (i>=0) collection.value.splice(i,1)
  active.value=''
}
async function persistDraft() {
  syncRoadEndpoints()
  const saved=await api('/admin/scene/draft','PUT',{...draft.value,token:draftToken.value})
  draftToken.value=saved.token
  savedAt.value=saved.savedAt
  return saved
}
async function save() {
  if (busy.value) return
  busy.value=true
  issue.value=''
  notice.value=''
  try {
    await persistDraft()
    notice.value='草稿已保存，地图仍使用 v'+store.snapshot.revision
  } catch (error) { issue.value=error.message }
  finally { busy.value=false }
}
async function publish() {
  if (busy.value) return
  busy.value=true
  issue.value=''
  try {
    const saved=await persistDraft()
    const state=await api('/admin/scene/publish','POST',{token:saved.token,note:note.value.trim(),
      feedbackOwner:linkedTicket.value?.owner,feedbackId:linkedTicket.value?.id})
    store.applyScene(state)
    linkedTicket.value=null
    note.value=''
    await refresh()
    notice.value='地图已发布 · v'+state.revision
  } catch(error) { issue.value=error.message }
  finally { busy.value=false }
}
async function discard() {
  try {
    if (draftToken.value) await api('/admin/scene/draft/'+draftToken.value,'DELETE')
    draftToken.value=null
    savedAt.value=''
    reset()
  } catch(error) { issue.value=error.message }
}
async function restore(target) {
  if (busy.value) return
  busy.value=true
  try {
    const state=await api('/admin/scene/restore','POST',{revision:store.snapshot.revision,target})
    store.applyScene(state)
    await refresh()
    notice.value='已恢复 v'+target+'，发布为 v'+state.revision
  } catch(error) { issue.value=error.message }
  finally { busy.value=false }
}
function exportData() {
  const file=new Blob([JSON.stringify(draft.value.scene,null,2)],{type:'application/json'})
  const url=URL.createObjectURL(file)
  const link=document.createElement('a')
  link.href=url
  link.download='nanhu-scene.json'
  link.click()
  setTimeout(()=>URL.revokeObjectURL(url),1000)
}
async function importData(event) {
  issue.value=''
  notice.value=''
  const file=event.target.files[0]
  event.target.value=''
  if (!file) return
  try {
    if (file.size>2_000_000) throw new Error('导入文件不能超过 2 MB')
    const data=JSON.parse(await file.text())
    if (data?.version!==1 || !['places','nodes','edges','tours'].every(k=>Array.isArray(data[k]))) {
      throw new Error('该文件不是受支持的南湖场景格式')
    }
    draft.value.scene=data
    active.value=''
    notice.value='已读入草稿。保存时服务端会校验编号、引用、入口和道路。'
  } catch (error) {issue.value=error.message}
}
function openTicket(i) {
  ticket.value=i
  reply.value={status:i.data.status,reply:i.data.reply||''}
}
function linkTicket() {
  linkedTicket.value=ticket.value
  const kind=ticket.value.data.type
  const target=ticket.value.data.target
  useTab(kind==='road'?'edges':'places')
  active.value=target||''
}
async function sendReply() {
  if (busy.value) return
  busy.value=true
  issue.value=''
  try {
    const {owner,id}=ticket.value
    const result=await api('/admin/feedback/'+encodeURIComponent(owner)+'/'+encodeURIComponent(id),'PUT',reply.value)
    items.value=await api('/admin/feedback')
    openTicket(result)
    store.notify('处理结果已保存')
  } catch (error) { issue.value=error.message }
  finally { busy.value=false }
}
onMounted(refresh)
</script>

<template>
  <main class="document-page">
    <header class="page-heading"><span class="eyebrow">管理后台</span><h1>校园地图维护</h1><p>管理地点、步行图、导览与纠错反馈。</p></header>
    <nav class="tabs" aria-label="后台栏目"><button v-for="(title,id) in tabs" :key="id" :class="{chosen:tab===id}" @click="useTab(id)">{{ title }}</button></nav>
    <p v-if="issue" class="error" role="alert">{{ issue }}</p><p v-if="notice" role="status" class="notice">{{ notice }}</p>
    <template v-if="isData && draft">
      <div class="admin-actions actions">
        <span class="muted">公开 v{{ store.snapshot?.revision }} · 草稿基于 v{{ draft.revision }} · {{ savedAt ? '已存草稿' : dirty ? '草稿未存' : '当前发布' }}</span>
        <button type="button" @click="exportData">导出场景</button><button type="button" @click="upload.click()">导入场景</button>
        <input ref="upload" type="file" accept=".json,application/json" hidden @change="importData">
        <button :disabled="(!dirty && !draftToken) || busy" @click="discard">放弃草稿</button>
        <button :disabled="!dirty || busy" @click="save">保存草稿</button>
      </div>
      <form class="publication actions" @submit.prevent="publish">
        <label>发布说明<input v-model="note" maxlength="500" required placeholder="说明本次地图改动"></label>
        <span v-if="linkedTicket" class="status">关联反馈 · {{ linkedTicket.data.description }}</span>
        <button v-if="linkedTicket" type="button" @click="linkedTicket=null">取消关联</button>
        <button class="primary" :disabled="(!dirty && !draftToken) || busy">发布地图</button>
      </form>
      <div class="space-grid admin-grid">
        <article class="paper">
          <div class="section-head"><h2>{{ tabs[tab] }}</h2><button @click="add">新增</button></div>
          <div class="admin-list">
            <button v-for="i in collection" :key="i.id" :class="{chosen:i.id===active}" @click="active=i.id">
              {{ i.name || (tab==='edges' ? props.roadName(i) : nodeName(i.id)) }}
            </button>
          </div>
        </article>
        <article v-if="item" class="paper">
          <div class="section-head"><h2>{{ item.name || (tab==='edges' ? '编辑道路' : '编辑节点') }}</h2>
            <button @click="remove">移出草稿</button></div>
          <p class="muted">编号 {{ item.id }}</p>
          <form class="stack" @submit.prevent="save">
            <template v-if="tab==='places'">
              <label>名称<input v-model.trim="item.name" maxlength="80"></label>
              <div class="field-grid"><label>分类<select v-model="item.type"><option v-for="(name,id) in categories" :key="id" :value="id">{{ name }}</option></select></label>
              <label>建模样式<select v-model="item.style"><option v-for="(name,id) in styles" :key="id" :value="id">{{ name }}</option></select></label></div>
              <div class="field-grid">
                <label v-for="(title,id) in {x:'东西坐标 X',z:'南北坐标 Z',w:'宽度',d:'进深',h:'高度',floors:'层数',angle:'朝向角度'}" :key="id">{{ title }}
                  <input v-model.number="item[id]" type="number" :step="id==='floors'?1:0.1"></label>
                <label>立面颜色<input v-model="item.color" type="color"></label>
              </div>
              <div class="field-grid"><label>入口节点<select v-model="item.entry"><option v-for="n in draft.scene.nodes" :key="n.id" :value="n.id">{{ nodeName(n.id) }}</option></select></label>
              <label>所属主楼<select v-model="item.parent"><option :value="null">独立地点</option><option v-for="p in draft.scene.places.filter(p=>p.id!==item.id&&p.h>0)" :key="p.id" :value="p.id">{{ p.name }}</option></select></label></div>
              <label>简介<textarea v-model.trim="item.description" rows="3" maxlength="1000"></textarea></label>
              <label>服务信息<input v-model.trim="item.service" maxlength="300"></label><label>更新说明<input v-model.trim="item.updated" maxlength="150"></label>
              <label>已核实开放时间<input v-model.trim="item.openingHours" maxlength="250" placeholder="*@09:00-18:00 或 1,2,3,4,5@09:00-18:00"></label>
              <label>照片地址<input v-model.trim="item.photo" placeholder="https://…"></label>
            </template>
            <div v-if="tab==='nodes'" class="field-grid">
              <label>X 坐标<input v-model.number="item.x" type="number" step=".1"></label><label>Z 坐标<input v-model.number="item.z" type="number" step=".1"></label>
            </div>
            <template v-if="tab==='edges'">
              <div class="field-grid"><label v-for="(label,side) in {a:'端点 A',b:'端点 B'}" :key="side">{{ label }}
                <select v-model="item[side]"><option v-for="n in draft.scene.nodes" :key="n.id" :value="n.id">{{ nodeName(n.id) }}</option></select></label></div>
              <label class="check"><input v-model="item.open" type="checkbox" :disabled="item.walkable===false"> 开放通行</label>
              <label>步行属性<select v-model="item.walkable" @change="item.walkable===false && (item.open=false)">
                <option :value="null">沿用现有步行属性</option><option :value="true">可步行</option><option :value="false">停用 / 待核实</option>
              </select></label>
              <label>道路宽度（场景单位）<input v-model.number="item.width" @change="item.width ||= null" type="number" min=".5" max="12" step=".1"></label>
              <label>道路依据<input v-model.trim="item.evidence" @change="item.evidence ||= null" maxlength="300"></label>
              <div v-for="(point,i) in item.geometry?.slice(1,-1)" :key="i" class="field-grid">
                <label>折点 {{ i+1 }} X<input v-model.number="point.x" type="number" step=".05"></label>
                <label>折点 {{ i+1 }} Z<input v-model.number="point.z" type="number" step=".05"></label>
                <button type="button" @click="item.geometry.splice(i+1,1)">移除折点</button>
              </div>
              <button type="button" @click="insertBend(item)">添加道路折点</button>
              <label class="check"><input v-model="item.stairs" type="checkbox"> 包含台阶</label>
              <label>道路遮蔽<select v-model="item.covered"><option :value="null">未核实</option><option :value="true">有遮蔽</option><option :value="false">露天</option></select></label>
            </template>
            <template v-if="tab==='tours'">
              <label>主题名称<input v-model.trim="item.name"></label><label>主题介绍<textarea v-model.trim="item.description" rows="2"></textarea></label>
              <div v-for="(stop,i) in item.stops" :key="i" class="station-edit">
                <label>站点 {{ i+1 }}<select v-model="stop.place"><option v-for="p in draft.scene.places" :key="p.id" :value="p.id">{{ p.name }}</option></select></label>
                <label>站点介绍<textarea v-model.trim="stop.note" rows="2"></textarea></label>
                <div class="actions"><button type="button" :disabled="i===0" @click="item.stops.splice(i-1,0,item.stops.splice(i,1)[0])">上移</button>
                  <button type="button" @click="item.stops.splice(i,1)">移除站点</button></div>
              </div>
              <button type="button" @click="item.stops.push({place:draft.scene.places[0]?.id||'',note:''})">添加站点</button>
            </template>
          </form>
        </article>
      </div>
    </template>
    <section v-if="tab==='history'" class="paper">
      <h2>地图版本</h2>
      <p class="muted">恢复会校验当前业务引用，并把历史场景发布为新版本。</p>
      <ul class="record-list"><li v-for="version in history" :key="version.revision">
        <div><strong>v{{ version.revision }} · {{ version.note }}</strong>
          <p>{{ version.editor }} · {{ new Date(version.publishedAt).toLocaleString('zh-CN') }}
            <span v-if="version.restoredFrom"> · 来源 v{{ version.restoredFrom }}</span></p></div>
        <span v-if="version.revision===store.snapshot?.revision" class="status">当前版本</span>
        <button v-else :disabled="busy" @click="restore(version.revision)">恢复 v{{ version.revision }}</button>
      </li></ul>
    </section>
    <div v-if="tab==='feedback'" class="space-grid">
      <article class="paper"><h2>反馈列表</h2><p v-if="!items.length" class="empty">暂无反馈</p>
        <div class="admin-list"><button v-for="i in items" :key="i.id" :class="{chosen:i.id===ticket?.id}" @click="openTicket(i)">
          {{ statusNames[i.data.status] }} · {{ i.data.description }}</button></div>
      </article>
      <article v-if="ticket" class="paper">
        <h2>处理反馈</h2><p>{{ ticket.data.description }}</p>
        <p class="muted">{{ ticket.owner }} · {{ ticket.data.type==='place' ? placeName(ticket.data.target)
          : ticket.data.type==='position' ? 'X '+ticket.data.x+' / Z '+ticket.data.z
          : props.roadName(draft.scene.edges.find(e=>e.id===ticket.data.target)||{a:ticket.data.target,b:''}) }}</p>
        <p v-if="ticket.data.publishedRevision" class="muted">已关联地图 v{{ ticket.data.publishedRevision }}</p>
        <form class="stack" @submit.prevent="sendReply">
          <label>状态<select v-model="reply.status"><option v-for="(name,id) in statusNames" :key="id" :value="id">{{ name }}</option></select></label>
          <label>回复<textarea v-model.trim="reply.reply" rows="4" required maxlength="1000"></textarea></label>
          <button class="primary" :disabled="busy">保存处理结果</button>
          <button type="button" @click="linkTicket">打开对应对象并关联发布</button>
        </form>
      </article>
    </div>
  </main>
</template>
