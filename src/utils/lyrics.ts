import type { Lyrics } from "@/data";

export interface SubtitleForLyrics {
  id_str: string;
  lan_doc: string;
  data?: {
    body: Array<{
      from: number;
      content: string;
    }>;
  };
}

export function selectSubtitleForAuto<T extends SubtitleForLyrics>(
  subtitles: readonly T[],
  preferredLanguage?: string,
): T | null {
  if (subtitles.length === 0) return null;
  return subtitles.find((item) => item.lan_doc === preferredLanguage) ?? subtitles[0];
}

export function subtitleToLyrics(subtitle: SubtitleForLyrics): Lyrics | null {
  if (!subtitle.data) return null;
  return subtitle.data.body.map((item) => [Math.round(item.from * 1000), item.content]);
}
