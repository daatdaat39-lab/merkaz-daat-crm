// תמלול לפי דוברים להקלטות 015 (סטריאו: כל צד בערוץ נפרד).
//
// שלבים: פיצול לשני ערוצים -> שער-רעש -> תמלול נפרד לכל ערוץ (עם חותמות זמן)
// -> סינון "הזיות" של Whisper על שקט -> הסרת דליפת-קול בין הערוצים -> זיהוי איזה
// ערוץ הוא הנציג -> מיזוג לפי זמן לשורות "נציג: ... / לקוח: ...".
//
// הפונקציות הטהורות מיוצאות כדי שאפשר יהיה לבדוק אותן בלי רשת ובלי מפתח.
import { parseWav, splitChannels, encodeWavMono, gateChannel, rangeRms, activeFraction, chunkSamples } from '../audio/wav';

export const AGENT_LABEL = 'נציג';
export const CUSTOMER_LABEL = 'לקוח';
export const NO_SPEECH_MARKER = '[הקלטה ללא דיבור]';

// האם התמלול כבר בפורמט דוברים (שורה שמתחילה ב"נציג: " / "לקוח: ")
export function hasSpeakerLabels(text) {
  return /^(נציג|לקוח): /m.test(text || '');
}

// ---- סינון הזיות ----
const SUBTITLE_JUNK = /(כתוביות|תרגום|amara|subtitles?|תודה שצפיתם|תודה על הצפייה|לעשות לייק|הירשמו לערוץ|תנו לייק)/i;
const FAREWELL_ONLY = new Set(['תודה', 'תודה רבה', 'להתראות', 'תודה ולהתראות']);

function normalizeText(t) {
  return (t || '').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

// seg: { start, end, text, noSpeechProb, avgLogprob, compressionRatio }
// gate: תוצאת gateChannel של אותו ערוץ; rawSamples/sampleRate - לחישוב אנרגיה
export function isHallucination(seg, gate, rawSamples, sampleRate) {
  const norm = normalizeText(seg.text);
  if (!norm) return true;
  if (SUBTITLE_JUNK.test(seg.text)) return true;
  // חזרתיות קיצונית (לולאה של אותה מילה)
  if (seg.compressionRatio > 2.6) return true;
  // הכלל הרשמי של Whisper: סבירות-אי-דיבור גבוהה + ביטחון נמוך
  if (seg.noSpeechProb > 0.6 && seg.avgLogprob < -1.0) return true;
  // הקטע נופל כמעט כולו על שקט (אחרי שער הרעש) - לא היה שם דיבור
  if (activeFraction(gate, seg.start, seg.end) < 0.15) return true;
  // "תודה"/"להתראות" בודדים בעוצמה נמוכה - הזיה קלאסית על סוף-שקט
  if (FAREWELL_ONLY.has(norm)) {
    const rms = rangeRms(rawSamples, sampleRate, seg.start, seg.end);
    if (rms < gate.threshold * 2.5) return true;
  }
  return false;
}

// ---- זיהוי הנציג ----
const AGENT_CUES = [
  /מדבר(?:ת)?\s+(?:מ|כאן|איתך|עם)/,
  /מדעת|ממרכז דעת|מישיבת דעת|מהגזברות/,
  /דעת ותבונה|מרכז דעת|ישיבת דעת/,
  /מהקורס(?:ים)?\s+של|בנוגע לקורס|לגבי הקורס|פרסמנו את הקורס/,
  /(?:איך|במה)\s+(?:אפשר|אוכל)\s+לעזור/,
  /אני\s+(?:מתקשר|מתקשרת|פונה)/,
  /השארת(?:ם)?\s+פרטים|ראיתי\s+ש(?:השארת|פנית)/,
];
const CUSTOMER_CUES = [
  /אני\s+מתעניין|אני\s+מתעניינת|רציתי\s+(?:לשאול|לברר)|כמה\s+(?:זה\s+)?עולה/,
];

function cueScore(text) {
  let s = 0;
  for (const re of AGENT_CUES) if (re.test(text)) s += 1;
  for (const re of CUSTOMER_CUES) if (re.test(text)) s -= 0.5;
  return s;
}

// מחזיר { agentChannel: 0|1, source: 'lexical'|'convention' }
// ברירת-מחדל: ערוץ 1 (ימין). נמדד על שיחות אמיתיות - בכ-12 מתוך 14 (נכנסות
// ויוצאות כאחד) הנציג היה בערוץ 1. כשיש רמזים לשוניים ברורים הם גוברים.
export function detectAgentChannel(textByChannel) {
  const s0 = cueScore(textByChannel[0] || '');
  const s1 = cueScore(textByChannel[1] || '');
  if (s0 - s1 >= 1) return { agentChannel: 0, source: 'lexical' };
  if (s1 - s0 >= 1) return { agentChannel: 1, source: 'lexical' };
  return { agentChannel: 1, source: 'convention' };
}

// ---- דליפת קול בין ערוצים ----
function tokens(text) {
  return new Set(normalizeText(text).split(' ').filter(Boolean));
}

function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

// קטעים משני ערוצים שחופפים בזמן ובעלי טקסט דומה - הד/דליפה. משאירים את זה
// שחזק יותר בערוץ שלו (energy), מוחקים את השני.
export function dedupeBleed(segs) {
  const dropped = new Set();
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const a = segs[i];
      const b = segs[j];
      if (a.channel === b.channel || dropped.has(i) || dropped.has(j)) continue;
      const overlap = Math.min(a.end, b.end) - Math.max(a.start, b.start);
      if (overlap <= 0) continue;
      const minDur = Math.min(a.end - a.start, b.end - b.start) || 1;
      if (overlap / minDur < 0.5) continue;
      if (jaccard(tokens(a.text), tokens(b.text)) < 0.6) continue;
      dropped.add(a.energy >= b.energy ? j : i);
    }
  }
  return segs.filter((_, idx) => !dropped.has(idx));
}

