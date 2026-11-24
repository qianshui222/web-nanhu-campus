<script setup>
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import * as T from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { buildLandscape } from './landscape.js'
import { makeModels } from './models.js'
import { overWater } from './terrain.js'
import { atmosphere } from './atmosphere.js'
import { campusAssets } from './campusAssets.js'
import { theme, qualityProfiles } from './campusTheme.js'
import { campusShadows } from './campusLighting.js'
import { overviewFrame } from './campusCamera.js'
import { createPoi } from './campusPoi.js'
import { overviewPost } from './campusPost.js'
import { roadPoints, roadSurface, routePoints, svgPoints } from './roads.js'

const props = defineProps({ scene: Object, selected: String, layers: Array, labels: Boolean,
  route: Object, simulation: String, focus: Number, pick: Boolean, environment: Object, inputBlocked: Boolean })
const emit = defineEmits(['select','position','progress','finish','walking','ready','tools'])
const host = ref(null)
const tagHost = ref(null)
const ready = ref(false), failure = ref(''), walking = ref(false), hover = ref('')
const north = ref('')
const quality=ref('balanced'), minimapOpen=ref(!matchMedia('(max-width: 700px)').matches)
const frameMode=ref('overview')
const comparison=new URLSearchParams(location.search).get('frame')==='baseline'
const audit=new URLSearchParams(location.search).has('scene-audit')
const auditRows=ref([]), assetRoles=ref('')
const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)')
let shadows, poi, landscape, post, reflection, nearLabels=false, lastHoverAt=0
const showMetrics=ref(false), metrics=ref(null)
const altitude=ref(null), bearing=ref(null)
const buildingIds=ref([]), glbIds=ref([]), glbErrors=ref([])
const glbTotal=computed(()=>props.scene.places.filter(p=>p.h>0&&p.asset).length)
const visiblePlaces = computed(() => props.scene.places.filter(p => props.layers.includes(p.type)))
const labelPlaces = computed(() => {
  const order=['complex','library','canteen','gate','east','west','track','hall','court']
  const priority = p=>p.id===props.selected ? -2 : order.includes(p.id) ? order.indexOf(p.id) : order.length
  return [...visiblePlaces.value].sort((a,b)=>priority(a)-priority(b))
})
const nodeMap = computed(() => Object.fromEntries(props.scene.nodes.map(n => [n.id,n])))
const cameraMark = ref({x:0,z:0})
const routeSvg = computed(() => svgPoints(routePoints(props.route)))
let renderer, threeScene, camera, controls, world, sky, overlay, roadLine, pin, pointer, observer, frame, timer
let air, fill, models, assets, assetRequests
let selectionRing, hoveredLabel, draggedAt, transition, walkYaw = 0, walkPitch = 0
let last = 0, sampleAt = 0, elapsed = 0, total = 0, sections = []
let statsStart=0, frames=0
let buildings = new Map()
let batchedLayers = new Map()
const keys = new Set()
const ray = new T.Raycaster(), ground = new T.Plane(new T.Vector3(0,1,0),0)
const home = new T.Vector3(254,209,275), center = new T.Vector3(3,0,-5)
const walkingKeys = { up:'KeyW', down:'KeyS', left:'KeyA', right:'KeyD' }

function dispose(group) {
  if (!group) return
  const materials = new Set(), geometries = new Set()
  group.traverse(obj=>{
    if (obj.geometry) geometries.add(obj.geometry)
    if (Array.isArray(obj.material)) obj.material.forEach(material=>materials.add(material))
    else if (obj.material) materials.add(obj.material)
    if (obj.isInstancedMesh) obj.dispose()
  })
  geometries.forEach(geometry=>geometry.dispose())
  const textures=new Set([...materials].flatMap(material=>material.userData.ownedTextures??[]))
  textures.forEach(texture=>texture.dispose())
  materials.forEach(material=>material.dispose())
  group.removeFromParent()
}

