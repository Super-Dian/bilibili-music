<script lang="ts" setup>
import { fromData } from "@/data";
import type { OutputFormat } from "@/data";
import Btn from "@/components/btn.vue";
import UiInput from "@/components/UiInput.vue";
import UiTextarea from "@/components/UiTextarea.vue";
import UiFormItem from "@/components/UiFormItem.vue";
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

// 标签名映射
const labelMap: Record<string, string> = {
  "1": "标题",
  "2": "简介",
  "3": "Up主",
  "4": "音乐名",
  "5": "原唱",
};

// 将格式字符串转换为带标签的格式
const formatToLabel = (format: string): string => {
  // 处理 "3(原:5)" 这种特殊格式
  const specialMatch = format.match(/^(\d+)\(原:(\d+)\)$/);
  if (specialMatch) {
    const [, main, sub] = specialMatch;
    return `${labelMap[main] || main}(${labelMap[sub] || sub})(${format})`;
  }

  // 处理 "4-3" 这种连接格式
  if (format.includes("-")) {
    const parts = format.split("-");
    const labels = parts.map((p) => labelMap[p] || p).join("-");
    return `${labels}(${format})`;
  }

  // 单个数字
  return `${labelMap[format] || format}(${format})`;
};

const titleSelects = fromData.data ? ["4-3", "4-5", "1-3", "4", "1"] : ["1-3", "1"];
const authorSelects = fromData.data ? ["3(原:5)", "3-5", "3", "5"] : ["3"];
const fileSelects = fromData.data ? ["4-3", "4-5", "1-3", "4", "1"] : ["1-3", "1"];

// 生成带标签的选项
const titleSelectOptions = titleSelects.map((item) => ({
  label: formatToLabel(item),
  value: item,
}));
const authorSelectOptions = authorSelects.map((item) => ({
  label: formatToLabel(item),
  value: item,
}));
const fileSelectOptions = fileSelects.map((item) => ({
  label: formatToLabel(item),
  value: item,
}));

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
      <div class="input-with-select">
        <UiInput v-model="fromData.title" />
        <UiSelect
          :model-value="infoRecord.title"
          :options="titleSelectOptions"
          placeholder="内嵌标题格式选择"
          @update:model-value="handleTitleSelect"
        />
      </div>
    </UiFormItem>
    <UiFormItem label="内嵌作者">
      <div class="input-with-select">
        <UiInput v-model="fromData.author" />
        <UiSelect
          :model-value="infoRecord.author"
          :options="authorSelectOptions"
          placeholder="内嵌作者格式选择"
          @update:model-value="handleAuthorSelect"
        />
      </div>
    </UiFormItem>
    <UiFormItem label="下载文件名">
      <div class="input-with-select">
        <UiInput v-model="fromData.file" />
        <UiSelect
          :model-value="infoRecord.file"
          :options="fileSelectOptions"
          placeholder="下载文件名格式选择"
          @update:model-value="handleFileSelect"
        />
      </div>
    </UiFormItem>
    <UiFormItem label="输出格式">
      <UiSelect
        :model-value="fromData.outputFormat"
        :options="formatOptions"
        placeholder="选择输出格式"
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

.input-with-select {
  display: flex;
  gap: 8px;
  align-items: center;
}

.input-with-select .ui-input {
  flex: 1;
  min-width: 0;
}

.input-with-select .ui-select {
  width: 100px;
  flex-shrink: 0;
}
</style>
