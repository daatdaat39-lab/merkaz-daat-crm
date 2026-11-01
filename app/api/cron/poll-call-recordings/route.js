import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { listRecordings, getRecordingAudio, isRecordingsApiConfigured } from '../../../../lib/hallo015/recordings';
import { transcribeAudio, isTranscriptionConfigured } from '../../../../lib/groq/transcribe';
import { normalizePhone } from '../../../../lib/hallo015/config';

// "השעון" שמתקן שתי-בעיות-בזו-אחר-זו (שתי-פאזות, לא שני-cron-נפרדים -
// תמלול-מיד-אחרי-תיקון-הקלטה-חדשה, בלי-להמתין-לריצה-הבאה):
//
// פאזה א' (היה-שבור-לגמרי, 0 הקלטות מתוך 200 בדיקה-חיה) - הקישור
// שה-webhook (hallo015-call) מקבל-ישירות מפנה ל-015pbx.net שדורש session
// מחובר בפורטל שלהם (אומת: 301 ל-auth.php) ולכן לעולם לא-מתנגן בכרטיס.
// הפתרון-הישן (poll-call-recordings דרך-מייל, Gmail) *מעולם לא-הצליח
// להחליף אף-הקלטה-אחת בפועל* (אומת-בפועל-מול-200-שיחות-חיות - כולן-עדיין
// עם-הקישור-החסום) - הוחלף-לגמרי כאן ב-API-המאומת-הישיר של 015
// (lib/hallo015/recordings.js, אותם-auth_username/auth_password כמו
// clickToDial.js) - בלי-תלות-בתיבת-מייל/Gmail-OAuth בכלל יותר.
//
// פאזה ב' (חדש) - תמלול (lib/groq/transcribe.js) לשיחות-שכבר-יש-להן
// recording_url-אמיתי (שלנו, מ-Storage) אבל-עדיין-בלי transcript.
export async function GET(request) {
  const configuredSecret = process.env.CRON_SECRET;
  if (!configuredSecret) {
    return NextResponse.json({ error: 'CRON_SECRET לא מוגדר בשרת' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${configuredSecret}`) {
    return NextResponse.json({ error: 'אין הרשאה' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const result = { recordingsFixed: 0, recordingsUnmatched: 0, transcribed: 0, transcriptionsFailed: 0 };

  // פאזה א' - תיקון recording_url
  if (!isRecordingsApiConfigured()) {
    result.recordingsError = 'חיוג-יזום/API של 015 לא מוגדר בשרת (HALLO015_API_USERNAME/PASSWORD) - מדלג על תיקון-הקלטות';
  } else {
    try {
      const windowHours = 3;
      const windowStart = new Date(Date.now() - windowHours * 60 * 60 * 1000);

      const { data: candidateCalls } = await supabase
        .from('phone_calls')
        .select('id, snumber, dnumber, extension, duration_seconds, started_at, recording_url')
        .gte('started_at', windowStart.toISOString())
        .not('duration_seconds', 'is', null)
        .gt('duration_seconds', 0)
        .order('started_at', { ascending: false })
        .limit(50);

      const needsFix = (candidateCalls || []).filter((c) => !c.recording_url || !c.recording_url.includes('supabase'));

      if (needsFix.length > 0) {
        const recordings = await listRecordings({
          startUnixSeconds: Math.floor(windowStart.getTime() / 1000),
          endUnixSeconds: Math.floor(Date.now() / 1000),
        });

        for (const call of needsFix) {
          // התאמה-היוריסטית (אין-מפתח-מדויק-משותף בין phone_calls ל-
          // רשומת-ההקלטה) - משך-זהה (±1 שנייה) וזמן-התחלה-קרוב (±5 דק')
          // ואחד-המספרים-שלנו (snumber/dnumber/extension) מופיע ב-
          // snumber/cnumber של ההקלטה. אותו-עיקרון-בדיוק כמו ההתאמה-
          // הישנה-דרך-מייל, רק-המקור-שונה.
          const callStartMs = new Date(call.started_at).getTime();
          const match = recordings.find((r) => {
            const durationDiff = Math.abs((Number(r.totaltime) || 0) - (call.duration_seconds || 0));
            if (durationDiff > 1) return false;
            const recordingStartMs = Number(r.start) * 1000;
            if (Math.abs(recordingStartMs - callStartMs) > 5 * 60 * 1000) return false;
            const ourNumbers = [call.snumber, call.dnumber, call.extension].filter(Boolean).map(normalizePhone);
            const theirNumbers = [r.snumber, r.cnumber].filter(Boolean).map(normalizePhone);
            return ourNumbers.some((n) => theirNumbers.includes(n));
          });

          if (!match) { result.recordingsUnmatched++; continue; }

          try {
            const { bytes, mimeType } = await getRecordingAudio(match);
            const path = `${call.id}/recording.wav`;
            const { error: uploadError } = await supabase.storage
              .from('call-recordings')
              .upload(path, bytes, { contentType: mimeType, upsert: true });
            if (uploadError) { result.recordingsUnmatched++; continue; }

            const { data: pub } = supabase.storage.from('call-recordings').getPublicUrl(path);
            await supabase.from('phone_calls').update({ recording_url: pub.publicUrl }).eq('id', call.id);
            result.recordingsFixed++;
          } catch (err) {
            console.error('poll-call-recordings: getRecordingAudio/upload נכשל עבור call', call.id, err.message);
            result.recordingsUnmatched++;
          }
        }
      }
    } catch (err) {
      result.recordingsError = err.message;
    }
  }

  // פאזה ב' - תמלול
  if (!isTranscriptionConfigured()) {
    result.transcriptionError = 'תמלול לא מוגדר בשרת (GROQ_API_KEY) - מדלג על תמלול';
  } else {
    try {
      const { data: untranscribed } = await supabase
        .from('phone_calls')
        .select('id, recording_url')
        .not('recording_url', 'is', null)
        .ilike('recording_url', '%supabase%')
        .is('transcript', null)
        .order('started_at', { ascending: false })
        .limit(20);

      for (const call of untranscribed || []) {
        try {
          const audioRes = await fetch(call.recording_url);
          if (!audioRes.ok) { result.transcriptionsFailed++; continue; }
          const bytes = Buffer.from(await audioRes.arrayBuffer());
          const transcript = await transcribeAudio(bytes, 'audio/wav');
          if (transcript) {
            await supabase.from('phone_calls').update({ transcript }).eq('id', call.id);
            result.transcribed++;
          } else {
            result.transcriptionsFailed++;
          }
        } catch (err) {
          console.error('poll-call-recordings: תמלול נכשל עבור call', call.id, err.message);
          result.transcriptionsFailed++;
        }
      }
    } catch (err) {
      result.transcriptionError = err.message;
    }
  }

  return NextResponse.json({ success: true, result });
}
