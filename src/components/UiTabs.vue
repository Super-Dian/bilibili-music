<script lang="ts" setup>
interface TabItem {
  key: string;
  title: string;
}

withDefaults(
  defineProps<{
    activeKey?: string;
    tabs?: TabItem[];
  }>(),
  {
    activeKey: "",
    tabs: () => [],
  },
);

defineEmits(["update:activeKey", "change"]);
</script>

<template>
  <div class="ui-tabs">
    <div class="ui-tabs-nav">
      <div
        v-for="tab in tabs"
        :key="tab.key"
        :class="['ui-tabs-tab', activeKey === tab.key && 'ui-tabs-tab-active']"
        @click="
          $emit('update:activeKey', tab.key);
          $emit('change', tab.key);
        "
      >
        {{ tab.title }}
      </div>
    </div>
    <div class="ui-tabs-content">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.ui-tabs {
  width: 100%;
}

.ui-tabs-nav {
  display: flex;
  border-bottom: 1px solid #e3e5e7;
  margin-bottom: 16px;
}

.ui-tabs-tab {
  padding: 12px 16px;
  cursor: pointer;
  color: #666;
  font-size: 14px;
  border-bottom: 2px solid transparent;
  transition: all 0.2s ease;
}

.ui-tabs-tab:hover {
  color: #00aeec;
}

.ui-tabs-tab-active {
  color: #00aeec;
  border-bottom-color: #00aeec;
}

.ui-tabs-content {
  min-height: 100px;
}
</style>

<style>
/* 深色模式 */
body[arco-theme="dark"] .ui-tabs-nav,
body[data-theme="dark"] .ui-tabs-nav {
  border-bottom-color: #444;
}

body[arco-theme="dark"] .ui-tabs-tab,
body[data-theme="dark"] .ui-tabs-tab {
  color: #999;
}

body[arco-theme="dark"] .ui-tabs-tab-active,
body[data-theme="dark"] .ui-tabs-tab-active {
  color: #00aeec;
}
</style>
