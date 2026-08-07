<script lang="ts" setup>
import { fromData, Lyrics, RecordData, userConfig } from "@/data";
import { onMounted, ref, computed, reactive } from "vue";
import { request } from "@/utils/requests";
import Btn from "@/components/btn.vue";
import { Message, SelectOptionGroup } from "@arco-design/web-vue";
import { callOpenAI, ChatCompletionMessageParam } from "@/utils/gpt";
import { diffChars, diffWords, diffLines, Change } from "diff";
import { logger } from "@/utils/logger";
import { GM_getValue } from "$";
import { correctLyrics, cleanOriginalLyrics } from "@/utils/lyricsCorrector";
const emits = defineEmits(["next", "prev"]);

type SubTitle = PlayerData["subtitle"]["subtitles"][number];

const subtitles = ref<SubTitle[]>([]);
const noSubtitle = ref(false);
const subtitle = ref<string[]>([]);

const subtitleEdit = ref<SubTitle | null>(null);

const lyricsRecord = {
  label: undefined as string | undefined,
};

const onChange = (v: (string | number | boolean)[]) => {
  const val = v.pop();
  if (val) {
    subtitle.value = [val.toString()];
    const s = subtitles.value.find((item) => item.id_str === val.toString());
    lyricsRecord.label = s?.lan_doc;
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
  } else if (subtitleEdit.value && subtitleEdit.value.data && lyricsBodyContent.value) {
    // 优先使用 _lyricsBody 中的时间轴（来自在线歌词或智能纠错）
    if (subtitleEdit.value.data._lyricsBody && subtitleEdit.value.data._lyricsBody.length > 0) {
      lyricsData = subtitleEdit.value.data._lyricsBody;
    } else {
      // 回退到使用原始 body 的时间轴
      lyricsData = lyricsBodyContent.value
        .split("\n")
        .map((item, index) => [Math.round(subtitleEdit.value!.data!.body[index].from * 1000), item]);
    }
  } else {
    {
      const s = subtitles.value.find((item) => item.id_str === subtitle.value[0]);
      if (!s || !s.data) {
        Message.error("歌词数据错误");
        return;
      }
      lyricsData = s.data.body.map((item) => [Math.round(item.from * 1000), item.content]);
      // 直接下一页的时候在剪辑歌词
      if (fromData.clipRanges && fromData.clipRanges.length > 0) {
        // lyricsData = lyrics_clip(fromData.clipRanges, lyricsData);
      }
    }
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
          const defaultLan = GM_getValue<RecordData | null>("default_rule");
          const default_lyrics_lan = defaultLan?.lyrics;
          console.log(default_lyrics_lan);
          const matched = default_lyrics_lan
            ? _subtitles.find((s) => s.lan_doc === default_lyrics_lan)
            : undefined;
          if (matched) {
            subtitle.value = [matched.id_str];
            lyricsRecord.label = matched.lan_doc;
            let lyricsData: Lyrics | undefined = matched.data?.body.map((item) => [
              Math.round(item.from * 1000),
              item.content,
            ]);
            if (lyricsData) {
              fromData.lyricsData = lyricsData;
            }
          }
          if (fromData.lyricsData) {
            const val = _subtitles[0].id_str;
            subtitle.value = [val];
            lyricsRecord.label = _subtitles[0].lan_doc;
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
      error.value = err.message;
    });
});

const visible = ref(false);

const editLyricsData = ref<SubTitle | null>(null);

const onlineLyrics = ref<string>("");

/** 第一句歌词开始时间（mm:ss格式） */
const lyricsStartTime = ref("");
const lyricsStartTimeError = ref(false);

/** 是否使用在线歌词 */
const useOnlineLyrics = ref(false);

/**
 * 当"使用在线歌词"开关变化时，自动替换或撤销歌词
 */
