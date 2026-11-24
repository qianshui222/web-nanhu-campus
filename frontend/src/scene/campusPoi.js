import * as T from 'three'
export const POI_LAYER=2
const scaleKeys=['complex','canteen','library','track','gate','hall','east','west']
const rect=(x,y,w,h)=>({left:x-w/2,right:x+w/2,top:y-h/2,bottom:y+h/2})
const intersect=(a,b)=>a.left<b.right+5&&a.right>b.left-5&&a.top<b.bottom+5&&a.bottom>b.top-5

export function createPoi(world,places){
  const proxyGeometry=new T.BoxGeometry(), proxyMaterial=new T.MeshBasicMaterial()
  const proxies=[], anchors=new Map(), visible=new Set()
  const ray=new T.Raycaster(), projected=new T.Vector3(), heading=new T.Vector3()
  ray.layers.set(POI_LAYER)
  for(const place of places){
    const p=new T.Mesh(proxyGeometry,proxyMaterial)
    p.position.set(place.x,Math.max(place.h*.5,1.0),place.z)
    p.rotation.y=T.MathUtils.degToRad(place.angle)
    p.scale.set(Math.max(place.w,3.1),Math.max(place.h,2),Math.max(place.d,3.1))
    p.layers.set(POI_LAYER)
    p.userData.place=place.id
    world.add(p)
    proxies.push(p)
    anchors.set(place.id,new T.Vector3(place.x,Math.max(place.h+2.0,2.6),place.z))
  }
  world.updateMatrixWorld(true)
  function actualAnchor(id,group){
    const bounds=new T.Box3().setFromObject(group)
    if(bounds.isEmpty())return
    const point=bounds.getCenter(new T.Vector3())
    point.y=bounds.max.y+1.45
    anchors.set(id,point)
  }
  function setLayers(ids){visible.clear();ids.forEach(id=>visible.add(id))}
  function pick(pointer,camera){
    ray.setFromCamera(pointer,camera)
    return ray.intersectObjects(proxies.filter(o=>visible.has(o.userData.place)),false)[0]?.object.userData.place??''
  }
  function layout(host,container,camera,{selected,hover,route,near}){
    const view=host.getBoundingClientRect(), mobile=view.width<550
    const w=view.width,h=view.height, cap=mobile?(near?6:4):(near?12:7)
    const reserved=[...host.closest('.map-shell').querySelectorAll('.view-controls,.paper-intro,.context,.minimap,.route-strip,.render-metrics,.walk-hint')]
      .map(el=>el.getBoundingClientRect()).filter(r=>r.width&&r.height)
      .map(r=>({left:r.left-view.left,right:r.right-view.left,top:r.top-view.top,bottom:r.bottom-view.top}))
    const priority=id=>id===selected?100:id===hover?90:id===route?85:(scaleKeys.includes(id)?30-scaleKeys.indexOf(id):0)
    const blockers=proxies.filter(o=>visible.has(o.userData.place))
    let count=0
    const elements=[...container.children].sort((a,b)=>priority(b.dataset.place)-priority(a.dataset.place))
    for(const el of elements){
      const id=el.dataset.place, key=priority(id), anchor=anchors.get(id)
      let state='hidden'
      if(anchor&&count<cap&&(near||key>0)){
        projected.copy(anchor).project(camera)
        const x=(projected.x+1)*w*.5,y=(1-projected.y)*h*.5
        if(projected.z>=-1&&projected.z<=1&&Math.abs(projected.x)<1&&Math.abs(projected.y)<1){
          heading.copy(anchor).sub(camera.position)
          const depth=heading.length()
          ray.set(camera.position,heading.normalize())
          ray.far=Math.max(0,depth-1.8)
          const occluded=key<85&&ray.intersectObjects(blockers,false).some(h=>h.object.userData.place!==id)
          const bw=el.offsetWidth,bh=el.offsetHeight
          const fit=occluded?null:[0,-24,24,-47,47].map(d=>y+d).find(at=>{
            const b=rect(x,at,bw,bh)
            return b.left>=4&&b.right<=w-4&&b.top>=4&&b.bottom<=h-4&&reserved.every(other=>!intersect(b,other))
          })
          if(fit!=null){
            state=id===selected?'selected':id===hover?'hovered':'compact'
            reserved.push(rect(x,fit,bw,bh))
            el.style.transform='translate3d('+x+'px,'+fit+'px,0) translate(-50%,-50%)'
            count++
          }
        }
      }
      el.dataset.poiState=state
      el.style.visibility=state==='hidden'?'hidden':'visible'
      el.tabIndex=state==='hidden'?-1:0
    }
    ray.far=Infinity
  }
  return {actualAnchor,setLayers,pick,layout}
}
