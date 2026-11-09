// עיבוד WAV (PCM 16-bit) בלי תלויות חיצוניות. ב-Vercel אין ffmpeg, ולכן
// פיצול הקלטת-סטריאו של 015 לשני ערוצים (נציג / לקוח) נעשה כאן ב-JS טהור.
//
// הקלטות 015: סטריאו, 8kHz, PCM 16-bit. כל ערוץ מכיל צד אחד של השיחה
// (נמדד על הקלטות אמיתיות: חלק גדול מהזמן רק ערוץ אחד פעיל).

const FRAME_MS = 20;

export function parseWav(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 44
    || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('הקובץ אינו WAV תקין');
  }
  let pos = 12;
  let fmt = null;
  let dataStart = -1;
  let dataLen = 0;
  while (pos + 8 <= buf.length) {
    const id = buf.toString('ascii', pos, pos + 4);
    let size = buf.readUInt32LE(pos + 4);
    const body = pos + 8;
    if (id === 'fmt ') {
      fmt = {
        format: buf.readUInt16LE(body),
        channels: buf.readUInt16LE(body + 2),
        sampleRate: buf.readUInt32LE(body + 4),
        bits: buf.readUInt16LE(body + 14),
      };
      // WAVE_FORMAT_EXTENSIBLE - הפורמט האמיתי נמצא בתת-הפורמט
      if (fmt.format === 0xfffe && size >= 26) fmt.format = buf.readUInt16LE(body + 24);
    } else if (id === 'data') {
      dataStart = body;
      // כותרת של WAV "זורם" יכולה להכיל גודל 0 / 0xFFFFFFFF - אז לוקחים עד סוף הקובץ
      if (size === 0 || size === 0xffffffff || body + size > buf.length) size = buf.length - body;
      dataLen = size;
      break;
    }
    pos = body + size + (size % 2);
  }
  if (!fmt || dataStart < 0) throw new Error('חסרה כותרת fmt/data בקובץ WAV');
  if (fmt.format !== 1 || fmt.bits !== 16) throw new Error(`פורמט שמע לא נתמך (format=${fmt.format}, bits=${fmt.bits})`);
  if (fmt.channels < 1 || fmt.channels > 2) throw new Error(`מספר ערוצים לא נתמך (${fmt.channels})`);
  return { channels: fmt.channels, sampleRate: fmt.sampleRate, dataStart, dataLen };
}

// מחזיר מערך של Int16Array - אחד לכל ערוץ
export function splitChannels(buf, info) {
  const frameBytes = 2 * info.channels;
  const frames = Math.floor(info.dataLen / frameBytes);
  const out = Array.from({ length: info.channels }, () => new Int16Array(frames));
  let p = info.dataStart;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < info.channels; c++) {
      out[c][i] = buf.readInt16LE(p);
      p += 2;
    }
  }
  return out;
}

export function encodeWavMono(samples, sampleRate) {
  const dataBytes = samples.length * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < samples.length; i++) buf.writeInt16LE(samples[i], 44 + i * 2);
  return buf;
}

// RMS לכל פריים של 20ms
export function frameRmsArray(samples, sampleRate) {
  const frameLen = Math.max(1, Math.round((sampleRate * FRAME_MS) / 1000));
  const n = Math.floor(samples.length / frameLen);
  const rms = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    let s = 0;
    const start = f * frameLen;
    for (let i = start; i < start + frameLen; i++) s += samples[i] * samples[i];
    rms[f] = Math.sqrt(s / frameLen);
  }
  return { rms, frameLen };
}

function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = Float32Array.from(arr).sort();
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

// "שער רעש": מאפס פריימים שקטים (אחרי הרחבה קלה סביב קטעי דיבור כדי לא לחתוך
// תחילת/סוף מילה). מטרה - לצמצם "הזיות" של Whisper על שקט ודליפת-קול מהצד השני.
// סף אדפטיבי לפי הערוץ עצמו, עם רצפה מוחלטת.
export function gateChannel(samples, sampleRate, { minAbs = 150, relative = 0.1, hangMs = 250 } = {}) {
  const { rms, frameLen } = frameRmsArray(samples, sampleRate);
  const threshold = Math.max(minAbs, relative * percentile(rms, 0.95));
  const hang = Math.round(hangMs / FRAME_MS);
  const active = new Uint8Array(rms.length);
  for (let f = 0; f < rms.length; f++) {
    if (rms[f] >= threshold) {
      for (let k = Math.max(0, f - hang); k <= Math.min(rms.length - 1, f + hang); k++) active[k] = 1;
    }
  }
  const gated = new Int16Array(samples.length);
  let activeFrames = 0;
  for (let f = 0; f < rms.length; f++) {
    if (!active[f]) continue;
    activeFrames++;
    const start = f * frameLen;
    gated.set(samples.subarray(start, start + frameLen), start);
  }
  return {
    gated, threshold, active, frameSec: FRAME_MS / 1000,
    activeFrames, totalFrames: rms.length, activeRatio: rms.length ? activeFrames / rms.length : 0,
  };
}

// איזה חלק מטווח הזמן (בשניות) נמצא בפריימים "פעילים" אחרי השער. קטע שכמעט כולו
// שקט הוא כנראה "הזיה" של Whisper ולא דיבור אמיתי.
export function activeFraction(gate, startSec, endSec) {
  const a = Math.max(0, Math.floor(startSec / gate.frameSec));
  const b = Math.min(gate.active.length, Math.ceil(endSec / gate.frameSec));
  if (b <= a) return 0;
  let on = 0;
  for (let f = a; f < b; f++) on += gate.active[f];
  return on / (b - a);
}

// RMS של טווח זמן (בשניות) בתוך ערוץ
export function rangeRms(samples, sampleRate, startSec, endSec) {
  const a = Math.max(0, Math.floor(startSec * sampleRate));
  const b = Math.min(samples.length, Math.ceil(endSec * sampleRate));
  if (b <= a) return 0;
  let s = 0;
  for (let i = a; i < b; i++) s += samples[i] * samples[i];
  return Math.sqrt(s / (b - a));
}

// חלוקה לחתיכות (לשיחות ארוכות מאוד - מגבלת גודל-קובץ ב-API). offsetSec הוא
// הזחה לתוספת לחותמות-הזמן של כל חתיכה.
export function chunkSamples(samples, sampleRate, maxSeconds = 1200) {
  const size = Math.floor(maxSeconds * sampleRate);
  if (samples.length <= size) return [{ offsetSec: 0, samples }];
  const chunks = [];
  for (let start = 0; start < samples.length; start += size) {
    chunks.push({ offsetSec: start / sampleRate, samples: samples.subarray(start, Math.min(samples.length, start + size)) });
  }
  return chunks;
}