function onUseOnlineLyricsChange(value: boolean | Array<string | number | boolean>) {
  if (value) {
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
  const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const minutes = parseInt(match[1], 10);
  const seconds = parseInt(match[2], 10);

  if (seconds >= 60) return null;

  return minutes * 60 * 1000 + seconds * 1000;
}

/**
 * 当开始时间输入变化时，实时调整歌词时间轴
 */
function onLyricsStartTimeChange(value: string) {
  if (!value) {
    lyricsStartTimeError.value = false;
    return;
  }

  const startTimeMs = parseLyricsStartTime(value);
  if (startTimeMs === null) {
    lyricsStartTimeError.value = true;
    return;
  }

  lyricsStartTimeError.value = false;

  // 如果有在线歌词且已替换，实时调整时间轴
  if (editLyricsData.value?.data?._lyricsBody && editLyricsData.value.data._lyricsBody.length > 0) {
    const firstLyricTime = editLyricsData.value.data._lyricsBody[0][0];
    const offset = startTimeMs - firstLyricTime;

    // 调整所有歌词的时间戳
    editLyricsData.value.data._lyricsBody = editLyricsData.value.data._lyricsBody.map(([time, text]) => [
      Math.max(0, time + offset),
      text
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
  const lines = lrcText.split("\n");

  for (const line of lines) {
    // 匹配 [MM:SS.mm] 或 [MM:SS:mm] 格式的时间戳
    const match = line.match(/^\[(\d{2}):(\d{2})[.:](\d{2,3})\](.*)/);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const milliseconds = parseInt(match[3].padEnd(3, "0"), 10);
      const content = match[4].trim();

      // 只添加有内容的歌词行
      if (content) {
        const totalMs = minutes * 60 * 1000 + seconds * 1000 + milliseconds;
        result.push([totalMs, content]);
      }
    }
  }

  return result;
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
    editLyricsData.value.data._editBody,
    editableOnlineLyrics.value,
  );
});

const lyricsBodyLine = computed(() => {
  // 原长度，剪辑长度，AI改写长度
  if (!editLyricsData.value?.data) return [0, 0, 0];

  // 当使用在线歌词时，原行数使用在线歌词的行数
  const originalLineCount = editLyricsData.value.data._lyricsBody && editLyricsData.value.data._lyricsBody.length > 0
    ? editLyricsData.value.data._lyricsBody.length
    : editLyricsData.value.data.body.length;

  return [
    originalLineCount,
    editLyricsData.value.data._editBody.split("\n").length,
    aiRewriteContent.value.trim().split("\n").length,
  ];
});

const lyricsBodyContent = computed(() => {
  if (!editLyricsData.value?.data) return "";
  if (lyricsBodySwitch.note) {
    return editLyricsData.value.data._editBody
      .split("\n")
      .map((item) => `♪ ${item} ♪`)
      .join("\n");
  }
  return editLyricsData.value.data._editBody;
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
  content = content.replace(/\[\d{2}:\d{2}[\.:]\d{2,3}]\n/g, "");

  // 如果不显示时间轴，移除所有时间标记 [00:00.00] 格式
  if (!timeAxis) {
    content = content.replace(/\[\d{2}:\d{2}[\.:]\d{2,3}]/g, "");
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
watch(onlineLyricsContent, (val) => {
  editableOnlineLyrics.value = val;
}, { immediate: true });

const aiRewriteLoading = ref(false);
const aiRewriteContent = ref("");

const aiLyricsDiff = computed(() => {
  if (!editLyricsData.value?.data) return [];
  return diffFunc[lyricsBodySwitch.aiDiff][1](
    editLyricsData.value.data._editBody,
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

watch(onlineLyricsIndex, (value) => {
  logger.debug("watch onlineLyricsIndex", value);
  if (value) {
    onlineLyricsLoading2.value = true;
    try {
      const [label] = value.split(".");
      const api = onlineLyricsApis.find((item) => item.label === label);
      if (!api) {
        console.warn("[lyrics] 未找到匹配的 API:", label);
        return;
      }
      const songId = lyricsIdMap.value[value];
      if (!songId) {
        console.warn("[lyrics] 未找到歌曲 ID, key:", value);
        return;
      }
      const detailUrl = api.detailUrl + new URLSearchParams({ id: songId });
      console.log("[lyrics] 请求歌词详情:", detailUrl);
      request
        .get<any>({
          url: detailUrl,
          cookie: false,
        })
        .then((res) => {
          console.log("[lyrics] 歌词详情响应:", res);
          const lrc = res?.data?.lrc;
          if (lrc) {
            onlineLyrics.value = lrc;
          } else {
            console.warn("[lyrics] 响应中未找到 data.lrc, 完整响应:", res);
            Message.warning("未找到歌词");
          }
        })
        .catch((err) => {
          console.error("[lyrics] 歌词详情请求失败:", err);
          Message.error("获取歌词失败");
        });
    } catch (err) {
      console.error("[lyrics] 歌词详情处理异常:", err);
      Message.error("获取歌词失败" + (err as Error).message);
    } finally {
      onlineLyricsLoading2.value = false;
    }
  }
});

/** 缓存原始歌词，用于撤销替换 */
const originalEditBody = ref("");

/** 用在线歌词替换当前编辑区的歌词 */
function replaceWithOnlineLyrics() {
  if (!editableOnlineLyrics.value) {
    Message.warning("没有可用的在线歌词");
    return;
  }
  if (!editLyricsData.value?.data) return;
  originalEditBody.value = editLyricsData.value.data._editBody;

  // 解析在线歌词编辑框的内容（已去除元信息）的时间轴并保存到 _lyricsBody
  const parsedLyrics = parseLrcToLyrics(editableOnlineLyrics.value);
  if (parsedLyrics.length > 0) {
    editLyricsData.value.data._lyricsBody = parsedLyrics;
    // 使用解析后的纯文本作为编辑区内容
    editLyricsData.value.data._editBody = parsedLyrics.map((item) => item[1]).join("\n");

    // 自动填充第一句歌词的开始时间
    const firstTimeMs = parsedLyrics[0][0];
    const minutes = Math.floor(firstTimeMs / 60000);
    const seconds = Math.floor((firstTimeMs % 60000) / 1000);
    lyricsStartTime.value = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    lyricsStartTimeError.value = false;
  } else {
    // 如果解析失败，使用编辑框中的纯文本
    editLyricsData.value.data._editBody = editableOnlineLyrics.value;
  }
  Message.success("已替换为在线歌词（含时间轴）");
}

/** 撤销：恢复为原始歌词 */
function undoReplaceLyrics() {
  if (!editLyricsData.value?.data || !originalEditBody.value) return;
  editLyricsData.value.data._editBody = originalEditBody.value;
  // 清空 _lyricsBody，恢复使用原始时间轴
  editLyricsData.value.data._lyricsBody = [];
  originalEditBody.value = "";
  // 清空开始时间输入框
  lyricsStartTime.value = "";
  lyricsStartTimeError.value = false;
  Message.success("已恢复原始歌词（使用原始时间轴）");
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

  // 保存原始歌词用于撤销
  originalEditBody.value = editLyricsData.value.data._editBody;
  // 将纠正后的 [ms, text][] 保存到 _lyricsBody（使用原AI识别的时间轴）
  editLyricsData.value.data._lyricsBody = corrected;
  // 将纠正后的纯文本写入编辑区
  editLyricsData.value.data._editBody = corrected.map((item) => item[1]).join("\n");
  Message.success("智能纠错完成，共修正 " + corrected.length + " 行");
}

function handleOk() {
  subtitleEdit.value = JSON.parse(JSON.stringify(editLyricsData.value));
  visible.value = false;
}

function handleCancel() {
  visible.value = false;
}

const onlineLyricsApis: { label: string; url: string; detailUrl: string }[] = [
{label:"LuoXueAPI",
  url:"https://api.vkeys.cn/v2/music/tencent/search/song?",
  detailUrl:"https://api.vkeys.cn/v2/music/tencent/lyric?"
}
];

/** 搜索结果 id 映射，供选中后获取歌词使用 */
const lyricsIdMap = ref<Record<string, string>>({});

async function searchOnlineLyrics() {
  if (!onlineSearch.value) return;
  onlineLyricsLoading.value = true;
  onlineLyricsOptions.value = [];
  onlineLyricsIndex.value = "";
  onlineLyrics.value = "";
  lyricsIdMap.value = {};

  try {
    await Promise.all(
      onlineLyricsApis.map((item): Promise<void> => {
        // 搜索接口返回 JSON，取 data[].id + data[].name
        return request
          .get<any>({
            url: item.url + new URLSearchParams({ word: onlineSearch.value }),
            cookie: false,
          })
          .then((res) => {
            console.log("[lyrics] 搜索响应 [" + item.label + "]:", res);
            const opt: SelectOptionGroup = { isGroup: true, label: item.label, options: [] };
            const list = res?.data ?? [];
            if (!Array.isArray(res?.data)) {
              console.warn("[lyrics] 搜索响应格式异常, 期望 data 为数组:", res);
            }
            for (const song of list) {
              const value = item.label + "." + song.id;
              opt.options.push({ label: song.name, value });
              lyricsIdMap.value[value] = song.id;
              if (!onlineLyricsIndex.value) {
                onlineLyricsIndex.value = value;
              }
            }
            console.log("[lyrics] 搜索结果 [" + item.label + "]:", opt.options.length + " 首");
            onlineLyricsOptions.value.push(opt);
          })
          .catch((err) => {
            console.error("[lyrics] 搜索请求失败 [" + item.label + "]:", err);
            throw err;
          });
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
  if (editLyricsData.value.data) {
    if (fromData.clipRanges && fromData.clipRanges.length > 0) {
      // editLyricsData.value.data._lyricsBody = lyrics_clip(
      //   fromData.clipRanges,
      //   editLyricsData.value.data.body.map((item) => [
      //     Math.round(item.from * 1000),
      //     item.content,
      //   ])
      // );
      editLyricsData.value.data._editBody = editLyricsData.value.data._lyricsBody
        .map((item) => item[1].replaceAll(/(^♪ )|( ♪$)/g, ""))
        .join("\n");
    } else {
      editLyricsData.value.data._editBody = editLyricsData.value.data.body
        .map((item) => item.content.replaceAll(/(^♪ )|( ♪$)/g, ""))
        .join("\n");
    }
  }
  onlineSearch.value = fromData.data?.music_title || "";

  searchOnlineLyrics();
  visible.value = true;
}
</script>

<template>
  <a-spin :loading="!fromData.playerData && !error">
    <a-form auto-label-width :model="{}">
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
                      style="
                        width: 100%;
                        height: 280px;
                        white-space: break-spaces;
                        overflow-y: scroll;
                        color: #4f4d4d;
                      "
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
      <a-checkbox v-model="fromData.externalLyrics" style="margin-top: 8px">
        外置歌词（保存为独立 .lrc 文件，不嵌入音频）
      </a-checkbox>
      <Btn @next="next" @prev="$emit('prev')" />
    </a-form>
  </a-spin>
  <a-modal v-model:visible="visible" fullscreen :body-style="{ height: '100%' }">
    <template #title> 歌词工作台 </template>
    <template #footer>
      <a-button @click="handleCancel"> 取消 </a-button>
      <a-button
        type="primary"
        :disabled="!useOnlineLyrics && lyricsBodyLine[0] !== lyricsBodyLine[1]"
        @click="handleOk"
      >
        确定
      </a-button>
    </template>
    <div
      v-if="editLyricsData && editLyricsData.data"
      style="display: flex; height: 100%; justify-content: space-around"
    >
      <div style="width: 48%; display: flex; flex-direction: column">
        <a-textarea
          style="flex: 1; margin-right: 10px"
          v-model="editLyricsData.data._editBody"
          show-word-limit
          :max-length="useOnlineLyrics ? undefined : { length: lyricsBodyLine[0], errorOnly: true }"
          :word-length="(v: string) => v.split('\n').length"
        />
        格式化：
        <a-input-group>
          <a-checkbox v-model="lyricsBodySwitch.note"> ♪ </a-checkbox>
        </a-input-group>
      </div>
      <a-tabs style="width: 48%; display: flex; flex-direction: column" justify>
        <a-tab-pane key="1" title="在线歌词">
          <a-spin
            style="height: 100%; display: flex; flex-direction: column"
            :loading="onlineLyricsLoading || onlineLyricsLoading2"
            tip="正在搜索在线歌词"
          >
            <a-input-group>
              <a-input :style="{ width: '160px' }" placeholder="歌名" v-model="onlineSearch" />
              <a-button @click="searchOnlineLyrics">
                <template #icon>
                  <icon-search />
                </template>
              </a-button>
              <a-select
                :options="onlineLyricsOptions"
                :style="{ width: '160px' }"
                placeholder="在线歌词"
                v-model="onlineLyricsIndex"
              />
              <a-checkbox v-model="lyricsBodySwitch.timeAxis">时间轴</a-checkbox>
              <a-checkbox v-model="lyricsBodySwitch.blankChar">空白字符</a-checkbox>
              <a-checkbox v-model="lyricsBodySwitch.metaInfo">元信息</a-checkbox>
              <a-checkbox v-model="lyricsBodySwitch.stripMeta">去除元信息</a-checkbox>
            </a-input-group>
            <div style="margin: 10px 0; display: flex; align-items: center; gap: 10px">
              <a-checkbox v-model="useOnlineLyrics" :disabled="!onlineLyrics" @change="onUseOnlineLyricsChange">
                使用在线歌词
              </a-checkbox>
              <span>开始时间：</span>
              <a-input
                v-model="lyricsStartTime"
                style="width: 80px"
                placeholder="mm:ss"
                :error="lyricsStartTimeError"
                :disabled="!useOnlineLyrics"
                @change="onLyricsStartTimeChange"
              />
              <a-button
                :disabled="!originalEditBody"
                @click="undoReplaceLyrics"
              >
                ↩ 撤销
              </a-button>
            </div>
            <a-alert type="info" style="margin-bottom: 10px">
              💡 使用在线歌词：勾选后会自动替换歌词并使用在线歌词的时间轴。请先勾选「去除元信息」，并手动删除规则无法去除的元信息，确保在线歌词编辑框的第一句就是歌词正文，然后输入第一句歌词在视频中的开始时间
            </a-alert>
            <a-button-group style="margin: 10px 0">
              <a-button
                type="outline"
                :disabled="!onlineLyrics || useOnlineLyrics"
                @click="smartCorrectLyrics"
              >
                🧠 智能纠错
              </a-button>
            </a-button-group>
            <a-alert type="info" style="margin-bottom: 10px">
              💡 使用智能纠错前，建议勾选「去除元信息」，并手动删除规则无法去除的元信息，确保在线歌词编辑框的第一句就是歌词正文
            </a-alert>
            <div style="flex: 1; overflow: auto; display: flex; flex-direction: column">
              <a-input-group style="margin-bottom: 10px">
                <a-select v-model="lyricsBodySwitch.onlineDiff" style="width: 140px">
                  <a-option
                    v-for="[key, [label]] in Object.entries(diffFunc)"
                    :key="key"
                    :value="key"
                  >
                    {{ label }}
                  </a-option>
                </a-select>
                <a-button @click="onlineLyricsViewMode = onlineLyricsViewMode === 'edit' ? 'diff' : 'edit'">
                  {{ onlineLyricsViewMode === 'edit' ? '查看差异' : '编辑歌词' }}
                </a-button>
              </a-input-group>

              <div v-if="onlineLyricsViewMode === 'diff'" class="diff-container-textarea">
                <span
                  v-for="(part, index) in onlineLyricsDiff"
                  :key="index"
                  :style="{
                    backgroundColor: part.added
                      ? '#e6ffe6'
                      : part.removed
                        ? '#ffe6e6'
                        : 'transparent',
                  }"
                  >{{ part.value }}</span
                >
              </div>
              <a-textarea
                v-else
                v-model="editableOnlineLyrics"
                style="flex: 1"
                placeholder="在线歌词（可编辑，修改后用于智能纠错）"
              />
            </div>
          </a-spin>
        </a-tab-pane>
        <a-tab-pane key="2" title="AI 改写" style="display: flex; flex-direction: column">
          <a-button-group>
            <a-alert type="info">将网络歌词给AI进行纠正</a-alert>

            <a-button type="primary" @click="aiRewrite">AI 改写</a-button>
            <a-trigger trigger="click" :unmount-on-close="false">
              <a-button type="primary">
                <template #icon> <icon-settings /> </template>
              </a-button>
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
                  <a-input placeholder="Host" v-model="userConfig.openai.host" />
                  <a-input placeholder="Key" v-model="userConfig.openai.key" />
                  <a-input placeholder="Modal" v-model="userConfig.openai.modal" />
                </div>
              </template>
            </a-trigger>
          </a-button-group>
          <a-spin
            style="margin-top: 10px; flex: 1; overflow: auto; width: 100%"
            :loading="aiRewriteLoading"
          >
            <a-collapse style="margin-bottom: 10px">
              <a-collapse-item header="自定义 Prompt" key="1">
                <a-space style="margin-bottom: 10px">
                  <a-button type="primary" @click="aiRewritePrompt += ' {{onlineLyrics}}'">
                    在线歌词
                  </a-button>

                  <a-button-group>
                    <a-button
                      type="primary"
                      @click="aiRewritePrompt += ' {{danmu}}'"
                      :disabled="true"
                    >
                      添加弹幕
                    </a-button>
                  </a-button-group>
                </a-space>
                <a-textarea
                  v-model="aiRewritePrompt"
                  :auto-size="{
                    minRows: 4,
                    maxRows: 10,
                  }"
                />
              </a-collapse-item>
            </a-collapse>
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
                :style="{
                  backgroundColor: part.added
                    ? '#e6ffe6'
                    : part.removed
                      ? '#ffe6e6'
                      : 'transparent',
                }"
                >{{ part.value }}</span
              >
            </div>
          </a-spin>
        </a-tab-pane>
        <a-tab-pane key="3" title="结果预览">
          <a-textarea style="height: 100%" :model-value="lyricsBodyContent" />
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
.arco-textarea {
  resize: none;
}

.arco-tabs-pane {
  display: flex;
  flex-direction: column;
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
  /* -webkit-tap-highlight-color: transparent; */
  display: block;
  box-sizing: border-box;
  min-height: 32px;
  padding: 4px 12px;
  font-size: 14px;
  line-height: 1.5715;
  font-family: var(--bew-font-family, var(--bew-fonts-mandarin-cn));
}
</style>
