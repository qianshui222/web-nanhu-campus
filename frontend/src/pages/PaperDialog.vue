<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'

defineProps({ title: String, sheet: Boolean })
defineEmits(['close'])
const dialog = ref(null)
onMounted(() => dialog.value.showModal())
onBeforeUnmount(() => dialog.value.close())

function backdrop(event) {
  if (event.target === dialog.value) dialog.value.close()
}
</script>

<template>
  <dialog ref="dialog" class="paper-dialog" :class="{ 'paper-sheet': sheet }"
    :aria-label="title" @click="backdrop" @close="$emit('close')">
    <section class="paper-dialog-content">
      <div class="paper-dialog-head">
        <h2>{{ title }}</h2>
        <button type="button" class="paper-dismiss" :aria-label="'关闭' + title" @click="dialog.close()">×</button>
      </div>
      <slot />
    </section>
  </dialog>
</template>
