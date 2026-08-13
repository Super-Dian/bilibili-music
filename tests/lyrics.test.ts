import { describe, expect, test } from "bun:test";

import { selectSubtitleForAuto, subtitleToLyrics } from "../src/utils/lyrics";

const subtitles = [
  {
    id_str: "zh",
    lan_doc: "中文",
    data: { body: [{ from: 1.2346, content: "第一句" }] },
  },
  {
    id_str: "en",
    lan_doc: "English",
    data: { body: [{ from: 2.5, content: "Second line" }] },
  },
];

describe("automatic subtitle selection", () => {
  test("uses the configured language without resetting to the first subtitle", () => {
    expect(selectSubtitleForAuto(subtitles, "English")).toBe(subtitles[1]);
  });

  test("falls back to the first subtitle when no language is configured or matched", () => {
    expect(selectSubtitleForAuto(subtitles)).toBe(subtitles[0]);
    expect(selectSubtitleForAuto(subtitles, "日本語")).toBe(subtitles[0]);
  });

  test("handles an empty subtitle list", () => {
    expect(selectSubtitleForAuto([], "中文")).toBeNull();
  });

  test("converts the selected subtitle body to a millisecond lyrics timeline", () => {
    expect(subtitleToLyrics(subtitles[0])).toEqual([[1235, "第一句"]]);
    expect(subtitleToLyrics({ id_str: "none", lan_doc: "无" })).toBeNull();
  });
});
