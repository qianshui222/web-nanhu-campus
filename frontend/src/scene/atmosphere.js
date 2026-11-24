import * as T from 'three'
import { theme } from './campusTheme.js'
const day=new T.Color(theme.sky), dusk=new T.Color(theme.twilight), night=new T.Color(theme.night)
const gray=new T.Color(theme.cloud), cold=new T.Color('#b1b7d2'), warm=new T.Color(theme.indoor)
const noon=new T.Color(theme.sunlight), wetRoad=new T.Color('#858477')
const mix=T.MathUtils.lerp
const ramp=T.MathUtils.smoothstep

export function atmosphere(scene){
  const root=new T.Group(), cloudRoot=new T.Group()
  root.add(cloudRoot)
  const cloudGeo=new T.IcosahedronGeometry(1,0)
  const cloudMaterial=new T.MeshBasicMaterial({color:'#e2eaf0',transparent:true,opacity:0,depthWrite:false})
  for(const [x,y,z,w,h,d] of [[-238,105,-210,48,7,17],[198,116,-215,51,8,18],[-224,117,127,40,7,14],[55,143,-233,53,8,17]]){
    for(let i=0;i<3;i++){
      const cloud=new T.Mesh(cloudGeo,cloudMaterial)
      cloud.position.set(x+(i-1)*w*.52,y+i%2*3,z+i*5)
      cloud.scale.set(w,h+i,d)
      cloudRoot.add(cloud)
    }
  }
  const count=420, drops=new Float32Array(count*3), streaks=new Float32Array(count*6)
  for(let i=0;i<count;i++){
    drops[3*i]=(Math.random()-.5)*156
    drops[3*i+1]=Math.random()*72
    drops[3*i+2]=(Math.random()-.5)*142
  }
  const dropGeo=new T.BufferGeometry().setAttribute('position',new T.BufferAttribute(drops,3))
  const rainGeo=new T.BufferGeometry().setAttribute('position',new T.BufferAttribute(streaks,3))
  const snow=new T.Points(dropGeo,new T.PointsMaterial({color:'#f1f7ff',size:.55,transparent:true,opacity:0,depthWrite:false}))
  const rain=new T.LineSegments(rainGeo,new T.LineBasicMaterial({color:'#c9dce3',transparent:true,opacity:0,depthWrite:false}))
  rain.frustumCulled=false
  snow.frustumCulled=false
  root.add(snow,rain)
  const lamps=[[68,4,-28],[-16,4,-26],[14,4,-112]].map(([x,y,z])=>{
    const glow=new T.PointLight('#f3c780',0,25,1.5)
    glow.position.set(x,y,z);root.add(glow)
    return glow
  })
  scene.add(root)
  let cloud=0,wet=0,flake=0,water=0,initialized=false
  const skyColor=new T.Color(), lightColor=new T.Color()
  function tick(environment,dt,camera,renderer,key,fill,models,viewDistance){
    const sample=environment?.weather
    const code=sample?.code
    const rainy=code!=null&&((code>=51&&code<=67)||(code>=80&&code<=82)||code>=95)
    const snowy=code!=null&&((code>=71&&code<=77)||[85,86].includes(code))
    const alpha=initialized?1-Math.exp(-dt*1.7):1
    initialized=true
    cloud=mix(cloud,(sample?.cloud??0)/100,alpha)
    wet=mix(wet,rainy||sample?.rain>0?Math.min(1,.17+(sample?.rain??sample?.precipitation??.4)*.17):0,alpha)
    flake=mix(flake,snowy||sample?.snowfall>0?Math.min(1,.22+(sample?.snowfall??.4)*.30):0,alpha)
    water=mix(water,Math.max(wet,flake*.28),alpha)
    const height=environment?.sun?.altitude??.55
    const daylight=ramp(height,-.145,.19), twilight=(1-ramp(Math.abs(height),.02,.38))*.72
    const nightStrength=1-ramp(height,-.16,.035)
    skyColor.copy(night).lerp(day,daylight).lerp(dusk,twilight*(1-cloud*.72)).lerp(gray,cloud*daylight*.53)
    renderer.setClearColor(skyColor)
    scene.fog.color.copy(skyColor)
    const vis=sample?.visibility
    const haze=vis==null?0:1-ramp(vis,500,6200)
    const displayDepth=Math.max(0,viewDistance-235)
    scene.fog.near=displayDepth+mix(455,115,haze)
    scene.fog.far=displayDepth+mix(890,340,haze)
    key.intensity=.022+2.42*ramp(height,-.025,.32)*(1-cloud*.74)
    fill.intensity=.68+1.05*daylight*(1-cloud*.30)
    key.color.copy(lightColor.copy(warm).lerp(noon,ramp(height,.035,.50)))
    fill.color.copy(lightColor.copy(cold).lerp(day,daylight))
    cloudRoot.visible=cloud>.16&&daylight>.12
    cloudMaterial.opacity=(cloud-.10)*.45*daylight
    const pane=models?.material('#84a1a0'), bulb=models?.material('#e8debb')
    if(pane){pane.emissive.set('#efb75e');pane.emissiveIntensity=nightStrength*.94}
    if(bulb){bulb.emissive.set('#ffc26f');bulb.emissiveIntensity=nightStrength*1.65}
    for(const lamp of lamps){lamp.intensity=nightStrength*28;lamp.visible=nightStrength>.04}
    const asphalt=models?.material('#697a78')
    if(asphalt){asphalt.roughness=.88-water*.44;asphalt.color.set(models.color('#697a78')).lerp(wetRoad,water*.55)}
    const stone=models?.material('#c1baa1')
    if(stone){stone.roughness=.9-water*.34;stone.color.set(models.color('#c1baa1')).lerp(wetRoad,water*.35)}
    snow.visible=flake>.025
    rain.visible=wet>.025
    snow.material.opacity=flake*.85
    rain.material.opacity=wet*.63
    dropGeo.setDrawRange(0,Math.round(count*flake))
    rainGeo.setDrawRange(0,Math.round(count*wet)*2)
    if(snow.visible||rain.visible){
      for(let i=0;i<count;i++){
        const j=i*3,k=i*6
        drops[j]+=(rain.visible?4:1.8)*dt
        if(drops[j]>78)drops[j]-=156
        drops[j+1]-=(rain.visible?35:8)*dt
        if(drops[j+1]<0)drops[j+1]+=72
        const x=drops[j],y=drops[j+1],z=drops[j+2]
        streaks.set([x,y,z,x-.55,y+2.15,z],k)
      }
      for(const object of [rain,snow])object.position.set(camera.position.x,Math.max(0,camera.position.y-40),camera.position.z)
      dropGeo.attributes.position.needsUpdate=true
      rainGeo.attributes.position.needsUpdate=true
    }
    return nightStrength
  }
  function dispose(){
    root.removeFromParent()
    cloudGeo.dispose();cloudMaterial.dispose()
    dropGeo.dispose();rainGeo.dispose();rain.material.dispose();snow.material.dispose()
  }
  return {tick,dispose}
}
