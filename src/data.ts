import { reactive } from "vue";
import { deepmerge, clone } from "@/utils/deepmerge";
import { GM_getValue, GM_setValue, unsafeWindow } from "$";
import { logger } from "@/utils/logger";
// import { ClipRanges, Lyrics } from "@ocyss/wasm-music-backend";

export const defaultUserConfig = {
  openai: {
    host: "https://api.openai.com/v1",
    key: "",
    modal: "gpt-4o-mini",
  },
};

export const userConfig = reactive(
  deepmerge(defaultUserConfig, GM_getValue("userConfig", {}), {
    clone: false,
  })
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
};

export const fromData = reactive(clone(defaultData));

export const reset = () => {
  deepmerge(fromData, defaultData, { clone: false });
};

unsafeWindow._bilibili_music_fromData = fromData;
unsafeWindow._bilibili_music_userConfig = userConfig;
