<script lang="ts" setup>
import { fromData } from "@/data";
import type { OutputFormat } from "@/data";
import Btn from "@/components/btn.vue";
import UiInput from "@/components/UiInput.vue";
import UiTextarea from "@/components/UiTextarea.vue";
import UiFormItem from "@/components/UiFormItem.vue";
import UiDropdown from "@/components/UiDropdown.vue";
import UiSelect from "@/components/UiSelect.vue";
import { GM_getValue, GM_setValue } from "$";
import { getActiveDefaultRule } from "@/episode";
import type { EpisodeVideoData } from "@/episode";
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

const FORMAT_EXT_MAP: Record<OutputFormat, string> = {
  m4a: "m4a",
  mp3: "mp3",
  flac: "flac",
  ogg: "ogg",
};

const formatOptions: { label: string; value: OutputFormat }[] = [
  { label: "M4A (AAC)", value: "m4a" },
  { label: "MP3", value: "mp3" },
  { label: "FLAC (无损)", value: "flac" },
  { label: "OGG (Vorbis)(暂不支持封面嵌入)", value: "ogg" },
];

const getFileExt = () => FORMAT_EXT_MAP[fromData.outputFormat] || "m4a";

const handleFormatChange = () => {
  // 同步文件名扩展名
  const dotIndex = fromData.file.lastIndexOf(".");
  if (dotIndex > 0) {
    fromData.file = `${fromData.file.substring(0, dotIndex)}.${getFileExt()}`;
  }
  fromData.record.outputFormat = fromData.outputFormat;
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
  fromData.file = `${title.replaceAll(invalidFileNameRegex, "")}.${getFileExt()}`;
};

const applyBatchTitleOverride = () => {
  const customTitle = (
    fromData.videoData as EpisodeVideoData | undefined
  )?._wasmMusicCustomTitle?.trim();
  if (!customTitle) return;
  fromData.title = customTitle;
  fromData.file = `${customTitle.replaceAll(invalidFileNameRegex, "")}.${getFileExt()}`;
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
        <UiTextarea v-model="fromData.videoData.desc" :rows="3" />
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
      <div class="input-with-btn">
        <UiInput v-model="fromData.title" />
        <UiDropdown
          :options="titleSelects.map((item) => ({ label: item, value: item }))"
          @select="handleTitleSelect"
        >
          <button class="icon-btn">
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
              <path
                d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"
              />
            </svg>
          </button>
        </UiDropdown>
      </div>
    </UiFormItem>
    <UiFormItem label="内嵌作者">
      <div class="input-with-btn">
        <UiInput v-model="fromData.author" />
        <UiDropdown
          :options="authorSelects.map((item) => ({ label: item, value: item }))"
          @select="handleAuthorSelect"
        >
          <button class="icon-btn">
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
              <path
                d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"
              />
            </svg>
          </button>
        </UiDropdown>
      </div>
    </UiFormItem>
    <UiFormItem label="下载文件名">
      <div class="input-with-btn">
        <UiInput v-model="fromData.file" />
        <UiDropdown
          :options="fileSelects.map((item) => ({ label: item, value: item }))"
          @select="handleFileSelect"
        >
          <button class="icon-btn">
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
              <path
                d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"
              />
            </svg>
          </button>
        </UiDropdown>
      </div>
    </UiFormItem>
    <UiFormItem label="输出格式">
      <UiSelect
        :model-value="fromData.outputFormat"
        :options="formatOptions"
        @update:model-value="
          (v: string) => {
            fromData.outputFormat = v as OutputFormat;
            handleFormatChange();
          }
        "
      />
    </UiFormItem>
    <Btn @next="next" @prev="$emit('prev')" />
  </div>
</template>

<style scoped>
.form-container {
  padding: 16px;
  width: 100%;
  box-sizing: border-box;
}

.input-with-btn {
  display: flex;
  gap: 8px;
  align-items: center;
}

.input-with-btn .ui-input,
.input-with-btn > :first-child {
  flex: 1;
  min-width: 0;
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
  flex-shrink: 0;
}

.icon-btn:hover {
  background: #00a1d6;
}
</style>

<style>
/* 深色模式：图标按钮 */
body[arco-theme="dark"] .icon-btn,
body[data-theme="dark"] .icon-btn {
  background: #00aeec;
  color: #fff;
}

body[arco-theme="dark"] .icon-btn:hover,
body[data-theme="dark"] .icon-btn:hover {
  background: #00a1d6;
}
</style>
