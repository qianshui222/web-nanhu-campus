<script setup>
import {campusDateLabel} from '../scene/campusEnvironment.js'
defineProps({plan:Object})
</script>
<template>
  <section v-if="plan" class="itinerary-result" aria-label="时间行程结果">
    <strong>{{ plan.feasible?'预计符合截止时间':'当前条件下未能满足' }}</strong>
    <p>截止 {{ campusDateLabel(plan.deadline) }}<br>到达 {{ campusDateLabel(plan.arrival) }}</p>
    <ol class="tour-stops">
      <li v-for="(v,i) in plan.visits" :key="i">
        <b>{{ v.name }}</b><p>{{ campusDateLabel(v.arrival) }} 到<br>{{ campusDateLabel(v.departure) }} 离开 · 停 {{v.minutes}} 分钟</p>
        <span class="muted">{{v.openingStatus}}</span>
        <p v-if="plan.legs[i]">下一段估算 {{plan.legs[i].route.meters}} m · {{Math.ceil(plan.legs[i].route.seconds/60)}} 分钟</p>
      </li>
    </ol>
    <p class="muted">地图 v{{plan.revision}} · {{plan.weather.source}}
      {{plan.weather.forecast?.length ? campusDateLabel(plan.weather.forecast[0].validAt)+' 至 '+campusDateLabel(plan.weather.forecast.at(-1).validAt) : '无该时段预报'}}</p>
    <ul class="plan-notes"><li v-for="note in plan.notes" :key="note">{{ note }}</li></ul>
  </section>
</template>
