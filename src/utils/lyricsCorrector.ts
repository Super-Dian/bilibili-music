import { diffChars } from "diff";
import type { Lyrics } from "@/data";

type DiffPart = { value: string; added?: boolean; removed?: boolean };

/**
 * 预处理 diff 结果：将 changed（removed + 相同长度 added）和纯 removed/added 分离。
 *
 * diffChars 输出的四种状态：
 * 1. unchanged: {value: "..."} - 不变字符
 * 2. changed: {removed: "..."} + {added: "..."} (长度相等) - 改变字符
 * 3. removed: {removed: "..."} (后面没有 added 或 added 长度不等) - 纯删除
 * 4. added: {added: "..."} (前面没有 removed 或 removed 长度不等) - 纯添加
 *
 * 此函数确保：
 * - changed 保持 removed + added 成对，长度相等
 * - 纯 removed/added 被分离出来
 */
function normalizeDiffs(diffs: DiffPart[]): DiffPart[] {
  const result: DiffPart[] = [];

  for (let i = 0; i < diffs.length; i++) {
    const part = diffs[i];

    // 如果当前是 removed，下一个是 added
    if (part.removed && i + 1 < diffs.length && diffs[i + 1].added) {
      const removedPart = part;
      const addedPart = diffs[i + 1];

      const removedLen = removedPart.value.length;
      const addedLen = addedPart.value.length;

      if (removedLen === addedLen) {
        // 长度匹配：这是 changed，保持原样
        result.push(removedPart);
        result.push(addedPart);
      } else if (removedLen > addedLen) {
        // removed 比 added 长：拆分为 changed + 纯 removed
        const matchLen = addedLen;
        const extraLen = removedLen - matchLen;

        // 纯 removed 部分
        if (extraLen > 0) {
          result.push({ value: removedPart.value.slice(0, matchLen), removed: true });
        }


        // changed 部分
        if (matchLen > 0) {
          result.push({ value: removedPart.value.slice(matchLen, removedLen), removed: true });
          result.push({ value: addedPart.value, added: true });
        }


      } else {
        // added 比 removed 长：拆分为 changed + 纯 added
        const matchLen = removedLen;
        const extraLen = addedLen - matchLen;

        // changed 部分
        if (matchLen > 0) {
          result.push({ value: removedPart.value, removed: true });
          result.push({ value: addedPart.value.slice(0, matchLen), added: true });
        }

        // 纯 added 部分
        if (extraLen > 0) {
          result.push({ value: addedPart.value.slice(matchLen), added: true });
        }
      }

      i++; // 跳过下一个 added
    } else {
      result.push(part);
    }
  }

  return result;
}

/**
 * 去除音乐符号 ♪ ♫ ♬ 等（U+266A-U+266C）及前后空格。
 */
function stripMusicNotes(text: string): string {
  return text.replace(/[♪-♬\s]/g, "").trim();
}

/**
 * 去除 LRC 标签 [key:value] 和时间戳 [00:08.00]。
 */
function stripLrcTags(text: string): string {
  return text.replace(/\[[^\]]*\]/g, "");
}

/**
 * 去除元信息文本（key:value / key-value 格式）。
 * 支持中英文混合 key（如 "音乐总监Music Director"、"和声编写/和声Backing Vocal"），
 * 分隔符支持冒号/横线，value 部分支持斜杠（如 "张靓颖/DaHua"）。
 */
function stripMetaText(text: string): string {
  // key: 中英文、斜杠、空格；分隔符: : ： - －；value: 到行尾
  return text.replace(/[a-zA-Z一-鿿/\s]+[:\-：－][^\n]*/g, "");
}

/**
 * 去除 "歌名 - 歌手" 格式的标题（可能在行首或独立一行）。
 */
function stripTitleLine(text: string): string {
  return text.replace(/^[^\n]+\s*-\s*[^\n]+\n?/gm, "");
}

/**
 * 预处理原曲歌词：去除所有元信息和时间戳，返回纯歌词文本。
 * 支持单行（无换行）和多行两种格式。
 */
