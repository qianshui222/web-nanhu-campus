const assert=require('node:assert/strict')
const {chromium,request}=require('playwright')
const fs=require('node:fs')
const path=require('node:path')
const origin=process.env.NANHU_TEST_URL||'http://127.0.0.1:8086'
const output=process.env.NANHU_SCREENSHOTS||path.resolve(__dirname,'../docs/environment/after')
const testName='环境验收 '+Date.now().toString(36)
const delay=ms=>new Promise(r=>setTimeout(r,ms))

async function call(c,method,url,body,status=200){
 const headers={}
 if(method!=='GET'){
  const csrf=await (await c.get(origin+'/api/csrf')).json()
  headers[csrf.header]=csrf.token
 }
 const r=await c.fetch(origin+'/api'+url,{method,data:body,headers})
 assert.equal(r.status(),status,await r.text())
 return status===204?null:r.json()
}

async function api(){
 const c=await request.newContext()
 try{
  const published=await call(c,'GET','/scene')
  assert.equal(published.scene.places.length,29)
  const nodes=new Map(published.scene.nodes.map(n=>[n.id,n]))
  const unconfirmed=new Set(published.scene.edges.some(e=>e.walkable===false)?['d11','d12','psych-lab']:[])
  for(const p of published.scene.places){
   assert(nodes.has(p.entry))
   const result=await call(c,'POST','/route',{start:'gate',end:p.id,via:[],avoidStairs:false},unconfirmed.has(p.id)?422:200)
   if(unconfirmed.has(p.id)) assert(result.message.includes('不可达'))
   else assert.equal(result.points.at(-1).id,p.entry)
  }
  const weather=await call(c,'GET','/environment/weather')
  console.log('REAL_WEATHER',weather.state,weather.source,weather.current?.validAt,weather.fetchedAt,weather.current?.code)
  const input={start:'gate',end:'complex',stops:[{place:'canteen',minutes:10}],dayOffset:1,startTime:'12:45',deadlineTime:'14:00',preferShelter:true}
  const result=await call(c,'POST','/agent/plan',input)
  assert(result.feasible&&result.mapRoute.points.length>3)
  assert.equal(result.visits[1].minutes,10)
  assert(result.notes.some(n=>n.includes('开放时间未知')))
  assert(result.notes.some(n=>n.includes('遮蔽路段')))
  assert.equal(result.input.dayOffset,null)
  const campusTime=await call(c,'GET','/environment/time')
  const shanghai=new Date(Date.parse(campusTime.now)+8*3600000+86400000).toISOString().slice(0,10)
  assert.equal(result.input.date,shanghai)
  const noTime=await call(c,'POST','/agent/plan',{...input,startTime:'12:45',deadlineTime:'12:46'})
  assert.equal(noTime.feasible,false)
  await call(c,'POST','/agent/plan',{...input,stops:[{place:'printing-not-recorded',minutes:10}]},400)
  const far=await call(c,'POST','/agent/plan',{...input,dayOffset:21})
  assert(!far.weather.forecast.length);assert(far.notes.some(n=>n.includes('预报')))
  console.log('PASS all 29 entrance references, reachable routes and explicit unavailable access, Tokyo-independent Beijing-relative day, feasible/infeasible, unknown opening and missing service')
  await call(c,'POST','/login',{username:'admin',password:'NanhuAdmin21'})
  const draft=structuredClone(published)
  draft.scene.places.find(p=>p.id==='canteen').openingHours='*@19:00-20:00'
  const changed=await call(c,'PUT','/admin/scene',draft)
  try{
   const closed=await call(c,'POST','/agent/plan',input)
   assert.equal(closed.feasible,false)
   assert(closed.visits.some(v=>v.openingStatus==='开放时间冲突'))
   console.log('PASS maintained opening-hours conflict')
  } finally{
   await call(c,'POST','/admin/scene/restore',{revision:changed.revision,target:published.revision})
  }
 }finally{await c.dispose()}
}
async function verifyBrowser(){
 const browser=await chromium.launch({executablePath:process.env.NANHU_BROWSER||undefined,args:['--no-sandbox','--disable-crash-reporter','--use-angle=swiftshader','--enable-unsafe-swiftshader']})
 try{
  const errors=[]
  const a=await browser.newContext({viewport:{width:1440,height:880},timezoneId:'America/Los_Angeles'})
  const p=await a.newPage()
  p.on('pageerror',e=>errors.push(e.message))
  p.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
  await p.goto(origin)
  await p.getByRole('button',{name:'复位视角',exact:true}).waitFor()
  await p.locator('.environment-chip').filter({hasText:/202\d/}).waitFor()
  const b=await browser.newContext({viewport:{width:1000,height:800},timezoneId:'Europe/Paris'})
  const z=await b.newPage();await z.goto(origin)
  await z.locator('.environment-chip').filter({hasText:/202\d/}).waitFor()
  const ticker=async page=>(await page.locator('.environment-chip').innerText()).match(/\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}/)?.[0]
  assert.equal(await ticker(p),await ticker(z))
  await b.close()
  fs.mkdirSync(output,{recursive:true})
  const screen=async f=>{await p.waitForTimeout(1150);await p.screenshot({path:path.join(output,f+'.png')})}
  const scene=(await call(p.request,'GET','/scene')).scene
  const generated=(await p.locator('.map-view').getAttribute('data-building-ids')).split(',')
  assert.deepEqual(generated.sort(),scene.places.filter(q=>q.h>0).map(q=>q.id).sort())
  const open=async()=>{await p.getByRole('button',{name:'校园环境',exact:true}).click();return p.getByRole('dialog',{name:'校园环境'})}
  const close=async()=>p.getByRole('button',{name:'关闭环境'}).click()
  let env=await open()
  await env.getByRole('checkbox',{name:'启用测试预览'}).check()
  async function preset(label,key,weather='clear'){
   await env.getByRole('button',{name:label,exact:true}).click()
   await env.getByLabel('测试天气').selectOption(weather)
   const stats=(await env.locator('dl').innerText()).match(/(-?\d+\.\d+)°\s*\/\s*(\d+\.\d+)°/)
   assert(stats)
   await close()
   assert((await p.locator('.environment-chip').innerText()).includes('测试'))
   await screen(key)
   env=await open()
   return [Number(stats[1]),Number(stats[2])]
  }
  const dawn=await preset('清晨','dawn'), noon=await preset('白天','overview-day')
  const dusk=await preset('黄昏','dusk'), night=await preset('夜间','night')
  assert(dawn[1]>75&&dawn[1]<145&&dusk[1]>220&&dusk[1]<295)
  assert(noon[0]>25&&night[0]<-20)
  console.log('SOLAR',dawn,noon,dusk,night)
  await preset('白天','cloudy','cloudy')
  await preset('白天','rain','rain')
  await preset('白天','snow','snow')
  await preset('白天','missing','missing')
  await env.locator('input[type=datetime-local]').fill('2026-11-24T00:01')
  assert((await env.innerText()).includes('2026/11/24'))
  await env.getByRole('button',{name:'白天',exact:true}).click()
  await env.getByLabel('测试天气').selectOption('clear')
  await close()
  await p.getByRole('button',{name:'地图校准',exact:true}).click()
  const calibration=p.getByRole('dialog',{name:'地图校准'})
  await calibration.getByRole('checkbox',{name:'显示本轮补录建筑锚点'}).check()
  await screen('gis-comparison')
  await p.getByRole('button',{name:'关闭校准'}).click()
  for(const [name,key] of [['南湖综合楼','complex'],['南湖食堂','canteen']]){
   await p.locator('.place-row').getByText(name,{exact:true}).click()
   await screen(key)
  }
  await p.getByRole('button',{name:'第一人称',exact:true}).click()
  await screen('walk')
  await p.getByRole('button',{name:'退出漫游'}).click()
  const baseline=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../backend/src/main/resources/scene-v2.json')))
  const existing=new Set(baseline.places.map(place=>place.id))
  const input=p.getByRole('searchbox',{name:'搜索地点'})
  for(const place of scene.places.filter(q=>!existing.has(q.id))){
   await input.fill(place.name)
   await p.locator('.place-row').getByText(place.name,{exact:true}).click()
   await p.getByRole('heading',{name:place.name,exact:true}).waitFor()
  }
  await input.clear()
  await p.getByRole('button',{name:'复位视角',exact:true}).click()
  await p.getByRole('button',{name:'渲染指标',exact:true}).click()
  await p.getByLabel('实时渲染指标').waitFor()
  await delay(2050)
  console.log('RENDER',(await p.getByLabel('实时渲染指标').innerText()).replace(/\s+/g,' '))
  await screen('metrics')
  await p.getByRole('button',{name:'校园 Agent',exact:true}).click()
  const enabled=(await call(p.request,'GET','/agent/status')).configured
  if(!enabled){
   await p.locator('.context').getByText(/未配置模型服务/).waitFor()
   assert(!(await p.getByRole('button',{name:'发送指令'}).isEnabled()))
  }
  await p.getByRole('button',{name:'时间行程表单'}).click()
  await p.locator('.context select').nth(0).selectOption('gate')
  await p.getByRole('button',{name:'计算时间行程'}).click()
  await p.getByLabel('时间行程结果').waitFor()
  await p.getByRole('button',{name:'登录 / 注册'}).click()
  const login=p.getByRole('dialog',{name:'账号登录'})
  await login.getByLabel('账号').fill('student');await login.getByLabel('密码').fill('NanhuStudent21')
  await login.getByRole('button',{name:'登录',exact:true}).click()
  await login.waitFor({state:'hidden'})
  await p.getByLabel('行程标题').fill(testName)
  await p.getByRole('button',{name:'保存时间行程'}).click()
  await p.locator('.toast').filter({hasText:'时间约束行程已保存'}).waitFor()
  await screen('timed-plan')
  await p.getByRole('button',{name:'个人空间',exact:true}).click()
  await p.reload()
  await p.getByRole('button',{name:'多站行程'}).click()
  const record=p.locator('.record-list li').filter({hasText:testName})
  await record.getByRole('button',{name:'打开行程'}).click()
  await p.getByLabel('时间行程结果').waitFor()
  assert.deepEqual(errors,[])
  console.log('PASS two timezone contexts, twilight and weather previews, visible generated IDs and individual selection, plan/save/reload/open')
 }finally{await browser.close()}
}
;(async()=>{await api();if(!process.env.NANHU_API_ONLY)await verifyBrowser()})().catch(e=>{console.error(e);process.exitCode=1})
