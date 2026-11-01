// תמלול-הקלטות-שיחה (015) דרך Groq - API תואם-OpenAI, מודל whisper-large-
// v3-turbo. נבחר-כנקודת-התחלה (לא ivrit.ai, שדורש-פריסה-עצמית על GPU -
// ר' דיון-עם-המשתמש) - קריאת-API פשוטה, זולה-מאוד, בלי-תשתית-להקים.
// language:'he' נשלח-במפורש כדי-לשפר-דיוק (לא-סומכים-על-זיהוי-אוטומטי).
const API_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const MODEL = 'whisper-large-v3-turbo';

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
