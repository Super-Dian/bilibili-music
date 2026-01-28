extern crate wasm_bindgen;
use std::{io::Write, panic};

use wasm_bindgen::prelude::*;

// use id3::frame::{Content, Picture, PictureType};
use id3::{
    frame::{self, Picture, PictureType},
    Frame, Tag, TagLike, Version,
};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
pub struct AddTagOptionRs {
    pub author: String,
    pub title: String,
    pub album: String,
    pub host: String,
    pub cover: Vec<u8>,
    pub cover_mime: String,
    pub lyrics: LyricsRs,
    pub clip_ranges: ClipRangesRs,
    pub speed: f32,
    pub tsrn: String,
}

pub type LyricsRs = Vec<(u32, String)>;

pub type ClipRangesRs = Vec<(u32, u32)>;

#[wasm_bindgen(typescript_custom_section)]
const ITEXT_STYLE: &'static str = r#"
interface AddTagOption {
    author: string;
    title: string;
    album: string;
    host: string;
    cover: Uint8Array;
    cover_mime: string;
    lyrics: Lyrics;
    clip_ranges: ClipRanges;
    speed: number;
    tsrn: string;
}

type Lyrics = Array<[number, string]>;
type ClipRanges = Array<[number, number]>;
"#;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(typescript_type = "AddTagOption")]
    pub type AddTagOption;

    #[wasm_bindgen(typescript_type = "Lyrics")]
    pub type Lyrics;

    #[wasm_bindgen(typescript_type = "ClipRanges")]
    pub type ClipRanges;

    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
}

macro_rules! console_log {
    // Note that this is using the `log` function imported above during
    // `bare_bones`
    ($($t:tt)*) => (log(&format_args!($($t)*).to_string()))
}

const MILLISECONDS_PER_HOUR: u32 = 3600000;
const MILLISECONDS_PER_MINUTE: u32 = 60000;
const MILLISECONDS_PER_SECOND: u32 = 1000;

#[wasm_bindgen]
pub fn main(file: Vec<u8>, option: AddTagOption) -> Result<Vec<u8>, JsValue> {
    panic::set_hook(Box::new(console_error_panic_hook::hook));
    let out_lenght = file.len();
    let option = serde_wasm_bindgen::from_value::<AddTagOptionRs>(option.into())?;

    let file = music_main(file, option)?;

    console_log!(
        "音乐姬[{}]: 文件大小修改前: {}, 修改后: {}",
        env!("CARGO_PKG_VERSION"),
        out_lenght,
        file.len(),
    );
    Ok(file)
}

#[wasm_bindgen]
pub fn lyrics_clip(ranges: ClipRanges, lyrics: Lyrics) -> Result<Lyrics, JsValue> {
    panic::set_hook(Box::new(console_error_panic_hook::hook));
    let ranges = serde_wasm_bindgen::from_value::<ClipRangesRs>(ranges.into())?;
    let lyrics = serde_wasm_bindgen::from_value::<LyricsRs>(lyrics.into())?;
    let result = clip_lyrics(&ranges, &lyrics)?;
    let result = serde_wasm_bindgen::to_value(&result)?;
    Ok(result.into())
}

