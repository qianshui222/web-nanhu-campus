import * as T from 'three'
import { importedCampusMaterial } from './campusMaterials.js'
import studio from '../../../modeling/studio-manifest.json'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

const draco = new DRACOLoader().setDecoderPath('/assets/decoders/draco/').setWorkerLimit(2)
const gltf = new GLTFLoader().setDRACOLoader(draco)
export const BUILDING_GRADE = .305
export const PICK_LAYER = 1
const detailRange = 118
const relativePath = /^\/assets\/campus\/(?:v[1-9][0-9]*|studio)\/[A-Za-z0-9_-]+\.glb$/
const studioAssets=new Map(studio.assets.map(a=>[a.buildingId,a]))

export function campusAssets(reflection) {
  const surfaces = new Map()
  const unmatched = new Set()
  const details = []
  const structural = []
  const temp = new T.Vector3()

  async function load(place, group, signal) {
  const alternate=studioAssets.get(place.id)
    const path=alternate?.standard===place.asset.model?alternate.model:place.asset.model
    if (!relativePath.test(path) || !path.endsWith('/'+place.id+'.glb')) throw new Error('Model URL does not match the campus ID')
    const response = await fetch(path,{signal})
    if (!response.ok) throw new Error('HTTP '+response.status)
    const {scene} = await gltf.parseAsync(await response.arrayBuffer(), '')
    if (signal.aborted) {
      scene.traverse(mesh=>{ if(mesh.isMesh){mesh.geometry.dispose();mesh.material.dispose()} })
      return false
    }
    const root = scene.children.find(node => node.userData.buildingId === place.id)
    const size = root?.userData.dimensions
    const bounds = new T.Box3().setFromObject(scene)
    if (!Array.isArray(size) || size.length!==3 || size.some(s=>!Number.isFinite(s)||s<=0) || bounds.isEmpty()) {
      scene.traverse(mesh=>{ if(mesh.isMesh){mesh.geometry.dispose();mesh.material.dispose()} })
      throw new Error('Invalid local dimensions or buildingId')
    }
    scene.scale.set(place.w/size[0],place.h/size[1],place.d/size[2])
    const originals = new Set()
    group.position.y=BUILDING_GRADE
    group.add(scene)
    scene.traverse(mesh=>{
      if(!mesh.isMesh) return
      const role=mesh.userData.surface
      importedCampusMaterial(mesh.material,role,unmatched)
      const materialKey=mesh.material.name
      const shared=surfaces.get(materialKey)
      if(shared) {
        if(shared!==mesh.material) originals.add(mesh.material)
        mesh.material=shared
      } else {
        if(reflection&&(role==='glaze'||role==='glowing')){
          mesh.material.envMap=reflection
          mesh.material.envMapIntensity=.22
        }
        surfaces.set(materialKey,mesh.material)
      }
      mesh.receiveShadow=true
      mesh.castShadow=role==='form'
      mesh.layers.enable(PICK_LAYER)
      if(role==='relief') {
        details.push({mesh,group})
        mesh.layers.disable(0)
      } else structural.push({place,mesh})
    })
    originals.forEach(m=>m.dispose())
    return true
  }

  function batch(world) {
    world.updateMatrixWorld(true)
    const clusters = new Map()
    for(const {place,mesh} of structural){
      const area = place.z < -65 ? 'north' : place.z > 19 ? 'south' : 'center'
      const key = [area,place.type,mesh.material.name,mesh.castShadow].join('|')
      if(!clusters.has(key)) clusters.set(key,{type:place.type,meshes:[]})
      clusters.get(key).meshes.push(mesh)
    }
    const layers = new Map()
    for(const {type,meshes} of clusters.values()) {
      if(meshes.length<2) continue
      const pieces=meshes.map(mesh=>mesh.geometry.clone().applyMatrix4(mesh.matrixWorld))
      const combined=mergeGeometries(pieces)
      pieces.forEach(g=>g.dispose())
      if(!combined) continue
      combined.computeBoundingSphere()
      const layer = layers.get(type) ?? new T.Group()
      layers.set(type,layer)
      if(!layer.parent)world.add(layer)
      const merged=new T.Mesh(combined,meshes[0].material)
      merged.castShadow=meshes[0].castShadow
      merged.receiveShadow=true
      layer.add(merged)
      meshes.forEach(mesh=>mesh.layers.set(PICK_LAYER))
    }
    return layers
  }

  function update(camera, nightStrength) {
    for(const key of ['nanhu_glaze','nanhu_glowing']){
      const material=surfaces.get(key)
      if(material?.envMap)material.envMapIntensity=.22-nightStrength*.17
    }
    const warm=surfaces.get('nanhu_glowing')
    if(warm){
      warm.emissive.set('#ffd18a')
      warm.emissiveIntensity=nightStrength*.69
    }
    for(const {mesh,group} of details) {
      const close=camera.position.distanceToSquared(group.getWorldPosition(temp))<detailRange**2
      if(close)mesh.layers.enable(0)
      else mesh.layers.disable(0)
    }
  }
  return {load,batch,update,unmatched}
}
