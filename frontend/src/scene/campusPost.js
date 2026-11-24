import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'

export function overviewPost(renderer,scene,camera){
  const composer=new EffectComposer(renderer)
  const render=new RenderPass(scene,camera)
  const soften=new ShaderPass({
    uniforms:{tDiffuse:{value:null},pixel:{value:.001},strength:{value:.32}},
    vertexShader:'varying vec2 uvHere;void main(){uvHere=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:`uniform sampler2D tDiffuse;
      uniform float pixel,strength;
      varying vec2 uvHere;
      void main(){
        float mask=smoothstep(.27,.51,abs(uvHere.y-.50))*strength;
        vec2 offset=vec2(0.0,pixel*1.8);
        vec4 current=texture2D(tDiffuse,uvHere);
        vec4 adjacent=(texture2D(tDiffuse,uvHere-offset)+texture2D(tDiffuse,uvHere+offset))*.5;
        gl_FragColor=mix(current,adjacent,mask);
      }`
  })
  const output=new OutputPass()
  composer.addPass(render)
  composer.addPass(soften)
  composer.addPass(output)
  return {
    resize(w,h,dpr){composer.setPixelRatio(dpr);composer.setSize(w,h);soften.uniforms.pixel.value=1/(h*dpr)},
    render(){composer.render()},
    dispose(){soften.dispose();output.dispose();composer.dispose()}
  }
}