#[wasm_bindgen]
pub fn wav_clip(ranges: ClipRanges, file: Vec<u8>, speed: f32) -> Result<Vec<u8>, JsValue> {
    panic::set_hook(Box::new(console_error_panic_hook::hook));
    let ranges = serde_wasm_bindgen::from_value::<ClipRangesRs>(ranges.into())?;
    let result = clip_wav(&file, &ranges, speed)?;
    Ok(result)
}
fn music_main(file: Vec<u8>, option: AddTagOptionRs) -> Result<Vec<u8>, JsValue> {
    let mut file = clip_wav(&file, &option.clip_ranges, option.speed)?;
    let lyrics = option.lyrics;

    let mut tag = Tag::new();
    tag.set_album(option.album);
    tag.set_artist(&option.author);
    tag.set_text("TCOM", option.author);
    tag.set_title(option.title);
    tag.add_frame(Frame::link("WOAS", option.host));

    let mut lyrics2: Vec<String> = Vec::new();
    lyrics2.push("[offset:0]".to_owned());

    let speed_factor = if option.speed <= 0.0 {
        1.0
    } else {
        option.speed
    };

    for item in &lyrics {
        let total_ms = (item.0 as f32 / speed_factor) as u32;
        let mins = (total_ms % MILLISECONDS_PER_HOUR) / MILLISECONDS_PER_MINUTE;
        let secs = (total_ms % MILLISECONDS_PER_MINUTE) / MILLISECONDS_PER_SECOND;
        let ms = total_ms % MILLISECONDS_PER_SECOND;

        lyrics2.push(format!("[{:02}:{:02}.{:03}] {}", mins, secs, ms, item.1));
    }

    tag.add_frame(frame::Lyrics {
        lang: "zho".to_owned(),
        description: "".to_owned(),
        text: lyrics2.join("\n"),
    });

    tag.add_frame(frame::SynchronisedLyrics {
        lang: "zho".to_owned(),
        timestamp_format: frame::TimestampFormat::Ms,
        content_type: frame::SynchronisedLyricsType::Lyrics,
        description: "".to_owned(),
        content: lyrics,
    });

    tag.add_frame(Picture {
        mime_type: option.cover_mime,
        picture_type: PictureType::CoverFront,
        description: "cover".to_owned(),
        data: option.cover,
    });

    tag.add_frame(frame::Comment {
        text: "Wasm🎶音乐姬下载,仅供个人学习使用,严谨售卖和其他侵权行为".to_owned(),
        lang: "zho".to_owned(),
        description: "Wasm🎶音乐姬".to_owned(),
    });

    tag.set_text("TRSN", option.tsrn);

    let mut out_tag = Vec::new();
    tag.write_to(&mut out_tag, Version::Id3v23).unwrap();

    file.write_all(b"id3 ").unwrap();
    file.write_all(&(out_tag.len() as u32).to_le_bytes())
        .unwrap();
    file.write_all(&out_tag).unwrap();

    Ok(file)
}

