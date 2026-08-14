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
    <div style="display: flex; flex-direction: column; gap: 12px">
      <div
        v-for="item in covers"
        :key="item.label"
        class="custom-checkbox-card"
        :class="{ 'custom-checkbox-card-checked': cover.includes(item.url || '') }"
        style="display: flex; align-items: flex-start; cursor: pointer"
        @click="selectCover(item.url)"
      >
        <div class="custom-checkbox-card-mask">
          <div class="custom-checkbox-card-mask-dot" v-if="cover.includes(item.url || '')" />
        </div>
        <div>
          <div class="custom-checkbox-card-title">
            {{ item.label }}
          </div>
          <img width="80" :src="item.url" style="border-radius: 4px" />
        </div>
      </div>
    </div>

    <Btn @next="next" @prev="$emit('prev')" />
  </form>
</template>

<style scoped></style>
