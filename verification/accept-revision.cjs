const assert=require('node:assert/strict')
const { chromium,request }=require('playwright')
const fs=require('node:fs')
const path=require('node:path')
const origin=process.env.NANHU_TEST_URL||'http://127.0.0.1:8086'
const output=process.env.NANHU_SCREENSHOTS||path.resolve(__dirname,'../docs/revision/after')
const stamp=Date.now().toString(36)
const name='整改验收 '+stamp
const user='revision_'+stamp
const secret='CampusRevision21!'
const known={start:'gate',end:'canteen',via:[],avoidStairs:false}
const stairRoute={...known,start:'d15',end:'gate'}
const log=(tag,data)=>console.log(tag,JSON.stringify(data))
async function call(ctx,method,url,body,status=200){
 const headers={}
 if(method!=='GET'){
  const csrf=await (await ctx.get('/api/csrf')).json()
  headers[csrf.header]=csrf.token
 }
 const response=await ctx.fetch('/api'+url,{method,data:body,headers})
 const raw=await response.text()
 assert.equal(response.status(),status,method+' '+url+' '+raw)
 return raw?JSON.parse(raw):null
}
async function checkApi(){
 const ctx=await request.newContext({baseURL:origin})
 try{
  const original=await call(ctx,'GET','/scene')
  const zero=await call(ctx,'POST','/route/compare',{...known,end:'gate'})
  assert.equal(zero.astar.distance,0);assert.equal(zero.dijkstra.expanded,0)
  const normal=await call(ctx,'POST','/route/compare',stairRoute)
  assert.equal(normal.astar.distance,normal.dijkstra.distance)
  assert(normal.route.edges.includes('P--M'))
  const avoid=await call(ctx,'POST','/route/compare',{...stairRoute,avoidStairs:true})
  assert(!avoid.route.edges.includes('P--M'));assert(avoid.route.meters>normal.route.meters)
  const places=new Map(original.scene.places.map(p=>[p.id,p]))
  const ordered=await call(ctx,'POST','/route/compare',{...known,via:['track','complex']})
  const points=ordered.route.points.map(n=>n.id)
  assert(points.indexOf(places.get('track').entry)<points.lastIndexOf(places.get('complex').entry))
  assert.equal(points[0],places.get('gate').entry)
  assert.equal(points.at(-1),places.get('canteen').entry)
  const edgeMap=new Map(original.scene.edges.map(e=>[e.id,e]))
  ordered.route.edges.forEach((id,i)=>assert.deepEqual(new Set([points[i],points[i+1]]),new Set([edgeMap.get(id).a,edgeMap.get(id).b])))
  const originalStops=['gate','track','complex','hall','canteen']
  const plan=await call(ctx,'POST','/itinerary/plan',{stops:originalStops,optimize:true,avoidStairs:false})
  assert.equal(plan.method,'exact')
  assert(plan.afterDistance<plan.beforeDistance)
  const permutations=([first,...rest])=>first===undefined?[[]]:permutations(rest).flatMap(p=>Array.from({length:p.length+1},(_,i)=>[...p.slice(0,i),first,...p.slice(i)]))
  const all=await Promise.all(permutations(originalStops.slice(1,-1)).map(via=>call(ctx,'POST','/route/compare',{...known,via})))
  assert.equal(plan.afterDistance,Math.min(...all.map(a=>a.route.meters)))
  const many=original.scene.places.filter(p=>!['d11','d12','psych-lab'].includes(p.id)).slice(0,14).map(p=>p.id)
  const heuristic=await call(ctx,'POST','/itinerary/plan',{stops:many,optimize:true,avoidStairs:false})
  assert.equal(heuristic.method,'nearest-2opt')
  assert(heuristic.afterDistance<=heuristic.beforeDistance)
  await call(ctx,'GET','/admin/scene/history',undefined,401)
  await call(ctx,'POST','/login',{username:'student',password:'NanhuStudent21'})
  await call(ctx,'POST','/admin/scene/restore',{revision:original.revision,target:1},403)
  log('API',{normal:normal.route.meters,avoid:avoid.route.meters,dijkstra:normal.dijkstra,astar:normal.astar,
    exact:[plan.beforeDistance,plan.afterDistance],order:plan.after,heuristic:[heuristic.beforeDistance,heuristic.afterDistance]})
 }finally{await ctx.dispose()}
}
async function login(page,username,password,register=false){
 await page.getByRole('button',{name:'登录 / 注册'}).click()
 const dialog=page.getByRole('dialog')
 if(register)await dialog.getByRole('button',{name:'注册新账号'}).click()
 await dialog.getByLabel('账号').fill(username)
 await dialog.getByLabel('密码').fill(password)
 await dialog.getByRole('button',{name:register?'注册并登录':'登录',exact:true}).click()
 await dialog.waitFor({state:'hidden'})
}
async function instrument(page){
 await page.addInitScript(()=>{
  window.sceneDraws=0
  for(const name of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced']){
   const original=WebGL2RenderingContext.prototype[name]
   if(!original)continue
   WebGL2RenderingContext.prototype[name]=function(...args){window.sceneDraws++;return original.apply(this,args)}
  }
 })
}
async function sample(page){
 await page.waitForTimeout(400)
 return page.evaluate(()=>new Promise(resolve=>{
  const start=performance.now(), begin=window.sceneDraws
  let frames=0
  function next(now){
   frames++
   if(now-start<2600)requestAnimationFrame(next)
   else resolve({frames,ms:Math.round(now-start),draws:window.sceneDraws-begin})
  }
  requestAnimationFrame(next)
 }))
}
async function show(page,text){await page.getByText(text,{exact:false}).first().waitFor({state:'visible'})}
async function gateShot(page,file){
 await page.locator('.place-row').filter({hasText:'南湖校区北门'}).click()
 await page.getByRole('button',{name:'关闭侧栏'}).click()
 await page.getByRole('button',{name:'第一人称',exact:true}).click()
 await page.waitForTimeout(450)
 await page.screenshot({path:file})
 await page.getByRole('button',{name:'退出漫游'}).click()
}
async function shots(page){
 await page.getByRole('button',{name:'复位视角'}).waitFor()
 await page.getByRole('button',{name:'渲染指标'}).click()
 await page.getByLabel('实时渲染指标').waitFor()
 log('RENDER',await page.getByLabel('实时渲染指标').innerText())
 await page.screenshot({path:path.join(output,'overview.png')})
 await page.getByRole('button',{name:'渲染指标'}).click()
 log('PERF_AFTER',await sample(page))
 for(const [place,file] of [['南湖综合楼','complex'],['南湖食堂','canteen']]){
  await page.locator('.place-row').filter({hasText:place}).click()
  await page.waitForTimeout(780)
  await page.screenshot({path:path.join(output,file+'.png')})
 }
 await page.getByRole('button',{name:'第一人称',exact:true}).click()
 await page.waitForTimeout(450)
 const mark=page.locator('.minimap circle').last()
 const {scene}=await (await page.request.get(origin+'/api/scene')).json()
 const food=scene.places.find(p=>p.id==='canteen')
 const rotation=food.angle*Math.PI/180
 const depth=async()=>{
  const x=Number(await mark.getAttribute('cx')),z=Number(await mark.getAttribute('cy'))
  return Math.sin(rotation)*(x-food.x)+Math.cos(rotation)*(z-food.z)
 }
 const start=await depth()
 await page.keyboard.down('KeyW');await page.waitForTimeout(2400);await page.keyboard.up('KeyW')
 await page.waitForTimeout(170)
 const stopped=await depth()
 assert(stopped<start-.7&&stopped>=food.d/2+.39,'canteen wall: '+stopped)
 await page.keyboard.down('KeyS');await page.waitForTimeout(650);await page.keyboard.up('KeyS')
 await page.waitForTimeout(170)
 assert(await depth()>stopped+.5)
 await page.getByRole('button',{name:'退出漫游'}).click()
 await gateShot(page,path.join(output,'walk.png'))
 await page.getByRole('button',{name:'地图校准'}).click()
 await page.getByRole('dialog',{name:'地图校准'}).waitFor()
 await page.screenshot({path:path.join(output,'calibration.png')})
 await page.getByRole('button',{name:'关闭校准'}).click()
}
async function browserFlow(){
 const opts={headless:true,executablePath:process.env.NANHU_BROWSER||undefined,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--disable-crash-reporter']}
 const browser=await chromium.launch(opts)
 const errors=[], bad=[]
 try{
  if(process.env.NANHU_BASELINE_URL){
   const baseline=await browser.newPage({viewport:{width:1440,height:880}})
   await instrument(baseline); await baseline.goto(process.env.NANHU_BASELINE_URL)
   await baseline.getByRole('button',{name:'复位视角'}).waitFor()
   log('PERF_BEFORE',await sample(baseline))
   fs.mkdirSync(path.resolve(output,'../before'),{recursive:true})
   await gateShot(baseline,path.resolve(output,'../before/before-walk.png'))
   await baseline.close()
  }
  const page=await browser.newPage({viewport:{width:1440,height:880},baseURL:origin})
  page.on('pageerror',e=>errors.push(e.message))
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text())})
  page.on('response',r=>{if(r.url().startsWith(origin+'/api')&&r.status()>=400)bad.push([r.status(),r.url()])})
  fs.mkdirSync(output,{recursive:true})
  await instrument(page);await page.goto('/')
  await shots(page)
  const before=await (await page.request.get('/api/scene')).json()
  await login(page,user,secret,true)
  await page.getByRole('searchbox',{name:'搜索地点'}).fill('综合楼')
  await page.locator('.place-row').filter({hasText:'南湖综合楼'}).click()
  await page.getByRole('heading',{name:'南湖综合楼',exact:true}).waitFor()
  await page.getByRole('button',{name:'行程优化',exact:true}).click()
  const selects=page.locator('.context select')
  await page.getByRole('button',{name:'添加中间站'}).click()
  await page.getByRole('button',{name:'添加中间站'}).click()
  await selects.nth(1).selectOption('track')
  await selects.nth(2).selectOption('complex')
  await selects.nth(3).selectOption('hall')
  await page.getByRole('button',{name:'生成行程'}).click()
  await page.getByLabel('算法对比').waitFor()
  await page.getByLabel('行程优化结果').waitFor()
  await page.getByLabel('行程名称').fill(name)
  await page.getByRole('button',{name:'保存多站行程'}).click()
  await page.locator('.toast').filter({hasText:'多站行程已保存'}).waitFor()
  await page.locator('.context').evaluate(e=>e.scrollTop=e.scrollHeight)
  await page.screenshot({path:path.join(output,'algorithm.png')})
  await page.getByRole('button',{name:'个人空间',exact:true}).click()
  await page.getByRole('button',{name:'多站行程',exact:true}).click()
  await show(page,name)
  await page.reload()
  await page.getByRole('button',{name:'多站行程',exact:true}).click()
  await show(page,name)
  await page.getByRole('button',{name:'打开行程'}).click()
  assert.equal(await selects.count(),5)
  assert.equal(await selects.nth(1).inputValue(),'track')
  await page.getByRole('button',{name:'地图纠错'}).click()
  await selects.first().selectOption('road')
  await selects.last().selectOption('P--M')
  await page.getByLabel('问题说明').fill(name+' · 临时道路围挡')
  await page.getByRole('button',{name:'提交反馈',exact:true}).click()
  await page.locator('.toast').filter({hasText:'反馈已提交'}).waitFor()
  await page.getByRole('button',{name:'退出',exact:true}).click()
  await login(page,'admin','NanhuAdmin21')
  await page.getByRole('button',{name:'管理后台',exact:true}).click()
  async function ticket(){
   await page.getByRole('button',{name:'反馈处理',exact:true}).click()
   await page.getByRole('button',{name:new RegExp(name)}).click()
  }
  await ticket()
  await page.locator('form select').last().selectOption('resolved')
  await page.getByLabel('回复',{exact:true}).fill('已核对，发布临时绕行。')
  await page.getByRole('button',{name:'保存处理结果'}).click()
  await page.locator('.toast').filter({hasText:'处理结果已保存'}).waitFor()
  await page.getByRole('button',{name:'打开对应对象并关联发布'}).click()
  await page.getByLabel('开放通行',{exact:true}).uncheck()
  await page.getByRole('button',{name:'保存草稿',exact:true}).click()
  await show(page,'草稿已保存')
  assert.equal((await (await page.request.get('/api/scene')).json()).revision,before.revision)
  await page.reload()
  await show(page,'已存草稿')
  await ticket()
  await page.getByRole('button',{name:'打开对应对象并关联发布'}).click()
  assert(!(await page.getByLabel('开放通行',{exact:true}).isChecked()))
  await page.getByLabel('发布说明').fill(name+' · 关闭中央步道')
  await page.getByRole('button',{name:'发布地图',exact:true}).click()
  await show(page,'地图已发布')
  const published=await (await page.request.get('/api/scene')).json()
  assert.equal(published.revision,before.revision+1)
  assert.equal(published.scene.edges.find(e=>e.id==='P--M').open,false)
  await page.getByRole('button',{name:'退出',exact:true}).click()
  await login(page,user,secret)
  await page.getByRole('button',{name:'路径规划',exact:true}).click()
  await page.locator('.context select').last().selectOption('canteen')
  await page.getByRole('button',{name:'计算路线',exact:true}).click()
  await page.getByLabel('算法对比').waitFor()
  assert((await page.getByLabel('算法对比').innerText()).includes('v'+published.revision))
  const chosen=await call(page.request,'POST','/route/compare',stairRoute)
  assert(!chosen.route.edges.includes('P--M'))
  await page.getByRole('button',{name:'个人空间',exact:true}).click()
  await page.getByRole('button',{name:'我的反馈',exact:true}).click()
  await show(page,'关联地图发布 v'+published.revision)
  await page.getByRole('button',{name:'退出',exact:true}).click()
  await login(page,'admin','NanhuAdmin21')
  await page.getByRole('button',{name:'管理后台',exact:true}).click()
  await page.getByRole('button',{name:'地图版本',exact:true}).click()
  await page.getByRole('button',{name:'恢复 v'+before.revision,exact:true}).click()
  await show(page,'已恢复 v'+before.revision)
  const restored=await (await page.request.get('/api/scene')).json()
  assert.equal(restored.revision,published.revision+1)
  assert.deepEqual(restored.scene,before.scene)
  assert((await call(page.request,'POST','/route/compare',stairRoute)).route.edges.includes('P--M'))
  await page.screenshot({path:path.join(output,'versions.png')})
  const closed=structuredClone(restored)
  for(const e of closed.scene.edges)if(e.a==='gate-in'||e.b==='gate-in')e.open=false
  const isolated=await call(page.request,'PUT','/admin/scene',closed)
  try{
   await call(page.request,'POST','/route/compare',known,422)
   const invalid=structuredClone(isolated)
   invalid.scene.edges[0].a='missing'
   await call(page.request,'PUT','/admin/scene',invalid,400)
   const crossing=structuredClone(isolated)
   crossing.scene.nodes.push(...[['x-a',-58,-61],['x-b',-56,-59],['x-c',-58,-59],['x-d',-56,-61]].map(([id,x,z])=>({id,x,z})))
   crossing.scene.edges.push({id:'cross-first',a:'x-a',b:'x-b',open:true,stairs:false},
    {id:'cross-second',a:'x-c',b:'x-d',open:true,stairs:false})
   assert((await call(page.request,'PUT','/admin/scene',crossing,400)).message.match(/未共享路口|需核对并拆分/))
   assert.deepEqual(await call(page.request,'GET','/scene'),isolated)
  }finally{await call(page.request,'POST','/admin/scene/restore',{revision:isolated.revision,target:restored.revision})}
  const other=await request.newContext({baseURL:origin})
  try{
   await call(other,'POST','/login',{username:'student',password:'NanhuStudent21'})
   assert(!(await call(other,'GET','/me/itinerary')).some(item=>item.data.name===name))
  }finally{await other.dispose()}
  assert.deepEqual(errors,[])
  assert.deepEqual(bad,[])
  log('BROWSER',{user,revision:restored.revision,closedDistance:chosen.route.meters})
 }finally{await browser.close()}
}
;(async()=>{await checkApi();if(!process.env.NANHU_API_ONLY)await browserFlow()})().catch(e=>{console.error(e);process.exitCode=1})