fn clip_wav(wav_data: &[u8], ranges: &ClipRangesRs, speed: f32) -> Result<Vec<u8>, JsValue> {
    const MIN_HEADER_SIZE: usize = 44;
    if wav_data.len() < MIN_HEADER_SIZE {
        return Err(JsValue::from_str("无效的WAV文件"));
    }

    let channels = u16::from_le_bytes([wav_data[22], wav_data[23]]) as usize;
    let sample_rate = u32::from_le_bytes([wav_data[24], wav_data[25], wav_data[26], wav_data[27]]);
    let bits_per_sample = u16::from_le_bytes([wav_data[34], wav_data[35]]);

    if bits_per_sample != 16 {
        return Err(JsValue::from_str("仅支持16位深度的WAV文件进行高质量变速"));
    }

    let bytes_per_sample = (bits_per_sample / 8) as u32;
    let block_align = (channels as u32 * bytes_per_sample) as usize;
    let bytes_per_ms = sample_rate * block_align as u32 / 1000;

    let mut data_start = 12;
    loop {
        if data_start + 8 > wav_data.len() {
            return Err(JsValue::from_str("无法找到data块"));
        }
        let chunk_id = &wav_data[data_start..data_start + 4];
        let chunk_size = u32::from_le_bytes([
            wav_data[data_start + 4],
            wav_data[data_start + 5],
            wav_data[data_start + 6],
            wav_data[data_start + 7],
        ]) as usize;

        if chunk_id == b"data" {
            data_start += 8;
            break;
        }
        data_start += 8 + chunk_size;
    }

    let audio_data = &wav_data[data_start..];

    let mut sorted_ranges = ranges.to_vec();
    sorted_ranges.sort_by_key(|r| r.0);
    let merged_ranges = merge_ranges(sorted_ranges);

    let est_new_len = data_start + (audio_data.len() as f32 / speed) as usize;
    let mut result = Vec::with_capacity(est_new_len);

    result.extend_from_slice(&wav_data[..data_start]);

    let mut last_end_ms = 0;

    let mut process_segment = |start_ms: u32, end_ms: u32| {
        let start_byte = (start_ms * bytes_per_ms) as usize / block_align * block_align;
        let end_byte = if end_ms == 0 {
            audio_data.len()
        } else {
            (end_ms * bytes_per_ms) as usize / block_align * block_align
        };

        let end_byte = end_byte.min(audio_data.len());
        if start_byte >= end_byte {
            return;
        }

        let segment = &audio_data[start_byte..end_byte];

        if (speed - 1.0).abs() < 0.001 {
            result.extend_from_slice(segment);
        } else {
            let src_frames = segment.len() / block_align;
            let dst_frames = (src_frames as f32 / speed).floor() as usize;

            for i in 0..dst_frames {
                let src_idx_f = i as f32 * speed;
                let idx_floor = src_idx_f.floor() as usize;
                let idx_ceil = (idx_floor + 1).min(src_frames - 1);
                let t = src_idx_f - idx_floor as f32;

                for c in 0..channels {
                    let offset = c * 2;

                    let pos_floor = idx_floor * block_align + offset;
                    let sample_floor =
                        i16::from_le_bytes([segment[pos_floor], segment[pos_floor + 1]]);

                    let pos_ceil = idx_ceil * block_align + offset;
                    let sample_ceil =
                        i16::from_le_bytes([segment[pos_ceil], segment[pos_ceil + 1]]);

                    let val = sample_floor as f32 * (1.0 - t) + sample_ceil as f32 * t;
                    let val_i16 = val.round().clamp(-32768.0, 32767.0) as i16;

                    result.extend_from_slice(&val_i16.to_le_bytes());
                }
            }
        }
    };

    for range in &merged_ranges {
        if last_end_ms < range.0 {
            process_segment(last_end_ms, range.0);
        }
        last_end_ms = range.1;
    }

    let total_audio_ms = (audio_data.len() as u32 / bytes_per_ms) as u32;
    if last_end_ms < total_audio_ms {
        process_segment(last_end_ms, 0);
    }

    let final_file_size = (result.len() - 8) as u32;
    result[4..8].copy_from_slice(&final_file_size.to_le_bytes());

    let final_data_size = (result.len() - data_start) as u32;

    let mut current_pos = 12;
    loop {
        if current_pos + 8 > result.len() {
            break;
        }
        let chunk_id = &result[current_pos..current_pos + 4];
        if chunk_id == b"data" {
            result[current_pos + 4..current_pos + 8]
                .copy_from_slice(&final_data_size.to_le_bytes());
            break;
        }
        let chunk_size = u32::from_le_bytes([
            result[current_pos + 4],
            result[current_pos + 5],
            result[current_pos + 6],
            result[current_pos + 7],
        ]) as usize;
        current_pos += 8 + chunk_size;
    }

    Ok(result)
}

fn clip_lyrics(ranges: &ClipRangesRs, lyrics: &LyricsRs) -> Result<LyricsRs, JsValue> {
    if ranges.is_empty() {
        return Ok(lyrics.to_vec());
    }

    // 对时间范围进行排序和合并
    let mut sorted_ranges = ranges.to_vec();
    sorted_ranges.sort_by_key(|r| r.0);
    let merged_ranges = merge_ranges(sorted_ranges);

    // 计算时间偏移量并调整歌词
    let mut adjusted_lyrics: Vec<(u32, String)> = Vec::new();

    for lyric in lyrics {
        let mut time_offset = 0;
        let mut should_add = true;

        // 计算当前歌词应该减去的时间
        for range in &merged_ranges {
            if lyric.0 >= range.0 && lyric.0 <= range.1 {
                // 如果歌词在删除区间内,跳过这个歌词
                should_add = false;
                break;
            } else if lyric.0 > range.1 {
                // 如果歌词在删除区间之后，减去整个区间的长度
                time_offset += range.1 - range.0;
            }
        }

        // 只添加不在删除区间内的歌词
        if should_add {
            adjusted_lyrics.push((lyric.0 - time_offset, lyric.1.clone()));
        }
    }

    Ok(adjusted_lyrics)
}

