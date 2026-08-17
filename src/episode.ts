import { GM_getValue, unsafeWindow } from "$";
import { Message } from "@/utils/message";
import { createApp, h } from "vue";
import PickerComponent from "@/steps/picker.vue";

import { fromData, type RecordData } from "@/data";
import {
  beginDownloadTask,
  cancelDownloadTaskBatch,
  completeDownloadTask,
  configureTaskCenterActions,
  failDownloadTask,
  getInterruptedDownloadTasks,
  getRetryableDownloadTasks,
  getTaskCenterState,
  prepareDownloadTaskRetry,
  setDownloadTaskBatchPaused,
  startDownloadTaskBatch,
} from "@/taskCenter";
import { clone } from "@/utils/deepmerge";
import { logger } from "@/utils/logger";
import { request } from "@/utils/requests";

export interface EpisodeVideoData extends VideoData {
  page?: number;
  part?: string;
  first_frame?: string;
  _wasmMusicOriginalTitle?: string;
  _wasmMusicCustomTitle?: string;
  _wasmMusicPickerLabel?: string;
  _wasmMusicPickerTitle?: string;
  _wasmMusicSectionTitle?: string;
  _wasmMusicBatchPrefix?: string;
  _wasmMusicCurrent?: boolean;
  _wasmMusicHydrated?: boolean;
  _wasmMusicSkipMontage?: boolean;
  _wasmMusicSkipDomMetadata?: boolean;
  _wasmMusicTaskId?: string;
}

interface MountedApp {
  app: { unmount: () => void };
  root: HTMLElement;
}

export interface EpisodeDownloadResult {
  bvid: string;
  page: number;
  label: string;
  status: "success" | "failed";
  error?: string;
}

interface EpisodeSession {
  activeVideoData: EpisodeVideoData | null;
  queue: EpisodeVideoData[];
  isBatch: boolean;
  auto: boolean;
  manualEach: boolean;
  rule: RecordData | null;
  app: MountedApp["app"] | null;
  root: HTMLElement | null;
  picker: HTMLElement | null;
  opening: boolean;
  advanceTimer: ReturnType<typeof setTimeout> | null;
  total: number;
  completed: number;
  succeeded: number;
  failed: number;
  results: EpisodeDownloadResult[];
  settling: boolean;
  hasMultiplePages: boolean; // 视频是否有多个分P可供选择
  paused: boolean;
  /** 加载的所有剧集（供 picker 步骤使用） */
  allEpisodes: EpisodeVideoData[];
  /** 当前剧集在 allEpisodes 中的索引 */
  currentEpisodeIndex: number;
  /** picker 元数据（标题、分类等） */
  pickerMeta: PickerMeta;
}

interface BilibiliResponse<T> {
  code: number;
  message?: string;
  data?: T;
}

export interface PickerMeta {
  title?: string;
  subtitle?: string;
  itemLabel?: string;
  currentLabel?: string;
  categories?: string[];
}

interface EpisodeLoadResult {
  episodes: EpisodeVideoData[];
  currentIndex: number;
  pickerMeta: PickerMeta;
}

export interface EpisodeSelection {
  indexes: number[];
  useDefault: boolean;
  manualEach: boolean;
  titleOverrides: Record<number, string>;
}

type RawEpisode = Episode & {
  pages?: Page[];
  arc: Arc & {
    bvid?: string;
    cid?: number;
    owner?: Owner;
  };
};

type RawEpisodePage = Partial<Page & Page2>;

type PageWindow = Window &
  typeof globalThis & {
    cid?: number;
    __INITIAL_STATE__?: {
      cid?: number;
      videoData?: VideoData;
    };
  };

export const episodeSession: EpisodeSession = {
  activeVideoData: null,
  queue: [],
  isBatch: false,
  auto: false,
  manualEach: false,
  rule: null,
  app: null,
  root: null,
  picker: null,
  opening: false,
  advanceTimer: null,
  total: 0,
  completed: 0,
  succeeded: 0,
  failed: 0,
  results: [],
  settling: false,
  paused: false,
  hasMultiplePages: false,
  allEpisodes: [],
  currentEpisodeIndex: 0,
  pickerMeta: {},
};

let appLauncher: (() => MountedApp) | null = null;
let activeOperationCanceller: (() => void) | null = null;
let activeOperationCancellerGeneration = 0;
let appTransitionHandler: ((videoData: EpisodeVideoData) => void | Promise<void>) | null = null;

export function configureEpisodeAppLauncher(launcher: () => MountedApp) {
  appLauncher = launcher;
}

