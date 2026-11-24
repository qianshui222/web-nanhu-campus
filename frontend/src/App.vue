<script setup>
import {computed,defineAsyncComponent,onMounted,ref,watch,nextTick} from 'vue'
import {useRoute,useRouter} from 'vue-router'
import {api,categories,useCampus} from './store.js'
import CampusHome from './pages/CampusHome.vue'
import PaperDialog from './pages/PaperDialog.vue'
import PaperAction from './pages/PaperAction.vue'
import PersonalSpace from './pages/PersonalSpace.vue'
import Admin from './pages/Admin.vue'
import AlgorithmStats from './pages/AlgorithmStats.vue'
import ItineraryPlanner from './pages/ItineraryPlanner.vue'
import Calibration from './pages/Calibration.vue'
import RoadInspector from './pages/RoadInspector.vue'
import EnvironmentPanel from './pages/EnvironmentPanel.vue'
import AgentPanel from './pages/AgentPanel.vue'
import {campusDateLabel,useCampusEnvironment,weatherName} from './scene/campusEnvironment.js'

const MapScene=defineAsyncComponent(()=>import('./scene/MapScene.vue'))
const store=useCampus(), page=useRoute(), router=useRouter()
const isCampus=computed(()=>page.name==='campus')
const isHome=computed(()=>page.name==='home')
const query=ref(''), category=ref(''), layers=ref(Object.keys(categories)), labels=ref(true)
const panel=ref(''), detail=ref(true), focus=ref(0), progress=ref(0)
const routeForm=ref({start:'gate',end:'complex',via:[],avoidStairs:false})
const planning=ref(false), planError=ref(''), routeName=ref('')
const comparison=ref(null), itineraryInitial=ref(null), calibrationOpen=ref(false), roadInspectorOpen=ref(false)
const environment=useCampusEnvironment(), environmentOpen=ref(false), mapView=ref(null), agentInitial=ref(null)
const tourId=ref(''), feedback=ref({type:'place',target:'',description:''}), picking=ref(false)
const loginOpen=ref(false), registering=ref(false), auth=ref({username:'',password:''}), authError=ref(''), authBusy=ref(false)
const paperPanel=ref(''), walkingNow=ref(false), mapReady=ref(false), noticeTimer=ref()
const paperTitles={ places:'校园地点', menu:'导航菜单', guide:'使用指南', tools:'地图工具' }
const weatherReport=computed(()=>{
  const report=environment.report.value
  if (!report || report.state==='unavailable') return '暂不可用'
  const name=weatherName(report.current?.code)
  return report.state==='stale' ? name+'（数据过期）' : name
})
function paperAction(action) {
  paperPanel.value=''
  nextTick(action)
}
watch(()=>page.path,()=>{
  paperPanel.value=''
  loginOpen.value=false
  roadInspectorOpen.value=false
  environmentOpen.value=false
  calibrationOpen.value=false
  walkingNow.value=false
  mapReady.value=false
})
const places=computed(()=>store.places.filter(p=>(!category.value||p.type===category.value)&&
  (p.name+p.description+p.service).toLowerCase().includes(query.value.trim().toLowerCase())))