function build() {
  if (!threeScene) return
  assetRequests?.abort()
  const request = new AbortController()
  assetRequests = request
  dispose(world)
  world = new T.Group()
  threeScene.add(world)
  models = makeModels(world)
  assets = campusAssets(reflection?.texture)
  batchedLayers = new Map()
  landscape=buildLandscape(world,models,props.scene)
  poi=createPoi(world,props.scene.places)
  auditRows.value=[]
  glbIds.value=[]
  glbErrors.value=[]
  buildingIds.value=[]
  const pending=[]
  const pool=assets
  const activeWorld=world
  buildings = new Map(props.scene.places.map(p => {
    if(!p.asset || !p.h) {
      const group=models.build(p)
      if(p.h)buildingIds.value.push(p.id)
      return [p.id,group]
    }
    const group=new T.Group()
    group.userData.place=p.id
    group.position.set(p.x,0,p.z)
    group.rotation.y=T.MathUtils.degToRad(p.angle)
    world.add(group)
    pending.push(pool.load(p,group,request.signal).then(loaded=>{
      if(!loaded || request.signal.aborted)return
      poi.actualAnchor(p.id,group)
      if(audit){
        group.updateWorldMatrix(true,true)
        const bounds=new T.Box3().setFromObject(group)
        auditRows.value.push({id:p.id,matrix:group.matrixWorld.toArray(),min:bounds.min.toArray(),max:bounds.max.toArray()})
      }
      glbIds.value.push(p.id)
      buildingIds.value.push(p.id)
      renderer.shadowMap.needsUpdate=true
    }).catch(error=>{
      if(!request.signal.aborted)glbErrors.value.push(p.id+' · '+error.message)
    }))
    return [p.id,group]
  }))
  Promise.all(pending).then(()=>{
    if(request.signal.aborted)return
    batchedLayers=pool.batch(activeWorld)
    assetRoles.value=[...pool.unmatched].join(',')
    applyLayers()
  })
  renderer.shadowMap.needsUpdate = true
  applyLayers()
}

function applyLayers() {
  const visible = new Set(visiblePlaces.value.map(p=>p.id))
  poi?.setLayers(visible)
  buildings.forEach((mesh,id)=>{ mesh.visible = visible.has(id) })
  batchedLayers.forEach((group,type)=>{group.visible=props.layers.includes(type)})
  if (renderer) renderer.shadowMap.needsUpdate = true
  ring()
}

function ring() {
  if (!selectionRing) return
  const p=props.scene.places.find(p=>p.id===props.selected && props.layers.includes(p.type))
  selectionRing.visible = Boolean(p)
  if (!p) return
  selectionRing.position.set(p.x,.25,p.z)
  selectionRing.rotation.y = T.MathUtils.degToRad(p.angle)
  selectionRing.children.forEach((m,i)=>{
    const long = i<2, w=Math.max(p.w,4)+2, d=Math.max(p.d,4)+2
    m.position.set(long ? 0 : w/2*(i===2 ? 1 : -1),0,long ? d/2*(i===0 ? 1 : -1) : 0)
    m.scale.set(long ? w+.6 : .7,.12,long ? .7 : d+.6)
  })
}

