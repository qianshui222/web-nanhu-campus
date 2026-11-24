<script setup>
import {computed} from 'vue'
import {campusDateLabel,weatherName} from '../scene/campusEnvironment.js'
const props=defineProps({ env:Object })
const emit=defineEmits(['close'])
const weather=computed(()=>props.env.report.value)
const solar=computed(()=>props.env.state.value.sun)
const conditions={clear:'晴',cloudy:'阴',rain:'雨',snow:'雪',missing:'字段缺失'}
const presets=[['清晨','2026-11-23T06:55'],['白天','2026-11-23T12:30'],['黄昏','2026-11-23T17:25'],['夜间','2026-11-23T23:00']]
function useTime(value){props.env.preview.value=true;props.env.previewTime.value=value}
</script>
<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <section class="modal" role="dialog" aria-modal="true" aria-label="校园环境">
      <button class="close" aria-label="关闭环境" @click="emit('close')">×</button>
      <span class="eyebrow">武汉 · Asia/Shanghai</span><h2>校园环境</h2>
      <p><strong>{{ campusDateLabel(env.displayed.value) }}</strong> · {{ env.preview.value?'测试预览':'现实同步' }}</p>
      <dl class="services">
        <dt>天气</dt><dd>{{ weather?.state==='unavailable'?'暂不可用':weatherName(weather?.current?.code) }}
          {{ weather?.current?.temperature!=null?weather.current.temperature+' °C':'' }}
          {{weather?.state==='stale'?' · 缓存已过期':''}}</dd>
        <dt>气象有效时间</dt><dd>{{ campusDateLabel(weather?.current?.validAt) }}</dd>
        <dt>上次拉取</dt><dd>{{ campusDateLabel(weather?.fetchedAt) }}</dd>
        <dt>云量</dt><dd>{{ weather?.current?.cloud!=null?weather.current.cloud+'%':'未知' }}</dd>
        <dt>降水 / 雪</dt><dd>{{ weather?.current?.precipitation!=null?weather.current.precipitation+' mm':'未知' }}
          / {{ weather?.current?.snowfall!=null?weather.current.snowfall+' cm':'未知' }}</dd>
        <dt>太阳高度与方位</dt><dd v-if="solar">{{ (solar.altitude*180/Math.PI).toFixed(1) }}° /
          {{ (solar.bearing*180/Math.PI).toFixed(1) }}°</dd><dd v-else>等待校时</dd>
      </dl>
      <p class="muted" v-if="weather?.source?.startsWith('测试')||weather?.state==='preview'">当前显示测试天气。灯光为场景模拟。</p>
      <p class="muted" v-else>气象数据由 <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> 提供，灯光为场景模拟。</p>
      <details open class="environment-preview">
        <summary>昼夜与天气测试</summary>
        <label class="check"><input type="checkbox" v-model="env.preview.value"> 启用测试预览</label>
        <div v-if="env.preview.value" class="stack">
          <label>测试时间（北京）<input type="datetime-local" v-model="env.previewTime.value"></label>
          <div class="actions"><button v-for="[label,time] in presets" :key="time" @click="useTime(time)">{{ label }}</button></div>
          <label>测试天气<select v-model="env.previewKind.value">
            <option v-for="(label,id) in conditions" :key="id" :value="id">{{ label }}</option></select></label>
        </div>
      </details>
    </section>
  </div>
</template>
