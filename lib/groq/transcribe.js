// תמלול-הקלטות-שיחה (015) דרך Groq - API תואם-OpenAI. נבחר-כנקודת-התחלה (לא
// ivrit.ai, שדורש-פריסה-עצמית על GPU - ר' דיון-עם-המשתמש) - קריאת-API פשוטה,
// זולה-מאוד, בלי-תשתית-להקים.
// המודל: whisper-large-v3-turbo. ניסינו את המלא (whisper-large-v3) ב-2026-11-09
// והוא יצא גרוע יותר על ההקלטות שלנו: מילון-המונחים (VOCAB_PROMPT) "הודפס
// חזרה" כדברי הלקוח בערוץ השקט, ודיבור אמיתי של הלקוח נעלם - ולכן חזרנו.
// כדי לנסות מודל אחר בלי שינוי קוד: GROQ_STT_MODEL ב-Vercel (+ פריסה מחדש).
// language:'he' נשלח-במפורש כדי-לשפר-דיוק (לא-סומכים-על-זיהוי-אוטומטי).
const API_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const MODEL = process.env.GROQ_STT_MODEL || 'whisper-large-v3-turbo';

export function getTranscriptionModel() {
  return MODEL;
}

export function isTranscriptionConfigured() {
  return Boolean(process.env.GROQ_API_KEY);
}

// audioBytes - Buffer; mimeType - למשל 'audio/wav'. מחזיר מחרוזת-טקסט,
// או null אם התמלול-נכשל (fail-soft - לא-עוצר את שאר-ריצת-ה-cron).
export async function transcribeAudio(audioBytes, mimeType = 'audio/wav') {
  if (!isTranscriptionConfigured()) return null;

  const form = new FormData();
  form.append('file', new Blob([audioBytes], { type: mimeType }), 'recording.wav');
  form.append('model', MODEL);
  form.append('language', 'he');
  form.append('response_format', 'json');

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: form,
  });
  if (!res.ok) {
    const errText = await res.text();
    console.error('transcribeAudio: Groq החזירה שגיאה', res.status, errText);
    const err = new Error(`Groq ${res.status}: ${errText.slice(0, 300)}`);
    err.groqStatus = res.status;
    throw err;
  }
  const data = await res.json();
  return (data?.text || '').trim() || null;
}

// מילון-רמז קצר שמשפר איות של שמות ומונחים שחוזרים בשיחות (לא נשלח כהוראה אלא
// כ"הקשר קודם" ל-Whisper). קצר בכוונה - פרומפט ארוך עלול "לדלוף" לתמלול על שקט.
const VOCAB_PROMPT = 'שיחת טלפון במרכז דעת ותבונה. קורס J.CBT, טיפול קוגניטיבי התנהגותי יהודי, הרב יצחק ערד, סילבוס, הרשמה, תשלום, זום.';

// תמלול עם חותמות-זמן לכל קטע (verbose_json). מיועד לערוץ-בודד (מונו) כדי
// לשייך כל קטע לדובר. מחזיר מערך { start, end, text, noSpeechProb, avgLogprob,
// compressionRatio } בשניות, או זורק שגיאה (groqStatus מצורף) - ההחלטה מה
// לעשות בכשל (429 וכו') נשארת אצל הקורא.
export async function transcribeAudioSegments(audioBytes, mimeType = 'audio/wav') {
  if (!isTranscriptionConfigured()) return null;

  const form = new FormData();
  form.append('file', new Blob([audioBytes], { type: mimeType }), 'channel.wav');
  form.append('model', MODEL);
  form.append('language', 'he');
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'segment');
  form.append('temperature', '0');
  form.append('prompt', VOCAB_PROMPT);

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: form,
  });
  if (!res.ok) {
    const errText = await res.text();
    console.error('transcribeAudioSegments: Groq החזירה שגיאה', res.status, errText);
    const err = new Error(`Groq ${res.status}: ${errText.slice(0, 300)}`);
    err.groqStatus = res.status;
    throw err;
  }
  const data = await res.json();
  const segments = Array.isArray(data?.segments) ? data.segments : [];
  if (segments.length === 0 && data?.text?.trim()) {
    // אין פירוט קטעים - מחזירים קטע יחיד כדי לא לאבד את הטקסט
    return [{ start: 0, end: Number(data.duration) || 0, text: data.text.trim(), noSpeechProb: 0, avgLogprob: 0, compressionRatio: 1 }];
  }
  return segments.map((s) => ({
    start: Number(s.start) || 0,
    end: Number(s.end) || 0,
    text: (s.text || '').trim(),
    noSpeechProb: Number(s.no_speech_prob) || 0,
    avgLogprob: Number(s.avg_logprob) || 0,
    compressionRatio: Number(s.compression_ratio) || 1,
  }));
}
