const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const fs = require('node:fs')
const path = require('node:path')

const [base='http://127.0.0.1:8080', output='docs/campus-site/screenshots', baseline] = process.argv.slice(2)
const cases = [['desktop',1440,900,false],['tablet',754,900,false],['phone',390,844,true]]

async function swipe(context,page) {
  const session=await context.newCDPSession(page)
  try {
    const dispatch=(type,y)=>session.send('Input.dispatchTouchEvent',{
      type, touchPoints:y==null?[]:[{x:200,y}],
    })
    await dispatch('touchStart',620)
    for(let step=1;step<=12;step++){
      await dispatch('touchMove',620-step*35)
      await page.waitForTimeout(16)
    }
    await dispatch('touchEnd')
  } finally { await session.detach() }
}

async function main() {
  fs.mkdirSync(output,{recursive:true})
  const browser=await chromium.launch({
    executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'],
  })
  const issues=[]
  const capture=(page,name,fullPage=false)=>page.screenshot({path:path.join(output,name+'.png'),fullPage,animations:'disabled'})
  try {
    for (const [name,width,height,touch] of cases){
      const context=await browser.newContext({
        viewport:{width,height},isMobile:touch,hasTouch:touch,deviceScaleFactor:touch?2:1,reducedMotion:'reduce',
      })
      const page=await context.newPage(), requests=[]
      page.on('request',r=>requests.push(r.url()))
      page.on('pageerror',e=>issues.push(e.message))
      page.on('console',m=>{if(m.type()==='error')issues.push(m.text())})
      page.on('response',r=>{if(r.status()>=400)issues.push(r.status()+' '+r.url())})
      await page.goto(base+'/#/',{waitUntil:'networkidle'})
      await page.getByRole('heading',{name:'南湖漫游',exact:true}).waitFor()
      await page.getByRole('link',{name:'在地图中查看南湖食堂'}).waitFor()
      assert.equal(await page.locator('canvas').count(),0)
      assert(!requests.some(url=>/\.glb(\?|$)|\/MapScene-/.test(url)), 'home fetched 3D assets')
      assert(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth))
      await capture(page,name+'-hero')
      if(touch) await swipe(context,page)
      else if(name==='tablet') await page.keyboard.press('PageDown')
      else await page.mouse.wheel(0,620)
      await page.waitForFunction(()=>scrollY>100)
      await page.waitForTimeout(350)
      const initialScroll=await page.evaluate(()=>scrollY)
      await page.evaluate(()=>scrollTo(0,document.body.scrollHeight))
      await page.waitForFunction(()=>document.querySelector('.site-footer').getBoundingClientRect().bottom<=innerHeight+1)
      await page.locator('.site-footer').getByRole('link',{name:'三维校园地图'}).waitFor()
      assert(await page.evaluate(()=>scrollY>innerHeight*2))
      await page.locator('.site-footer').getByRole('link',{name:'校园地点'}).click()
      await page.waitForFunction(()=>{
        const heading=document.querySelector('#places-title').getBoundingClientRect()
        const header=document.querySelector('.site-header').getBoundingClientRect()
        return location.hash.endsWith('#places') && heading.top>=header.bottom && heading.bottom<innerHeight*.66
      })
      if(name==='desktop') await capture(page,'desktop-places')
      const category=page.getByRole('button',{name:'校园生活',exact:true})
      await category.click()
      assert.equal(await page.locator('.site-place-card').count(),1)
      await page.getByRole('button',{name:'全部',exact:true}).click()
      assert.equal(await page.locator('.site-place-card').count(),4)
      for (const image of await page.locator('.campus-home img').all()){
        await image.scrollIntoViewIfNeeded()
        await image.evaluate(img=>img.decode())
      }
      await page.evaluate(()=>scrollTo(0,0))
      if(name!=='tablet')await capture(page,name+'-full',true)
      if(touch || name==='tablet'){
        const menu=page.getByRole('button',{name:'菜单',exact:true})
        await menu.click()
        const nav=page.getByRole('dialog',{name:'导航菜单'})
        await nav.waitFor()
        assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).overflowY),'hidden')
        if(touch)await capture(page,'phone-menu')
        await page.keyboard.press('Escape')
        await nav.waitFor({state:'hidden'})
        assert.equal(await page.evaluate(()=>document.activeElement.textContent.trim()),'菜单')
        assert.notEqual(await page.evaluate(()=>getComputedStyle(document.documentElement).overflowY),'hidden')
      }
      await page.getByRole('button',{name:'登录 / 注册'}).click()
      await page.getByRole('dialog',{name:'登录账号'}).waitFor()
      await page.getByRole('button',{name:'注册新账号'}).click()
      await page.getByRole('dialog',{name:'注册账号'}).waitFor()
      await page.keyboard.press('Escape')
      const start=page.getByRole('link',{name:'开始漫游',exact:true})
      await start.click()
      await page.waitForURL('**/#/campus')
      await page.locator('[data-glb-count="24"]').waitFor({timeout:60000})
      assert.equal(await page.locator('canvas').count(),1)
      if(name==='desktop') await capture(page,'desktop-campus')
      await page.goBack()
      await page.locator('.campus-home').waitFor()
      assert.equal(await page.locator('canvas').count(),0)
      const canteen=page.getByRole('link',{name:'在地图中查看南湖食堂'})
      await canteen.scrollIntoViewIfNeeded()
      const savedY=await page.evaluate(()=>scrollY)
      await canteen.click()
      await page.waitForURL('**/#/campus?place=canteen')
      await page.locator('[data-glb-count="24"][data-camera-mode="focus"]').waitFor({timeout:60000})
      await page.locator('.context').getByRole('heading',{name:'南湖食堂',exact:true}).waitFor()
      if(name==='desktop') await capture(page,'desktop-canteen')
      await page.goBack()
      await page.waitForFunction(y=>Math.abs(scrollY-y)<6,savedY)
      assert.equal(await page.locator('canvas').count(),0)
      await page.mouse.wheel(0,320)
      await page.waitForFunction(y=>scrollY>y+20,savedY)
      await page.goForward()
      await page.locator('.context').getByRole('heading',{name:'南湖食堂',exact:true}).waitFor()
      if(name==='desktop'){
        await page.reload()
        await page.locator('[data-glb-count="24"][data-camera-mode="focus"]').waitFor({timeout:60000})
        await page.locator('.context').getByRole('heading',{name:'南湖食堂',exact:true}).waitFor()
        await page.goto(base+'/#/?place=library')
        await page.waitForURL('**/#/campus?place=library')
        await page.locator('.context').getByRole('heading',{name:'南湖图书馆入口',exact:true}).waitFor()
      }
      console.log(name+' / initial scroll '+Math.round(initialScroll)+' px / restored '+Math.round(savedY)+' px / deep link, 24 GLB')
      await context.close()
    }
    if(baseline){
      const snapshot=await (await fetch(base+'/api/scene')).json()
      assert.deepEqual(snapshot.scene,JSON.parse(fs.readFileSync(baseline,'utf8')).scene)
      console.log('Campus scene equals baseline')
    }
    assert.deepEqual(issues,[])
    console.log('Campus site checks passed')
  } finally { await browser.close() }
}
main().catch(e=>{console.error(e);process.exitCode=1})
