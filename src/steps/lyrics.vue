<script lang="ts" setup>
import { fromData, Lyrics, userConfig } from "@/data";
import { onMounted, ref, computed, reactive } from "vue";
import { request } from "@/utils/requests";
import Btn from "@/components/btn.vue";
import UiCheckbox from "@/components/UiCheckbox.vue";
import UiButton from "@/components/UiButton.vue";
import UiInput from "@/components/UiInput.vue";
import UiTextarea from "@/components/UiTextarea.vue";
import UiSpin from "@/components/UiSpin.vue";
import { Message, SelectOptionGroup } from "@arco-design/web-vue";
import { callOpenAI, ChatCompletionMessageParam } from "@/utils/gpt";
import { diffChars, diffWords, diffLines, Change } from "diff";
import { logger } from "@/utils/logger";
import { getActiveDefaultRule } from "@/episode";
import { correctLyrics, cleanOriginalLyrics } from "@/utils/lyricsCorrector";
import { selectSubtitleForAuto, subtitleToLyrics } from "@/utils/lyrics";

const emits = defineEmits(["next", "prev"]);

type SubTitle = PlayerData["subtitle"]["subtitles"][number];

const subtitles = ref<SubTitle[]>([]);
const noSubtitle = ref(false);
const subtitle = ref<string[]>([]);

const subtitleEdit = ref<SubTitle | null>(null);
const subtitleEditMode = ref<LyricsMode>("ai");

const lyricsRecord = {
  label: undefined as string | undefined,
};

const onChange = (v: (string | number | boolean)[]) => {
  const val = v.at(-1);
  if (val !== undefined && val !== false) {
    subtitle.value = [val.toString()];
    const s = subtitles.value.find((item) => item.id_str === val.toString());
    lyricsRecord.label = s?.lan_doc;
    noSubtitle.value = false;
  } else {
    fromData.lyricsData = null;
    subtitle.value = [];
    lyricsRecord.label = undefined;
    noSubtitle.value = true;
  }
};

const error = ref("");

function skipLyrics() {
  noSubtitle.value = true;
  next();
}

function next() {
  fromData.record.lyrics = lyricsRecord.label;
  let lyricsData: Lyrics = [];

  if (noSubtitle.value) {
    Message.info("跳过歌词嵌入");
  } else if (subtitleEdit.value?.data) {
    const data = subtitleEdit.value.data;
    const lines = (data._editBody ?? "").split("\n");

    if (subtitleEditMode.value === "online") {
      lyricsData = data._lyricsBody ?? [];
    } else {
      if (lines.length !== data.body.length) {
        Message.error("歌词行数与 AI 字幕时间轴不一致");
        return;
      }
      lyricsData = data.body.map((item, index) => [Math.round(item.from * 1000), lines[index]]);
      if (subtitleEditMode.value === "ai-corrected" && data._lyricsBody?.length) {
        lyricsData = data._lyricsBody;
      }
    }

    if (lyricsData.length === 0 || lyricsData.length !== lines.length) {
      Message.error("歌词时间轴无效，请重新处理歌词");
      return;
    }
  } else {
    const s = subtitles.value.find((item) => item.id_str === subtitle.value[0]);
    if (!s?.data) {
      Message.error("歌词数据错误");
      return;
    }
    lyricsData = s.data.body.map((item) => [Math.round(item.from * 1000), item.content]);
  }

  fromData.lyricsData = lyricsData;
  emits("next");
}

onMounted(() => {
  if (!fromData.videoData) return;
  const cid = fromData.videoData.cid.toString();
  const bvid = fromData.videoData.bvid;
  const aid = fromData.videoData.aid.toString();
  logger.debug({ cid, bvid, aid });
  // if (fromData.data) {
  //   request.get({ url: fromData.data.mv_lyric }).then((res) => {
  //     if (!fromData.data) return;
  //     logger.debug(fromData.data.mv_lyric, res);
  //     fromData.data.mv_lyric_data = res;
  //   });
  // }
  request
    .get({
      url:
        "https://api.bilibili.com/x/player/wbi/v2?" +
        new URLSearchParams({
          cid,
          bvid,
          aid,
        }),
    })
    .then(async (res: any) => {
      logger.debug("playerData", res);
      if (!res.data) return;
      fromData.playerData = res.data as PlayerData;
      fromData.playerData.aid = fromData.playerData.aid || fromData.videoData!.aid;
      fromData.playerData.cid = fromData.videoData!.cid;
      fromData.playerData.bvid = fromData.playerData.bvid || fromData.videoData!.bvid;
      fromData.playerData.subtitle =
        fromData.playerData.subtitle || ({ subtitles: [] } as unknown as PlayerData["subtitle"]);
      fromData.playerData.subtitle.subtitles = fromData.playerData.subtitle.subtitles || [];
      if (fromData.playerData.subtitle.subtitles.length === 0) {
        error.value = "当前视频没有字幕";
        noSubtitle.value = true;
        if (fromData.usedefaultconfig) emits("next");
        return;
      }
      const _subtitles = await Promise.all(
        fromData.playerData.subtitle.subtitles.map(async (item) => {
          item.data = await request.get({ url: `http:${item.subtitle_url}` });
          return item;
        }),
      );
      subtitles.value = _subtitles;
      if (fromData.playerData) fromData.playerData.subtitle.subtitles = _subtitles;

      // 新增：尝试使用本地默认语言配置（lan_doc），否则回退到第一个
      if (_subtitles.length > 0) {
        if (fromData.usedefaultconfig) {
          const preferredLanguage = getActiveDefaultRule()?.lyrics;
          const selected = selectSubtitleForAuto(_subtitles, preferredLanguage);
          if (selected) {
            subtitle.value = [selected.id_str];
            lyricsRecord.label = selected.lan_doc;
            fromData.lyricsData = subtitleToLyrics(selected);
          }

          emits("next");
        } else {
          const val = _subtitles[0].id_str;
          subtitle.value = [val];
          lyricsRecord.label = _subtitles[0].lan_doc;
        }
      }
      console.log(_subtitles);
    })
    .catch((err) => {
      if (fromData.usedefaultconfig) {
        fromData.playerData = {
          aid: fromData.videoData!.aid,
          cid: fromData.videoData!.cid,
          bvid: fromData.videoData!.bvid,
          subtitle: {
            subtitles: [],
          },
        } as unknown as PlayerData;
        fromData.lyricsData = null;
        logger.warn("字幕信息获取失败，自动下载将跳过字幕", err);
        emits("next");
      } else {
        error.value = err.message;
      }
    });
});

