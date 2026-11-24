import * as T from 'three'
import { surfaces, theme } from './campusTheme.js'

const shadow=new T.Color(theme.shadow), bounce=new T.Color(theme.bounce)
const importedRoles={
  form:'building',relief:'trim',glaze:'glass',glowing:'glowing'
}
export function campusLightingMaterial(material,role) {
  if(!material.isMeshStandardMaterial || material.userData.campusRole)return material
  material.userData.campusRole=role
  material.customProgramCacheKey=()=>role==='grass'?'campus-grass-v1':'campus-light-v1'
  material.onBeforeCompile=shader=>{
    shader.uniforms.campusShadow={value:shadow}
    shader.uniforms.campusBounce={value:bounce}
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 campusPosition;')
      .replace('#include <project_vertex>',`
vec4 campusVertex = vec4(transformed,1.0);
#ifdef USE_INSTANCING
  campusVertex = instanceMatrix * campusVertex;
#endif
campusPosition = (modelMatrix * campusVertex).xyz;
#include <project_vertex>`)
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      varying vec3 campusPosition;
      uniform vec3 campusShadow;
      uniform vec3 campusBounce;`)
    if(role==='grass'){
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        float fieldVariation = sin(campusPosition.x*.045)*cos(campusPosition.z*.038);
        diffuseColor.rgb *= .96 + fieldVariation*.055;
      `)
    }
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
      float directWeight=dot(reflectedLight.directDiffuse, vec3(.2126,.7152,.0722));
      float diffuseWeight=dot(reflectedLight.directDiffuse+reflectedLight.indirectDiffuse, vec3(.2126,.7152,.0722));
      float shade=1.0-smoothstep(.18,.70,directWeight/max(.001,diffuseWeight));
      float nearGround=1.0-smoothstep(.35,8.0,campusPosition.y);
      outgoingLight=mix(outgoingLight, outgoingLight*mix(vec3(1.0),campusShadow,.31), shade*.68);
      outgoingLight += reflectedLight.indirectDiffuse*campusBounce*nearGround*.095;
      #include <opaque_fragment>`)
  }
  return material
}
export function createCampusMaterial(key) {
  const [role,color,roughness]=surfaces[key]??['paint',key,.87]
  return campusLightingMaterial(new T.MeshStandardMaterial({color,roughness,flatShading:true}),role)
}
export function importedCampusMaterial(material,role,unmatched) {
  const semantic=importedRoles[role] ?? (material.name==='nanhu_lettering'?'lettering':null)
  if(!semantic){unmatched.add(material.name || '(unnamed)');return material}
  return campusLightingMaterial(material,semantic)
}
export const semanticColor=key=>surfaces[key]?.[1]??key
