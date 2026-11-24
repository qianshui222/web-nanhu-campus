<script setup>
defineProps({ icon: String, active: Boolean, disabled: Boolean })
</script>

<template>
  <button type="button" class="paper-action" :class="{ 'paper-action-active': active }" :disabled="disabled">
    <svg class="paper-bubble" viewBox="0 0 147 53" preserveAspectRatio="none" aria-hidden="true">
      <path d="M24 4C12 4 4 10 4 22s9 21 28 22l24 1 1 5 12-5 51-1c15-1 23-7 23-19s-8-20-24-21C91 2 51 3 24 4Z"/>
    </svg>
    <svg class="paper-action-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path v-if="icon==='walk'" d="M14 3a1.7 1.7 0 1 1-3.4 0A1.7 1.7 0 0 1 14 3ZM11 8l-2 6 4 3 1 5M9 14l-2 5-4 2M11 8l4 5 5-1M11 8l-4 1-3 4"/>
      <path v-else-if="icon==='place'" d="M12 22s7-7 7-13a7 7 0 0 0-14 0c0 6 7 13 7 13Z M15 9a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/>
      <path v-else d="M12 6C9 3 5 3 2 4v15c4-1 7-1 10 2 3-3 6-3 10-2V4c-3-1-7-1-10 2v15M5 8l4 1m6 0 4-1M5 12l4 1m6 0 4-1"/>
    </svg>
    <span><slot /></span>
  </button>
</template>
