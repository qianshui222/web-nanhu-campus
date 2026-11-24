const assert=require('node:assert/strict')
const {request}=require('playwright')
const origin=process.env.NANHU_TEST_URL||'http://127.0.0.1:8080'
const stamp=Date.now().toString(36)
const creds={username:'verify_'+stamp,password:'VerifyNanhu21!'}
const route={start:'d15',end:'gate',via:[],avoidStairs:false}
const log=text=>console.log('PASS',text)
async function call(context,method,path,data,status=200){
 const headers={}
 if(method!=='GET'){
  const token=await (await context.get('/api/csrf')).json()
  headers[token.header]=token.token
 }
 const response=await context.fetch('/api'+path,{method,data,headers})
 const text=await response.text()
 assert.equal(response.status(),status, method+' '+path+' '+text.slice(0,350))
 return text?JSON.parse(text):null
}
;(async()=>{
 const guest=await request.newContext({baseURL:origin}), student=await request.newContext({baseURL:origin})
 const other=await request.newContext({baseURL:origin}), admin=await request.newContext({baseURL:origin})
 const contexts=[guest,student,other,admin]
 let original, dirty=false
 try{
  const get=(c,p,s)=>call(c,'GET',p,undefined,s)
  const post=(c,p,d,s)=>call(c,'POST',p,d,s)
  original=await get(guest,'/scene')
  const {scene}=original, nodes=new Map(scene.nodes.map(n=>[n.id,n])), edges=new Map(scene.edges.map(e=>[e.id,e]))
  const places=new Map(scene.places.map(p=>[p.id,p]))
  const zero=await post(guest,'/route',{...route,end:route.start})
  assert.equal(zero.meters,0)
  assert.deepEqual(zero.points.map(p=>p.id),[places.get(route.start).entry])
  const normal=await post(guest,'/route',route)
  assert(normal.meters>0)
  assert.equal(normal.points[0].id,places.get(route.start).entry)
  assert.equal(normal.points.at(-1).id,places.get(route.end).entry)
  assert(normal.edges.includes('P--M'))
  const via=await post(guest,'/route',{...route,via:['complex','library']})
  const ids=via.points.map(p=>p.id)
  assert(ids.indexOf('complex-in')>0 && ids.indexOf('complex-in')<ids.indexOf('library-in'))
  for (const result of [normal,via]){
   let distance=0
   result.edges.forEach((id,i)=>{
    const e=edges.get(id),a=result.points[i],b=result.points[i+1]
    assert(e?.open)
    assert([a.id,b.id].includes(e.a) && [a.id,b.id].includes(e.b))
    assert.deepEqual(a,nodes.get(a.id)); assert.deepEqual(b,nodes.get(b.id))
    const shape=e.geometry ?? [a,b]
    distance+=shape.slice(1).reduce((sum,p,j)=>sum+Math.hypot(p.x-shape[j].x,p.z-shape[j].z),0)
   })
   assert.equal(result.meters,Math.round(distance*(scene.calibration?.metersPerUnit || 1)*10)/10)
  }
  const avoid=await post(guest,'/route',{...route,avoidStairs:true})
  assert(avoid.edges.every(id=>!edges.get(id).stairs))
  assert(avoid.meters>normal.meters)
  log('same entry, ordinary route, two ordered waypoints, entry/path continuity, distance and avoidance')
  await post(student,'/register',creds)
  await post(student,'/login',creds)
  assert.equal((await get(student,'/session')).username,creds.username)
  await post(other,'/login',{username:'student',password:'NanhuStudent21'})
  await post(admin,'/login',{username:'admin',password:'NanhuAdmin21'})
  await get(student,'/admin/feedback',403)
  await call(student,'PUT','/admin/scene',original,403)
  const noCsrf=await guest.post('/api/route',{data:route})
  assert.equal(noCsrf.status(),403)
  await get(guest,'/me/favorite',401)
  log('register, sign in, guest restrictions, Spring Security admin policy and CSRF')
  const favorite=await post(student,'/me/favorite',{place:'complex'})
  const saved=await post(student,'/me/route',{...route,name:'验收路线'})
  const sched={name:'验收课程',date:'2030-04-16',day:0,start:'08:00',end:'09:00',place:'complex'}
  const item=await post(student,'/me/schedule',sched)
  const conflict=await post(student,'/me/schedule',{...sched,start:'08:30',end:'09:30'},409)
  assert(conflict.message.includes('重叠'))
  const changed=await call(student,'PUT','/me/schedule/'+item.id,{...sched,name:'更新课程'})
  assert.equal(changed.data.name,'更新课程')
  const tour=scene.tours[0].id
  await post(student,'/me/progress',{tour,index:1},409)
  await post(student,'/me/progress',{tour,index:0})
  const issue=await post(student,'/me/feedback',{type:'position',x:18,z:40,description:'验收模拟反馈'})
  assert.equal(issue.data.status,'pending')
  for(const [kind,row] of [['favorite',favorite],['route',saved],['schedule',item],['feedback',issue]]){
   assert(!(await get(other,'/me/'+kind)).some(i=>i.id===row.id))
  }
  await call(other,'PUT','/me/schedule/'+item.id,sched,404)
  await call(other,'DELETE','/me/route/'+saved.id,undefined,404)
  const all=await get(admin,'/admin/feedback')
  assert(all.some(i=>i.id===issue.id && i.owner===creds.username))
  const url='/admin/feedback/'+creds.username+'/'+issue.id
  await call(admin,'PUT',url,{status:'working',reply:'正在核对'})
  assert((await get(student,'/me/feedback')).some(i=>i.id===issue.id&&i.data.status==='working'))
  await call(admin,'PUT',url,{status:'resolved',reply:'已完成核对'})
  assert((await get(student,'/me/feedback')).some(i=>i.id===issue.id&&i.data.reply==='已完成核对'))
  await post(student,'/logout',undefined,204)
  assert.equal((await get(student,'/session')).signedIn,false)
  await get(student,'/me/schedule',401)
  await post(student,'/login',creds)
  for(const [kind,id] of [['favorite',favorite.id],['route',saved.id],['schedule',item.id],['progress',tour]]) {
   assert((await get(student,'/me/'+kind)).some(i=>i.id===id))
  }
  log('private isolation, persistent records across logout, schedule overlap/edit, ordered progress and feedback lifecycle')
  const altered=structuredClone(original)
  altered.scene.places.find(p=>p.id==='complex').h+=2
  altered.scene.edges.find(e=>e.id==='P--M').open=false
  const closed=await call(admin,'PUT','/admin/scene',altered)
  dirty=true
  const changedSnapshot=await get(guest,'/scene')
  assert.equal(changedSnapshot.scene.places[0].h,original.scene.places[0].h+2)
  const detour=await post(guest,'/route',route)
  assert(!detour.edges.includes('P--M') && detour.meters>normal.meters)
  await call(admin,'PUT','/admin/scene',original,409)
  const invalid=structuredClone(closed)
  invalid.scene.edges[0].a='nonexistent'
  await call(admin,'PUT','/admin/scene',invalid,400)
  assert.deepEqual(await get(guest,'/scene'),closed)
  const crossing=structuredClone(closed)
  crossing.scene.places[0].z=-15
  await call(admin,'PUT','/admin/scene',crossing,400)
  const disconnected=structuredClone(closed)
  for(const e of disconnected.scene.edges) if(e.a==='gate-in'||e.b==='gate-in') e.open=false
  const isolated=await call(admin,'PUT','/admin/scene',disconnected)
  const unavailable=await post(guest,'/route',route,422)
  assert(unavailable.message.includes('不可达'))
  const restored=await call(admin,'PUT','/admin/scene',{...original,revision:isolated.revision})
  assert.deepEqual(restored.scene,original.scene)
  dirty=false
  assert.deepEqual(await post(guest,'/route',route),normal)
  await call(student,'DELETE','/me/schedule/'+item.id,undefined,204)
  log('revision lock, building update, closed-road detour, isolation, invalid import rollback, scene restore and schedule deletion')
  console.log('VERIFIED',origin)
 }finally{
  if(dirty){
   const current=await call(guest,'GET','/scene')
   await call(admin,'PUT','/admin/scene',{...original,revision:current.revision})
  }
  await Promise.all(contexts.map(c=>c.dispose()))
 }
})().catch(error=>{console.error(error);process.exitCode=1})