export function registerEpisodeAppTransitionHandler(
  handler: (videoData: EpisodeVideoData) => void | Promise<void>,
) {
  appTransitionHandler = handler;
  return () => {
    if (appTransitionHandler === handler) {
      appTransitionHandler = null;
    }
  };
}

export function registerActiveEpisodeOperationCanceller(canceller: (() => void) | null) {
  const generation = ++activeOperationCancellerGeneration;
  activeOperationCanceller = canceller;
  return () => {
    if (activeOperationCancellerGeneration === generation) {
      activeOperationCanceller = null;
    }
  };
}

export function getActiveDefaultRule() {
  return episodeSession.rule || GM_getValue<RecordData | null>("default_rule");
}

export function buildEpisodeSourceUrl(
  videoData: EpisodeVideoData | VideoData | null,
  currentUrl = location.href,
) {
  if (!videoData?.bvid) {
    return currentUrl.split("?")[0];
  }

  const current = new URL(currentUrl);
  const currentBvid = current.pathname.match(/\/video\/(BV[\w]+)/i)?.[1];
  const page = "page" in videoData ? Number(videoData.page) : 0;
  const pageCount = Array.isArray(videoData.pages) ? videoData.pages.length : 0;
  const isOrdinaryCurrentVideo =
    currentBvid?.toLowerCase() === videoData.bvid.toLowerCase() && page <= 1 && pageCount <= 1;
  if (isOrdinaryCurrentVideo) {
    return currentUrl.split("?")[0];
  }

  const url = new URL(`/video/${videoData.bvid}/`, current.origin);
  if (page > 1 || (page === 1 && pageCount > 1)) {
    url.searchParams.set("p", page.toString());
  }
  return url.href;
}

export function getEpisodeSourceUrl() {
  return buildEpisodeSourceUrl(episodeSession.activeVideoData || fromData.videoData);
}

function getPlayerVideoData() {
  const playerWrap = document.querySelector<
    HTMLDivElement & { __vue__?: { videoData?: VideoData } }
  >("#playerWrap");
  const pageWindow = unsafeWindow as unknown as PageWindow;
  return playerWrap?.__vue__?.videoData || pageWindow.__INITIAL_STATE__?.videoData || null;
}