const visible = ref(false);

const editLyricsData = ref<SubTitle | null>(null);

type LyricsMode = "ai" | "ai-corrected" | "online";
const lyricsMode = ref<LyricsMode>("ai");
const originalAiBody = ref<Body[]>([]);
const originalAiText = ref("");

const onlineLyrics = ref<string>("");

/** 第一句歌词开始时间（mm:ss格式） */
const lyricsStartTime = ref("");
const lyricsStartTimeError = ref(false);

/** 是否使用在线歌词 */
const useOnlineLyrics = ref(false);

/** 在线歌词原始解析结果（未偏移），用于 offset 计算基准 */
const originalParsedLyrics = ref<Array<[number, string]>>([]);

/**
 * 当"使用在线歌词"开关变化时，自动替换或撤销歌词
 */
function onUseOnlineLyricsChange(value: boolean | Array<string | number | boolean>) {
  const enabled = Array.isArray(value) ? value.length > 0 : value;
  if (enabled) {
    replaceWithOnlineLyrics();
  } else {
    undoReplaceLyrics();
  }
}

/**
 * 验证并调整歌词时间轴
 * @returns 调整后的毫秒数，如果无效返回null
 */
function parseLyricsStartTime(timeStr: string): number | null {
  const match = timeStr.match(/^(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?$/);
  if (!match) return null;

  const minutes = parseInt(match[1], 10);
  const seconds = parseInt(match[2], 10);
  const fraction = match[3] ?? "0";

  if (seconds >= 60) return null;

  return minutes * 60 * 1000 + seconds * 1000 + parseInt(fraction.padEnd(3, "0"), 10);
}

/**
 * 当开始时间输入变化时，实时调整歌词时间轴
 */
function onLyricsStartTimeChange(value: string) {
  if (!value) {
    lyricsStartTimeError.value = true;
    return;
  }

  const startTimeMs = parseLyricsStartTime(value);
  if (startTimeMs === null) {
    lyricsStartTimeError.value = true;
    return;
  }

  lyricsStartTimeError.value = false;

  // 在线模式始终从未偏移的 LRC 时间轴重新计算，避免重复修改产生累积偏移。
  if (lyricsMode.value === "online" && originalParsedLyrics.value.length > 0) {
    const offset = startTimeMs - originalParsedLyrics.value[0][0];
    editLyricsData.value!.data!._lyricsBody = originalParsedLyrics.value.map(([time, text]) => [
      Math.max(0, time + offset),
      text,
    ]);
  }
}

/**
 * 解析 LRC 格式的歌词，提取时间轴和歌词文本
 * @param lrcText LRC 格式的歌词文本
 * @returns Array<[毫秒, 歌词文本]>
 */
function parseLrcToLyrics(lrcText: string): Array<[number, string]> {
  const result: Array<[number, string]> = [];
  const timestamp = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,4}))?\]/g;

  for (const line of lrcText.split(/\r?\n/)) {
    const matches = [...line.matchAll(timestamp)];
    if (matches.length === 0) continue;
    const content = line.replace(timestamp, "").trim();
    if (!content) continue;

    for (const match of matches) {
      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      if (seconds >= 60) continue;
      const fraction = (match[3] ?? "0").slice(0, 3).padEnd(3, "0");
      result.push([minutes * 60000 + seconds * 1000 + Number(fraction), content]);
    }
  }

  return result.sort((a, b) => a[0] - b[0]);
}

const diffFunc = {
  no: ["不显示差异", (oldStr: string, newStr: string) => [{ value: newStr }] as Change[]] as const,
  Chars: ["字符差异", diffChars] as const,
  Words: ["单词差异", diffWords] as const,
  Lines: ["行差异", diffLines] as const,
};

type DiffType = keyof typeof diffFunc;

const lyricsBodySwitch = reactive({
  timeAxis: false,
  blankChar: true,
  metaInfo: false,
  stripMeta: false,

  note: true,

  onlineDiff: "no" as DiffType,
  aiDiff: "no" as DiffType,
});