function viewFov(mode,aspect) {
  if(comparison)return aspect < 1 ? T.MathUtils.clamp(44/aspect,43,76) : 43
  return mode==='walk'?55:mode==='focus'?(aspect<.85?48:36):aspect<.85?Math.min(68,36/aspect):34
}
function setProjection(mode){
  frameMode.value=mode
  camera.fov=viewFov(mode,camera.aspect)
  camera.updateProjectionMatrix()
}
function startFrame(overhead=false){
  if(comparison)return {target:center,position:overhead?new T.Vector3(center.x,420,center.z+.02):home}
  const shot=overviewFrame(props.scene,camera.aspect,camera.fov,overhead)
  controls.maxDistance=Math.max(650,shot.position.distanceTo(shot.target)*1.45)
  return shot
}
function reset() {
  if (!camera) return
  if (walking.value) toggleWalk()
  setProjection('overview')
  const {position,target}=startFrame()
  animateTo(position,target)
}
function animateTo(position,target) {
  const damping=controls.enableDamping
  controls.enableDamping=false
  controls.update()
  controls.enableDamping=damping
  if(reducedMotion.matches){
    camera.position.copy(position)
    controls.target.copy(target)
    camera.lookAt(controls.target)
    return
  }
  transition = { from: camera.position.clone(), to: position.clone(), fromTarget: controls.target.clone(),
    toTarget: target.clone(), start: performance.now() }
}
function overhead() {
  if (!camera) return
  if (walking.value) toggleWalk()
  setProjection('overhead')
  const {position,target}=startFrame(true)
  animateTo(position,target)
}
function focus() {
  const p = props.scene.places.find(x=>x.id===props.selected)
  if (!p || !camera) return
  if (walking.value) toggleWalk()
  setProjection('focus')
  const target = new T.Vector3(p.x,p.h*.24,p.z)
  const scale = Math.max(54, Math.min(136, Math.max(p.w,p.d)*1.5))*(comparison?1:Math.max(1.06,.93/camera.aspect))
  animateTo(target.clone().add(new T.Vector3(scale*.65,scale*.55,scale*.80)),target)
}
function centered(node) {
  if (!camera || walking.value) return
  setProjection('focus')
  const target = new T.Vector3(node.x,0,node.z)
  animateTo(camera.position.clone().add(target.clone().sub(controls.target)),target)
}
function toggleWalk() {
  if (!camera) return
  transition = null
  keys.clear()
  walking.value = !walking.value
  controls.enabled = !walking.value
  if (walking.value) {
    setProjection('walk')
    const p = props.scene.places.find(p=>p.id===props.selected)
    const entry = nodeMap.value[p?.entry] || props.scene.nodes.find(n=>n.id==='gate-in') || props.scene.nodes[0]
    if (!entry) { walking.value = false; controls.enabled = true; return }
    const facade=p?.asset?.facade
    const heading={south:0,north:Math.PI,east:Math.PI/2,west:-Math.PI/2}
    const access=facade && props.scene.edges.find(e=>e.open && e.walkable!==false &&
      [e.a,e.b].includes(entry.id) && roadPoints(e,nodeMap.value).length===2)
    const approach=access ? nodeMap.value[access.a===entry.id?access.b:access.a] : null
    const spawn=approach && Math.hypot(approach.x-entry.x,approach.z-entry.z)<=12 ? approach : entry
    camera.position.set(spawn.x,1.72,spawn.z)
    walkYaw = spawn!==entry ? Math.atan2(spawn.x-entry.x,spawn.z-entry.z)
      : facade ? T.MathUtils.degToRad(p.angle)+heading[facade]
      : p?.h ? Math.atan2(entry.x-p.x,entry.z-p.z) : Math.PI
    walkPitch = -0.018
    orient()
  } else {
    setProjection('overview')
    const {position,target}=startFrame()
    camera.position.copy(position)
    controls.target.copy(target)
    controls.update()
  }
}
function orient() {
  camera.rotation.order = 'YXZ'
  camera.rotation.set(walkPitch, walkYaw,0)
}
function blocked(x,z) {
  if (Math.abs(x)>167 || Math.abs(z+4)>151) return true
  if (props.scene.boundary?.length && !overWater(props.scene.boundary,x,z)) return true
  if (overWater(props.scene.water,x,z)) return true
  return props.scene.places.some(p=>{
    if (!p.h) return false
    const a=T.MathUtils.degToRad(p.angle), dx=x-p.x, dz=z-p.z
    return Math.abs(Math.cos(a)*dx-Math.sin(a)*dz)<p.w/2+.42 &&
      Math.abs(Math.sin(a)*dx+Math.cos(a)*dz)<p.d/2+.42
  })
}
function walk(dt) {
  let forward = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'))
  let side = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'))
  const scale = dt*7/(Math.hypot(forward,side)||1)
  forward*=scale
  side*=scale
  const dx = -Math.sin(walkYaw)*forward + Math.cos(walkYaw)*side
  const dz = -Math.cos(walkYaw)*forward - Math.sin(walkYaw)*side
  if (!blocked(camera.position.x+dx,camera.position.z)) camera.position.x+=dx
  if (!blocked(camera.position.x,camera.position.z+dz)) camera.position.z+=dz
}
function onKey(event, down) {
  if (props.inputBlocked || !walking.value || ['INPUT','SELECT','TEXTAREA'].includes(event.target.tagName)) return
  if (!['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.code)) return
  event.preventDefault()
  if (down) keys.add(event.code)
  else keys.delete(event.code)
}
const keyDown = e => onKey(e,true)
const keyUp = e => onKey(e,false)
const blur = () => keys.clear()
function pointerDown(e) {
  if (e.button!==0) return
  draggedAt = { x:e.clientX,y:e.clientY, px:e.clientX, py:e.clientY }
  if (walking.value) e.currentTarget.setPointerCapture(e.pointerId)
}
function cast(e) {
  const r=renderer.domElement.getBoundingClientRect()
  pointer.set((e.clientX-r.left)/r.width*2-1, -(e.clientY-r.top)/r.height*2+1)
  ray.setFromCamera(pointer,camera)
}
function hit(e) {
  cast(e)
  return poi?.pick(pointer,camera)??''
}
function move(e) {
  if (draggedAt && walking.value) {
    walkYaw -= (e.clientX-draggedAt.px)*.004
    walkPitch = T.MathUtils.clamp(walkPitch-(e.clientY-draggedAt.py)*.004,-1.1,1.1)
    draggedAt.px=e.clientX
    draggedAt.py=e.clientY
    orient()
    return
  }
  if (draggedAt || walking.value || e.pointerType==='touch') return
  if (hoveredLabel || performance.now()-lastHoverAt<48) return
  lastHoverAt=performance.now()
  hover.value = hit(e)
}
function release(e) {
  const start = draggedAt
  draggedAt = null
  if (!start || Math.hypot(start.x-e.clientX,start.y-e.clientY)>5) return
  if (props.pick) {
    cast(e)
    const point = ray.ray.intersectPlane(ground, new T.Vector3())
    if (point && Math.abs(point.x)<=175 && Math.abs(point.z)<=175) emit('position',{ x:Math.round(point.x),z:Math.round(point.z) })
    return
  }
  const id = hit(e)
  if (id) emit('select',id)
}
function rebuildRoute() {
  dispose(roadLine)
  roadLine = new T.Group()
  overlay.add(roadLine)
  elapsed=0
  total=0
  sections=[]
  const points=routePoints(props.route)
  pin.visible=points.length>0
  if (!points.length) return
  const geometry = new T.CylinderGeometry(.54,.54,.055,10)
  const markerMaterial = new T.MeshBasicMaterial({color:'#f4c36c'})
  for (let i=0;i<points.length;i++) {
    const n=points[i]
    const joint = new T.Mesh(geometry,markerMaterial)
    joint.position.set(n.x,roadSurface+.036,n.z)
    roadLine.add(joint)
    if (!i) continue
    const a=points[i-1]
    const distance=Math.hypot(n.x-a.x,n.z-a.z)
    const segment = new T.Mesh(new T.BoxGeometry(1.08,.052,distance),markerMaterial)
    segment.position.set((a.x+n.x)/2,roadSurface+.036,(a.z+n.z)/2)
    segment.rotation.y=Math.atan2(n.x-a.x,n.z-a.z)
    roadLine.add(segment)
    sections.push({a,b:n,start:total,distance})
    total+=distance
  }
  updatePin()
}
function updatePin() {
  const points=routePoints(props.route)
  if (!points?.length) return
  const section=sections.find(s=>elapsed<=s.start+s.distance)
  if (section) {
    const t=(elapsed-section.start)/section.distance
    pin.position.set(T.MathUtils.lerp(section.a.x,section.b.x,t),1.47,T.MathUtils.lerp(section.a.z,section.b.z,t))
  } else pin.position.set(points.at(-1).x,1.47,points.at(-1).z)
}
function updateLabels(distance) {
  if (!tagHost.value || !poi) return
  nearLabels=nearLabels?distance<181:distance<155
  const end=props.route?.points?.at(-1)?.id
  const route=end?props.scene.places.find(p=>p.entry===end)?.id:null
  poi.layout(host.value,tagHost.value,camera,{selected:props.selected,hover:hover.value,route,near:nearLabels})
}
function renderCampus(now,dt){
  renderer.info.reset()
  const profile=qualityProfiles[quality.value]
  const distance=camera.position.distanceTo(controls.target)
  const plantSwap=landscape?.updatePlants(walking.value?0:distance)
  const shadowMoved=shadows(frameMode.value,camera.position,controls.target,props.environment?.sun,profile,props.scene)
  if(plantSwap||shadowMoved)renderer.shadowMap.needsUpdate=true
  const glow=air.tick(props.environment,dt,camera,renderer,sky,fill,models,walking.value?0:distance)
  assets?.update(camera,glow)
  landscape?.updateWater?.(reducedMotion.matches?0:now/1000,profile.waterDetail,props.environment?.weather)
  if(frameMode.value==='overview'&&profile.blur&&!transition&&!comparison){
    if(!post){
      post=overviewPost(renderer,threeScene,camera)
      post.resize(host.value.clientWidth,host.value.clientHeight,renderer.getPixelRatio())
    }
    post.render()
  }else renderer.render(threeScene,camera)
}
function render(now) {
  frame=requestAnimationFrame(render)
  const elapsedFrame=Math.min((now-last)/1000,.15)
  const dt=Math.min(elapsedFrame,.05)
  last=now
  if (walking.value) {
    const steps=Math.max(1,Math.ceil(elapsedFrame/.04))
    for(let i=0;i<steps;i++)walk(elapsedFrame/steps)
  }
  else {
    if (transition) {
      const t=T.MathUtils.clamp((now-transition.start)/620,0,1)
      const smooth=t*t*(3-2*t)
      camera.position.lerpVectors(transition.from,transition.to,smooth)
      controls.target.lerpVectors(transition.fromTarget,transition.toTarget,smooth)
      camera.lookAt(controls.target)
      if (t===1) transition=null
    } else controls.update()
  }
  if (props.simulation==='running') {
    elapsed=Math.min(total,elapsed+dt*14)
    updatePin()
    if (elapsed>=total) { emit('progress',1); emit('finish') }
  }
  if (now-sampleAt>95) {
    sampleAt=now
    const target=walking.value ? camera.position : controls.target
    cameraMark.value={x:target.x,z:target.z}
    if(!walking.value)updateLabels(camera.position.distanceTo(controls.target))
    const angle = walking.value ? walkYaw : controls.getAzimuthalAngle()
    north.value='rotate('+angle+'rad)'
    if (props.simulation==='running') emit('progress', total ? elapsed/total : 1)
  }
  renderCampus(now,dt)
  frames++
  if(now-statsStart>=1700){
    const { render,memory }=renderer.info
    metrics.value={fps:Math.round(frames*1000/(now-statsStart)),calls:render.calls,
      triangles:render.triangles,geometries:memory.geometries,textures:memory.textures}
    altitude.value=props.environment?.sun ? Math.round(T.MathUtils.radToDeg(props.environment.sun.altitude)) : null
    bearing.value=props.environment?.sun ? Math.round(T.MathUtils.radToDeg(props.environment.sun.bearing)) : null
    statsStart=now
    frames=0
  }
}
function resize() {
  if (!renderer) return
  const {clientWidth:w,clientHeight:h}=host.value
  if (!w || !h) return
  const aspectChanged=Math.abs(camera.aspect-w/h)>.025
  camera.aspect=w/h
  camera.fov=viewFov(frameMode.value,camera.aspect)
  camera.updateProjectionMatrix()
  renderer.setSize(w,h,false)
  post?.resize(w,h,renderer.getPixelRatio())
  if(ready.value&&aspectChanged&&!comparison&&['overview','overhead'].includes(frameMode.value)){
    const shot=startFrame(frameMode.value==='overhead')
    transition=null
    camera.position.copy(shot.position)
    controls.target.copy(shot.target)
    controls.update()
  }
}
function releaseScene() {
  assetRequests?.abort()
  cancelAnimationFrame(frame)
  observer?.disconnect()
  controls?.dispose()
  air?.dispose()
  dispose(world)
  dispose(overlay)
  post?.dispose()
  post=null
  reflection?.dispose()
  reflection=null
  sky?.shadow.map?.dispose()
  renderer?.dispose()
  renderer?.domElement.removeEventListener('webglcontextlost',contextLost)
  renderer?.domElement.remove()
  renderer=null
}
function contextLost(event) {
  event.preventDefault()
  ready.value=false
  walking.value=false
  failure.value='三维渲染连接已中断，请重试。'
  releaseScene()
}
function start() {
  failure.value=''
  try {
    renderer=new T.WebGLRenderer({antialias:true,powerPreference:'high-performance'})
    renderer.domElement.addEventListener('webglcontextlost',contextLost)
    renderer.setPixelRatio(Math.min(devicePixelRatio,qualityProfiles[quality.value].dpr))
    renderer.setClearColor(theme.sky)
    renderer.info.autoReset=false
    renderer.outputColorSpace=T.SRGBColorSpace
    renderer.toneMapping=T.ACESFilmicToneMapping
    renderer.toneMappingExposure=1.08
    renderer.shadowMap.enabled=true
    renderer.shadowMap.type=T.PCFShadowMap
    renderer.shadowMap.autoUpdate=false
    host.value.prepend(renderer.domElement)
    const reflectionGenerator=new T.PMREMGenerator(renderer)
    const room=new RoomEnvironment()
    try{reflection=reflectionGenerator.fromScene(room,.10,.1,40,{size:64})}
    finally{room.dispose();reflectionGenerator.dispose()}
    threeScene=new T.Scene()
    threeScene.fog=new T.Fog(theme.sky,475,1020)
    camera=new T.PerspectiveCamera(43,1,.60,1200)
    camera.position.copy(home)
    controls=new OrbitControls(camera,renderer.domElement)
    controls.target.copy(center)
    controls.enableDamping=true
    controls.dampingFactor=.12
    controls.minDistance=35
    controls.maxDistance=650
    controls.maxPolarAngle=Math.PI*.475
    controls.addEventListener('start',()=>{transition=null})
    controls.update()
    pointer=new T.Vector2()
    fill=new T.HemisphereLight('#e5f0ef','#74846f',1.78)
    threeScene.add(fill)
    sky=new T.DirectionalLight('#ffe6c5',2.65)
    sky.position.set(-115,163,-76)
    sky.castShadow=true
    sky.shadow.mapSize.set(2048,2048)
    Object.assign(sky.shadow.camera,{left:-205,right:205,top:205,bottom:-205,near:1,far:540})
    sky.shadow.bias=-.00063
    sky.shadow.normalBias=.13
    threeScene.add(sky,sky.target)
    shadows=campusShadows(sky)
    air=atmosphere(threeScene)
    overlay=new T.Group()
    threeScene.add(overlay)
    selectionRing=new T.Group()
    const geometry=new T.BoxGeometry()
    const material=new T.MeshBasicMaterial({color:'#ffd48a'})
    for(let i=0;i<4;i++)selectionRing.add(new T.Mesh(geometry,material))
    overlay.add(selectionRing)
    pin=new T.Mesh(new T.SphereGeometry(1.75,12,8),new T.MeshBasicMaterial({color:'#ec6e48'}))
    overlay.add(pin)
    build()
    rebuildRoute()
    observer=new ResizeObserver(resize)
    observer.observe(host.value)
    resize()
    const first=startFrame()
    camera.position.copy(first.position)
    controls.target.copy(first.target)
    controls.update()
    ready.value=true
    last=performance.now()
    statsStart=last
    frames=0
    frame=requestAnimationFrame(render)
  } catch (error) {
    ready.value=false
    failure.value='三维渲染初始化失败。请检查浏览器 WebGL 后重试。'
    releaseScene()
  }
}
watch(()=>props.inputBlocked,blocked=>{if(blocked) keys.clear()})
watch(walking,value=>emit('walking',value))
watch(ready,value=>emit('ready',value))
function toggleMetrics(){showMetrics.value=!showMetrics.value}
defineExpose({reset,toggleWalk,toggleMetrics})
watch(quality,()=>{
  if(!renderer)return
  if(quality.value==='balanced'){post?.dispose();post=null}
  renderer.setPixelRatio(Math.min(devicePixelRatio,qualityProfiles[quality.value].dpr))
  resize()
})
watch(()=>props.scene,()=>{build()})
watch(()=>props.layers,applyLayers,{deep:true})
watch(()=>props.selected,ring)
watch(()=>props.focus,focus)
watch(()=>props.route,()=>{if (renderer) rebuildRoute()})
watch(()=>props.simulation,state=>{
  if (state==='restart') { elapsed=0; updatePin(); emit('progress',0) }
})
onMounted(()=>{
  timer=setTimeout(start,12)
  window.addEventListener('keydown',keyDown)
  window.addEventListener('keyup',keyUp)
  window.addEventListener('blur',blur)
})
onBeforeUnmount(()=>{
  clearTimeout(timer)
  releaseScene()
  window.removeEventListener('keydown',keyDown)
  window.removeEventListener('keyup',keyUp)
  window.removeEventListener('blur',blur)
})
</script>

<template>
  <div class="map-view" :class="{ 'is-walking': walking, 'is-picking': pick }" :data-building-ids="buildingIds.join(',')" :data-glb-count="glbIds.length" :data-glb-ids="glbIds.join(',')" :data-material-unmatched="assetRoles"
       :data-pose-audit="audit ? JSON.stringify(auditRows) : null" :data-camera-mode="frameMode">
    <div ref="host" class="three-host" @pointerdown="pointerDown" @pointermove="move" @pointerup="release"
      @pointercancel="draggedAt = null" @pointerleave="hover = ''">
      <div ref="tagHost" class="map-labels">
        <button v-for="p in (ready && !walking && labels && !pick ? labelPlaces : [])" :key="p.id"
          class="map-label" :class="[p.type, { active: p.id === selected }]" :data-place="p.id"
          @pointerdown.stop @pointerup.stop @mouseenter="hoveredLabel = p.id; hover = p.id"
          @mouseleave="hoveredLabel = ''; hover = ''" @click="emit('select',p.id)">
          <i></i>{{ p.name }}
        </button>
      </div>
      <div v-if="glbErrors.length" class="asset-warning" role="alert" @pointerdown.stop @pointerup.stop>
        <strong>部分楼体加载失败</strong>
        <ul><li v-for="issue in glbErrors" :key="issue">{{ issue }}</li></ul>
        <button @click="build">重试楼体资源</button>
      </div>
      <div v-if="!ready" class="map-load">
        <strong>{{ failure || '正在生成三维校园…' }}</strong>
        <button v-if="failure" @click="start">重试三维渲染</button>
        <progress v-else aria-label="生成中"></progress>
      </div>
    </div>
    <div v-if="ready" class="view-controls">
      <button @click="reset">复位视角</button>
      <button @click="overhead">北向俯视</button>
      <label class="quality-control"><span>画质</span><select v-model="quality" aria-label="画质">
        <option value="balanced">均衡</option><option value="detailed">精细</option>
      </select></label>
      <button aria-haspopup="dialog" @click="emit('tools')">工具</button>
    </div>
    <output v-if="showMetrics && metrics" class="render-metrics" aria-label="实时渲染指标">
      {{ metrics.fps }} FPS · {{ metrics.calls }} 绘制调用<br>
      {{ metrics.triangles.toLocaleString() }} 三角面 · {{ metrics.geometries }} 几何 · {{ metrics.textures }} 纹理
      <br>实体建筑 {{ buildingIds.length }}/{{ scene.places.filter(p=>p.h>0).length }}
      <br v-if="glbTotal">Blender 资产 {{ glbIds.length }}/{{ glbTotal }}
      <br v-if="altitude!==null"><span v-if="altitude!==null">太阳高度 {{ altitude }}° · 方位 {{ bearing }}°</span>
    </output>
    <div v-if="ready && walking" class="walk-hint">
      <span>WASD / 方向键移动 · 拖动改变视线</span>
      <div class="walk-pad">
        <button v-for="(key,direction) in walkingKeys" :key="key" :aria-label="direction"
          @pointerdown.prevent="$event.currentTarget.setPointerCapture($event.pointerId); keys.add(key)"
          @pointerup="keys.delete(key)" @pointercancel="keys.delete(key)">{{ {up:'↑',down:'↓',left:'←',right:'→'}[direction] }}</button>
      </div>
    </div>
    <div v-if="ready && hover && !walking && !pick" class="hover-hint">{{ scene.places.find(p=>p.id===hover)?.name }}</div>
    <div v-if="ready" class="minimap" :class="{ 'minimap-closed': !minimapOpen }">
      <div><button type="button" :aria-expanded="minimapOpen" @click="minimapOpen=!minimapOpen">校园小地图
        <span aria-hidden="true">{{ minimapOpen?'−':'+' }}</span></button><span class="compass" :style="{ transform: north }">↑ N</span></div>
      <svg v-show="minimapOpen" viewBox="-180 -160 360 320" aria-label="校园小地图" @click.self="reset">
        <rect x="-170" y="-151" width="340" height="302" rx="8" fill="#ccd9be"/>
        <polygon v-if="scene.boundary?.length" :points="scene.boundary.map(p=>p.x+','+p.z).join(' ')" fill="#afc2a7"/>
        <polygon v-if="scene.water?.length" :points="scene.water.map(p=>p.x+','+p.z).join(' ')" fill="#85b0aa"/>
        <polyline v-for="e in scene.edges.filter(edge=>edge.walkable!==false)" :key="e.id" fill="none"
          :points="svgPoints(roadPoints(e,nodeMap))" :stroke="e.open ? '#778d7b' : '#d28573'" stroke-width="4"
          @click="centered(nodeMap[e.a])"/>
        <polyline v-if="routeSvg" :points="routeSvg" fill="none" stroke="#c76a3d" stroke-width="5" pointer-events="none"/>
        <g v-for="p in visiblePlaces" :key="p.id" :transform="'translate('+p.x+' '+p.z+') rotate('+(-p.angle)+')'"
          role="button" :aria-label="p.name" tabindex="0" @click="emit('select',p.id)" @keydown.enter="emit('select',p.id)">
          <rect :x="-Math.max(p.w,10)/2" :y="-Math.max(p.d,10)/2" :width="Math.max(p.w,10)" :height="Math.max(p.d,10)"
            rx="2" :fill="p.id===selected ? '#e1a057' : p.color" stroke="#53735f" stroke-width="1.5"/>
        </g>
        <circle :cx="cameraMark.x" :cy="cameraMark.z" r="8" fill="none" stroke="#216b58" stroke-width="2.6" pointer-events="none"/>
      </svg>
    </div>
  </div>
</template>

<style scoped>
.asset-warning{position:absolute;z-index:4;left:16px;bottom:50px;max-width:min(340px,65%);background:#fff4db;color:#5b4128;padding:.7rem;border-radius:8px;font-size:.78rem}
.asset-warning ul{margin:.35rem 0}
</style>
