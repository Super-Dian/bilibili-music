import { describe, expect, test } from "bun:test";

import { applyMetadataFormat } from "../src/utils/format";

describe("metadata format expansion", () => {
  test("replaces placeholders once without rewriting digits inside inserted metadata", () => {
    expect(
      applyMetadataFormat("1-3", [
        "DX2026 标题 123",
        "简介里的 1、2、3 不应参与替换",
        "UP主3号",
        "歌曲4号",
        "歌手5号",
      ]),
    ).toBe("DX2026 标题 123-UP主3号");
  });

  test("keeps the existing author template meaning", () => {
    expect(applyMetadataFormat("3(原:5)", ["标题", "简介", "UP主", "歌曲", "原唱"])).toBe(
      "UP主(原:原唱)",
    );
  });
});