const selected=computed(()=>store.selectedPlace)
const scene=computed(()=>store.snapshot?.scene)
function locateFromUrl() {
  if (!isCampus.value || !scene.value) return
  const id=page.query.place
  if (typeof id !== 'string') return
  if (store.places.some(place=>place.id===id)) select(id)
  else store.notify('该地点不在当前校园地图中')
}
watch([isCampus,()=>page.query.place,()=>Boolean(scene.value)],locateFromUrl,{immediate:true})
function onMapReady(ready) {
  mapReady.value=ready
  if (ready && typeof page.query.place==='string' && store.selected===page.query.place) focus.value++
}
const tours=computed(()=>scene.value?.tours || [])
const tour=computed(()=>tours.value.find(t=>t.id===tourId.value)||tours.value[0])
const completed=computed(()=>store.records.progress.find(i=>i.id===tour.value?.id)?.data.completed||0)
const favorite=computed(()=>store.records.favorite.some(i=>i.id===store.selected))
const routeTime=computed(()=>{
  const seconds=store.route?.seconds||0
  return seconds<60 ? seconds+' 秒' : Math.floor(seconds/60)+' 分 '+seconds%60+' 秒'
})
const placeName=id=>store.places.find(p=>p.id===id)?.name||id
const roadName=edge=>{
  const byNode=id=>store.places.find(p=>p.entry===id)?.name || ({
    A:'北门内侧',B:'东北路口',C:'东门路口',D:'东侧步道',L:'图书馆路口',Q:'综合楼入口广场',
    P:'综合楼西广场',W:'西北步道',M:'中央步道',S:'生活区东侧',W2:'食堂北侧',J:'食堂西侧',K:'生活区西侧',
    H1:'场馆北侧',H2:'场馆东侧',R:'体育场北侧',H3:'场馆西侧',X:'球场东北角',T:'西门北侧',
    U:'西门南侧',V:'校区西南角',Y:'宿舍 13 栋北侧',Z:'宿舍 12 栋东北角',D15a:'宿舍 15 栋东侧',F:'宿舍区路口',G:'宿舍 11 栋南侧'
  })[id] || id
  return byNode(edge.a)+' → '+byNode(edge.b)
}
function select(id) {
  const p=store.places.find(p=>p.id===id)
  if (!p) return
  store.selected=id
  if (!layers.value.includes(p.type)) layers.value=[...layers.value,p.type]
  detail.value=true
  if (!picking.value) panel.value=''
  focus.value++
}
function show(name) {
  if (name==='itinerary') itineraryInitial.value=null
  if (name==='agent') agentInitial.value=null
  panel.value=panel.value===name?'':name
  picking.value=false
}
function requireUser() {
  if (store.session.signedIn) return true
  authError.value=''
  loginOpen.value=true
  return false
}
async function run(action) {
  try { await action(); return true }
  catch (error) { store.notify(error.message); return false }
}
async function submitAuth() {
  if (authBusy.value) return
  authBusy.value=true
  authError.value=''
  try {
    if (registering.value) await api('/register','POST',auth.value)
    await api('/login','POST',auth.value)
    await store.refreshSession()
    loginOpen.value=false
    auth.value={username:'',password:''}
    store.notify('已登录')
  } catch (error) { authError.value=error.message }
  finally { authBusy.value=false }
}
async function logout() {
  await run(async()=>{
    await api('/logout','POST')
    await store.refreshSession()
    if (!isHome.value) await router.push('/')
    store.notify('已退出')
  })
}
async function toggleFavorite() {
  if (!requireUser()) return
  await run(async()=>{
    if (favorite.value) await store.remove('favorite',store.selected)
    else await store.save('favorite',{place:store.selected})
  })
}
async function locate(id) {
  if (!isCampus.value) {
    await router.push({name:'campus',query:{place:id}})
    await nextTick()
  } else select(id)
}
async function destination(id) {
  await locate(id)
  routeForm.value.end=id
  panel.value='route'
}
async function loadSavedRoute(data) {
  await router.push('/campus')
  routeForm.value={start:data.start,end:data.end,via:[...data.via],avoidStairs:data.avoidStairs}
  routeName.value=data.name
  panel.value='route'
  await plan()
}
async function plan() {
  if (planning.value) return
  planning.value=true
  planError.value=''
  comparison.value=null
  store.route=null
  store.simulation='idle'
  progress.value=0
  try {
    const data=await api('/route/compare','POST',routeForm.value)
    const snapshot=await api('/scene')
    if (snapshot.revision!==data.revision) throw new Error('规划期间地图已更新，请重新计算')
    store.applyScene(snapshot)
    comparison.value=data
    store.route=data.route
  } catch (error) { planError.value=error.message }
  finally { planning.value=false }
}
function invalidateRoute() {
  comparison.value=null
  store.route=null
  store.simulation='idle'
  progress.value=0
}
async function openItinerary(data) {
  invalidateRoute()
  if(data.timedPlan){
    agentInitial.value=data.timedPlan
    await router.push('/campus')
    panel.value='agent'
    if(store.snapshot?.revision===agentInitial.value.revision && agentInitial.value.mapRoute)store.route=agentInitial.value.mapRoute
    return
  }
  itineraryInitial.value=data
  await router.push('/campus')
  panel.value='itinerary'
}
async function displayAgentRoute(result) {
  const snapshot=await api('/scene')
  if(snapshot.revision!==result.revision)throw new Error('地图已经更新，请重新规划')
  store.applyScene(snapshot)
  invalidateRoute()
  store.route=result.route
}
async function displayTimedPlan(plan) {
  if(plan.mapRoute)await displayAgentRoute({revision:plan.revision,route:plan.mapRoute})
  else invalidateRoute()
}
async function agentAction(action) {
  const needsPlace=['locate','details','favorite'].includes(action.kind)
  if(needsPlace&&!store.places.some(p=>p.id===action.id))throw new Error('该地点不在当前地图中')
  switch(action.kind){
    case 'locate': case 'details': {
      await locate(action.id)
      if(!mapView.value)throw new Error('没有可用的地图视图')
      store.notify('已定位 '+placeName(action.id))
      break
    }
    case 'layer': {
      if(action.id!=='all'&&!Object.hasOwn(categories,action.id))throw new Error('未知图层')
      layers.value=action.id==='all'?Object.keys(categories):[action.id]
      category.value=action.id==='all'?'':action.id
      break
    }
    case 'favorite': {
      if(!store.session.signedIn)throw new Error('请先登录后收藏')
      if(!store.records.favorite.some(i=>i.id===action.id))await store.save('favorite',{place:action.id})
      break
    }
    case 'play': {
      if(!store.route)throw new Error('没有可播放的路线')
      await simulate(true)
      break
    }
    case 'stop': {
      store.simulation='restart';await nextTick();store.simulation='idle';progress.value=0
      break
    }
    case 'reset': {
      if(!mapView.value)throw new Error('没有可用的地图视图')
      mapView.value.reset()
      break
    }
    case 'agenda': if(store.session.signedIn)await router.push('/space');else throw new Error('请先登录后查看日程');break
    default: throw new Error('地图操作不受支持')
  }
}
async function saveRoute() {
  if (!requireUser()) return
  await run(async()=>{
    await store.save('route',{...routeForm.value,name:routeName.value.trim() || placeName(routeForm.value.start)+' → '+placeName(routeForm.value.end)})
    store.notify('路线已保存')
  })
}
async function simulate(restart=false) {
  if (store.simulation==='running' && !restart) {store.simulation='paused';return}
  if (restart || store.simulation==='finished') {
    store.simulation='restart'
    await nextTick()
  }
  store.simulation='running'
}
async function scheduleAt(id) {
  if (!requireUser()) return
  await router.push({path:'/space',query:{place:id}})
}
async function finishStation(index) {
  if (!requireUser()) return
  await run(async()=>{
    await store.save('progress',{tour:tour.value.id,index})
    store.notify('已记录完成进度')
  })
}
function beginFeedback() {
  if (!requireUser()) return
  feedback.value.target=store.selected||store.places[0]?.id||''
  show('feedback')
}
function setPosition(position) {
  Object.assign(feedback.value,position)
  picking.value=false
}
async function submitFeedback() {
  if (!requireUser()) return
  if (await run(()=>store.save('feedback',feedback.value))) {
    feedback.value.description=''
    panel.value=''
    store.notify('反馈已提交，可在个人空间查看处理结果')
  }
}
async function openSpace() {
  if (requireUser()) await router.push('/space')
}
function filter(type) {
  category.value=type
  if (type && !layers.value.includes(type)) layers.value=[...layers.value,type]
}
watch(()=>store.message,message=>{
  clearTimeout(noticeTimer.value)
  if (message) noticeTimer.value=setTimeout(()=>store.notify(''),5200)
})
watch(routeForm,()=>{
  invalidateRoute()
  planError.value=''
},{deep:true})
onMounted(()=>{
  store.loadScene()
  run(()=>store.refreshSession())
})
</script>