// ---- עיצוב ----
export function formatTurns(segs, agentChannel, maxGapSec = 2.5) {
  const sorted = [...segs].sort((x, y) => x.start - y.start || x.end - y.end);
  const turns = [];
  for (const s of sorted) {
    const label = s.channel === agentChannel ? AGENT_LABEL : CUSTOMER_LABEL;
    const text = s.text.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const last = turns[turns.length - 1];
    if (last && last.label === label && s.start - last.end <= maxGapSec) {
      last.text += ' ' + text;
      last.end = Math.max(last.end, s.end);
    } else {
      turns.push({ label, text, start: s.start, end: s.end });
    }
  }
  return turns.map((t) => `${t.label}: ${t.text}`).join('\n');
}

// transcribeSegments(wavBytes) => Promise<segments[]> - מוזרק כדי שאפשר יהיה
// לבדוק את כל הצינור בלי רשת. מחזיר:
//   { unsupported: '...' }                          - לא סטריאו / פורמט לא נתמך (הקורא יחזור לתמלול הרגיל)
//   { text, agentChannel, roleSource, stats }       - הצלחה (text עשוי להיות NO_SPEECH_MARKER)
export async function buildSpeakerTranscript(wavBytes, { transcribeSegments, maxChunkSeconds = 1200 } = {}) {
  let info;
  try {
    info = parseWav(wavBytes);
  } catch (err) {
    return { unsupported: err.message };
  }
  if (info.channels !== 2) return { unsupported: 'ההקלטה אינה סטריאו' };

  const raw = splitChannels(wavBytes, info);
  const gates = raw.map((samples) => gateChannel(samples, info.sampleRate));

  const perChannel = await Promise.all(gates.map(async (gate) => {
    if (gate.activeRatio < 0.01) return []; // ערוץ כמעט שקט לגמרי - אין מה לתמלל
    const out = [];
    for (const chunk of chunkSamples(gate.gated, info.sampleRate, maxChunkSeconds)) {
      const part = await transcribeSegments(encodeWavMono(chunk.samples, info.sampleRate));
      for (const s of part || []) out.push({ ...s, start: s.start + chunk.offsetSec, end: s.end + chunk.offsetSec });
    }
    return out;
  }));

  const stats = { raw: 0, hallucinations: 0, bleed: 0, kept: 0 };
  let kept = [];
  perChannel.forEach((segs, channel) => {
    for (const s of segs) {
      stats.raw++;
      if (isHallucination(s, gates[channel], raw[channel], info.sampleRate)) { stats.hallucinations++; continue; }
      kept.push({ ...s, channel, energy: rangeRms(raw[channel], info.sampleRate, s.start, s.end) });
    }
  });

  const beforeBleed = kept.length;
  kept = dedupeBleed(kept);
  stats.bleed = beforeBleed - kept.length;
  stats.kept = kept.length;

  if (kept.length === 0) return { text: NO_SPEECH_MARKER, agentChannel: null, roleSource: null, stats };

  const textByChannel = [0, 1].map((c) => kept.filter((s) => s.channel === c).map((s) => s.text).join(' '));
  const { agentChannel, source } = detectAgentChannel(textByChannel);
  return { text: formatTurns(kept, agentChannel), agentChannel, roleSource: source, stats };
}
