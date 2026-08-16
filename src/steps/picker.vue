<script lang="ts" setup>
import { computed, ref, watch, nextTick } from "vue";
import type { EpisodeVideoData } from "@/episode";
import { formatEpisodeDuration } from "@/episode";
import UiInput from "@/components/UiInput.vue";
import UiSelect from "@/components/UiSelect.vue";
import UiButton from "@/components/UiButton.vue";
import UiCheckbox from "@/components/UiCheckbox.vue";
import UiAlert from "@/components/UiAlert.vue";

interface PickerMeta {
  title?: string;
  subtitle?: string;
  itemLabel?: string;
  currentLabel?: string;
  categories?: string[];
}

interface EpisodeSelection {
  indexes: number[];
  useDefault: boolean;
  manualEach: boolean;
  titleOverrides: Record<number, string>;
}

const props = defineProps<{
  episodes: EpisodeVideoData[];
  currentIndex: number;
  pickerMeta?: PickerMeta;
  savedRule?: any;
}>();

const emit = defineEmits<{
  confirm: [selection: EpisodeSelection];
  cancel: [];
}>();

const itemLabel = computed(() => props.pickerMeta?.itemLabel || "分集");
const currentLabel = computed(() => props.pickerMeta?.currentLabel || `当前${itemLabel.value}`);

// --- State ---
const searchText = ref("");
const activeCategory = ref("");
const activePage = ref(1);
const selectedIndexes = ref<Set<number>>(
  new Set(
    props.currentIndex >= 0 && props.currentIndex < props.episodes.length
      ? [props.currentIndex]
      : [],
  ),
);
const titleOverrides = ref<Map<number, string>>(new Map());
const renameVisible = ref(false);
const isManualEach = ref(false);
const isAuto = ref(!!props.savedRule);
const autoDisabled = ref(!props.savedRule);
const pageSize = 20;

// --- Rename panel state ---
const prefixText = ref("");
const suffixText = ref("");
const renameInputs = ref<Record<number, string>>({});

// --- Computed ---
const nativeCategories = computed(() => {
  const cats = Array.isArray(props.pickerMeta?.categories) ? props.pickerMeta!.categories! : [];
  return [...new Set(cats.map((c) => `${c}`.trim()).filter(Boolean))];
});

