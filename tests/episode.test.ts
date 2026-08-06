import { afterEach, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";

const messages = {
  error: [] as string[],
  info: [] as string[],
  success: [] as string[],
  warning: [] as string[],
};
let requestGet: (options: unknown) => Promise<unknown> = async () => {
  throw new Error("unexpected request");
};

mock.module("$", () => ({
  GM_getValue: () => null,
  GM_setValue: () => undefined,
  unsafeWindow: {},
}));
mock.module("vue", () => ({
  reactive: <T>(value: T) => value,
}));
(globalThis as typeof globalThis & { watch: () => void }).watch = () => undefined;
mock.module("@arco-design/web-vue", () => ({
  Message: {
    error: (message: string) => messages.error.push(message),
    info: (message: string) => messages.info.push(message),
    success: (message: string) => messages.success.push(message),
    warning: (message: string) => messages.warning.push(message),
  },
}));
mock.module("@/utils/logger", () => ({
  logger: {
    debug: () => undefined,
    error: () => undefined,
    info: () => undefined,
    log: () => undefined,
    warn: () => undefined,
  },
}));
mock.module("@/utils/requests", () => ({
  request: {
    get: (options: unknown) => requestGet(options),
  },
}));

const episodeModule = await import("../src/episode.ts");
const dataModule = await import("../src/data.ts");
const {
  buildEpisodeSourceUrl,
  configureEpisodeAppLauncher,
  episodeSession,
  failEpisodeDownload,
  finishEpisodeDownload,
  hydrateEpisodeData,
  stopEpisodeSession,
} = episodeModule;
const { normalizeRecordProcessingRule } = dataModule;

const makeEpisode = (bvid: string, page: number, label: string) =>
  ({
    aid: page,
    bvid,
    cid: page,
    page,
    part: label,
    title: label,
    pages: [{ cid: page, page, part: label }],
  }) as any;

let launches = 0;

beforeAll(() => {
  configureEpisodeAppLauncher(() => {
    launches++;
    return {
      app: { unmount: () => undefined },
      root: { remove: () => undefined } as any,
    };
  });
});

beforeEach(() => {
  stopEpisodeSession(false);
  launches = 0;
  requestGet = async () => {
    throw new Error("unexpected request");
  };
  Object.values(messages).forEach((items) => items.splice(0));
});

afterEach(() => stopEpisodeSession(false));

describe("batch queue settlement", () => {
  test("a failed item advances, counts once, and a later success completes the batch", async () => {
    const first = makeEpisode("BVFAIL", 1, "失败项");
    const second = makeEpisode("BVOK", 2, "成功项");
    episodeSession.activeVideoData = first;
    episodeSession.queue = [second];
    episodeSession.isBatch = true;
    episodeSession.total = 2;

    expect(failEpisodeDownload(new Error("playurl failed"))).toBe(true);
    expect(finishEpisodeDownload()).toBe(false);
    expect(episodeSession.completed).toBe(1);
    expect(episodeSession.failed).toBe(1);

    await Bun.sleep(900);
    expect(launches).toBe(1);
    expect(episodeSession.activeVideoData?.bvid).toBe("BVOK");
    expect(finishEpisodeDownload()).toBe(true);

    await Bun.sleep(900);
    expect(episodeSession.isBatch).toBe(false);
    expect(messages.warning.at(-1)).toBe("批量下载任务已完成：成功 1，失败 1，共 2 项");
  });

  test("cancelling clears the pending advance timer", async () => {
    episodeSession.activeVideoData = makeEpisode("BVFAIL", 1, "失败项");
    episodeSession.queue = [makeEpisode("BVNEVER", 2, "不应启动")];
    episodeSession.isBatch = true;
    episodeSession.total = 2;

    expect(failEpisodeDownload("cover failed")).toBe(true);
    stopEpisodeSession(false);
    await Bun.sleep(900);

    expect(launches).toBe(0);
    expect(episodeSession.activeVideoData).toBeNull();
    expect(episodeSession.queue).toHaveLength(0);
  });

  test("playurl, cover, and FFmpeg failures all advance and aggregate", async () => {
    episodeSession.activeVideoData = makeEpisode("BVPLAYURL", 1, "playurl 项");
    episodeSession.queue = [
      makeEpisode("BVCOVER", 2, "封面项"),
      makeEpisode("BVFFMPEG", 3, "FFmpeg 项"),
    ];
    episodeSession.isBatch = true;
    episodeSession.total = 3;

    expect(failEpisodeDownload("playurl failed")).toBe(true);
    await Bun.sleep(900);
    expect(failEpisodeDownload("cover failed")).toBe(true);
    await Bun.sleep(900);
    expect(failEpisodeDownload("FFmpeg failed")).toBe(true);
    await Bun.sleep(900);

    expect(launches).toBe(2);
    expect(messages.warning.at(-1)).toBe("批量下载任务已完成：成功 0，失败 3，共 3 项");
    expect(messages.error).toEqual([
      "已跳过 playurl 项：playurl failed",
      "已跳过 封面项：cover failed",
      "已跳过 FFmpeg 项：FFmpeg failed",
    ]);
  });
});

describe("hydration and source URL compatibility", () => {
  test("the API-confirmed target page CID wins over a stale collection CID", async () => {
    requestGet = async () => ({
      code: 0,
      data: {
        aid: 9,
        bvid: "BVHYDRATE",
        cid: 111,
        title: "hydrated",
        pages: [
          { cid: 111, page: 1, part: "P1", duration: 10 },
          { cid: 222, page: 2, part: "P2", duration: 20 },
        ],
      },
    });
    const result = await hydrateEpisodeData({
      ...makeEpisode("BVHYDRATE", 2, "P2"),
      cid: 111,
      _wasmMusicHydrated: false,
    });

    expect(result.cid).toBe(222);
    expect(result.page).toBe(2);
  });

  test("single videos retain the old query-free URL while multi-P entries keep p", () => {
    expect(
      buildEpisodeSourceUrl(
        { ...makeEpisode("BVSINGLE", 1, "single"), pages: [{ cid: 1, page: 1 }] },
        "https://www.bilibili.com/video/BVSINGLE?spm_id_from=333.1",
      ),
    ).toBe("https://www.bilibili.com/video/BVSINGLE");
    expect(
      buildEpisodeSourceUrl(
        {
          ...makeEpisode("BVMULTI", 1, "P1"),
          pages: [
            { cid: 1, page: 1 },
            { cid: 2, page: 2 },
          ],
        },
        "https://www.bilibili.com/video/BVMULTI?p=2",
      ),
    ).toBe("https://www.bilibili.com/video/BVMULTI/?p=1");
    expect(
      buildEpisodeSourceUrl(
        { ...makeEpisode("BVCROSS", 1, "cross"), pages: [{ cid: 1, page: 1 }] },
        "https://www.bilibili.com/video/BVORIGIN?p=3",
      ),
    ).toBe("https://www.bilibili.com/video/BVCROSS/");
  });
});

describe("processing rule compatibility", () => {
  test("old rules fall back to no clipping and normal speed", () => {
    expect(normalizeRecordProcessingRule({ format: {} } as any)).toEqual({
      clipRanges: null,
      speed: 1,
    });
  });

  test("new rules copy valid ranges and reject invalid speed", () => {
    expect(
      normalizeRecordProcessingRule({
        clipRanges: [
          [-20, 100],
          [-20, -10],
          [500, 400],
          [200, 350],
        ],
        speed: 3,
      } as any),
    ).toEqual({
      clipRanges: [
        [0, 100],
        [200, 350],
      ],
      speed: 1,
    });
    expect(normalizeRecordProcessingRule({ speed: 1.5 } as any).speed).toBe(1.5);
  });
});
