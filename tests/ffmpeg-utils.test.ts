import { afterEach, describe, expect, mock, test } from "bun:test";

let fakeLoad: (() => Promise<void>) | null = null;
let fakeLoadCount = 0;

class FakeFFmpeg {
  deletedFiles: string[] = [];
  on() {}
  load() {
    fakeLoadCount += 1;
    return fakeLoad?.() || Promise.resolve();
  }
  terminate() {}
  deleteFile(fileName: string) {
    this.deletedFiles.push(fileName);
    return Promise.resolve();
  }
}

mock.module("@ffmpeg/ffmpeg", () => ({ FFmpeg: FakeFFmpeg }));
mock.module("@/utils/logger", () => ({
  logger: {
    debug: () => undefined,
    error: () => undefined,
    info: () => undefined,
    log: () => undefined,
    warn: () => undefined,
  },
}));

const originalFetch = globalThis.fetch;
const {
  FFMPEG_CDN_PROVIDERS,
  cleanupFFmpegFiles,
  ffmpegLoad,
  getFFmpeg,
  getFFmpegDiagnostics,
  preflightFFmpegEnvironment,
  terminateFFmpeg,
  tryFFmpegProviders,
} = await import("../src/utils/ffmpeg.ts");

afterEach(() => {
  fakeLoad = null;
  fakeLoadCount = 0;
  globalThis.fetch = originalFetch;
  terminateFFmpeg();
});

describe("FFmpeg reliability helpers", () => {
  test("falls back from the primary CDN to the backup CDN", async () => {
    const attempts: string[] = [];
    const result = await tryFFmpegProviders(FFMPEG_CDN_PROVIDERS, async (provider) => {
      attempts.push(provider.name);
      if (provider.name === "unpkg") throw new Error("primary unavailable");
      return provider.name;
    });

    expect(attempts).toEqual(["unpkg", "jsDelivr"]);
    expect(result).toBe("jsDelivr");
  });

  test("does not contact another CDN after cancellation", async () => {
    const attempts: string[] = [];
    await expect(
      tryFFmpegProviders(
        FFMPEG_CDN_PROVIDERS,
        async (provider) => {
          attempts.push(provider.name);
          throw new DOMException("cancelled", "AbortError");
        },
        () => true,
      ),
    ).rejects.toHaveProperty("name", "AbortError");
    expect(attempts).toEqual(["unpkg"]);
  });

  test("preflight reports the exact capability flags", () => {
    const result = preflightFFmpegEnvironment();
    expect(result.webAssembly).toBe(typeof WebAssembly !== "undefined");
    expect(result.blobUrl).toBe(
      typeof Blob !== "undefined" && typeof URL.createObjectURL === "function",
    );
    expect(result.mode).toBe("single-thread");
  });

  test("a cancelled loader cannot clear or overwrite a newer loader", async () => {
    const deferred: Array<() => void> = [];
    fakeLoad = () =>
      new Promise<void>((resolve) => {
        deferred.push(resolve);
      });
    globalThis.fetch = (async () =>
      new Response(new Uint8Array([0, 97, 115, 109]), { status: 200 })) as typeof fetch;

    const first = ffmpegLoad();
    const firstSettled = first.catch((error: unknown) => error);
    while (deferred.length < 1) await Bun.sleep(0);
    terminateFFmpeg();

    const second = ffmpegLoad();
    while (deferred.length < 2) await Bun.sleep(0);
    deferred[0]();
    const firstError = await firstSettled;
    expect(firstError).toHaveProperty("name", "AbortError");

    void ffmpegLoad();
    await Bun.sleep(0);
    expect(fakeLoadCount).toBe(2);

    deferred[1]();
    await second;
    expect(getFFmpegDiagnostics().loaded).toBe(true);
  });

  test("keeps cancellation attached while the response body is still streaming", async () => {
    let bodyStarted = false;
    globalThis.fetch = (async (_url, init) => {
      const signal = init?.signal;
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            bodyStarted = true;
            controller.enqueue(new Uint8Array([0, 97, 115, 109]));
            signal?.addEventListener("abort", () => controller.error(signal.reason), {
              once: true,
            });
          },
        }),
        { status: 200 },
      );
    }) as typeof fetch;

    const controller = new AbortController();
    const pending = ffmpegLoad(undefined, controller.signal).catch((error: unknown) => error);
    while (!bodyStarted) await Bun.sleep(0);
    controller.abort();

    const result = await Promise.race([
      pending,
      Bun.sleep(1_000).then(() => new Error("response body cancellation timed out")),
    ]);
    expect(result).toHaveProperty("name", "AbortError");
    expect(fakeLoadCount).toBe(0);
  });

  test("cleans the captured instance instead of a replacement singleton", async () => {
    const firstInstance = getFFmpeg();
    const first = firstInstance as unknown as FakeFFmpeg;
    terminateFFmpeg();
    const replacement = getFFmpeg() as unknown as FakeFFmpeg;

    await cleanupFFmpegFiles(firstInstance, ["input.m4s", "cover.jpg", "output.m4a"]);

    expect(first.deletedFiles).toEqual(["input.m4s", "cover.jpg", "output.m4a"]);
    expect(replacement.deletedFiles).toEqual([]);
  });
});