const filteredIndexes = computed(() => {
  const keyword = searchText.value.trim().toLowerCase();
  const category = activeCategory.value;
  return props.episodes
    .map((episode, index) => ({ episode, index }))
    .filter(({ episode }) => !category || episode._wasmMusicSectionTitle === category)
    .filter(({ episode }) => {
      if (!keyword) return true;
      return [
        episode._wasmMusicPickerTitle,
        episode.part,
        episode.title,
        episode.bvid,
        episode._wasmMusicSectionTitle,
        episode._wasmMusicPickerLabel,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    })
    .map(({ index }) => index);
});

const totalPages = computed(() => Math.max(1, Math.ceil(filteredIndexes.value.length / pageSize)));

const pageIndexes = computed(() => {
  const start = (activePage.value - 1) * pageSize;
  return filteredIndexes.value.slice(start, start + pageSize);
});

const selectedArray = computed(() => Array.from(selectedIndexes.value).sort((a, b) => a - b));

const hasEmptyTitle = computed(() =>
  selectedArray.value.some((index) => !getEditedTitle(index).trim()),
);

const countText = computed(() => {
  const sc = selectedIndexes.value.size;
  const rc = filteredIndexes.value.length;
  const base =
    rc === props.episodes.length
      ? `已选择 ${sc}/${props.episodes.length} 个${itemLabel.value}`
      : `已选择 ${sc}/${props.episodes.length} 个${itemLabel.value} · 当前结果 ${rc}`;
  return hasEmptyTitle.value ? `${base} · 请补全空标题` : base;
});

const confirmText = computed(() => {
  const sc = selectedIndexes.value.size;
  return sc > 1 ? `批量下载（${sc}）` : `下载所选${itemLabel.value}`;
});

const showOptions = computed(() => selectedIndexes.value.size > 1);

// --- Methods ---
function getDefaultTitle(index: number) {
  const ep = props.episodes[index];
  return `${ep?._wasmMusicPickerTitle || ep?.part || ep?.title || ep?.bvid || `未命名${itemLabel.value}`}`;
}

function getEditedTitle(index: number) {
  if (renameInputs.value[index] !== undefined) return renameInputs.value[index];
  return getDefaultTitle(index);
}

function setTitleOverride(index: number, value: string) {
  if (value === getDefaultTitle(index)) {
    delete renameInputs.value[index];
  } else {
    renameInputs.value[index] = value;
  }
}

function toggleSelect(index: number) {
  if (selectedIndexes.value.has(index)) {
    selectedIndexes.value.delete(index);
  } else {
    selectedIndexes.value.add(index);
  }
  selectedIndexes.value = new Set(selectedIndexes.value);
}

function selectCurrent() {
  selectedIndexes.value = new Set(
    props.currentIndex >= 0 && props.currentIndex < props.episodes.length
      ? [props.currentIndex]
      : [],
  );
  searchText.value = "";
  activeCategory.value = "";
  activePage.value = Math.floor(Math.max(0, props.currentIndex) / pageSize) + 1;
}

function selectAll() {
  filteredIndexes.value.forEach((index) => selectedIndexes.value.add(index));
  selectedIndexes.value = new Set(selectedIndexes.value);
}

function clearSelection() {
  selectedIndexes.value = new Set();
}

function toggleRename() {
  if (selectedIndexes.value.size === 0) return;
  renameVisible.value = !renameVisible.value;
  if (renameVisible.value) {
    nextTick(() => {
      const firstInput = document.querySelector<HTMLInputElement>(".rename-list input");
      firstInput?.focus();
    });
  }
}

function applyAffix(position: "prefix" | "suffix", value: string) {
  if (!value) return;
  selectedArray.value.forEach((index) => {
    const title = getEditedTitle(index);
    setTitleOverride(index, position === "prefix" ? `${value}${title}` : `${title}${value}`);
  });
}

function resetAllTitles() {
  renameInputs.value = {};
}

function resetTitle(index: number) {
  delete renameInputs.value[index];
  renameInputs.value = { ...renameInputs.value };
}

// Watch manualEach changes
watch(isManualEach, (val) => {
  if (val) {
    isAuto.value = false;
    autoDisabled.value = true;
  } else {
    isAuto.value = !!props.savedRule;
    autoDisabled.value = !props.savedRule;
  }
});

// Keep page in bounds
watch(filteredIndexes, () => {
  if (activePage.value > totalPages.value) {
    activePage.value = totalPages.value;
  }
});

// --- Confirm/Cancel ---
function handleConfirm() {
  if (selectedIndexes.value.size === 0 || hasEmptyTitle.value) return;
  const titleOverridesObj: Record<number, string> = {};
  selectedArray.value.forEach((index) => {
    const value = getEditedTitle(index).trim();
    if (value) titleOverridesObj[index] = value;
  });
  emit("confirm", {
    indexes: selectedArray.value,
    useDefault: !isManualEach.value && isAuto.value && !autoDisabled.value,
    manualEach: isManualEach.value,
    titleOverrides: titleOverridesObj,
  });
}

function handleCancel() {
  emit("cancel");
}

function onKeyDown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.preventDefault();
    handleCancel();
  }
}

// Register keyboard listener
import { onMounted, onUnmounted } from "vue";
onMounted(() => document.addEventListener("keydown", onKeyDown, true));
onUnmounted(() => document.removeEventListener("keydown", onKeyDown, true));
</script>

