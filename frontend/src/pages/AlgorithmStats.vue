<script setup>
defineProps({ result: Object })
const time = nanos => nanos < 1000 ? nanos+' ns' : (nanos/1000).toFixed(1)+' μs'
</script>

<template>
  <section class="algorithm-stats" v-if="result" aria-label="算法对比">
    <div class="section-head"><strong>算法实测</strong><span class="muted">地图 v{{ result.revision }}</span></div>
    <table>
      <thead><tr><th>算法</th><th>展开节点</th><th>估算长度</th><th>搜索耗时</th></tr></thead>
      <tbody>
        <tr v-for="[key,title] in [['dijkstra','Dijkstra'],['astar','A*']]" :key="key">
          <th scope="row">{{ title }}</th><td>{{ result[key].expanded }}</td>
          <td>{{ result[key].distance }} m</td><td>{{ time(result[key].nanos) }}</td>
        </tr>
      </tbody>
    </table>
    <p class="muted">同一版道路图、入口与通行条件。节点数为逐段展开数之和，耗时只含搜索，微秒级测量会波动。地图展示 A* 结果。</p>
  </section>
</template>