fn merge_ranges(ranges: ClipRangesRs) -> ClipRangesRs {
    if ranges.is_empty() {
        return ranges.to_vec();
    }

    let mut merged = Vec::new();
    let mut current = ranges[0].clone();

    for range in ranges.into_iter().skip(1) {
        if range.0 <= current.1 {
            current.1 = current.1.max(range.1);
        } else {
            merged.push(current);
            current = range;
        }
    }
    merged.push(current);

    merged
}

#[cfg(test)]
mod tests {
    use std::{fs, io::Write};

    use crate::*;
    use wasm_bindgen_test::*;

    #[wasm_bindgen_test]
    fn test_wsam() {
        wasm_bindgen_test_configure!(run_in_browser);
        let (in_file, opt) = test_data();
        let in_len = in_file.len();
        let opt = serde_wasm_bindgen::to_value(&opt).unwrap();
        let out_file = main(in_file, AddTagOption { obj: opt }).unwrap();
        self::console_log!("res: {:?}", out_file);
        let out_len = out_file.len();
        self::console_log!("in len: {}, out len: {}", in_len, out_len);
        assert!(in_len < out_len, "in len: {}, out len: {}", in_len, out_len);
    }

    #[test]
    fn test_rs_tag() {
        let (in_file, option) = test_data();
        let in_len = in_file.len();

        let mut out_file = fs::File::create("./testdata/test_out_tag.wav").unwrap();

        let file = music_main(in_file, option).unwrap();

        out_file.write_all(&file).unwrap();

        let out_len = out_file.metadata().unwrap().len() as usize;

        println!("in len: {}, out len: {}", in_len, out_len);
        assert!(
            in_len == 2355244 && out_len == 2376710,
            "in len[2355244]: {}, out len[2376710]: {}",
            in_len,
            out_len
        );
    }

    #[test]
    fn test_rs_clip() {
        let (in_file, mut option) = test_data();
        option.clip_ranges = vec![(0, 3000), (7000, 9000)];

        let in_len = in_file.len();

        let mut out_file = fs::File::create("./testdata/test_out_clip.wav").unwrap();
        let file = music_main(in_file, option).unwrap();

        out_file.write_all(&file).unwrap();

        let out_len = out_file.metadata().unwrap().len() as usize;

        println!("in len: {}, out len: {}", in_len, out_len);
        assert!(
            in_len == 2355244 && out_len == 1416710,
            "in len[2355244]: {}, out len[1416710]: {}",
            in_len,
            out_len
        );
    }

    #[test]
    fn test_rs_speed() {
        let (in_file, mut option) = test_data();
        option.speed = 2.;

        let in_len = in_file.len();

        let mut out_file = fs::File::create("./testdata/test_out_speed.wav").unwrap();
        let file = music_main(in_file, option).unwrap();

        out_file.write_all(&file).unwrap();

        let out_len = out_file.metadata().unwrap().len() as usize;

        println!("in len: {}, out len: {}", in_len, out_len);
        assert!(
            in_len == 2355244 && out_len == 1199110,
            "in len[2355244]: {}, out len[1199110]: {}",
            in_len,
            out_len
        );
    }

    fn test_data() -> (Vec<u8>, AddTagOptionRs) {
        let cover_file = include_bytes!("../testdata/cover.jpeg").to_vec();
        let in_file = include_bytes!("../testdata/music_13s.wav").to_vec();
        let mut lyrics = Vec::<(u32, String)>::new();
        for i in 0..10 {
            let i = i * 1024;
            let (from, to) = (4 + i, i + 1024);
            lyrics.push((from, format!("test:{}-{}", from, to)));
        }
        let opt = AddTagOptionRs {
            clip_ranges: vec![],
            author: "Ocyss".to_string(),
            title: "add tag test".to_string(),
            album: "tests".to_string(),
            host: "https://github.com/ocyss".to_string(),
            cover: cover_file,
            cover_mime: "image/jpeg".to_string(),
            lyrics: lyrics,
            speed: 1.,
            tsrn: "ocyss.icu".to_string(),
        };
        return (in_file, opt);
    }
}
