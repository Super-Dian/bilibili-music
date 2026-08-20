<script lang="ts" setup>
import { fromData } from "@/data";
import { onMounted, reactive } from "vue";
import Btn from "@/components/btn.vue";
import { getActiveDefaultRule } from "@/episode";

const emits = defineEmits(["next", "prev"]);
const covers = reactive<{ label: string; url?: string }[]>([]);

const cover = ref<string[]>([]);

onMounted(() => {
  covers.push({
    label: "视频封面",
    url: fromData.videoData?.pic,
  });

  if (fromData.data) {
    covers.push({
      label: "音乐封面",
      url: fromData.data?.mv_cover,
    });
  }
  covers.push({
    label: "Up主头像",
    url: fromData.videoData?.owner.face,
  });
  const url = covers?.[0]?.url;
  if (fromData.usedefaultconfig) {
    const defaultRule = getActiveDefaultRule();
    const coverLabel = defaultRule?.cover;
    const coverItem = covers.find((item) => item.label === coverLabel);
    if (coverItem && coverItem.url) {
      fromData.coverUrl = coverItem.url;
      cover.value = [coverItem.url];
      coverRecord.label = coverItem.label;
      next();
      return;
    }
    if (url) {
      fromData.coverUrl = url.toString();
      cover.value = [url];
      coverRecord.label = covers?.[0]?.label;
    } else {
      fromData.coverUrl = null;
      coverRecord.label = undefined;
    }
    next();
    return;
  }
  if (url) {
    fromData.coverUrl = url.toString();
    cover.value = [url];
    coverRecord.label = covers?.[0]?.label;
  }
});

const coverRecord = {
  label: undefined as string | undefined,
};

function next() {
  fromData.record.cover = coverRecord.label;
  emits("next");
}

function selectCover(url: string | undefined) {
  if (!url) return;
  fromData.coverUrl = url;
  cover.value = [url];
  coverRecord.label = covers.find((item) => item.url === url)?.label;
}
</script>

<template>
  <form @submit.prevent>
    <div class="cover-list">
      <div
        v-for="item in covers"
        :key="item.label"
        class="cover-item"
        :class="{ 'cover-item-checked': cover.includes(item.url || '') }"
        @click="selectCover(item.url)"
      >
        <div class="cover-checkbox">
          <div class="cover-checkbox-dot" v-if="cover.includes(item.url || '')" />
        </div>
        <div class="cover-content">
          <div class="cover-title">
            {{ item.label }}
          </div>
          <img class="cover-image" :src="item.url" />
        </div>
      </div>
    </div>

    <Btn @next="next" @prev="$emit('prev')" />
  </form>
</template>

<style scoped>
.cover-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
}

.cover-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  border: 1px solid #e3e5e7;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.cover-item:hover {
  border-color: #00aeec;
  background: #f5f5f5;
}

.cover-item-checked {
  border-color: #00aeec;
  background: #e6f7ff;
}

.cover-checkbox {
  width: 18px;
  height: 18px;
  border: 2px solid #c9ccd0;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 2px;
  transition: all 0.2s ease;
}

.cover-item-checked .cover-checkbox {
  background: #00aeec;
  border-color: #00aeec;
}

.cover-checkbox-dot {
  width: 10px;
  height: 10px;
  background: #fff;
  border-radius: 2px;
}

.cover-content {
  flex: 1;
}

.cover-title {
  font-size: 14px;
  font-weight: 500;
  color: #18191c;
  margin-bottom: 8px;
}

.cover-image {
  width: 100px;
  height: auto;
  border-radius: 6px;
  object-fit: cover;
}
</style>

<style>
/* 深色模式 */
body[arco-theme="dark"] .cover-item,
body[data-theme="dark"] .cover-item {
  border-color: #444;
  background: #2a2a2a;
}

body[arco-theme="dark"] .cover-item:hover,
body[data-theme="dark"] .cover-item:hover {
  background: #3a3a3a;
}

body[arco-theme="dark"] .cover-item-checked,
body[data-theme="dark"] .cover-item-checked {
  background: #173344;
  border-color: #00aeec;
}

body[arco-theme="dark"] .cover-checkbox,
body[data-theme="dark"] .cover-checkbox {
  border-color: #555;
}

body[arco-theme="dark"] .cover-title,
body[data-theme="dark"] .cover-title {
  color: #e0e0e0;
}
</style>
