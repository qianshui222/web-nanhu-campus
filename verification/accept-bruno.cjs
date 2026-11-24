const {chromium}=require('playwright')
const fs=require('node:fs')
const path=require('node:path')
const assert=require('node:assert/strict')
const baseURL=process.env.NANHU_TEST_URL||'http://127.0.0.1:8086'
const dest=path.join(__dirname,'../docs/bruno')
const manifest=require('../modeling/studio-manifest.json').assets
const baseline=JSON.parse(fs.readFileSync(path.join(dest,'layout-baseline.json')))
const shots=!process.env.NANHU_NO_SHOTS
const wait=(p,n)=>p.waitForTimeout(n)

async function verify(){
  const browser=await chromium.launch({executablePath:process.env.NANHU_BROWSER,
    args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-crash-reporter']})
  try{
    const page=await browser.newPage({baseURL,viewport:{width:1440,height:900}})
    const errors=[],failed=[],downloaded=new Set()
    page.on('pageerror',e=>errors.push(e.message))
    page.on('console',e=>{if(e.type()==='error')errors.push(e.text())})
    page.on('response',r=>{
      const name=new URL(r.url()).pathname
      if(!name.startsWith('/assets/'))return
      if(!r.ok())failed.push([name,r.status()])
      if(name.endsWith('.glb')&&r.ok())downloaded.add(name)
    })
    await page.goto('/?scene-audit#/campus')
    const {scene,revision}=await (await page.request.get('/api/scene')).json()
    assert.deepEqual(scene,baseline.scene)
    const map=page.locator('.map-view[data-glb-count="24"]')
    await map.waitFor({timeout:45000})
    const poses=JSON.parse(await map.getAttribute('data-pose-audit'))
    assert.equal(poses.length,24)
    for(const item of manifest)assert(downloaded.has(item.model),item.buildingId)
    for(const row of poses){
      const p=scene.places.find(p=>p.id===row.id),angle=p.angle*Math.PI/180
      const expected=[Math.cos(angle),0,-Math.sin(angle),0,0,1,0,0,Math.sin(angle),0,Math.cos(angle),0,p.x,.305,p.z,1]
      assert(row.matrix.every((v,i)=>Math.abs(v-expected[i])<1e-6),row.id)
      const c=Math.abs(expected[0]),s=Math.abs(expected[8])
      const low=[p.x-c*p.w/2-s*p.d/2,.305,p.z-s*p.w/2-c*p.d/2]
      const high=[2*p.x-low[0],.305+p.h,2*p.z-low[2]]
      assert(row.min.every((v,i)=>Math.abs(v-low[i])<.02)&&row.max.every((v,i)=>Math.abs(v-high[i])<.02),row.id)
    }
    assert.equal(await map.getAttribute('data-material-unmatched'),'')
    const button=(name)=>page.getByRole('button',{name,exact:true})
    const shot=async(name)=>{await wait(page,800);if(shots)await page.screenshot({path:path.join(dest,name+'.png')})}
    const mode=page.getByLabel('画质',{exact:true})
    const metrics=page.getByLabel('实时渲染指标')
    const statistics={}
    const monitor=async name=>{
      await wait(page,3800)
      const text=await metrics.innerText()
      const canvas=await page.locator('canvas').evaluate(c=>({buffer:[c.width,c.height],css:[c.clientWidth,c.clientHeight],dpr:devicePixelRatio}))
      statistics[name]={text,canvas}
    }
    const openTool=async name=>{await button('工具').click();await button(name).click()}
    await openTool('校园环境')
    const dialog=page.getByRole('dialog',{name:'校园环境'})
    await dialog.getByLabel('启用测试预览').check()
    await dialog.getByLabel('测试时间（北京）').fill('2026-11-24T12:30')
    await dialog.getByLabel('测试天气').selectOption('clear')
    await button('关闭环境').click()
    await shot('overview')
    const labels=page.locator('.map-label:not([data-poi-state="hidden"]):visible')
    const count=await labels.count()
    assert(count>0&&count<=7)
    const boxes=await labels.evaluateAll(els=>els.map(e=>{const r=e.getBoundingClientRect();return [r.left,r.top,r.right,r.bottom]}))
    assert(boxes.every((a,i)=>boxes.slice(i+1).every(b=>a[2]<=b[0]||b[2]<=a[0]||a[3]<=b[1]||b[3]<=a[1])))
    await openTool('渲染指标');await monitor('balanced')
    await mode.selectOption('detailed');await monitor('detailed');await shot('overview-detailed')
    for(let i=0;i<3;i++){await mode.selectOption('balanced');await wait(page,260);await mode.selectOption('detailed');await wait(page,430)}
    assert.equal(await page.locator('.three-host canvas').count(),1)
    await mode.selectOption('balanced');await monitor('balanced-after-switches')
    await openTool('渲染指标')
    const minimap=page.getByRole('button',{name:/^校园小地图/})
    await minimap.click()
    assert.equal(await minimap.getAttribute('aria-expanded'),'false')
    await minimap.click()
    await shot('minimap')
    await button('校园地点').click()
    const search=page.getByPlaceholder(/搜索建筑/)
    await search.fill('食堂')
    await page.locator('.place-row').filter({hasText:'南湖食堂'}).click()
    const heading=page.getByRole('heading',{name:'南湖食堂',exact:true})
    await heading.waitFor()
    await shot('place-card')
    const close=button('关闭侧栏')
    await close.focus();await page.keyboard.press('Escape')
    await heading.waitFor({state:'hidden'})
    const canvas=page.locator('.three-host canvas')
    const box=await canvas.boundingBox()
    await canvas.click({position:{x:box.width*.5,y:box.height*.50}})
    await heading.waitFor()
    await close.click()
    await button('开始漫游').click()
    await wait(page,500)
    const marker=page.locator('.minimap svg circle[r="8"]').last()
    const start=+await marker.getAttribute('cy')
    await page.keyboard.down('w');await wait(page,2300);await page.keyboard.up('w');await wait(page,300)
    const x=+await marker.getAttribute('cx'),z=+await marker.getAttribute('cy')
    const food=scene.places.find(p=>p.id==='canteen'),angle=food.angle*Math.PI/180
    assert(start-z>2)
    assert(Math.sin(angle)*(x-food.x)+Math.cos(angle)*(z-food.z)>=food.d/2+.39)
    await button('复位视角').click()
    await button('校园地点').click()
    await button('路径规划').click()
    const picks=page.locator('.context select')
    await picks.first().selectOption('d5');await picks.last().selectOption('canteen')
    const result=page.waitForResponse(r=>r.url().endsWith('/api/route/compare')&&r.request().method()==='POST')
    await button('计算路线').click()
    const route=(await (await result).json()).route
    assert.equal(route.points.at(-1).id,'canteen-in')
    assert.equal(route.meters,109.8)
    await button('模拟导航').click()
    await button('暂停').waitFor()
    assert.deepEqual(errors,[])
    assert.deepEqual(failed,[])
    const phone=await browser.newPage({baseURL,viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true})
    await phone.goto('/#/campus')
    await phone.locator('.map-view[data-glb-count="24"]').waitFor()
    await phone.getByRole('button',{name:/^校园小地图/}).waitFor()
    assert(await phone.getByLabel('画质',{exact:true}).isVisible())
    await wait(phone,1000)
    if(shots)await phone.screenshot({path:path.join(dest,'mobile.png')})
    const phoneLabels=await phone.locator('.map-label:not([data-poi-state="hidden"]):visible').count()
    assert(phoneLabels<=4)
    if(shots)fs.writeFileSync(path.join(dest,'browser-verification.json'),JSON.stringify({revision,poses,
      statistics,desktopLabels:count,phoneLabels,routeMeters:route.meters,errors,failed,studioModels:downloaded.size},null,2)+'\n')
    console.log('PASS',poses.length,'poses',downloaded.size,'GLBs',count,'labels',route.meters,'m',statistics)
  }finally{await browser.close()}
}
verify().catch(error=>{console.error(error);process.exitCode=1})