export function cleanOriginalLyrics(text: string): string {
  let result = text;
  result = stripLrcTags(result);       // [ti:xxx] [00:08.00] 等
  result = stripMetaText(result);       // 词：xxx 编曲 - xxx 等
  result = stripTitleLine(result);      // 姑娘别哭泣 - 柯柯柯啊
  return result.trim();
}

/**
 * 智能纠错主函数。
 *
 * @param aiBody     - AI 字幕 body（带时间戳）
 * @param onlineText - 在线原曲歌词（可含 LRC 标签、元信息头部、时间戳）
 * @returns 纠正后的 Lyrics，或 null
 */
export function correctLyrics(
  aiBody: Array<{ from: number; content: string }>,
  onlineText: string,
): Lyrics | null {
  if (!aiBody.length || !onlineText) return null;

  const aiLines = aiBody.map((item) => stripMusicNotes(item.content));
  const aiText = aiLines.join("");
  const origText = cleanOriginalLyrics(onlineText).replace(/\n/g, "");
  if (!origText) return null;

  // 计算每行在 AI 拼接文本中的累积字符边界
  const lineBounds: number[] = [];
  let cumulative = 0;
  for (const line of aiLines) {
    cumulative += line.length;
    lineBounds.push(cumulative);
  }

  // diffChars 对比，预处理确保 removed/added 长度匹配，逐字符重建并按 AI 原行边界切分
  const rawDiffs = diffChars(origText, aiText);
  const diffs = normalizeDiffs(rawDiffs);
  const result: Lyrics = [];
  let currentLine = "";
  let lineIdx = 0;
  let aiCharCount = 0;
  let diffCount = 0;
  //let prevRemoved = false;

  let pendingLineBreak = false;

  for (let idx = 0; idx < diffs.length; idx++) {
    const part = diffs[idx];

    // 如果有待处理的换行，需要判断是否是纯 removed
    // 纯 removed = 当前是 removed，且后面不是 added（或已是最后一个元素）
    // 只有纯 removed 才应该 pending，changed（removed + added 成对）应该立即换行
    if (pendingLineBreak) {
      const isPureRemoved = part.removed &&
        (idx + 1 >= diffs.length || !diffs[idx + 1].added);

      if (!isPureRemoved) {
        // 不是纯 removed，执行换行
        if (lineIdx < aiBody.length) {
          result.push([Math.round(aiBody[lineIdx].from * 1000), currentLine]);
          currentLine = "";
          lineIdx++;
        }
        pendingLineBreak = false;
      }
    }

    for (let i = 0; i < part.value.length; i++) {
      const ch = part.value[i];

      if (part.added) {
        // AI 多出的字：不写入 currentLine，但计入 aiCharCount
        diffCount++;
        aiCharCount++;
      } else if (part.removed) {
        // AI 漏字：写入 currentLine，不计入 aiCharCount
        currentLine += ch;
      } else {
        // unchanged：写入 currentLine，计入 aiCharCount
        currentLine += ch;
        aiCharCount++;
      }

      // 检查行边界：标记待换行，但不立即换行（等待后续 removed 处理完）
      if (!pendingLineBreak && lineIdx < lineBounds.length && aiCharCount >= lineBounds[lineIdx]) {
        if (i == part.value.length - 1) {
          pendingLineBreak = true;
        }
        else {
          // 如果当前 part 还有剩余字符，说明换行点在 part 内部，立即换行
          result.push([Math.round(aiBody[lineIdx].from * 1000), currentLine]);
          currentLine = "";
          lineIdx++;
        }
      }
    }
  }

  // 处理最后一个待换行
  if (pendingLineBreak && lineIdx < aiBody.length) {
    result.push([Math.round(aiBody[lineIdx].from * 1000), currentLine]);
    currentLine = "";
    lineIdx++;
  }

  if (currentLine && lineIdx < aiBody.length) {
    result.push([Math.round(aiBody[lineIdx].from * 1000), currentLine]);
  }

  console.log("[lyricsCorrector] 修改 " + diffCount + " 个字符");

  return result;
}