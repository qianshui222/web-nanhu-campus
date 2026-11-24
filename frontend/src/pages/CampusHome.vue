<script setup>
import { computed, ref } from 'vue'
import { useCampus } from '../store.js'

defineEmits(['space'])
const store = useCampus()
const selectedGroup = ref('all')
const groups = [
  { id: 'all', name: '全部' },
  { id: 'study', name: '教学与阅读' },
  { id: 'life', name: '校园生活' },
  { id: 'sport', name: '体育运动' },
]
const featured = [
  { id: 'complex', group: 'study', label: '教学', photo: 'complex' },
  { id: 'library', group: 'study', label: '阅读', photo: 'library' },
  { id: 'canteen', group: 'life', label: '餐饮', photo: 'canteen' },
  { id: 'track', group: 'sport', label: '运动', photo: 'track' },
]
const cards = computed(() => featured.flatMap(card => {
  const place = store.places.find(p => p.id === card.id)
  return place && (selectedGroup.value === 'all' || card.group === selectedGroup.value)
    ? [{ ...card, name: place.name, description: place.description }] : []
}))
const guides = [
  { title: '步行漫游', text: '进入三维校园后选择「开始漫游」。用 WASD 或方向键移动，拖动改变视线；触屏可用屏幕方向键。', icon: 'M13 3a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM12 9l-3 6 5 2 2 5m-7-7-2 4-4 2m9-12 4 4 4-1' },
  { title: '查找与规划', text: '用「校园地点」搜建筑或设施。打开路径规划，设置起点、终点和途经点，查看估算步行距离。', icon: 'M12 22S5 15 5 9a7 7 0 0 1 14 0c0 6-7 13-7 13Zm0-10a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z' },
  { title: '调整视角', text: '拖动地图旋转，滚轮或双指缩放。迷路时可复位视角、切换北向俯视，或展开小地图定位。', icon: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm3 7-1 5-5 1 1-5 5-1Z' },
]
const questions = [
  { title: '需要登录才能浏览和导航吗？', text: '浏览三维地图、搜索地点和规划路线无需登录。想保存地点、路线或日程时，登录后可在个人空间查看。' },
  { title: '地图里的距离和入口能用来现场找路吗？', text: '步行距离是根据校园路网计算的估算值，入口和道路开放情况请以现场为准。发现偏差可从「校园地点」中的「地图纠错」提交反馈。' },
  { title: '手机运行三维页面卡顿怎么办？', text: '在三维页面的画质菜单中选择「均衡」。也可返回首页查看静态校园预览和地点介绍。' },
]
</script>

<template>
  <main id="home-content" class="campus-home" tabindex="-1">
    <section class="site-hero" aria-labelledby="site-title">
      <div class="site-container site-hero-grid">
        <div class="site-hero-copy">
          <p class="site-kicker">华中师范大学 · 南湖校区</p>
          <h1 id="site-title"><img src="/brand/nanhu-wordmark.svg" alt="南湖漫游" width="418" height="123"></h1>
          <p>从综合楼、图书馆到食堂与球场，<br>沿着校园步道，在地图上走一遍南湖。</p>
          <div class="site-actions">
            <RouterLink class="site-pill site-pill-primary" to="/campus">开始漫游 <span aria-hidden="true">↗</span></RouterLink>
            <RouterLink class="site-inline" :to="{path:'/',hash:'#places'}">探索校园地点 <span aria-hidden="true">↓</span></RouterLink>
          </div>
        </div>
        <figure class="site-hero-picture">
          <img src="/site-media/hero.webp" alt="南湖校区三维预览，湖泊、运动场及建筑群环绕校内步道" width="1280" height="710" fetchpriority="high">
          <figcaption><span aria-hidden="true"></span> 南湖校区 · 三维场景预览</figcaption>
        </figure>
      </div>
      <RouterLink class="site-scroll" :to="{path:'/',hash:'#about'}"><span aria-hidden="true">↓</span> 向下浏览</RouterLink>
    </section>

    <section id="about" class="site-section site-about" aria-labelledby="about-title">
      <div class="site-container site-about-grid">
        <div>
          <p class="site-kicker">认识校园</p>
          <h2 id="about-title">沿着步道，<br>认识南湖校区</h2>
          <p>南湖校区的教学和实验空间集中在南湖综合楼。图书馆分馆入口位于与综合楼相接的翼楼，从南侧广场可以辨认入口。</p>
          <p>食堂、宿舍和运动区域也收录在地图中。你可以按用途查找地点，也可以从校门出发，沿着校园步道依次查看。</p>
        </div>
        <figure class="site-about-figure">
          <img src="/site-media/intro.webp" alt="南湖三维校园里的教学建筑和南侧广场" width="960" height="620" loading="lazy">
          <figcaption>从三维校园观察教学区与广场</figcaption>
        </figure>
      </div>
    </section>

    <section id="places" class="site-section site-places" aria-labelledby="places-title">
      <div class="site-container">
        <div class="site-section-heading">
          <div><p class="site-kicker">校园地点</p><h2 id="places-title">今天想去哪里？</h2></div>
          <div class="site-filters" aria-label="地点分类">
            <button v-for="group in groups" :key="group.id" type="button" :aria-pressed="selectedGroup===group.id"
              @click="selectedGroup=group.id">{{ group.name }}</button>
          </div>
        </div>
        <p v-if="store.failure" class="site-places-status" role="status">{{ store.failure }} <button @click="store.loadScene()">重试</button></p>
        <p v-else-if="!store.snapshot" class="site-places-status" role="status">正在读取校园地点…</p>
        <div v-else class="site-place-grid">
          <article v-for="card in cards" :key="card.id" class="site-place-card">
            <img :src="'/site-media/'+card.photo+'.webp'" :alt="card.name+'的三维预览'" width="680" height="453" loading="lazy">
            <div class="site-place-body">
              <p class="site-place-label">{{ card.label }}</p>
              <h3>{{ card.name }}</h3>
              <p>{{ card.description }}</p>
              <RouterLink class="site-inline" :aria-label="'在地图中查看'+card.name" :to="{name:'campus',query:{place:card.id}}">
                在地图中查看 <span aria-hidden="true">↗</span>
              </RouterLink>
            </div>
          </article>
        </div>
      </div>
    </section>

    <section id="preview" class="site-section site-preview" aria-labelledby="preview-title">
      <div class="site-container site-preview-grid">
        <div>
          <p class="site-kicker">地图预览</p>
          <h2 id="preview-title">先看全貌，<br>再决定从哪儿出发</h2>
          <p>北向俯视可同时看到建筑、操场与湖面。进入三维校园后，点击地标即可查看详情和规划路线。</p>
          <ul class="site-legend" aria-label="地图图例">
            <li><i class="legend-water"></i> 湖面</li><li><i class="legend-green"></i> 绿地</li><li><i class="legend-road"></i> 步道</li>
          </ul>
          <RouterLink class="site-pill site-pill-dark" to="/campus">进入三维校园 <span aria-hidden="true">↗</span></RouterLink>
        </div>
        <figure class="site-preview-map">
          <img src="/site-media/map.webp" alt="南湖校区北向俯视图，展示环校园步道与建筑之间的位置关系" width="960" height="780" loading="lazy">
          <figcaption><strong aria-hidden="true">↑ N</strong> 北向俯视 · 静态预览</figcaption>
        </figure>
      </div>
    </section>

    <section id="guide" class="site-section site-guide" aria-labelledby="guide-title">
      <div class="site-container">
        <p class="site-kicker">使用指南</p>
        <h2 id="guide-title">第一次漫游</h2>
        <div class="site-guide-grid">
          <article v-for="item in guides" :key="item.title">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="item.icon"/></svg>
            <h3>{{ item.title }}</h3>
            <p>{{ item.text }}</p>
          </article>
        </div>
        <RouterLink class="site-inline" to="/campus">打开地图练习 <span aria-hidden="true">↗</span></RouterLink>
      </div>
    </section>

    <section class="site-section site-faq" aria-labelledby="faq-title">
      <div class="site-container site-faq-grid">
        <div><p class="site-kicker">出发之前</p><h2 id="faq-title">常见问题</h2></div>
        <div class="site-questions">
          <details v-for="item in questions" :key="item.title">
            <summary>{{ item.title }}</summary><p>{{ item.text }}</p>
          </details>
        </div>
      </div>
    </section>

    <footer class="site-footer">
      <div class="site-container">
        <div class="site-footer-grid">
          <div>
            <img src="/brand/nanhu-wordmark.svg" alt="南湖漫游" width="146" height="43">
            <p>华中师范大学南湖校区地图与导览。<br>大学 Web 程序设计课程项目。</p>
          </div>
          <nav aria-label="页脚导航">
            <RouterLink :to="{path:'/',hash:'#places'}">校园地点</RouterLink>
            <RouterLink to="/campus">三维校园地图</RouterLink>
            <RouterLink :to="{path:'/',hash:'#guide'}">使用指南</RouterLink>
            <button type="button" @click="$emit('space')">个人空间</button>
          </nav>
        </div>
        <p class="site-footer-note">校内道路与设施的实际情况以现场为准。</p>
      </div>
    </footer>
  </main>
</template>
