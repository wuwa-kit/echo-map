<script setup lang="ts">
defineProps<{ url: string }>()
</script>

<template>
  <img :src="url" class="object-contain" />
</template>