const onlineLyricsDiff = computed(() => {
  if (!editLyricsData.value?.data) return [];
  return diffFunc[lyricsBodySwitch.onlineDiff][1](
    editLyricsData.value.data._editBody ?? "",
    editableOnlineLyrics.value,
  );
});

const lyricsBodyLine = computed(() => {
  // 原长度，剪辑长度，AI改写长度
  if (!editLyricsData.value?.data) return [0, 0, 0];

  // 当使用在线歌词时，原行数使用在线歌词的行数
  const originalLineCount =
    editLyricsData.value.data._lyricsBody && editLyricsData.value.data._lyricsBody.length > 0
      ? editLyricsData.value.data._lyricsBody.length
      : editLyricsData.value.data.body.length;

  return [
    originalLineCount,
    (editLyricsData.value.data._editBody ?? "").split("\n").length,
    aiRewriteContent.value.trim().split("\n").length,
  ];
});

const lyricsBodyContent = computed(() => {
  if (!editLyricsData.value?.data) return "";
  if (lyricsBodySwitch.note) {
    return (editLyricsData.value.data._editBody ?? "")
      .split("\n")
      .map((item) => `♪ ${item} ♪`)
      .join("\n");
  }
  return editLyricsData.value.data._editBody ?? "";
});

function onlineLyricsContentFormat({
  metaInfo,
  timeAxis,
  blankChar,
}: {
  timeAxis: boolean;
  blankChar: boolean;
  metaInfo: boolean;
}) {
  let content = onlineLyrics.value;

  // 如果不显示元信息，移除类似 [ti:xxx] 格式的信息
  if (!metaInfo) {
    content = content.replace(/^\[(ti|ar|al|by|offset):.*?\]\n?/gm, "");
  }

  // 移除空歌词行: 匹配 [xx:xx.xx]\n 并整行去除（含换行符）
  content = content.replace(/\[\d{1,3}:\d{2}[.:]\d{1,4}]\n/g, "");

  // 如果不显示时间轴，移除所有时间标记 [00:00.00] 格式
  if (!timeAxis) {
    content = content.replace(/\[\d{1,3}:\d{2}[.:]\d{1,4}]/g, "");
  }

  // 如果不显示空白字符，移除空行
  if (!blankChar) {
    content = content
      .split("\n")
      .filter((line) => line.trim())
      .join("\n");
  }

  return content;
}

const onlineLyricsContent = computed(() => {
  if (lyricsBodySwitch.stripMeta) {
    return cleanOriginalLyrics(onlineLyrics.value);
  }
  return onlineLyricsContentFormat(lyricsBodySwitch);
});

/** 可编辑的在线歌词副本，用户可手动修改后用于纠错 */
const editableOnlineLyrics = ref("");
const onlineLyricsViewMode = ref<"edit" | "diff">("edit");
watch(
  onlineLyricsContent,
  (val) => {
    editableOnlineLyrics.value = val;
  },
  { immediate: true },
);

const aiRewriteLoading = ref(false);
const aiRewriteContent = ref("");

const aiLyricsDiff = computed(() => {
  if (!editLyricsData.value?.data) return [];
  return diffFunc[lyricsBodySwitch.aiDiff][1](
    editLyricsData.value.data._editBody ?? "",
    aiRewriteContent.value,
  );
});

const aiRewritePrompt = ref("{{onlineLyrics}}");

const aiRewrite = async () => {
  const editBody = editLyricsData.value?.data?._editBody;
  if (!editBody) {
    Message.warning("没有可用的歌词内容");
    return;
  }
  aiRewriteLoading.value = true;

  function render(template: string, context: Record<string, string>) {
    return template.replace(/\{\{(.*?)\}\}/g, (match, key) => context[key]);
  }
  const _prompt = render(aiRewritePrompt.value, {
    onlineLyrics: onlineLyricsContentFormat({
      timeAxis: false,
      blankChar: false,
      metaInfo: false,
    }),
  });
  try {
    const table = editBody
      .split("\n")
      .map((item) => `|${item}| |`)
      .join("\n");

    const prompt: ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: `你是一个严格的字幕纠错专家。你的唯一任务是修正语音识别产生的错别字。
        起因是我利用AI工具给视频添加字幕，但是错误率较高，常常导致我被老板批评, 要是你纠正有错不按照规则，就只能将你杀死
        
## 严格要求：
1. 必须严格保持表格格式与行数，绝对禁止增加或删除任何一行
2. 只能修改错别字，一般不改变句子结构
3. 如果无法100%确定是错字，必须保持原样
4. 禁止对歌词进行任何形式的重写或优化
5. 返回纠正后的完整歌词，格式与给定的表格一致`,
      },
      {
        role: "user",
        content: `请帮我完成以下纠正表，参考互联网歌词和拼音进行纠正，每一行需要对应：
\`\`\` 互联网歌词（仅供参考）
${_prompt}
\`\`\`

|待纠正字幕|纠正字幕|
|------|------|
${table}


## 输出
返回纠正后的表，要严格按照格式输出`,
      },
    ];
    const res = await callOpenAI(prompt);
    if (res && editLyricsData.value?.data?._editBody) {
      const match = res.match(/\|(.+)\|(.+)\|/g);
      const contentMap = editBody.split("\n").reduce<Record<string, true>>((pre, cur) => {
        pre[cur] = true;
        return pre;
      }, {});
      let result = "";
      for (const item of match) {
        const l = item.split("|");
        if (l.length === 4 && contentMap[l[1]]) {
          result += l[2] + "\n";
        }
      }
      logger.debug("AI 改写结果", { res, result, match, contentMap });
      aiRewriteContent.value = result;
      // const match = res.match(/```[\s\S]*?\n([\s\S]*?)\n```/);
      // aiRewriteContent.value = match ? match[1].trim() : res;
    }
  } finally {
    aiRewriteLoading.value = false;
  }
};