<template>
  <div class="picker-root">
    <div class="picker-dialog">
    <!-- Header -->
    <div class="picker-header">
      <h2 class="picker-title">选择要下载的{{ itemLabel }}</h2>
      <p class="picker-subtitle">
        {{ pickerMeta?.title ? `《${pickerMeta.title}》：` : "" }}{{
          pickerMeta?.subtitle || "勾选一个就是单项下载；勾选多个会按列表顺序逐个下载。"
        }}
      </p>
    </div>

    <!-- Tools -->
    <div class="picker-tools">
      <UiButton @click="selectCurrent">只选{{ currentLabel }}</UiButton>
      <UiButton @click="selectAll" :disabled="filteredIndexes.length === 0">全选结果</UiButton>
      <UiButton @click="clearSelection">清空选择</UiButton>
      <UiButton
        @click="toggleRename"
        :disabled="selectedIndexes.size === 0"
      >
        {{ renameVisible ? "返回选择列表" : `编辑所选标题${selectedIndexes.size ? `（${selectedIndexes.size}）` : ""}` }}
      </UiButton>
    </div>

    <!-- Query (search + filter) -->
    <div v-if="!renameVisible" class="picker-query">
      <UiInput
        v-model="searchText"
        placeholder="搜索标题 / BV号"
        style="flex: 1"
      />
      <UiSelect
        v-if="nativeCategories.length > 1"
        v-model="activeCategory"
        :options="[{ label: '全部分类', value: '' }, ...nativeCategories.map(c => ({ label: c, value: c }))]"
        style="width: 140px"
      />
    </div>

    <!-- Episode List -->
    <div v-if="!renameVisible" class="picker-list">
      <div v-if="pageIndexes.length === 0" class="picker-empty">没有符合条件的视频</div>
      <label
        v-for="index in pageIndexes"
        :key="index"
        class="picker-row"
        :class="{ 'picker-row-selected': selectedIndexes.has(index) }"
      >
        <input
          type="checkbox"
          :checked="selectedIndexes.has(index)"
          @change="toggleSelect(index)"
        />
        <span class="picker-index">{{ episodes[index]._wasmMusicPickerLabel || `P${episodes[index].page}` }}</span>
        <span class="picker-name" :title="episodes[index].bvid ? `${episodes[index]._wasmMusicPickerTitle || episodes[index].part || episodes[index].title} · ${episodes[index].bvid}` : ''">
          {{ episodes[index]._wasmMusicPickerTitle || episodes[index].part || episodes[index].title }}
          <span v-if="index === currentIndex" class="picker-current-badge">当前</span>
        </span>
        <span class="picker-time">{{ formatEpisodeDuration(episodes[index].duration) }}</span>
      </label>
    </div>

    <!-- Pagination -->
    <div v-if="!renameVisible && totalPages > 1" class="picker-pagination">
      <UiButton :disabled="activePage <= 1" @click="activePage--">上一页</UiButton>
      <span class="picker-page-info">第 {{ activePage }}/{{ totalPages }} 页 · 共 {{ filteredIndexes.length }} 项</span>
      <UiButton :disabled="activePage >= totalPages" @click="activePage++">下一页</UiButton>
    </div>

    <!-- Rename Panel -->
    <div v-if="renameVisible" class="picker-rename-panel">
      <div class="picker-rename-header">
        <strong>批量编辑下载标题</strong>
        <span>默认保留每个视频自己的标题，只修改你想改的项目即可。</span>
      </div>
      <div class="picker-rename-bulk">
        <UiInput v-model="prefixText" placeholder="批量添加前缀" style="width: 150px" />
        <UiButton @click="applyAffix('prefix', prefixText)">添加前缀</UiButton>
        <UiInput v-model="suffixText" placeholder="批量添加后缀" style="width: 150px" />
        <UiButton @click="applyAffix('suffix', suffixText)">添加后缀</UiButton>
        <UiButton @click="resetAllTitles">全部恢复默认</UiButton>
      </div>
      <div class="picker-rename-list rename-list">
        <div v-if="selectedArray.length === 0" class="picker-empty">
          请先选择要下载的{{ itemLabel }}
        </div>
        <div v-for="index in selectedArray" :key="index" class="picker-rename-row">
          <span class="picker-rename-meta" :title="episodes[index].bvid || ''">
            {{ episodes[index]._wasmMusicPickerLabel || `P${episodes[index].page || index + 1}` }}
          </span>
          <UiInput
            :model-value="getEditedTitle(index)"
            @update:model-value="setTitleOverride(index, $event)"
            style="flex: 1"
          />
          <UiButton @click="resetTitle(index)">恢复</UiButton>
        </div>
      </div>
    </div>

    <!-- Options (batch mode) -->
    <div v-if="showOptions" class="picker-options">
      <UiCheckbox v-model="isManualEach">
        每个项目分别手动确认（可单独修改标题、作者、文件名、封面和字幕）
      </UiCheckbox>
      <UiCheckbox v-model="isAuto" :disabled="autoDisabled">
        {{ savedRule
          ? "使用已保存规则（作者、封面、字幕、剪辑范围与倍速）自动完成；标题和文件名使用所选列表"
          : "尚未保存默认规则：先手动设置第一项，其余项目复用作者、封面、字幕、剪辑范围与倍速"
        }}
      </UiCheckbox>
      <p class="picker-hint">
        每项默认使用分集列表里的自带标题；进入"编辑所选标题"可逐项修改或批量加前后缀。手动模式会在同一个窗口逐项停下来确认。
      </p>
    </div>

    <!-- Footer -->
    <div class="picker-footer">
      <span class="picker-count">{{ countText }}</span>
      <div class="picker-actions">
        <UiButton @click="handleCancel">取消</UiButton>
        <UiButton
          type="primary"
          :disabled="selectedIndexes.size === 0 || hasEmptyTitle"
          @click="handleConfirm"
        >
          {{ confirmText }}
        </UiButton>
      </div>
    </div>
    </div>
  </div>