export function formatEpisodeDuration(duration: number) {
  const total = Math.max(0, Number(duration) || 0);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = Math.floor(total % 60);
  return hours > 0
    ? `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds
        .toString()
        .padStart(2, "0")}`
    : `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

async function fetchVideoViewData(bvid: string) {
  const response = await request.get<BilibiliResponse<VideoData>>({
    url:
      "https://api.bilibili.com/x/web-interface/view?" +
      new URLSearchParams({
        bvid,
      }),
  });
  if (response?.code === 0 && response.data) {
    return response.data;
  }
  throw new Error(response?.message || `读取 ${bvid} 视频信息失败`);
}

function buildUgcEpisodeVideoData(
  rawEpisode: RawEpisode,
  section: Section,
  index: number,
  baseVideoData: EpisodeVideoData,
  currentBvid: string,
  currentCid: number,
) {
  const arc = rawEpisode.arc || ({} as RawEpisode["arc"]);
  const rawPage = (rawEpisode.page || rawEpisode.pages?.[0] || {}) as RawEpisodePage;
  const rawPages =
    rawEpisode.pages && rawEpisode.pages.length > 0
      ? rawEpisode.pages
      : rawPage.cid
        ? [rawPage as Page]
        : [];
  const episodeBvid = rawEpisode.bvid || arc.bvid;
  if (!episodeBvid) {
    return null;
  }

  const episodeCid = Number(rawEpisode.cid || rawPage.cid || arc.cid || 0);
  const sameBvid = episodeBvid.toLowerCase() === currentBvid.toLowerCase();
  const isCurrent = sameBvid && (!currentCid || !episodeCid || episodeCid === currentCid);
  const videoData = clone(isCurrent ? baseVideoData : (arc as unknown as EpisodeVideoData));
  const title = videoData.title || arc.title || rawEpisode.title || rawPage.part || episodeBvid;
  const pickerTitle = rawEpisode.title || arc.title || rawPage.part || title;

  videoData.aid = rawEpisode.aid || arc.aid || videoData.aid;
  videoData.bvid = episodeBvid;
  videoData.cid = episodeCid || videoData.cid;
  videoData.title = title;
  videoData.desc = videoData.desc || arc.desc || "";
  videoData.pic = videoData.pic || arc.pic || "";
  videoData.owner = clone(
    videoData.owner ||
      arc.owner ||
      arc.author ||
      baseVideoData.owner || { mid: 0, name: "", face: "" },
  );
  videoData.stat = clone(videoData.stat || (arc.stat as unknown as Stat) || ({} as Stat));
  videoData.pages = clone(rawPages);
  videoData.page = Number(rawPage.page) || 1;
  videoData.part = pickerTitle;
  videoData.duration = rawPage.duration || arc.duration || videoData.duration || 0;
  videoData.dimension = clone(
    (rawPage.dimension as Dimension | undefined) ||
      (arc.dimension as unknown as Dimension) ||
      videoData.dimension ||
      ({} as Dimension),
  );
  videoData.first_frame = rawPage.first_frame || videoData.first_frame;
  videoData._wasmMusicOriginalTitle = title;
  videoData._wasmMusicPickerLabel = section.title || `E${index + 1}`;
  videoData._wasmMusicPickerTitle = pickerTitle;
  videoData._wasmMusicSectionTitle = section.title || "";
  videoData._wasmMusicBatchPrefix = `E${String(index + 1).padStart(2, "0")}`;
  videoData._wasmMusicCurrent = isCurrent;
  videoData._wasmMusicHydrated = isCurrent;
  videoData._wasmMusicSkipMontage = !isCurrent;
  videoData._wasmMusicSkipDomMetadata = !isCurrent;
  return videoData;
}

export async function hydrateEpisodeData(episode: EpisodeVideoData) {
  if (episode._wasmMusicHydrated) {
    return episode;
  }

  try {
    const apiVideoData = await fetchVideoViewData(episode.bvid);
    const pages = Array.isArray(apiVideoData.pages) ? apiVideoData.pages : [];
    const targetPage =
      pages.find((page) => Number(page.page) === Number(episode.page)) ||
      pages.find((page) => Number(page.cid) === Number(episode.cid)) ||
      pages[0] ||
      ({} as Page);
    const hydrated = Object.assign({}, clone(apiVideoData), {
      cid: targetPage.cid || episode.cid || apiVideoData.cid,
      page: Number(targetPage.page) || Number(episode.page) || 1,
      part: episode.part || targetPage.part || apiVideoData.title,
      duration: targetPage.duration || episode.duration || apiVideoData.duration,
      dimension: clone(targetPage.dimension || episode.dimension || apiVideoData.dimension || {}),
      first_frame: targetPage.first_frame || episode.first_frame,
    }) as EpisodeVideoData;

    for (const [key, value] of Object.entries(episode)) {
      if (key.startsWith("_wasmMusic")) {
        (hydrated as unknown as Record<string, unknown>)[key] = clone(value);
      }
    }
    hydrated._wasmMusicHydrated = true;
    return hydrated;
  } catch (error) {
    logger.warn(`读取合集视频 ${episode.bvid} 的完整信息失败，将使用合集内信息继续`, error);
    const fallback = clone(episode);
    fallback._wasmMusicHydrated = true;
    return fallback;
  }
}

async function hydrateSelectedEpisodes(episodes: EpisodeVideoData[]) {
  if (!episodes.some((episode) => !episode._wasmMusicHydrated)) {
    return episodes;
  }

  const output = Array.from<EpisodeVideoData>({ length: episodes.length });
  let cursor = 0;
  const workerCount = Math.min(4, episodes.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < episodes.length) {
      const index = cursor++;
      output[index] = await hydrateEpisodeData(episodes[index]);
    }
  });
  await Promise.all(workers);
  return output;
}

export function applyEpisodeTitleOverrides(
  episodes: EpisodeVideoData[],
  sourceIndexes: number[],
  titleOverrides: Record<number, string>,
) {
  return episodes.map((episode, position) => {
    const sourceIndex = sourceIndexes[position];
    const customTitle = titleOverrides[sourceIndex]?.trim();
    if (!customTitle) {
      return episode;
    }
    const renamed = clone(episode);
    renamed.title = customTitle;
    renamed._wasmMusicCustomTitle = customTitle;
    return renamed;
  });
}

function createTaskEpisodePayload(episode: EpisodeVideoData) {
  const payload = {
    aid: episode.aid,
    bvid: episode.bvid,
    cid: episode.cid,
    page: Number(episode.page) || 1,
    part: episode.part,
    title: episode.title,
    desc: episode.desc || "",
    pic: episode.pic || "",
    owner: clone(episode.owner || { mid: 0, name: "", face: "" }),
    stat: clone(episode.stat || ({} as Stat)),
    pages: clone(episode.pages || []),
    duration: episode.duration || 0,
    dimension: clone(episode.dimension || {}),
    first_frame: episode.first_frame,
  } as EpisodeVideoData;
  for (const [key, value] of Object.entries(episode)) {
    if (key.startsWith("_wasmMusic") && key !== "_wasmMusicTaskId") {
      (payload as unknown as Record<string, unknown>)[key] = clone(value);
    }
  }
  payload._wasmMusicHydrated = true;
  return payload as unknown as Record<string, unknown>;
}

function getEpisodeTaskLabel(episode: EpisodeVideoData) {
  return (
    episode._wasmMusicCustomTitle ||
    episode._wasmMusicPickerTitle ||
    episode.part ||
    episode.title ||
    episode.bvid ||
    "未命名任务"
  );
}

function formatEpisodeError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error === null || error === undefined) return "未知错误";
  try {
    return JSON.stringify(error);
  } catch {
    return "无法序列化的错误";
  }
}

async function loadEpisodeData(): Promise<EpisodeLoadResult> {
  const playerVideoData = getPlayerVideoData();
  const pathBvid = location.pathname.match(/\/video\/(BV[\w]+)/i);
  const bvid = pathBvid?.[1] || playerVideoData?.bvid;
  if (!bvid) {
    throw new Error("未能从当前页面识别 BV 号");
  }

  let apiVideoData: VideoData | null = null;
  try {
    apiVideoData = await fetchVideoViewData(bvid);
  } catch (error) {
    logger.warn("获取分集接口失败，尝试使用页面内数据", error);
    if (!playerVideoData?.pages) {
      throw error;
    }
  }

  const baseVideoData = Object.assign({}, clone(playerVideoData || {}), clone(apiVideoData || {}), {
    bvid,
  }) as EpisodeVideoData;
  const urlPage = Number(new URL(location.href).searchParams.get("p"));
  const pageWindow = unsafeWindow as unknown as PageWindow;
  const initialState = pageWindow.__INITIAL_STATE__ || {};
  const playerCid = Number(
    baseVideoData.cid || pageWindow.cid || initialState.cid || playerVideoData?.cid,
  );
  const ugcSeason = baseVideoData.ugc_season;
  const ugcEntries = Array.isArray(ugcSeason?.sections)
    ? ugcSeason.sections.flatMap((section) =>
        (Array.isArray(section.episodes) ? section.episodes : []).map((episode) => ({
          episode: episode as RawEpisode,
          section,
        })),
      )
    : [];
  const nativeCategories = Array.from(
    new Set(ugcEntries.map((entry) => `${entry.section.title || ""}`.trim()).filter(Boolean)),
  );
  const distinctUgcBvids = new Set(
    ugcEntries
      .map((entry) => entry.episode.bvid)
      .filter(Boolean)
      .map((ugcBvid) => ugcBvid.toLowerCase()),
  );

  if (distinctUgcBvids.size > 1) {
    const episodes = ugcEntries
      .map((entry, index) =>
        buildUgcEpisodeVideoData(
          entry.episode,
          entry.section,
          index,
          baseVideoData,
          bvid,
          playerCid,
        ),
      )
      .filter((episode): episode is EpisodeVideoData => Boolean(episode));
    const currentIndex = Math.max(
      0,
      episodes.findIndex((episode) => episode._wasmMusicCurrent),
    );
    return {
      episodes,
      currentIndex,
      pickerMeta: {
        title: ugcSeason?.title || "视频合集",
        subtitle: "这是由多个独立 BV 组成的合集；可跨 BV 勾选，确认后会按合集顺序逐个下载。",
        itemLabel: "视频",
        currentLabel: "当前视频",
        categories: nativeCategories,
      },
    };
  }

  const pages =
    Array.isArray(baseVideoData.pages) && baseVideoData.pages.length > 0
      ? baseVideoData.pages
      : [
          {
            cid: baseVideoData.cid,
            page: 1,
            part: baseVideoData.title || "当前视频",
            duration: baseVideoData.duration || 0,
          } as Page,
        ];
  const cidPage = pages.find((page) => Number(page.cid) === playerCid);
  const currentPage =
    urlPage >= 1 && urlPage <= pages.length ? urlPage : Number(cidPage?.page || 1);
  const baseTitle = baseVideoData.title || "bilibili_video";
  const episodes = pages.map((page, index) => {
    const pageNumber = Number(page.page) || index + 1;
    const part = page.part || `P${pageNumber}`;
    const isCurrent = pageNumber === currentPage;
    const videoData = clone(baseVideoData);
    videoData.cid = page.cid;
    videoData.page = pageNumber;
    videoData.part = part;
    videoData.duration = page.duration || videoData.duration;
    videoData.dimension = page.dimension || videoData.dimension;
    videoData.first_frame = page.first_frame || videoData.first_frame;
    videoData.title = pages.length > 1 ? `${baseTitle} - P${pageNumber} ${part}` : baseTitle;
    videoData._wasmMusicOriginalTitle = baseTitle;
    videoData._wasmMusicPickerLabel = `P${pageNumber}`;
    videoData._wasmMusicPickerTitle = part;
    videoData._wasmMusicBatchPrefix = `P${String(pageNumber).padStart(2, "0")}`;
    videoData._wasmMusicCurrent = isCurrent;
    videoData._wasmMusicHydrated = true;
    videoData._wasmMusicSkipMontage = !isCurrent;
    videoData._wasmMusicSkipDomMetadata = !isCurrent;
    return videoData;
  });

  return {
    episodes,
    currentIndex: Math.max(
      0,
      episodes.findIndex((episode) => episode._wasmMusicCurrent),
    ),
    pickerMeta: {
      title: baseTitle,
      subtitle: "勾选一个就是单集下载；勾选多个会按分 P 顺序逐个下载。",
      itemLabel: "分集",
      currentLabel: "当前分集",
    },
  };
}

function showEpisodePicker(
  episodes: EpisodeVideoData[],
  currentIndex: number,
  pickerMeta: PickerMeta = {},
) {
  return new Promise<EpisodeSelection | null>((resolve) => {
    const savedRule = GM_getValue<RecordData | null>("default_rule");

    // Mount Vue picker component
    const mountEl = document.createElement("div");
    mountEl.id = "bilibili-music-vue-picker";
    document.body.appendChild(mountEl);
    episodeSession.picker = mountEl;

    const app = createApp({
      render() {
        return h(PickerComponent, {
          episodes,
          currentIndex,
          pickerMeta,
          savedRule,
          onConfirm(selection: EpisodeSelection) {
            episodeSession.picker = null;
            app.unmount();
            mountEl.remove();
            resolve(selection);
          },
          onCancel() {
            episodeSession.picker = null;
            app.unmount();
            mountEl.remove();
            resolve(null);
          },
        });
      },
    });
    app.mount(mountEl);
  });
}

function cleanupMountedApp() {
  if (episodeSession.app) {
    try {
      episodeSession.app.unmount();
    } catch (error) {
      logger.warn("卸载下载窗口失败", error);
    }
  }
  episodeSession.root?.remove();
  episodeSession.app = null;
  episodeSession.root = null;
}

export function launchNextEpisode() {
  logger.info("[Episode] launchNextEpisode 开始", {
    paused: episodeSession.paused,
    queueLength: episodeSession.queue.length,
    isBatch: episodeSession.isBatch,
    auto: episodeSession.auto,
  });

  if (episodeSession.paused) {
    setDownloadTaskBatchPaused(true);
    return;
  }
  const nextVideoData = episodeSession.queue.shift();
  if (!nextVideoData) {
    logger.info("[Episode] 队列为空，没有下一个剧集");
    return;
  }
  if (!appLauncher) {
    throw new Error("下载窗口尚未初始化");
  }

  episodeSession.activeVideoData = nextVideoData;
  episodeSession.settling = false;
  beginDownloadTask(
    nextVideoData._wasmMusicTaskId,
    episodeSession.auto ? "正在应用预设" : "等待用户确认设置",
  );
  logger.info("[Episode] activeVideoData 已设置", {
    bvid: nextVideoData.bvid,
    page: nextVideoData.page,
    taskId: nextVideoData._wasmMusicTaskId,
  });

  logger.info("[Episode] 准备启动下一个剧集", {
    bvid: nextVideoData.bvid,
    page: nextVideoData.page,
    hasApp: Boolean(episodeSession.app),
    hasRoot: Boolean(episodeSession.root),
    hasTransitionHandler: Boolean(appTransitionHandler),
  });

  if (episodeSession.app && episodeSession.root && appTransitionHandler) {
    logger.info("[Episode] 尝试使用现有窗口切换分集");
    try {
      void Promise.resolve(appTransitionHandler(nextVideoData)).catch((error) => {
        logger.error("在现有下载窗口中切换分集失败", error);
        failEpisodeDownload(error);
      });
      return;
    } catch (error) {
      logger.error("在现有下载窗口中切换分集失败", error);
      if (failEpisodeDownload(error)) {
        return;
      }
    }
  }

  // 首项需要创建窗口；只有窗口异常丢失或未注册切换处理器时才回退重建。
  logger.info("[Episode] 创建新窗口");
  cleanupMountedApp();
  try {
    const { app, root } = appLauncher();
    episodeSession.root = root;
    episodeSession.app = app;
  } catch (error) {
    logger.error("打开当前分集下载窗口失败", error);
    if (!failEpisodeDownload(error)) {
      throw error;
    }
  }
}

function finishEpisodeItem(
  status: EpisodeDownloadResult["status"],
  error?: unknown,
  outputName?: string,
) {
  const activeVideoData = episodeSession.activeVideoData;
  logger.info("[Episode] finishEpisodeItem 调用", {
    status,
    isBatch: episodeSession.isBatch,
    hasActiveVideoData: Boolean(activeVideoData),
    settling: episodeSession.settling,
    queueLength: episodeSession.queue.length,
  });

  if (!episodeSession.isBatch || !activeVideoData || episodeSession.settling) {
    logger.warn("[Episode] finishEpisodeItem 跳过", {
      isBatch: episodeSession.isBatch,
      hasActiveVideoData: Boolean(activeVideoData),
      settling: episodeSession.settling,
    });
    return false;
  }

  episodeSession.settling = true;
  if (status === "success") {
    completeDownloadTask(activeVideoData._wasmMusicTaskId, outputName);
  } else {
    failDownloadTask(activeVideoData._wasmMusicTaskId, error);
  }
  episodeSession.completed++;
  if (status === "success") {
    episodeSession.succeeded++;
  } else {
    episodeSession.failed++;
  }
  const errorMessage = status === "failed" ? formatEpisodeError(error) : undefined;
  const label =
    activeVideoData._wasmMusicPickerTitle ||
    activeVideoData.part ||
    activeVideoData.title ||
    activeVideoData.bvid;
  episodeSession.results.push({
    bvid: activeVideoData.bvid,
    page: Number(activeVideoData.page) || 1,
    label,
    status,
    error: errorMessage,
  });
  if (status === "failed") {
    Message.error(`已跳过 ${label}：${errorMessage}`);
  }

  episodeSession.advanceTimer = setTimeout(() => {
    episodeSession.advanceTimer = null;
    logger.info("[Episode] advanceTimer 触发", {
      queueLength: episodeSession.queue.length,
      paused: episodeSession.paused,
    });
    if (episodeSession.queue.length > 0) {
      if (episodeSession.paused) {
        episodeSession.activeVideoData = null;
        setDownloadTaskBatchPaused(true);
        Message.info("下载队列已暂停，可从任务中心继续");
        return;
      }
      logger.info("[Episode] 继续下一个剧集");
      launchNextEpisode();
      return;
    }

    const total = episodeSession.total;
    const succeeded = episodeSession.succeeded;
    const failed = episodeSession.failed;
    const results = clone(episodeSession.results);
    logger.info("批量下载任务结束", { total, succeeded, failed, results });
    episodeSession.activeVideoData = null;
    episodeSession.isBatch = false;
    episodeSession.auto = false;
    episodeSession.manualEach = false;
    episodeSession.rule = null;
    episodeSession.total = 0;
    episodeSession.completed = 0;
    episodeSession.succeeded = 0;
    episodeSession.failed = 0;
    episodeSession.results = [];
    episodeSession.settling = false;
    episodeSession.paused = false;
    cleanupMountedApp();
    const summary = `批量下载任务已完成：成功 ${succeeded}，失败 ${failed}，共 ${total} 项`;
    if (failed > 0) {
      Message.warning(summary);
    } else {
      Message.success(summary);
    }
  }, 800);
  return true;
}

export function finishEpisodeDownload(outputName?: string) {
  logger.info("[Episode] finishEpisodeDownload 调用", {
    isBatch: episodeSession.isBatch,
    hasActiveVideoData: Boolean(episodeSession.activeVideoData),
    activeVideoDataId: episodeSession.activeVideoData?._wasmMusicTaskId,
  });
  if (!episodeSession.isBatch) {
    return completeDownloadTask(episodeSession.activeVideoData?._wasmMusicTaskId, outputName);
  }
  return finishEpisodeItem("success", undefined, outputName);
}

export function failEpisodeDownload(error: unknown) {
  if (!episodeSession.isBatch) {
    return failDownloadTask(episodeSession.activeVideoData?._wasmMusicTaskId, error);
  }
  return finishEpisodeItem("failed", error);
}

export function stopEpisodeSession(showMessage = false, cancelTasks = true) {
  const hadTask = Boolean(
    episodeSession.root ||
    episodeSession.picker ||
    episodeSession.queue.length ||
    episodeSession.activeVideoData,
  );
  try {
    activeOperationCanceller?.();
  } catch (error) {
    logger.warn("取消当前音频操作失败", error);
  }
  activeOperationCanceller = null;
  if (episodeSession.advanceTimer) {
    clearTimeout(episodeSession.advanceTimer);
    episodeSession.advanceTimer = null;
  }
  episodeSession.queue = [];
  episodeSession.picker?.remove();
  episodeSession.picker = null;
  cleanupMountedApp();
  episodeSession.activeVideoData = null;
  episodeSession.isBatch = false;
  episodeSession.hasMultiplePages = false;
  episodeSession.auto = false;
  episodeSession.manualEach = false;
  episodeSession.rule = null;
  episodeSession.total = 0;
  episodeSession.completed = 0;
  episodeSession.succeeded = 0;
  episodeSession.failed = 0;
  episodeSession.results = [];
  episodeSession.settling = false;
  episodeSession.paused = false;
  episodeSession.opening = false;
  episodeSession.allEpisodes = [];
  episodeSession.currentEpisodeIndex = 0;
  episodeSession.pickerMeta = {};
  if (cancelTasks) {
    cancelDownloadTaskBatch("用户取消");
  }
  if (showMessage && hadTask) {
    Message.info("下载任务已取消");
  }
}

export function pauseEpisodeSession() {
  if (
    !episodeSession.isBatch ||
    (!episodeSession.activeVideoData && !episodeSession.queue.length)
  ) {
    Message.info("当前没有可暂停的批量队列");
    return;
  }
  episodeSession.paused = true;
  setDownloadTaskBatchPaused(true);
  Message.info(episodeSession.activeVideoData ? "将在当前项目完成后暂停队列" : "下载队列已暂停");
}

export function resumeEpisodeSession() {
  if (!episodeSession.paused) return;
  episodeSession.paused = false;
  setDownloadTaskBatchPaused(false);
  if (!episodeSession.activeVideoData && episodeSession.queue.length > 0) {
    launchNextEpisode();
  }
  Message.info("下载队列已继续");
}

function startStoredDownloadTasks(
  tasks: ReturnType<typeof getRetryableDownloadTasks>,
  mode: "重试" | "继续",
) {
  if (tasks.length === 0) {
    Message.info(mode === "重试" ? "没有失败任务可重试" : "没有中断任务可继续");
    return;
  }
  const snapshot = getTaskCenterState();
  stopEpisodeSession(false, false);
  const episodes = tasks.map((task) => {
    const episode = clone(task.payload) as unknown as EpisodeVideoData;
    episode._wasmMusicTaskId = task.id;
    episode._wasmMusicHydrated = true;
    episode._wasmMusicCurrent = false;
    episode._wasmMusicSkipMontage = true;
    episode._wasmMusicSkipDomMetadata = true;
    return episode;
  });
  prepareDownloadTaskRetry(tasks.map((task) => task.id));
  episodeSession.queue = episodes;
  episodeSession.isBatch = true;
  episodeSession.auto = Boolean(snapshot.rule) && snapshot.automatic;
  episodeSession.manualEach = Boolean(snapshot.manualEach);
  episodeSession.rule = snapshot.rule ? (clone(snapshot.rule) as RecordData) : null;
  episodeSession.total = episodes.length;
  episodeSession.completed = 0;
  episodeSession.succeeded = 0;
  episodeSession.failed = 0;
  episodeSession.results = [];
  episodeSession.settling = false;
  episodeSession.paused = false;
  launchNextEpisode();
  Message.info(`${mode} ${episodes.length} 个下载任务`);
}

export function retryFailedEpisodeTasks() {
  startStoredDownloadTasks(getRetryableDownloadTasks(), "重试");
}

export function resumeInterruptedEpisodeTasks() {
  startStoredDownloadTasks(getInterruptedDownloadTasks(), "继续");
}

function isEpisodePickerRoute() {
  return /^\/video\/BV[\w]+(?:\/|$)/i.test(location.pathname);
}

function openLegacyMusicApp() {
  if (!appLauncher) {
    throw new Error("下载窗口尚未初始化");
  }
  appLauncher();
}

/**
 * 处理 picker 选择结果：hydrate、创建任务、设置 session 状态。
 * 供 App.vue picker 步骤和 openMusicApp() 调用。
 */
export async function processEpisodeSelection(
  episodes: EpisodeVideoData[],
  pickerMeta: PickerMeta,
  selection: EpisodeSelection,
) {
  if (!selection || selection.indexes.length === 0) return;

  let selectedEpisodes = selection.indexes.map((index) => episodes[index]).filter(Boolean);
  if (selectedEpisodes.some((episode) => !episode._wasmMusicHydrated)) {
    Message.info(`正在读取所选 ${selectedEpisodes.length} 个视频的完整信息...`);
    selectedEpisodes = await hydrateSelectedEpisodes(selectedEpisodes);
  }
  selectedEpisodes = applyEpisodeTitleOverrides(
    selectedEpisodes,
    selection.indexes,
    selection.titleOverrides,
  );

  const savedRule = GM_getValue<RecordData | null>("default_rule");
  const isBatch = selectedEpisodes.length > 1;
  const manualEach = isBatch && selection.manualEach;
  const automatic = isBatch && !manualEach && selection.useDefault && Boolean(savedRule);
  const taskIds = startDownloadTaskBatch(
    selectedEpisodes.map((episode) => ({
      bvid: episode.bvid,
      page: Number(episode.page) || 1,
      label: getEpisodeTaskLabel(episode),
      prefix: episode._wasmMusicBatchPrefix,
      payload: createTaskEpisodePayload(episode),
    })),
    {
      title: pickerMeta.title || selectedEpisodes[0]?.title || "下载任务",
      automatic,
      manualEach,
      rule: automatic ? savedRule : null,
    },
  );
  selectedEpisodes.forEach((episode, index) => {
    episode._wasmMusicTaskId = taskIds[index];
  });
  episodeSession.queue = selectedEpisodes;
  episodeSession.isBatch = isBatch;
  episodeSession.hasMultiplePages = episodes.length > 1;
  episodeSession.auto = automatic;
  episodeSession.manualEach = manualEach;
  episodeSession.rule = episodeSession.auto ? clone(savedRule) : null;
  episodeSession.total = selectedEpisodes.length;
  episodeSession.completed = 0;
  episodeSession.succeeded = 0;
  episodeSession.failed = 0;
  episodeSession.results = [];
  episodeSession.settling = false;
  episodeSession.paused = false;
}

export async function openMusicApp() {
  if (episodeSession.root || episodeSession.picker || episodeSession.opening) {
    Message.warning("已有下载窗口或分集选择窗口正在运行");
    return;
  }
  if (!isEpisodePickerRoute()) {
    openLegacyMusicApp();
    return;
  }

  episodeSession.opening = true;
  try {
    const { episodes, currentIndex, pickerMeta } = await loadEpisodeData();
    // 存储剧集数据到 session，供 App.vue 中的 picker 步骤使用
    episodeSession.allEpisodes = episodes;
    episodeSession.currentEpisodeIndex = currentIndex;
    episodeSession.pickerMeta = pickerMeta;
    episodeSession.hasMultiplePages = episodes.length > 1;

    if (episodes.length <= 1) {
      // 单集：直接处理，无需 picker
      const selection = { indexes: [0], useDefault: false, manualEach: false, titleOverrides: {} };
      await processEpisodeSelection(episodes, pickerMeta, selection);
      launchNextEpisode();
    } else {
      // 多集：直接挂载 App.vue，由 picker 步骤处理
      cleanupMountedApp();
      const { app, root } = appLauncher!();
      episodeSession.root = root;
      episodeSession.app = app;
    }
  } catch (error) {
    logger.error("打开视频选择器失败", error);
    Message.error(`无法读取视频列表：${error instanceof Error ? error.message : String(error)}`);
    stopEpisodeSession(false);
  } finally {
    episodeSession.opening = false;
  }
}

configureTaskCenterActions({
  pause: pauseEpisodeSession,
  resume: resumeEpisodeSession,
  hasLiveSession: () =>
    episodeSession.paused &&
    Boolean(episodeSession.app && episodeSession.root && episodeSession.queue.length > 0),
  cancel: () => stopEpisodeSession(true),
  retryFailed: retryFailedEpisodeTasks,
  resumeInterrupted: resumeInterruptedEpisodeTasks,
});