const onlineSearch = ref<string>(fromData.data?.music_title || "");

const onlineLyricsLoading = ref(false);
const onlineLyricsLoading2 = ref(false);

const onlineLyricsOptions = ref<SelectOptionGroup[]>([]);

const onlineLyricsIndex = ref<string>("");

watch(onlineLyricsIndex, async (value) => {
  logger.debug("watch onlineLyricsIndex", value);
  console.log("[lyrics] 选择在线歌词:", value);
  if (!value) return;

  const [label] = value.split(".");
  const api = onlineLyricsApis.find((item) => item.label === label);
  const songId = lyricsIdMap.value[value];
  if (!api || !songId) {
    console.warn("[lyrics] 在线歌词详情参数无效:", { value, label, songId });
    return;
  }

  onlineLyricsLoading2.value = true;
  try {
    const lrc = await fetchOnlineLyrics(api, songId);
    if (onlineLyricsIndex.value !== value) return;
    console.log("[lyrics] 歌词详情加载成功:", { value, length: lrc.length });
    onlineLyrics.value = lrc;
  } catch (err) {
    if (onlineLyricsIndex.value !== value) return;
    console.error("[lyrics] 歌词详情请求失败:", err);
    Message.error("获取歌词失败");
  } finally {
    if (onlineLyricsIndex.value === value) onlineLyricsLoading2.value = false;
  }
});

/** 缓存原始歌词，用于撤销替换 */
const originalEditBody = ref("");

