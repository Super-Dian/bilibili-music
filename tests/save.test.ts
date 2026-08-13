import { beforeEach, describe, expect, test } from "bun:test";

let activeRequest: Record<string, any> | null = null;
let abortCount = 0;

const { saveDownload } = await import("../src/utils/save.ts");

const executeDownload = (request: Record<string, any>) => {
  activeRequest = request;
  return {
    abort() {
      abortCount++;
      return true;
    },
  };
};

beforeEach(() => {
  activeRequest = null;
  abortCount = 0;
});

describe("observable userscript downloads", () => {
  test("waits for the download manager onload callback", async () => {
    let settled = false;
    const pending = saveDownload(executeDownload, new Blob(["audio"]), "song.m4a").then(() => {
      settled = true;
    });

    await Bun.sleep(0);
    expect(settled).toBe(false);
    expect(activeRequest?.name).toBe("song.m4a");
    expect(activeRequest?.url).toBeInstanceOf(Blob);

    activeRequest?.onload();
    await pending;
    expect(settled).toBe(true);
  });

  test("surfaces a download-manager rejection", async () => {
    const pending = saveDownload(executeDownload, new Blob(["audio"]), "song.m4a");
    activeRequest?.onerror({ error: "not_permitted", details: "permission denied" });

    await expect(pending).rejects.toThrow("浏览器尚未授予油猴下载权限");
    await expect(pending).rejects.toThrow("not_permitted");
    await expect(pending).rejects.toThrow("permission denied");
  });

  test("aborts an in-flight save with the caller signal", async () => {
    const controller = new AbortController();
    const pending = saveDownload(executeDownload, new Blob(["audio"]), "song.m4a", {
      signal: controller.signal,
    });

    controller.abort();

    await expect(pending).rejects.toHaveProperty("name", "AbortError");
    expect(abortCount).toBe(1);
  });
});
