import { GM_getValue, GM_setValue, unsafeWindow } from "$";
import { reactive } from "vue";

import { deepmerge, clone } from "@/utils/deepmerge";
import { logger } from "@/utils/logger";
// import { ClipRanges, Lyrics } from "@ocyss/wasm-music-backend";

export const defaultUserConfig = {
  darkMode: false,
  openai: {
    host: "https://api.openai.com/v1",
    key: "",
    modal: "gpt-4o-mini",
  },
};

export const userConfig = reactive(
  deepmerge(defaultUserConfig, GM_getValue("userConfig", {}), {
    clone: false,
  }),
);

watch(userConfig, (newVal) => {
  logger.debug("write userConfig", newVal);
  GM_setValue("userConfig", clone(newVal));
});

export type Lyrics = Array<[number, string]>;
export type ClipRanges = Array<[number, number]>;
export type RecordData = typeof defaultRecordData;

export const defaultRecordData = {
  format: {
    title: "",
    author: "",
    file: "",
  },
  cover: undefined as string | undefined,
  lyrics: undefined as string | undefined,
  clipRanges: null as ClipRanges | null,
  speed: 1,
};

export function normalizeRecordProcessingRule(
  rule: Partial<RecordData> | null | undefined,
): Pick<RecordData, "clipRanges" | "speed"> {
  const clipRanges = Array.isArray(rule?.clipRanges)
    ? rule.clipRanges
        .filter(
          (range): range is [number, number] =>
            Array.isArray(range) &&
            range.length >= 2 &&
            Number.isFinite(Number(range[0])) &&
            Number.isFinite(Number(range[1])),
        )
        .map(
          ([start, end]) =>
            [Math.max(0, Math.round(Number(start))), Math.max(0, Math.round(Number(end)))] as [
              number,
              number,
            ],
        )
        .filter(([start, end]) => end > start)
    : null;
  const storedSpeed = Number(rule?.speed);
  const speed =
    Number.isFinite(storedSpeed) && storedSpeed >= 0.5 && storedSpeed <= 2 ? storedSpeed : 1;

  return {
    clipRanges: clipRanges && clipRanges.length > 0 ? clipRanges : null,
    speed,
  };
}

export const defaultData = {
  data: null as MusicData | null,
  err: null as any,
  coverUrl: null as null | string,
  lyricsData: null as null | Lyrics,
  clipRanges: null as null | ClipRanges,
  videoData: null as VideoData | null,
  playerData: null as PlayerData | null,
  videoParse: null as VideoParse | null,

  title: "",
  author: "",
  file: "",
  // 下载/播放倍速
  speed: 1,
  record: defaultRecordData,
  usedefaultconfig: false,
  // 外置歌词：不嵌入音频，单独保存为 .lrc 文件
  externalLyrics: false,
};

export const fromData = reactive(clone(defaultData));

export const reset = () => {
  deepmerge(fromData, defaultData, { clone: false });
};

unsafeWindow._bilibili_music_fromData = fromData;
unsafeWindow._bilibili_music_userConfig = userConfig;