</template>

<style scoped>
.picker-root {
  position: fixed;
  inset: 0;
  z-index: 10050;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.55);
  font-family: Arial, "Microsoft YaHei", sans-serif;
}

.picker-dialog {
  display: flex;
  flex-direction: column;
  width: min(760px, 92vw);
  max-height: min(820px, 90vh);
  overflow: hidden;
  color: #18191c;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.3);
}

.picker-header {
  padding: 20px 22px 12px;
  border-bottom: 1px solid #e3e5e7;
}

.picker-title {
  margin: 0 0 6px;
  font-size: 20px;
  font-weight: 700;
  color: #18191c;
}

.picker-subtitle {
  margin: 0;
  color: #61666d;
  font-size: 13px;
  line-height: 1.6;
}

.picker-tools {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 22px;
  border-bottom: 1px solid #e3e5e7;
}

.picker-query {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 22px;
  background: #f6f7f8;
  border-bottom: 1px solid #e3e5e7;
}

.picker-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 120px;
  padding: 12px 22px;
  overflow-y: auto;
  flex: 1;
}

.picker-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 130px;
  color: #9499a0;
  font-size: 14px;
}

.picker-row {
  display: grid;
  grid-template-columns: auto 58px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 11px 12px;
  border: 1px solid #e3e5e7;
  border-radius: 8px;
  cursor: pointer;
  transition: 0.15s ease;
}

.picker-row:hover {
  background: #f1faff;
  border-color: #00aeec;
}

.picker-row:has(input:checked) {
  background: #eaf8ff;
  border-color: #00aeec;
}

.picker-row input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: #00aeec;
}

.picker-index {
  color: #00aeec;
  font-weight: 700;
}

.picker-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.picker-current-badge {
  margin-left: 6px;
  padding: 2px 6px;
  color: #00aeec;
  font-size: 11px;
  background: #dff6ff;
  border-radius: 4px;
}

.picker-time {
  color: #9499a0;
  font-variant-numeric: tabular-nums;
}

.picker-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 10px 22px;
  border-top: 1px solid #e3e5e7;
}

.picker-page-info {
  min-width: 130px;
  color: #61666d;
  font-size: 13px;
  text-align: center;
}

