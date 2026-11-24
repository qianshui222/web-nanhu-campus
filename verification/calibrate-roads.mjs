import * as fs from 'node:fs'
const path=new URL('../backend/src/main/resources/',import.meta.url)
const scene=JSON.parse(fs.readFileSync(new URL('scene-v3.json',path)))
const nodes=Object.fromEntries(scene.nodes.map(n=>[n.id,n]))
// Coordinates read from the road-layer capture cropped at (240,235).
function fromGis(u,v){
  const dx=u+240-780, dy=v+235-535
  return {x:+((1.9*dx+1.65*dy)/6.02).toFixed(2),z:+((-dx+2.3*dy)/6.02).toFixed(2)}
}
const moved={
  B:[1026,189], C:[1008,216], D:[939,281], L:[866,347], Q:[792,340],
  P1:[670,312], S:[552,322], R2:[433,353], 'track-in':[379,341]
}
for(const [id,p] of Object.entries(moved))Object.assign(nodes[id],fromGis(...p))
const turns={
 'gate-in--A':[[917,125],[923,130]],
 'A--B':[[972,164],[1003,176],[1020,182]],
 'B--C':[[1022,197],[1015,209]],
 'C--D':[[983,235],[961,257]],
 'D--L':[[923,298],[901,321],[881,343]],
 'L--Q':[[843,349],[816,349],[803,347]],
 'Q--complex-in':[[801,329],[807,312],[829,284.5],[852,262],[870.5,249.5]],
 'Q--P':[[760,335],[727,325],[699,316],[682,312]],
 'P1--P':[[656,310],[629,299],[609,289],[599,278],[605,267]],
 'A--W':[[898,113],[856,98],[827,90],[801,88]],
 'J--K':[[481,223],[474,243]],
 'canteen-in--J':[[518,211],[501,204]],
 'P--W2':[[596,246],[568,235]],
 'K--H1':[[443,295],[436,310]],
 'H1--H2':[[443,321],[452,323]],
 'M--S':[[587,290],[572,307],[569,317],[563,321]],
 'X--court-in':[[316,282],[350,296],[386,311]],
 'R2--track-entry':[[428,347],[422,342]],
 'west-in--U':[[225,291],[206,310],[176,341],[157,355]]
}
// Preserve public road IDs even when a junction splits the mapped corridor.
Object.assign(scene.edges.find(e=>e.id==='H2--R'),{b:'R2'})
Object.assign(scene.edges.find(e=>e.id==='R--track-in'),{a:'R2',b:'R'})
Object.assign(scene.edges.find(e=>e.id==='P--W2'),{b:'canteen-in'})
const retired={
 'U--V':'操场西南角步行连续性未核实，停用历史西侧捷径',
 'd12-in--Z':'宿舍南侧道路接续未核实，停用历史断头段',
 'G--d11-in':'GIS 标注可定位宿舍，湖侧入口接续被建筑遮挡',
 'F--G':'GIS 无法确认湖侧通路绕过附属设施，停用历史连接',
 'PLJ--G':'GIS 无法确认湖侧支路，保留历史编号供反馈定位'
}
const marked=new Set(['complex-in','library-in','canteen-in','d15-in','d5-in','track-in','court-in'])
function coords(n){return {x:n.x,z:n.z}}
for(const e of scene.edges){
  const a=nodes[e.a],b=nodes[e.b]
  if (retired[e.id]) {
    e.open=false
    e.walkable=false
    e.evidence=retired[e.id]
    continue
  }
  e.geometry=[coords(a),...(turns[e.id]||[]).map(([u,v])=>fromGis(u,v)),coords(b)]
  e.width=['A--B','B--C','C--D','D--L','L--Q','Q--P','A--W','W--P','P--M','M--S','J--K','K--H1','H1--H2','H2--R','X--court-in'].includes(e.id)?4.1:
    e.a.endsWith('-in')||e.b.endsWith('-in')?1.45:2.3
  if(turns[e.id])e.evidence='官方 GIS 道路层地面线形人工描绘，宽度为场景估计'
  else if(marked.has(e.a)||marked.has(e.b))e.evidence='GIS 邻接路段的入口接入估计，门洞与无障碍状态待现场核实'
  else if(e.id==='H2--R'||e.id==='R--track-in')e.evidence='运动区域外侧分岔处拆边，共用 R2 路口'
  else if(e.a.endsWith('-in')||e.b.endsWith('-in'))e.evidence='既有入口接入点，门洞位置与开放条件待现场核实'
}
if(process.argv.includes('--write'))fs.writeFileSync(new URL('scene.json',path),JSON.stringify(scene,null,2)+'\n')
else console.log(JSON.stringify(scene))
