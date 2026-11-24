const assert = require('node:assert/strict')
const fs = require('node:fs')
const { request } = require('playwright')

const origin = process.env.NANHU_TEST_URL
if (!origin || new URL(origin).port === '8080') {
  throw new Error('Set NANHU_TEST_URL to an isolated server with a test database')
}
const subjects = [['gate','complex'],['d5','canteen'],['d15','complex'],['canteen','track'],['complex','library']]
const seed = name => JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'../backend/src/main/resources/'+name)))
const xy = ({x,z}) => ({x,z})
const compact = value => Array.isArray(value) ? value.map(compact) : value && typeof value==='object'
    ? Object.fromEntries(Object.entries(value).filter(([,v])=>v!==null).map(([k,v])=>[k,compact(v)])) : value
async function call(client, method, path, data, status=200) {
  const headers = {}
  if (method!=='GET') {
    const token = await (await client.get('/api/csrf')).json()
    headers[token.header]=token.token
  }
  const res = await client.fetch('/api'+path,{method,data,headers})
  const body = await res.json()
  assert.equal(res.status(),status, method+' '+path+' '+JSON.stringify(body).slice(0,220))
  return body
}

async function verify() {
  const guest = await request.newContext({baseURL:origin})
  const admin = await request.newContext({baseURL:origin})
  const compare = (start,end,extra={},status=200) => call(guest,'POST','/route/compare',{start,end,via:[],avoidStairs:false,...extra},status)
  let original, edited=false
  try {
    original = await call(guest,'GET','/scene')
    const scene = original.scene
    const baseline = seed(scene.places.some(p=>p.asset) ? 'scene.json' : 'scene-v3.json')
    assert.deepEqual(compact(scene.places),compact(baseline.places))
    assert.deepEqual(scene.edges.map(e=>e.id),baseline.edges.map(e=>e.id))
    assert.deepEqual(scene.nodes.map(n=>n.id),baseline.nodes.map(n=>n.id))
    assert.deepEqual(scene.calibration,baseline.calibration)
    assert.deepEqual(scene.water,baseline.water)
    assert.deepEqual(scene.boundary,baseline.boundary)
    const edges = new Map(scene.edges.map(e => [e.id,e]))
    const stops = new Map(scene.places.map(p => [p.id,p.entry]))
    const measured = []
    function check(result,start,end) {
      const {route, astar, dijkstra} = result
      assert.equal(astar.distance,dijkstra.distance)
      assert.equal(route.meters,astar.distance)
      assert.equal(route.points[0].id,stops.get(start))
      assert.equal(route.points.at(-1).id,stops.get(end))
      const path = [xy(route.points[0])]
      const chord = route.edges.reduce((sum,id,i)=>{
        const edge = edges.get(id), a = route.points[i], b = route.points[i+1]
        assert(edge?.open && edge.walkable!==false)
        assert(edge.a===a.id && edge.b===b.id || edge.b===a.id && edge.a===b.id)
        const forward = edge.a===a.id
        const shape = forward ? edge.geometry : edge.geometry.toReversed()
        assert.deepEqual(shape[0],xy(a))
        assert.deepEqual(shape.at(-1),xy(b))
        path.push(...shape.slice(1))
        return sum+Math.hypot(b.x-a.x,b.z-a.z)
      },0)
      assert.deepEqual(route.polyline,path)
      const length=path.slice(1).reduce((sum,at,i)=>sum+Math.hypot(at.x-path[i].x,at.z-path[i].z),0)
      assert.equal(route.meters,Math.round(length*scene.calibration.metersPerUnit*10)/10)
      if(path.length>route.points.length)assert(length>chord)
      return route
    }
    for(const [start,end] of subjects) {
      const a=check(await compare(start,end),start,end)
      const b=check(await compare(end,start),end,start)
      assert.deepEqual(b.polyline,a.polyline.toReversed())
      assert.deepEqual(b.edges,a.edges.toReversed())
      measured.push({start,end,meters:a.meters,vertices:a.polyline.length,edges:a.edges,polyline:a.polyline})
    }
    assert(measured.at(-1).edges.length>1)
    const same=check(await compare('gate','gate'),'gate','gate')
    assert.equal(same.meters,0)
    const multi=check(await compare('gate','track',{via:['complex','canteen']}),'gate','track')
    assert(multi.points.findIndex(p=>p.id===stops.get('complex'))<multi.points.findIndex(p=>p.id===stops.get('canteen')))
    const avoid=check(await compare('d15','complex',{avoidStairs:true}),'d15','complex')
    assert(avoid.edges.every(id=>!edges.get(id).stairs))
    const retired=await compare('gate','d11',{},422)
    assert(retired.message.includes('不可达'))

    await call(admin,'POST','/login',{username:'admin',password:'NanhuAdmin21'})
    const changed=structuredClone(original)
    const closed=measured[2].edges.includes('P--M')?'P--M':measured[2].edges[1]
    changed.scene.edges.find(e=>e.id===closed).open=false
    await call(guest,'PUT','/admin/scene',changed,401)
    const next=await call(admin,'PUT','/admin/scene',changed)
    edited=true
    const detour=check(await compare('d15','complex'),'d15','complex')
    assert(!detour.edges.includes(closed) && detour.meters>measured[2].meters)
    const mismatch=structuredClone(next)
    mismatch.scene.edges.find(e=>e.id==='A--B').geometry[0].x+=.1
    await call(admin,'PUT','/admin/scene',mismatch,400)
    const through=structuredClone(next)
    through.scene.edges.find(e=>e.id==='A--B').geometry.splice(1,0,xy(scene.places.find(p=>p.id==='complex')))
    await call(admin,'PUT','/admin/scene',through,400)
    const reopenUnavailable=structuredClone(next)
    reopenUnavailable.scene.edges.find(e=>e.walkable===false).open=true
    await call(admin,'PUT','/admin/scene',reopenUnavailable,400)
    const isolated=structuredClone(next)
    isolated.scene.edges.filter(e=>[e.a,e.b].includes('gate-in')).forEach(e=>e.open=false)
    const final=await call(admin,'PUT','/admin/scene',isolated)
    assert((await compare('gate','complex',{},422)).message.includes('不可达'))
    const restored=await call(admin,'POST','/admin/scene/restore',{target:original.revision,revision:final.revision})
    edited=false
    assert.deepEqual(restored.scene,original.scene)
    assert.deepEqual((await compare('gate','complex')).route.polyline,measured[0].polyline)
    const output={measured, multi:{meters:multi.meters, stops:multi.points.map(p=>p.id)},
      detour:{closed, before:measured[2].meters,after:detour.meters,edges:detour.edges},
      failures:['gate → d11 (historical access unconfirmed)','gate → complex (gate closed)'],
      revisions:[original.revision,next.revision,final.revision,restored.revision]}
    console.log(JSON.stringify(output,null,2))
  } finally {
    if(edited) {
      const snapshot=await call(guest,'GET','/scene')
      await call(admin,'POST','/admin/scene/restore',{target:original.revision,revision:snapshot.revision})
    }
    await Promise.all([guest.dispose(),admin.dispose()])
  }
}
verify().catch(error=>{console.error(error);process.exitCode=1})