.picker-rename-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 22px;
  overflow: hidden;
  border-top: 1px solid #e3e5e7;
  min-height: 180px;
}

.picker-rename-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.picker-rename-header span {
  color: #61666d;
  font-size: 12px;
}

.picker-rename-bulk {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 7px;
}

.picker-rename-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: auto;
  min-height: 110px;
}

.picker-rename-row {
  display: grid;
  grid-template-columns: 62px 1fr auto;
  align-items: center;
  gap: 9px;
}

.picker-rename-meta {
  overflow: hidden;
  color: #00aeec;
  font-size: 12px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.picker-options {
  padding: 10px 22px;
  color: #61666d;
  font-size: 13px;
  background: #f6f7f8;
  border-top: 1px solid #e3e5e7;
}

.picker-options label {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  cursor: pointer;
}

.picker-options label + label {
  margin-top: 8px;
}

.picker-hint {
  margin: 6px 0 0 24px;
  line-height: 1.5;
}

.picker-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 22px;
  border-top: 1px solid #e3e5e7;
}

.picker-count {
  color: #61666d;
  font-size: 13px;
}

.picker-actions {
  display: flex;
  gap: 10px;
}

/* 深色模式 */
body[arco-theme="dark"] .picker-dialog,
body[data-theme="dark"] .picker-dialog {
  color: #f1f2f3;
  background: #1f1f1f;
}

body[arco-theme="dark"] .picker-header,
body[data-theme="dark"] .picker-header {
  border-color: #444;
}

body[arco-theme="dark"] .picker-title,
body[data-theme="dark"] .picker-title {
  color: #e0e0e0;
}

body[arco-theme="dark"] .picker-subtitle,
body[data-theme="dark"] .picker-subtitle {
  color: #a0a4a8;
}

body[arco-theme="dark"] .picker-tools,
body[data-theme="dark"] .picker-tools {
  border-color: #444;
}

body[arco-theme="dark"] .picker-query,
body[data-theme="dark"] .picker-query {
  background: #292929;
  border-color: #444;
}

body[arco-theme="dark"] .picker-row,
body[data-theme="dark"] .picker-row {
  border-color: #444;
}

body[arco-theme="dark"] .picker-row:hover,
body[data-theme="dark"] .picker-row:hover {
  background: #173344;
  border-color: #00aeec;
}

body[arco-theme="dark"] .picker-row:has(input:checked),
body[data-theme="dark"] .picker-row:has(input:checked) {
  background: #173344;
  border-color: #00aeec;
}

body[arco-theme="dark"] .picker-row input[type="checkbox"],
body[data-theme="dark"] .picker-row input[type="checkbox"] {
  background-color: #2a2a2a;
  border-color: #555;
}

body[arco-theme="dark"] .picker-name,
body[data-theme="dark"] .picker-name {
  color: #e0e0e0;
}

body[arco-theme="dark"] .picker-time,
body[data-theme="dark"] .picker-time {
  color: #a0a4a8;
}

body[arco-theme="dark"] .picker-pagination,
body[data-theme="dark"] .picker-pagination {
  border-color: #444;
}

body[arco-theme="dark"] .picker-page-info,
body[data-theme="dark"] .picker-page-info,
body[arco-theme="dark"] .picker-count,
body[data-theme="dark"] .picker-count {
  color: #a0a4a8;
}

body[arco-theme="dark"] .picker-rename-panel,
body[data-theme="dark"] .picker-rename-panel {
  border-color: #444;
}

body[arco-theme="dark"] .picker-rename-meta,
body[data-theme="dark"] .picker-rename-meta {
  color: #00aeec;
}

body[arco-theme="dark"] .picker-options,
body[data-theme="dark"] .picker-options {
  background: #292929;
  border-color: #444;
  color: #a0a4a8;
}

body[arco-theme="dark"] .picker-footer,
body[data-theme="dark"] .picker-footer {
  border-color: #444;
}
</style>
