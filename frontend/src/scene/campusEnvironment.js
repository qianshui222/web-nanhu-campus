import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import SunCalc from 'suncalc'
import { api } from '../store.js'

export const zone='Asia/Shanghai'
const display=new Intl.DateTimeFormat('zh-CN',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'})
export const campusDateLabel=value=>value==null?'时间未知':display.format(new Date(value))
export const previewWeather={
  clear:{code:0,cloud:9,precipitation:0,temperature:22,visibility:24000},
  cloudy:{code:3,cloud:99,precipitation:0,temperature:19,visibility:16000},
  rain:{code:63,cloud:93,precipitation:3.8,rain:3.8,temperature:17,visibility:4200},
  snow:{code:73,cloud:88,precipitation:1.5,snowfall:1.6,temperature:-1,visibility:2600},
  missing:{code:null,cloud:null,precipitation:null,temperature:null}
}
export function sunDirection(now,latitude,longitude) {
  const {altitude,azimuth}=SunCalc.getPosition(new Date(now),latitude,longitude)
  const bearing=(azimuth+Math.PI+Math.PI*2)%(Math.PI*2)
  return {altitude,bearing,x:Math.sin(bearing)*Math.cos(altitude),y:Math.sin(altitude),z:-Math.cos(bearing)*Math.cos(altitude)}
}

export function useCampusEnvironment(){
  const now=ref(null), clock=ref(null), weather=ref(null), preview=ref(false)
  const previewTime=ref('2026-11-23T12:30'), previewKind=ref('clear')
  let offset=0, base=0, timer, syncTimer, weatherTimer
  function tick(){if(clock.value)now.value=base+performance.now()-offset}
  async function sync(){
    const started=performance.now()
    try{
      const data=await api('/environment/time')
      offset=(started+performance.now())/2
      base=Date.parse(data.now)
      clock.value=data
      tick()
    }catch{ /* Retain the last server-calibrated clock while disconnected. */ }
  }
  async function refreshWeather(){
    try{weather.value=await api('/environment/weather')}
    catch{
      weather.value=weather.value?.current?{...weather.value,state:'stale'}:{state:'unavailable',source:'Open-Meteo'}
    }
  }
  function resume(){if(!document.hidden){sync();refreshWeather()}}
  onMounted(()=>{
    sync();refreshWeather()
    timer=setInterval(tick,1000)
    syncTimer=setInterval(sync,5*60_000)
    weatherTimer=setInterval(refreshWeather,5*60_000)
    document.addEventListener('visibilitychange',resume)
  })
  onBeforeUnmount(()=>{
    clearInterval(timer);clearInterval(syncTimer);clearInterval(weatherTimer)
    document.removeEventListener('visibilitychange',resume)
  })
  const displayed=computed(()=>{
    const candidate=Date.parse(previewTime.value+'+08:00')
    return preview.value&&Number.isFinite(candidate)?candidate:now.value
  })
  const sun=computed(()=>displayed.value==null||!clock.value?null:
    sunDirection(displayed.value,clock.value.latitude,clock.value.longitude))
  const report=computed(()=>preview.value?{state:'preview',source:'受控预览',current:previewWeather[previewKind.value]}:weather.value)
  const state=computed(()=>({sun:sun.value,weather:report.value?.current,preview:preview.value}))
  return {displayed,preview,previewTime,previewKind,report,state,refreshWeather}
}
export function weatherName(code){
  if(code==null)return '天气未知'
  if(code===0)return '晴'
  if(code<4)return '多云 / 阴'
  if([45,48].includes(code))return '雾'
  if((code>=71&&code<=77)||[85,86].includes(code))return '雪'
  if(code>=95)return '雷雨'
  return '雨 / 雨夹雪'
}
