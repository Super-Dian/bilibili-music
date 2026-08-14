<script lang="ts" setup>
import { fromData } from "@/data";
import Btn from "@/components/btn.vue";
import UiInput from "@/components/UiInput.vue";
import UiTextarea from "@/components/UiTextarea.vue";
import UiFormItem from "@/components/UiFormItem.vue";
import UiDropdown from "@/components/UiDropdown.vue";
import { GM_getValue, GM_setValue } from "$";
import { getActiveDefaultRule, type EpisodeVideoData } from "@/episode";
import { applyMetadataFormat } from "@/utils/format";

const emits = defineEmits(["next", "prev"]);

const invalidFileNameRegex = /[<>:"/\\|?*]/g;

const infoMaps = computed(() => [
  fromData.videoData?.title || "",
  fromData.videoData?.desc || "",
  fromData.videoData?.owner.name || "",
  fromData.data?.music_title || "",
  fromData.data?.origin_artist || "",
]);

const titleSelects = fromData.data ? ["4-3", "4-5", "1-3", "4", "1"] : ["1-3", "1"];
const authorSelects = fromData.data ? ["3(原:5)", "3-5", "3", "5"] : ["3"];
const fileSelects = fromData.data ? ["4-3", "4-5", "1-3", "4", "1"] : ["1-3", "1"];

const infoRecord = {
  title: "",
  author: "",
  file: "",
};

function next() {
  fromData.record.format = infoRecord;
  emits("next");
}

const handleSelect = (type: keyof typeof infoRecord, format: string) => {
  GM_setValue(`${type}-format${!fromData.data ? "_no_music" : ""}`, format);
  infoRecord[type] = format;
  return applyMetadataFormat(format, infoMaps.value);
};

const handleTitleSelect = (value: any) => {
  if (!value || typeof value != "string") return;
  fromData.title = handleSelect("title", value);
};

const handleAuthorSelect = (value: any) => {
  if (!value || typeof value != "string") return;
  fromData.author = handleSelect("author", value);
};

const handleFileSelect = (value: any) => {
  if (!value || typeof value != "string") return;
  const title = handleSelect("file", value);
  fromData.file = `${title.replaceAll(invalidFileNameRegex, "")}.m4a`;
};

const applyBatchTitleOverride = () => {
  const customTitle = (
    fromData.videoData as EpisodeVideoData | undefined
  )?._wasmMusicCustomTitle?.trim();
  if (!customTitle) return;
  fromData.title = customTitle;
  fromData.file = `${customTitle.replaceAll(invalidFileNameRegex, "")}.m4a`;
};

onMounted(() => {
  const noMusic = !fromData.data ? "_no_music" : "";
  if (fromData.usedefaultconfig) {
    const defaultRule = getActiveDefaultRule();
    const format = defaultRule?.format;
    if (format) {
      handleTitleSelect(titleSelects.includes(format.title) ? format.title : titleSelects[0]);
      handleAuthorSelect(authorSelects.includes(format.author) ? format.author : authorSelects[0]);
      handleFileSelect(fileSelects.includes(format.file) ? format.file : fileSelects[0]);
      applyBatchTitleOverride();
      next();
      return;
    }
  }
  const titleFormat = GM_getValue(`title-format${noMusic}`, titleSelects[0]);
  const authorFormat = GM_getValue(`author-format${noMusic}`, authorSelects[0]);
  const fileFormat = GM_getValue(`file-format${noMusic}`, fileSelects[0]);

  handleTitleSelect(titleFormat);
  handleAuthorSelect(authorFormat);
  handleFileSelect(fileFormat);
  applyBatchTitleOverride();
});
</script>

<template>
  <div class="form-container">
    <template v-if="fromData.videoData">
      <UiFormItem label="标题(1)">
        <UiInput v-model="fromData.videoData.title" />
      </UiFormItem>
      <UiFormItem label="简介(2)">
        <UiTextarea
          v-model="fromData.videoData.desc"
          :rows="3"
        />
      </UiFormItem>
      <UiFormItem label="Up主(3)">
        <UiInput v-model="fromData.videoData.owner.name" />
      </UiFormItem>
    </template>
    <template v-if="fromData.data">
      <UiFormItem label="音乐名(4)">
        <UiInput v-model="fromData.data.music_title" />
      </UiFormItem>
      <UiFormItem label="原唱(5)">
        <UiInput v-model="fromData.data.origin_artist" />
      </UiFormItem>
    </template>

    <UiFormItem label="内嵌标题">
      <div style="display: flex; gap: 8px">
        <UiInput v-model="fromData.title" />
        <UiDropdown :options="titleSelects.map(item => ({ label: item, value: item }))" @select="handleTitleSelect">
          <button class="icon-btn"><icon-settings /></button>
        </UiDropdown>
      </div>
    </UiFormItem>
    <UiFormItem label="内嵌作者">
      <div style="display: flex; gap: 8px">
        <UiInput v-model="fromData.author" />
        <UiDropdown :options="authorSelects.map(item => ({ label: item, value: item }))" @select="handleAuthorSelect">
          <button class="icon-btn"><icon-settings /></button>
        </UiDropdown>
      </div>
    </UiFormItem>
    <UiFormItem label="下载文件名">
      <div style="display: flex; gap: 8px">
        <UiInput v-model="fromData.file" />
        <UiDropdown :options="fileSelects.map(item => ({ label: item, value: item }))" @select="handleFileSelect">
          <button class="icon-btn"><icon-settings /></button>
        </UiDropdown>
      </div>
    </UiFormItem>
    <Btn @next="next" @prev="$emit('prev')" />
  </div>
</template>

<style scoped>
.form-container {
  padding: 16px;
}

.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  background: #00aeec;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s ease;
}

.icon-btn:hover {
  background: #00a1d6;
}
</style>
