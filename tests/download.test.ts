import { afterEach, describe, expect, test } from "bun:test";

import { downloadBinary, isAbortError } from "../src/utils/download.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("streaming binary downloader", () => {
  test("combines streamed chunks and reports monotonic progress", async () => {
    const progress: Array<number | null> = [];
    let requestInit: RequestInit | undefined;
    globalThis.fetch = (async (_input, init) => {
      requestInit = init;
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array([1, 2]));
            controller.enqueue(new Uint8Array([3, 4, 5, 6]));
            controller.close();
          },
        }),
        { status: 200, headers: { "content-length": "6" } },
      );
    }) as typeof fetch;

    const bytes = await downloadBinary("https://example.test/audio", {
      onProgress: (value) => progress.push(value.percent),
    });

    expect(Array.from(bytes)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(requestInit?.credentials).toBe("same-origin");
    expect(progress.at(-1)).toBe(100);
    const numericProgress = progress.filter((value): value is number => value !== null);
    expect(
      numericProgress.every((value, index) => index === 0 || value >= numericProgress[index - 1]),
    ).toBe(true);
  });

  test("aborts an in-flight stream", async () => {
    let cancelCount = 0;
    let resolveFirstChunk: (() => void) | undefined;
    const firstChunk = new Promise<void>((resolve) => {
      resolveFirstChunk = resolve;
    });
    globalThis.fetch = (async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array([1]));
          },
          cancel() {
            cancelCount += 1;
          },
        }),
        { status: 200 },
      )) as typeof fetch;
    const controller = new AbortController();
    const promise = downloadBinary("https://example.test/slow", {
      signal: controller.signal,
      onProgress: () => resolveFirstChunk?.(),
    });
    await firstChunk;
    controller.abort();

    let caught: unknown;
    try {
      await promise;
    } catch (error) {
      caught = error;
    }
    expect(isAbortError(caught)).toBe(true);
    expect(cancelCount).toBe(1);
  });
});
