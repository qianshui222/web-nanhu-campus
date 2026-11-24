import * as fs from 'node:fs'
const base = new URL('../backend/src/main/resources/',import.meta.url)
const scene = JSON.parse(fs.readFileSync(new URL('scene-v4.json',base)))
const byId = new Map(scene.places.map(p => [p.id,p]))
const nodes = new Map(scene.nodes.map(n => [n.id,n]))
const edited = {
  d1: {x:-2}, d2:{x:-2}, d15:{x:-19}, hall:{x:-58,w:34},
  canteen:{x:-22,z:-48,w:36,d:20,angle:-4},
}
for (const [id,params] of Object.entries(edited)) Object.assign(byId.get(id),params)
const verifiedFacade={
  complex:{source:'ICET_2024_PAGE_17',status:'photo-and-gis'},
  canteen:{source:'CCNU_GIS_AND_DINING',status:'gis-interpretation',facade:'south',doorOffset:6.4},
  library:{source:'CCNU_GIS_AND_ICET',status:'gis-interpretation'},
  hall:{source:'CCNU_GIS_AND_ICET',status:'gis-interpretation'}
}
const brick = new Set(['d1','d2','d3','d4','d5','d6','d7','d8'])
const banded = new Set(['d11','d12','d13','d14','d15'])
for (const p of scene.places.filter(p=>p.h>0)) {
  p.asset={model:'/assets/campus/v5/'+p.id+'.glb',source:'CCNU_GIS',status:'stylized-estimate',
    ...(p.style==='dorm'?{variant:brick.has(p.id)?'brick':banded.has(p.id)?'banded':'concrete'}:{}),
    ...verifiedFacade[p.id]}
}

function snap(id,x,z){Object.assign(nodes.get(id),{x,z})}
snap('d1-in',4.8,-110)
snap('d2-in',7.1,-95)
snap('d15-in',-19,.5)
snap('D15a',-19,4)
snap('hall-in',-58,25)

const food=byId.get('canteen')
const a=food.angle*Math.PI/180, u=food.asset.doorOffset, v=food.d/2+2.2
const door={x:+(food.x+Math.cos(a)*u+Math.sin(a)*v).toFixed(3),
            z:+(food.z-Math.sin(a)*u+Math.cos(a)*v).toFixed(3)}
const forecourt={...nodes.get('canteen-in'),id:'canteen-forecourt'}
scene.nodes.push(forecourt)
nodes.set(forecourt.id,forecourt)
snap('canteen-in',door.x,door.z)
const xy=({x,z})=>({x,z})
for (const e of scene.edges) {
  if(e.a==='canteen-in')e.a=forecourt.id
  if(e.b==='canteen-in')e.b=forecourt.id
  if(!e.geometry)continue
  e.geometry[0]=xy(nodes.get(e.a))
  e.geometry[e.geometry.length-1]=xy(nodes.get(e.b))
}
scene.edges.push({id:'canteen-door-spur',a:forecourt.id,b:'canteen-in',open:true,stairs:false,width:2.10,
  geometry:[xy(forecourt),door],evidence:'GIS 显示南侧广场与临路主立面相接，门洞位置为场景估计'})
fs.writeFileSync(new URL('scene.json',base),JSON.stringify(scene,null,2)+'\n')
