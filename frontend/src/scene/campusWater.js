import * as T from 'three'
import { theme } from './campusTheme.js'

function shorelineTexture(points){
  const size=192
  const minX=Math.min(...points.map(p=>p.x)), minZ=Math.min(...points.map(p=>p.z))
  const width=Math.max(.001,Math.max(...points.map(p=>p.x))-minX)
  const depth=Math.max(.001,Math.max(...points.map(p=>p.z))-minZ)
  const values=new Uint8Array(size*size)
  const segments=points.map((a,i)=>{
    const b=points[(i+1)%points.length], dx=b.x-a.x,dz=b.z-a.z
    return {a,dx,dz,length:dx*dx+dz*dz}
  })
  for(let row=0;row<size;row++)for(let col=0;col<size;col++){
    const x=minX+width*(col+.5)/size,z=minZ+depth*(row+.5)/size
    let nearest=18
    for(const {a,dx,dz,length} of segments){
      const t=length?T.MathUtils.clamp(((x-a.x)*dx+(z-a.z)*dz)/length,0,1):0
      nearest=Math.min(nearest,Math.hypot(x-a.x-t*dx,z-a.z-t*dz))
    }
    values[row*size+col]=Math.round(nearest/18*255)
  }
  const map=new T.DataTexture(values,size,size,T.RedFormat)
  map.minFilter=T.LinearFilter
  map.magFilter=T.LinearFilter
  map.needsUpdate=true
  return {map,range:new T.Vector4(minX,minZ,width,depth)}
}

export function campusWater(points){
  const contour=new T.Shape(points.map(({x,z})=>new T.Vector2(x,-z)))
  const geometry=new T.ShapeGeometry(contour)
  geometry.rotateX(-Math.PI/2)
  const {map,range}=shorelineTexture(points)
  const uniforms={
    lakeDistance:{value:map},lakeRange:{value:range},lakeTime:{value:0},lakeDetail:{value:.5},
    lakeDeep:{value:new T.Color(theme.deep)},lakeShallow:{value:new T.Color(theme.shallow)}
  }
  const material=new T.MeshStandardMaterial({roughness:.49,metalness:.07})
  material.userData.ownedTextures=[map]
  material.customProgramCacheKey=()=> 'nanhu-water-v1'
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms)
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 lakePosition;')
      .replace('#include <project_vertex>','lakePosition=(modelMatrix*vec4(transformed,1.0)).xz;\n#include <project_vertex>')
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      varying vec2 lakePosition;
      uniform sampler2D lakeDistance;
      uniform vec4 lakeRange;
      uniform float lakeTime, lakeDetail;
      uniform vec3 lakeDeep, lakeShallow;`)
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float edge=texture2D(lakeDistance,(lakePosition-lakeRange.xy)/lakeRange.zw).r;
      float crosswave=sin(lakePosition.x*.57+lakePosition.y*.24+lakeTime*.95)
                  *sin(lakePosition.y*.82-lakePosition.x*.18-lakeTime*.66);
      float ripple=sin(lakePosition.x*.33-lakePosition.y*.52+lakeTime*.58+crosswave*.55);
      float strand=(1.0-smoothstep(.02,.12,edge))*smoothstep(.68,1.0,ripple)*.15;
      diffuseColor.rgb=mix(lakeShallow,lakeDeep,smoothstep(.00,.83,edge));
      diffuseColor.rgb*=.97+ripple*.037+crosswave*.025*lakeDetail;
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.66,.79,.74),strand);
    `)
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_begin>',`#include <normal_fragment_begin>
      normal=normalize(normal+vec3(crosswave,ripple,0.0)*lakeDetail*.040);
    `)
  }
  const water=new T.Mesh(geometry,material)
  water.position.y=.365
  water.receiveShadow=true
  water.userData.tick=(seconds,quality,weather)=>{
    uniforms.lakeTime.value=seconds
    uniforms.lakeDetail.value=quality*(weather?.rain>0?1.22:1)
  }
  return water
}