<template>
  <div class="app-shell" :class="{ 'site-app': isHome }">
    <a v-if="isHome" class="site-skip" href="#home-content" @click.prevent="$el.querySelector('#home-content').focus()">跳到正文</a>
    <header class="topbar" :class="{ 'site-header': isHome }">
      <RouterLink class="brand" to="/" aria-label="南湖漫游首页">
        <img src="/brand/nanhu-wordmark.svg" alt="" width="132" height="39">
      </RouterLink>
      <nav aria-label="主导航">
        <RouterLink to="/" :aria-current="isHome && !page.hash ? 'page' : null">首页</RouterLink>
        <RouterLink v-if="isHome" :to="{path:'/',hash:'#places'}" :aria-current="page.hash==='#places'?'location':null">校园地点</RouterLink>
        <RouterLink to="/campus" :aria-current="isCampus?'page':null">三维地图</RouterLink>
        <RouterLink v-if="isHome" :to="{path:'/',hash:'#guide'}" :aria-current="page.hash==='#guide'?'location':null">使用指南</RouterLink>
        <button :class="{active:page.name==='space'}" @click="openSpace">个人空间</button>
        <button v-if="store.session.admin" :class="{active:page.name==='admin'}" @click="router.push('/admin')">管理后台</button>
      </nav>
      <div class="account">
        <span v-if="store.session.signedIn">{{ store.session.username }}</span>
        <button v-if="store.session.signedIn" @click="logout">退出</button>
        <button v-else @click="requireUser">登录 / 注册</button>
        <button class="paper-menu-button" type="button" aria-haspopup="dialog" @click="paperPanel='menu'">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6q8-1 16 0M4 12q8-1 16 0M4 18q8-1 16 0"/></svg>
          菜单
        </button>
      </div>
    </header>

    <PaperDialog v-if="paperPanel" :key="paperPanel" :title="paperTitles[paperPanel]"
      :sheet="paperPanel==='places'" @close="paperPanel=''">
      <template v-if="paperPanel==='places'">
        <div class="sidebar-head">
          <label class="search"><span aria-hidden="true">⌕</span><input v-model="query" type="search" placeholder="搜索建筑、食堂、宿舍…" aria-label="搜索地点" autofocus></label>
          <div class="filters">
            <button :class="{chosen:!category}" @click="filter('')">全部</button>
            <button v-for="(label,type) in categories" :key="type" :class="{chosen:type===category}" @click="filter(type)">{{ label }}</button>
          </div>
        </div>
        <div class="place-list">
          <button v-for="p in places" :key="p.id" class="place-row" :class="{active:p.id===store.selected}" @click="paperAction(()=>select(p.id))">
            <span class="category-icon" :class="p.type">{{ categories[p.type].slice(0,1) }}</span>
            <span class="place-name"><b>{{ p.name }}</b><small>{{ categories[p.type] }}</small></span><span class="row-arrow">›</span>
          </button>
          <p v-if="scene && !places.length" class="empty">没有符合条件的地点</p>
        </div>
        <div class="sidebar-bottom">
          <details><summary>地图图层</summary><div class="layer-grid">
            <label><input v-model="labels" type="checkbox"> 地图标签</label>
            <label v-for="(label,type) in categories" :key="type"><input v-model="layers" type="checkbox" :value="type"> {{ label }}</label>
          </div></details>
          <div class="quick-links">
            <button @click="paperAction(()=>show('route'))">路径规划</button>
            <button @click="paperAction(()=>show('tour'))">主题导览</button>
            <button @click="paperAction(()=>show('itinerary'))">行程优化</button>
            <button @click="paperAction(()=>show('agent'))">校园 Agent</button>
            <button @click="paperAction(openSpace)">今日行程</button>
            <button @click="paperAction(beginFeedback)">地图纠错</button>
          </div>
        </div>
      </template>
      <div v-else-if="paperPanel==='menu'" class="paper-link-list">
        <div class="site-menu-group">
          <RouterLink to="/" @click="paperPanel=''">首页</RouterLink>
          <RouterLink :to="{path:'/',hash:'#places'}" @click="paperPanel=''">校园地点</RouterLink>
          <RouterLink :to="{path:'/',hash:'#guide'}" @click="paperPanel=''">使用指南</RouterLink>
        </div>
        <div class="site-menu-group">
          <RouterLink to="/campus" @click="paperPanel=''">三维地图</RouterLink>
          <button v-if="isCampus" @click="paperAction(()=>paperPanel='places')">搜索地图地点</button>
        </div>
        <button @click="paperAction(openSpace)">个人空间</button>
        <button v-if="store.session.admin" @click="paperAction(()=>router.push('/admin'))">管理后台</button>
      </div>
      <div v-else-if="paperPanel==='guide'" class="paper-guide">
        <dl>
          <div><dt>观察校园</dt><dd>拖动旋转视角，滚轮或双指缩放。点击建筑或标签查看详情。</dd></div>
          <div><dt>步行漫游</dt><dd>选择「开始漫游」，用 WASD 或方向键移动，拖动改变视线。触屏可使用屏幕方向键。</dd></div>
          <div><dt>查找与导航</dt><dd>从「校园地点」搜索，或打开路径规划选择起点、终点和途经点。</dd></div>
        </dl>
      </div>
      <template v-else>
        <div class="paper-link-list">
          <button @click="paperAction(()=>environmentOpen=true)">校园环境</button>
          <button :disabled="!scene" @click="paperAction(()=>roadInspectorOpen=true)">路网检查</button>
          <button :disabled="!mapReady" @click="paperAction(()=>mapView?.toggleMetrics())">渲染指标</button>
          <button :disabled="!scene" @click="paperAction(()=>calibrationOpen=true)">地图校准</button>
        </div>
        <dl class="paper-status">
          <div><dt>地图版本</dt><dd>{{ store.snapshot?.revision ? 'v'+store.snapshot.revision : '读取中' }}</dd></div>
          <div><dt>校园时间</dt><dd>{{ campusDateLabel(environment.displayed.value) }}</dd></div>
          <div><dt>天气</dt><dd>{{ weatherReport }}</dd></div>
          <div v-if="environment.preview.value || environment.report.value?.source?.startsWith('测试')"><dt>环境模式</dt><dd>测试预览</dd></div>
        </dl>
      </template>
    </PaperDialog>

    <CampusHome v-if="isHome" @space="openSpace" />
    <main v-else-if="isCampus" class="workspace paper-workspace">
      <section class="map-shell" aria-label="三维校园">
        <MapScene v-if="scene" ref="mapView" :scene="scene" :selected="store.selected" :layers="layers" :environment="environment.state.value"
          :labels="labels" :route="store.route" :simulation="store.simulation" :focus="focus" :pick="picking"
          :input-blocked="!!paperPanel || loginOpen || roadInspectorOpen || calibrationOpen || environmentOpen"
          @select="select" @position="setPosition" @progress="progress=$event" @finish="store.simulation='finished'"
          @walking="walkingNow=$event" @ready="onMapReady" @tools="paperPanel='tools'" />
        <div v-else class="map-load"><strong>{{ store.failure || '正在读取校园资料…' }}</strong>
          <button v-if="store.failure" @click="store.loadScene()">重试</button><progress v-else aria-label="读取中"></progress>
        </div>
        <div class="paper-intro campus-map-actions" :class="{ 'paper-intro-walking': walkingNow }">
          <h1 class="site-visually-hidden">三维校园</h1>
          <div class="paper-actions" aria-label="漫游入口">
            <PaperAction icon="walk" :active="walkingNow" :disabled="!mapReady" @click="mapView?.toggleWalk()">
              {{ walkingNow ? '退出漫游' : '开始漫游' }}
            </PaperAction>
            <PaperAction v-if="!walkingNow" icon="place" aria-haspopup="dialog" @click="paperPanel='places'">校园地点</PaperAction>
            <PaperAction v-if="!walkingNow" icon="guide" aria-haspopup="dialog" @click="paperPanel='guide'">使用指南</PaperAction>
          </div>
        </div>
        <div class="map-key"><span></span> 校园局部坐标 · 步行距离为估算</div>

        <aside v-if="panel || (selected && detail)" class="context" aria-label="地图侧栏" @keydown.esc.stop="panel='';detail=false;picking=false">
          <button class="close" aria-label="关闭侧栏" @click="panel='';detail=false;picking=false">×</button>
          <template v-if="panel==='route'">
            <span class="eyebrow">步行导航</span><h2>规划路线</h2>
            <form class="stack" @submit.prevent="plan">
              <label>起点<select v-model="routeForm.start" required><option value="" disabled>请选择</option>
                <option v-for="p in store.places" :key="p.id" :value="p.id">{{ p.name }}</option></select></label>
              <div v-for="(_,i) in routeForm.via" :key="i" class="via-row">
                <label>途经点 {{ i+1 }}<select v-model="routeForm.via[i]" required><option value="" disabled>请选择</option>
                  <option v-for="p in store.places" :key="p.id" :value="p.id">{{ p.name }}</option></select></label>
                <button type="button" :aria-label="'删除途经点 '+(i+1)" @click="routeForm.via.splice(i,1)">×</button>
              </div>
              <label>终点<select v-model="routeForm.end" required><option value="" disabled>请选择</option>
                <option v-for="p in store.places" :key="p.id" :value="p.id">{{ p.name }}</option></select></label>
              <label class="check"><input v-model="routeForm.avoidStairs" type="checkbox"> 排除含台阶路段</label>
              <div class="actions"><button type="button" :disabled="routeForm.via.length>=12" @click="routeForm.via.push('')">添加途经点</button>
                <button class="primary" :disabled="planning">{{ planning?'规划中…':'计算路线' }}</button></div>
              <p v-if="planError" role="alert" class="error">{{ planError }}</p>
            </form>
            <AlgorithmStats :result="comparison"/>
            <form v-if="store.route" class="stack route-save" @submit.prevent="saveRoute">
              <label>路线名称<input v-model="routeName" maxlength="80" placeholder="可选，默认使用起终点"></label>
              <button>保存到个人空间</button>
            </form>
          </template>
          <ItineraryPlanner v-else-if="panel==='itinerary'" :initial="itineraryInitial" @login="requireUser"
            @result="store.route=$event" @invalidate="invalidateRoute"/>
          <AgentPanel v-else-if="panel==='agent'" :initial="agentInitial" :perform="agentAction" :show-plan="displayTimedPlan"
            :show-route="displayAgentRoute" :ask-login="requireUser"/>
          <template v-else-if="panel==='tour'">
            <span class="eyebrow">主题导览</span><h2>{{ tour?.name || '暂无导览' }}</h2>
            <template v-if="tour">
              <label v-if="tours.length>1">导览主题<select v-model="tourId"><option value="">默认主题</option>
                <option v-for="t in tours" :key="t.id" :value="t.id">{{ t.name }}</option></select></label>
              <p>{{ tour.description }}</p>
              <progress :value="completed" :max="tour.stops.length"></progress>
              <p class="muted">{{ completed }} / {{ tour.stops.length }} 站已完成 · 手动确认</p>
              <ol class="tour-stops"><li v-for="(stop,i) in tour.stops" :key="i">
                <b>{{ placeName(stop.place) }}</b><p>{{ stop.note }}</p><div class="actions">
                  <button @click="destination(stop.place)">导航</button>
                  <button v-if="i===completed" class="primary" @click="finishStation(i)">确认完成</button>
                  <span v-else class="muted">{{ i<completed?'已完成':'依序完成' }}</span>
                </div>
              </li></ol>
            </template>
          </template>
          <template v-else-if="panel==='feedback'">
            <span class="eyebrow">地图维护</span><h2>提交纠错</h2>
            <form class="stack" @submit.prevent="submitFeedback">
              <label>对象类型<select v-model="feedback.type" @change="feedback.target='';picking=false">
                <option value="place">建筑或服务地点</option><option value="road">道路</option><option value="position">地图位置</option></select></label>
              <label v-if="feedback.type==='place'">地点<select v-model="feedback.target" required>
                <option v-for="p in store.places" :key="p.id" :value="p.id">{{ p.name }}</option></select></label>
              <label v-if="feedback.type==='road'">道路<select v-model="feedback.target" required>
                <option v-for="e in scene?.edges" :key="e.id" :value="e.id">{{ roadName(e) }}</option></select></label>
              <button v-if="feedback.type==='position'" type="button" @click="picking=!picking">
                {{ picking?'请点击地图地面': feedback.x===undefined?'在地图选点':'已选位置，重新定位' }}</button>
              <label>问题说明<textarea v-model.trim="feedback.description" required maxlength="1000" rows="4" placeholder="请说明哪里需要调整"></textarea></label>
              <button class="primary">提交反馈</button>
            </form>
          </template>
          <template v-else-if="selected">
            <span class="eyebrow">{{ categories[selected.type] }} · 南湖校区</span><h2>{{ selected.name }}</h2>
            <img v-if="selected.photo" class="place-photo" :key="selected.photo" :src="selected.photo" :alt="selected.name+'参考照片'" referrerpolicy="no-referrer" @error="$event.target.hidden=true">
            <div class="detail-location"><span class="location-pin">⌖</span><span>{{ selected.parent ? placeName(selected.parent)+' · 附属入口' : '华中师范大学南湖校区' }}</span></div>
            <p>{{ selected.description }}</p>
            <dl class="services"><dt>服务信息</dt><dd>{{ selected.service }}</dd><dt>更新说明</dt><dd>{{ selected.updated }}</dd></dl>
            <div class="detail-actions">
              <button class="primary" @click="destination(selected.id)">导航到这里</button>
              <button @click="toggleFavorite">{{ favorite?'取消收藏':'收藏地点' }}</button>
              <button @click="scheduleAt(selected.id)">添加到行程</button>
            </div>
          </template>
        </aside>

        <div v-if="store.route" class="route-strip" aria-label="步行路线结果">
          <div><span class="eyebrow">估算步行</span><strong>{{ store.route.meters }} m · {{ routeTime }}</strong>
            <small>{{ store.route.points.length===1?'起终点为同一入口':'按 1.25 m/s 计算，动画已加速' }}</small></div>
          <progress :value="progress" max="1" aria-label="模拟导航进度"></progress>
          <div class="actions"><button class="primary" @click="simulate()">{{ {idle:'模拟导航',running:'暂停',paused:'继续',finished:'再次模拟'}[store.simulation] || '模拟导航' }}</button>
            <button v-if="store.simulation!=='idle'" @click="simulate(true)">重新开始</button></div>
        </div>
      </section>
    </main>

    <PersonalSpace v-else-if="page.path==='/space' && store.session.signedIn" :key="store.session.username"
      @locate="locate" @navigate="destination" @route="loadSavedRoute" @itinerary="openItinerary"/>
    <Admin v-else-if="page.path==='/admin' && store.session.admin" :road-name="roadName" />
    <main v-else class="unauthorized"><h1>{{ store.session.signedIn ? '权限不足' : '登录后继续' }}</h1>
      <button v-if="!store.session.signedIn" class="primary" @click="requireUser">登录</button>
      <button v-else @click="router.push('/campus')">返回地图</button></main>

    <PaperDialog v-if="loginOpen" :title="registering ? '注册账号' : '登录账号'" @close="loginOpen=false">
        <form class="stack" @submit.prevent="submitAuth">
          <label>账号<input v-model.trim="auth.username" autocomplete="username" autofocus minlength="3" maxlength="32" required></label>
          <label>密码<input v-model="auth.password" type="password" :autocomplete="registering?'new-password':'current-password'" minlength="8" required></label>
          <p v-if="authError" class="error" role="alert">{{ authError }}</p>
          <button class="primary" :disabled="authBusy">{{ registering?'注册并登录':'登录' }}</button>
          <button type="button" @click="registering=!registering;authError=''">{{ registering?'已有账号，去登录':'注册新账号' }}</button>
        </form>
    </PaperDialog>
    <div v-if="store.message" class="toast" role="status">{{ store.message }}<button aria-label="关闭消息" @click="store.notify('')">×</button></div>
    <RoadInspector v-if="roadInspectorOpen && scene" :scene="scene" :route="store.route" :revision="store.snapshot.revision" @close="roadInspectorOpen=false"/><Calibration v-if="calibrationOpen && store.snapshot" :snapshot="store.snapshot" @close="calibrationOpen=false"/>
    <EnvironmentPanel v-if="environmentOpen" :env="environment" @close="environmentOpen=false"/>
  </div>
</template>