/** 用在线歌词替换当前编辑区的歌词 */
function replaceWithOnlineLyrics() {
  if (!editableOnlineLyrics.value || !editLyricsData.value?.data) {
    Message.warning("没有可用的在线歌词");
    return;
  }

  const parsedLyrics = parseLrcToLyrics(editableOnlineLyrics.value);
  if (parsedLyrics.length === 0) {
    Message.warning("在线歌词中没有有效时间轴，请开启时间轴后再使用");
    useOnlineLyrics.value = false;
    editLyricsData.value.data._lyricsBody = [];
    originalParsedLyrics.value = [];
    return;
  }

  originalEditBody.value = editLyricsData.value.data._editBody ?? originalAiText.value;
  originalParsedLyrics.value = parsedLyrics.map(([time, text]) => [time, text]);
  lyricsMode.value = "online";
  subtitleEditMode.value = "online";

  editLyricsData.value.data._lyricsBody = parsedLyrics;
  editLyricsData.value.data._editBody = parsedLyrics.map(([, text]) => text).join("\n");

  const firstTimeMs = parsedLyrics[0][0];
  const minutes = Math.floor(firstTimeMs / 60000);
  const seconds = Math.floor((firstTimeMs % 60000) / 1000);
  const milliseconds = firstTimeMs % 1000;
  lyricsStartTime.value = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}.${milliseconds.toString().padStart(3, "0")}`;
  lyricsStartTimeError.value = false;
  Message.success("已替换为在线歌词（含时间轴）");
}

/** 撤销：一键恢复为原始 AI 歌词状态（不论当前处于何种中间状态） */
function undoReplaceLyrics() {
  if (!editLyricsData.value?.data || !originalAiText.value) return;
  editLyricsData.value.data._editBody = originalAiText.value;
  editLyricsData.value.data._lyricsBody = [];
  lyricsMode.value = "ai";
  subtitleEditMode.value = "ai";
  originalEditBody.value = "";
  originalParsedLyrics.value = [];
  lyricsStartTime.value = "";
  lyricsStartTimeError.value = false;
  useOnlineLyrics.value = false;
  aiRewriteContent.value = "";
  Message.success("已恢复原始歌词");
}

/** 智能纠错：用在线歌词纠正 AI 字幕的错别字 */
function smartCorrectLyrics() {
  if (!onlineLyrics.value) {
    Message.warning("请先搜索并加载在线歌词");
    return;
  }
  if (!editLyricsData.value?.data?.body) {
    Message.warning("没有可用的 AI 字幕数据");
    return;
  }
  const aiBody = editLyricsData.value.data.body;
  const onlineText = editableOnlineLyrics.value;

  const corrected = correctLyrics(aiBody, onlineText);
  if (!corrected) {
    Message.warning("未找到匹配的原曲歌词，跳过纠错");
    return;
  }

  originalEditBody.value = editLyricsData.value.data._editBody ?? originalAiText.value;
  editLyricsData.value.data._lyricsBody = corrected;
  editLyricsData.value.data._editBody = corrected.map((item) => item[1]).join("\n");
  lyricsMode.value = "ai-corrected";
  subtitleEditMode.value = "ai-corrected";
  originalParsedLyrics.value = [];
  lyricsStartTime.value = "";
  useOnlineLyrics.value = false;
  Message.success("智能纠错完成，共修正 " + corrected.length + " 行");
}

function handleOk() {
  if (lyricsMode.value === "online") {
    const parsedLyrics = parseLrcToLyrics(editableOnlineLyrics.value);
    if (parsedLyrics.length === 0) {
      Message.error("在线歌词时间轴无效，请开启时间轴后再使用");
      return;
    }
    originalParsedLyrics.value = parsedLyrics;
    const startTimeMs = parseLyricsStartTime(lyricsStartTime.value);
    if (startTimeMs === null) {
      Message.error("在线歌词开始时间无效");
      lyricsStartTimeError.value = true;
      return;
    }
    const offset = startTimeMs - parsedLyrics[0][0];
    editLyricsData.value!.data!._lyricsBody = parsedLyrics.map(([time, text]) => [
      Math.max(0, time + offset),
      text,
    ]);
    editLyricsData.value!.data!._editBody = parsedLyrics.map(([, text]) => text).join("\n");
  }

  subtitleEditMode.value = lyricsMode.value;
  subtitleEdit.value = JSON.parse(JSON.stringify(editLyricsData.value));
  visible.value = false;
}

function handleCancel() {
  visible.value = false;
}

const onlineLyricsApis: { label: string; url: string; detailUrl: string }[] = [
  {
    label: "LuoXueAPI",
    url: "https://api.vkeys.cn/v2/music/tencent/search/song?",
    detailUrl: "https://api.vkeys.cn/v2/music/tencent/lyric?",
  },
];

type CachedSearch = {
  songs: Array<{ id: string; name: string }>;
  expiresAt: number;
};

const SEARCH_CACHE_TTL = 15 * 60 * 1000;
const DETAIL_CACHE_TTL = 24 * 60 * 60 * 1000;
const onlineSearchCache = new Map<string, CachedSearch>();
const onlineSearchPending = new Map<string, Promise<CachedSearch>>();
const onlineLyricsCache = new Map<string, { lrc: string; expiresAt: number }>();
const onlineLyricsPending = new Map<string, Promise<string>>();

function cacheKey(value: string) {
  return value.trim().toLocaleLowerCase();
}

async function fetchOnlineSearch(api: (typeof onlineLyricsApis)[number], word: string) {
  const key = `${api.label}:${cacheKey(word)}`;
  const cached = onlineSearchCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached;
  if (cached) onlineSearchCache.delete(key);

  const pending = onlineSearchPending.get(key);
  if (pending) return pending;

  const url = api.url + new URLSearchParams({ word: word.trim() });
  console.log("[lyrics] 请求搜索接口:", url);
  const task = Promise.race([
    request.get<any>({ url, cookie: false, timeout: 5 }),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("搜索请求超时")), 8000)),
  ])
    .then((res: any) => {
      console.log("[lyrics] 搜索接口响应:", res);
      const list = Array.isArray(res?.data)
        ? res.data
            .filter((song: any) => song?.id != null && (song?.name || song?.song))
            .map((song: any) => ({
              id: String(song.id),
              name: String(song.name || song.song),
            }))
        : [];
      const result = { songs: list, expiresAt: Date.now() + SEARCH_CACHE_TTL };
      onlineSearchCache.set(key, result);
      return result;
    })
    .finally(() => onlineSearchPending.delete(key));

  onlineSearchPending.set(key, task);
  return task;
}

async function fetchOnlineLyrics(api: (typeof onlineLyricsApis)[number], songId: string) {
  const key = `${api.label}:${songId}`;
  const cached = onlineLyricsCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.lrc;
  if (cached) onlineLyricsCache.delete(key);

  const pending = onlineLyricsPending.get(key);
  if (pending) return pending;

  const task = request
    .get<any>({
      url: api.detailUrl + new URLSearchParams({ id: songId }),
      cookie: false,
    })
    .then((res) => {
      const lrc = res?.data?.lrc;
      if (typeof lrc !== "string" || !lrc) throw new Error("响应中未找到歌词");
      onlineLyricsCache.set(key, { lrc, expiresAt: Date.now() + DETAIL_CACHE_TTL });
      return lrc;
    })
    .finally(() => onlineLyricsPending.delete(key));

  onlineLyricsPending.set(key, task);
  return task;
}

/** 搜索结果 id 映射，供选中后获取歌词使用 */
const lyricsIdMap = ref<Record<string, string>>({});

async function searchOnlineLyrics() {
  const word = onlineSearch.value.trim();
  console.log("[lyrics] 开始搜索在线歌词:", word);
  if (!word) {
    Message.warning("请输入歌名");
    return;
  }
  onlineLyricsLoading.value = true;
  onlineLyricsOptions.value = [];
  onlineLyricsIndex.value = "";
  onlineLyrics.value = "";
  editableOnlineLyrics.value = "";
  lyricsIdMap.value = {};

  try {
    await Promise.all(
      onlineLyricsApis.map(async (item): Promise<void> => {
        try {
          const result = await fetchOnlineSearch(item, word);
          const opt: SelectOptionGroup = { isGroup: true, label: item.label, options: [] };
          for (const song of result.songs) {
            const value = item.label + "." + song.id;
            opt.options.push({ label: song.name, value });
            lyricsIdMap.value[value] = song.id;
          }
          console.log("[lyrics] 搜索结果:", item.label, result.songs.length);
          onlineLyricsOptions.value.push(opt);
          if (!onlineLyricsIndex.value && result.songs.length > 0) {
            const firstValue = `${item.label}.${result.songs[0].id}`;
            console.log("[lyrics] 自动选择搜索结果:", firstValue);
            onlineLyricsIndex.value = firstValue;
          }
        } catch (err) {
          console.error("[lyrics] 搜索请求失败 [" + item.label + "]:", err);
          throw err;
        }
      }),
    );
  } catch (err) {
    Message.error("搜索歌词失败" + (err as Error).message);
  } finally {
    onlineLyricsLoading.value = false;
  }
}

function editLyrics(item: SubTitle) {
  editLyricsData.value = JSON.parse(JSON.stringify(item)) as Subtitle2;
  // [DEBUG] 打开工作台时的初始状态
  console.log("[lyrics-debug] editLyrics() 打开工作台", {
    _lyricsBody: editLyricsData.value?.data?._lyricsBody,
    _editBody: editLyricsData.value?.data?._editBody,
    hasClipRanges: !!(fromData.clipRanges && fromData.clipRanges.length > 0),
  });
  if (editLyricsData.value.data) {
    originalAiBody.value = editLyricsData.value.data.body.map((item) => ({ ...item }));
    originalAiText.value = originalAiBody.value
      .map((item) => item.content.replaceAll(/(^♪ )|( ♪$)/g, ""))
      .join("\n");
    lyricsMode.value = "ai";
    subtitleEditMode.value = "ai";
    originalEditBody.value = "";
    originalParsedLyrics.value = [];
    lyricsStartTime.value = "";
    lyricsStartTimeError.value = false;
    useOnlineLyrics.value = false;
    // 将 ♪ 复选框默认设为勾选（预览时显示 ♪）
    lyricsBodySwitch.note = true;

    const aiText = originalAiText.value;
    if (
      fromData.clipRanges &&
      fromData.clipRanges.length > 0 &&
      editLyricsData.value.data._lyricsBody?.length
    ) {
      editLyricsData.value.data._editBody = editLyricsData.value.data._lyricsBody
        .map((item) => item[1].replaceAll(/(^♪ )|( ♪$)/g, ""))
        .join("\n");
    } else {
      editLyricsData.value.data._editBody = aiText;
    }
  }
  onlineSearch.value = fromData.data?.music_title || "";

  searchOnlineLyrics();
  visible.value = true;
}
</script>

<template>
  <a-spin :loading="!fromData.playerData && !error">
    <form @submit.prevent>
      <a-result
        v-if="error"
        status="error"
        :title="error"
        subtitle="请查看视频是否有字幕,包括AI字幕,如果没有,请跳过"
      >
        <template #extra>
          <a-space>
            <a-button type="primary" @click="skipLyrics">跳过字幕嵌入</a-button>
          </a-space>
        </template>
      </a-result>
      <div class="lyrics-list-scroll" v-else-if="fromData.playerData">
        <a-checkbox-group v-model="subtitle" @change="onChange">
          <template v-for="item in subtitles" :key="item.id">
            <a-checkbox :value="item.id_str">
              <template #checkbox="{ checked }">
                <a-space
                  align="start"
                  class="custom-checkbox-card"
                  :class="{ 'custom-checkbox-card-checked': checked }"
                  style="width: 100%"
                >
                  <div className="custom-checkbox-card-mask">
                    <div className="custom-checkbox-card-mask-dot" />
                  </div>
                  <div>
                    <div className="custom-checkbox-card-title">
                      {{ item.lan_doc }}
                      <a-button type="primary" size="small" @click="editLyrics(item)">
                        <template #icon>
                          <icon-settings />
                        </template>
                      </a-button>
                    </div>

                    <div
                      v-if="item.data"
                      class="lyrics-preview-text"
                    >
                      {{
                        subtitleEdit &&
                        subtitleEdit.data &&
                        item.id_str === subtitleEdit.id_str &&
                        lyricsBodyContent
                          ? lyricsBodyContent
                          : item.data.body.map((item) => item.content).join("\n")
                      }}
                    </div>
                  </div>
                </a-space>
              </template>
            </a-checkbox>
          </template>
        </a-checkbox-group>
      </div>
      <UiCheckbox v-model="fromData.externalLyrics" style="margin-top: 8px">
        外置歌词（保存为独立 .lrc 文件，不嵌入音频）
      </UiCheckbox>
      <Btn @next="next" @prev="$emit('prev')" />
    </form>
  </a-spin>
  <a-modal v-model:visible="visible" fullscreen :body-style="{ height: '100%' }">
    <template #title> 歌词工作台 </template>
    <template #footer>
      <UiButton @click="handleCancel"> 取消 </UiButton>
      <UiButton
        type="primary"
        :disabled="!useOnlineLyrics && lyricsBodyLine[0] !== lyricsBodyLine[1]"
        @click="handleOk"
      >
        确定
      </UiButton>
    </template>
    <div v-if="editLyricsData && editLyricsData.data" class="lyrics-workspace">
      <div class="lyrics-left-panel">
        <UiTextarea
          class="lyrics-left-textarea"
          style="margin-right: 10px"
          v-model="editLyricsData.data._editBody"
          :rows="10"
        />
        格式化：
        <div style="display: flex; gap: 8px">
          <UiCheckbox v-model="lyricsBodySwitch.note"> ♪ </UiCheckbox>
        </div>
      </div>
      <a-tabs class="lyrics-right-panel">
        <a-tab-pane key="1" title="在线歌词">
          <UiSpin
            style="height: 100%; display: flex; flex-direction: column"
            :loading="onlineLyricsLoading || onlineLyricsLoading2"
            tip="正在搜索在线歌词"
          >
            <div style="display: flex; gap: 8px">
              <UiInput :style="{ width: '160px' }" placeholder="歌名" v-model="onlineSearch" />
              <UiButton @click="searchOnlineLyrics">
                <template #icon>
                  <icon-search />
                </template>
              </UiButton>
              <a-select
                :options="onlineLyricsOptions"
                :style="{ width: '160px' }"
                placeholder="在线歌词"
                v-model="onlineLyricsIndex"
              />
              <UiCheckbox v-model="lyricsBodySwitch.timeAxis">时间轴</UiCheckbox>
              <UiCheckbox v-model="lyricsBodySwitch.blankChar">空白字符</UiCheckbox>
              <UiCheckbox v-model="lyricsBodySwitch.metaInfo">元信息</UiCheckbox>
              <UiCheckbox v-model="lyricsBodySwitch.stripMeta">智能去除元信息</UiCheckbox>
            </div>
            <div style="margin: 10px 0; display: flex; align-items: center; gap: 10px">
              <UiCheckbox
                v-model="useOnlineLyrics"
                :disabled="!onlineLyrics"
                @change="onUseOnlineLyricsChange"
              >
                使用在线歌词
              </UiCheckbox>
              <span>开始时间：</span>
              <UiInput
                v-model="lyricsStartTime"
                style="width: 100px"
                placeholder="mm:ss"
                :error="lyricsStartTimeError"
                :disabled="!useOnlineLyrics"
                @change="onLyricsStartTimeChange"
              />
              <UiButton :disabled="lyricsMode === 'ai'" @click="undoReplaceLyrics">
                ↩ 撤销
              </UiButton>
            </div>
            <a-alert type="info" style="margin-bottom: 10px">
              💡
              使用在线歌词：勾选后会自动替换歌词并使用在线歌词的时间轴。开始时间指的是在线字幕在视频中应当开始的时间，为了方便对齐可以删掉在线歌词中的非正文部分（如标题，歌手），可以使用去除元数据快速删除。
            </a-alert>
            <div style="margin: 10px 0; display: flex; gap: 8px">
              <UiButton
                type="outline"
                :disabled="!onlineLyrics || useOnlineLyrics"
                @click="smartCorrectLyrics"
              >
                智能纠错
              </UiButton>
            </div>
            <a-alert type="info" style="margin-bottom: 10px">
              💡
              使用智能纠错前，建议勾选「去除元信息」，并手动删除规则无法去除的元信息，确保在线歌词编辑框的第一句就是歌词正文，智能纠错会保留AI字幕的时间轴
            </a-alert>
            <div style="flex: 1; overflow: auto; display: flex; flex-direction: column">
              <div style="display: flex; gap: 8px; margin-bottom: 10px">
                <a-select v-model="lyricsBodySwitch.onlineDiff" style="width: 140px">
                  <a-option
                    v-for="[key, [label]] in Object.entries(diffFunc)"
                    :key="key"
                    :value="key"
                  >
                    {{ label }}
                  </a-option>
                </a-select>
                <UiButton
                  @click="onlineLyricsViewMode = onlineLyricsViewMode === 'edit' ? 'diff' : 'edit'"
                >
                  {{ onlineLyricsViewMode === "edit" ? "查看差异" : "编辑歌词" }}
                </UiButton>
              </div>

              <div
                v-if="onlineLyricsViewMode === 'diff'"
                class="diff-container-textarea"
                style="min-height: 300px"
              >
                <span
                  v-for="(part, index) in onlineLyricsDiff"
                  :key="index"
                  :class="{
                    'diff-added': part.added,
                    'diff-removed': part.removed,
                  }"
                  >{{ part.value }}</span
                >
              </div>
              <UiTextarea
                v-else
                class="online-lyrics-editor"
                v-model="editableOnlineLyrics"
                placeholder="在线歌词（可编辑，修改后用于智能纠错）"
                :rows="10"
              />
            </div>
          </UiSpin>
        </a-tab-pane>
        <a-tab-pane key="2" title="AI 改写" style="display: flex; flex-direction: column">
          <div style="display: flex; flex-direction: column; gap: 8px">
            <a-alert type="info">将网络歌词给AI进行纠正（此部分未进行维护，可用性未知）</a-alert>

            <UiButton type="primary" @click="aiRewrite">AI 改写</UiButton>
            <a-trigger trigger="click" :unmount-on-close="false">
              <UiButton type="primary">
                <template #icon> <icon-settings /> </template>
              </UiButton>
              <template #content>
                <div
                  style="
                    padding: 10px;
                    width: 200px;
                    background-color: var(--color-bg-popup);
                    border-radius: 4px;
                    box-shadow: 0 2px 8px 0 rgba(0, 0, 0, 0.15);
                  "
                >
                  <UiInput placeholder="Host" v-model="userConfig.openai.host" />
                  <UiInput placeholder="Key" v-model="userConfig.openai.key" />
                  <UiInput placeholder="Modal" v-model="userConfig.openai.modal" />
                </div>
              </template>
            </a-trigger>
          </div>
          <a-spin
            style="margin-top: 10px; flex: 1; overflow: auto; width: 100%"
            :loading="aiRewriteLoading"
          >
            <details style="margin-bottom: 10px; border: 1px solid #e3e5e7; border-radius: 6px; padding: 8px">
              <summary style="cursor: pointer; font-weight: 500; margin-bottom: 10px">自定义 Prompt</summary>
                <div style="display: flex; gap: 8px; margin-bottom: 10px">
                  <a-button type="primary" @click="aiRewritePrompt += ' {{onlineLyrics}}'">
                    在线歌词
                  </a-button>

                  <a-button
                    type="primary"
                    @click="aiRewritePrompt += ' {{danmu}}'"
                    :disabled="true"
                  >
                    添加弹幕
                  </a-button>
                </div>
                <UiTextarea
                  v-model="aiRewritePrompt"
                  :rows="4"
                />
            </details>
            <div style="margin-bottom: 10px">
              <a-select v-model="lyricsBodySwitch.aiDiff">
                >
                <a-option
                  v-for="[key, [label]] in Object.entries(diffFunc)"
                  :key="key"
                  :value="key"
                >
                  {{ label }}
                </a-option>
              </a-select>
              <a-alert :type="lyricsBodyLine[0] === lyricsBodyLine[2] ? 'success' : 'error'"
                ><span style="margin-right: 20px">原行数：{{ lyricsBodyLine[0] }}</span
                ><span>AI行数：{{ lyricsBodyLine[2] }}</span>
              </a-alert>
            </div>
            <div class="diff-container-textarea">
              <span
                v-for="(part, index) in aiLyricsDiff"
                :key="index"
                :class="{
                  'diff-added': part.added,
                  'diff-removed': part.removed,
                }"
                >{{ part.value }}</span
              >
            </div>
          </a-spin>
        </a-tab-pane>
        <a-tab-pane key="3" title="结果预览">
          <UiTextarea class="result-preview-editor" :model-value="lyricsBodyContent" :rows="10" />
        </a-tab-pane>
      </a-tabs>
    </div>
  </a-modal>
</template>

<style>
.custom-checkbox-card-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.lyrics-list-scroll {
  max-height: 60vh;
  overflow-y: auto;
}
.lyrics-preview-text {
  width: 100%;
  height: 280px;
  white-space: break-spaces;
  overflow-y: scroll;
  color: #4f4d4d;
}

/* 深色模式：歌词预览文字 */
body[arco-theme="dark"] .lyrics-preview-text {
  color: #b0b5bb;
}

.lyrics-left-textarea .arco-textarea {
  resize: none;
}

/* 在线歌词编辑框、结果预览框高度 */
.lyrics-right-panel .online-lyrics-editor .arco-textarea,
.lyrics-right-panel .result-preview-editor .arco-textarea {
  min-height: 300px;
}

/* 工作台整体布局 */
.lyrics-workspace {
  display: flex;
  height: 100%;
  min-height: 0;
  justify-content: space-around;
}

/* 左侧：歌词编辑框 */
.lyrics-left-panel {
  width: 48%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.lyrics-left-textarea {
  flex: 1;
  min-height: 200px;
}

/* 右侧：tab 面板整体可滚动 */
.lyrics-right-panel {
  width: 48%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow-y: auto;
}
.lyrics-right-panel .arco-tabs-header {
  flex-shrink: 0;
}
.lyrics-right-panel .arco-tabs-content {
  flex: 1;
  min-height: 0;
  overflow: visible !important;
}
.lyrics-right-panel .arco-tabs-content-list {
  height: auto !important;
}
.lyrics-right-panel .arco-tabs-content-item-active,
.lyrics-right-panel .arco-tabs-content-item {
  height: auto !important;
}
.lyrics-right-panel .arco-tabs-pane {
  height: auto !important;
}

.diff-container-textarea {
  overflow-y: scroll;
  flex: 1;
  white-space: pre-wrap;
  font-family: monospace;
  background: #f5f5f5;
  width: 100%;
  padding-right: 0;
  padding-left: 0;
  color: inherit;
  border: none;
  border-radius: 0;
  outline: 0;
  cursor: inherit;
  display: block;
  box-sizing: border-box;
  padding: 4px 12px;
  font-size: 14px;
  line-height: 1.5715;
  font-family: var(--bew-font-family, var(--bew-fonts-mandarin-cn));
}

/* 差异高亮样式 */
.diff-added {
  background-color: #e6ffe6;
  color: #1a1a1a;
}

.diff-removed {
  background-color: #ffe6e6;
  color: #1a1a1a;
}

/* 深色模式：差异容器背景 */
body[arco-theme="dark"] .diff-container-textarea {
  background: #2a2a2a;
  color: #e0e0e0;
}

/* 深色模式：差异高亮色 */
body[arco-theme="dark"] .diff-added {
  background-color: #1a3a1a;
  color: #90ee90;
}

body[arco-theme="dark"] .diff-removed {
  background-color: #3a1a1a;
  color: #ff6b6b;
}
</style>
