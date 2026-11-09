import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { listRecordings, getRecordingAudio, isRecordingsApiConfigured } from '../../../../lib/hallo015/recordings';
import { transcribeAudio, transcribeAudioSegments, isTranscriptionConfigured, getTranscriptionModel } from '../../../../lib/groq/transcribe';
import { buildSpeakerTranscript, NO_SPEECH_MARKER } from '../../../../lib/groq/speakerTranscript';
import { normalizePhone } from '../../../../lib/hallo015/config';
import { safeEqual } from '../../../../lib/security/safeEqual';

// תמלול דוברים = שתי קריאות API לכל שיחה, לכן יותר זמן לפונקציה ופחות שיחות בריצה
export const maxDuration = 60;
const MAX_PER_RUN = 6;
const TIME_BUDGET_MS = 40_000;

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
  if (!safeEqual(authHeader, `Bearer ${configuredSecret}`)) {
    return NextResponse.json({ error: 'אין הרשאה' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const result = { recordingsFixed: 0, recordingsUnmatched: 0, transcribed: 0, transcriptionsFailed: 0 };

  // פאזה א' - תיקון recording_url
  if (!isRecordingsApiConfigured()) {
    result.recordingsError = 'חיוג-יזום/API של 015 לא מוגדר בשרת (HALLO015_API_USERNAME/PASSWORD) - מדלג על תיקון-הקלטות';
  } else {
    try {
      // חלון: לא-ישן-מדי (3 שעות) אבל-גם-לא-טרי-מדי (10 דק') - הקלטה
      // אצל-015 לא-זמינה-מיד-אחרי-שהשיחה-הסתיימה (אומת בפאנל-שלהם:
      // "This call ended less than 10 minutes ago - may not be available
      // yet"). מיון-עולה (לא-יורד!) - בלי-זה, בעומס-שיחות-גבוה ה-50
      // "הכי-חדשות" הן-תמיד-אותן-שיחות-טריות-מדי-בכל-ריצה (שיחות-מעט-
      // יותר-ישנות-ומוכנות-כבר נדחקות-החוצה ע"י-שיחות-חדשות-עוד-יותר,
      // ולעולם לא-מגיעות-לתור) - אומת-בפועל: recordingsFixed חזר ל-0
      // כש-המיון-היה-יורד, 2 ריצות-ברציפות, למרות שההתאמה-עצמה עובדת.
      const windowHours = 3;
      const windowStart = new Date(Date.now() - windowHours * 60 * 60 * 1000);
      const windowEnd = new Date(Date.now() - 10 * 60 * 1000);

      const { data: candidateCalls } = await supabase
        .from('phone_calls')
        .select('id, snumber, dnumber, extension, duration_seconds, started_at, recording_url')
        .gte('started_at', windowStart.toISOString())
        .lte('started_at', windowEnd.toISOString())
        .not('duration_seconds', 'is', null)
        .gt('duration_seconds', 0)
        .order('started_at', { ascending: true })
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
            // טווח-סבילות-רחב-מהמתוכנן-במקור (±1) - אומת-בפועל: totaltime
            // של-015 (משך-ההקלטה-בפועל) יכול-לסטות-כמה-שניות מ-duration_
            // seconds-שלנו (משך-השיחה-כפי-שה-webhook-מדווח) - ללא-קשר-
            // לחוסר-דיוק, רק-מדידה-שונה-במעט (ring-time/trailing). ±8
            // עדיין-צר-מספיק-כדי-לא-להתבלבל-בין-שיחות-שונות-לאותו-מספר.
            const durationDiff = Math.abs((Number(r.totaltime) || 0) - (call.duration_seconds || 0));
            if (durationDiff > 8) return false;
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

  // פאזה ב' - תמלול (לפי דוברים; נפילה חזרה לתמלול רגיל אם הפיצול לא אפשרי)
  //
  // מצבי הפעלה (כולם מאחורי אותו CRON_SECRET):
  //   ברירת מחדל        - שיחות שעדיין בלי תמלול (עד 6 בריצה: תמלול דוברים כולל
  //                        שתי קריאות API לשיחה, ויש תקרת זמן לפונקציה)
  //   ?redo=<id>         - תמלול מחדש לשיחה אחת (מחליף את התמלול הקיים)
  //   ?redoOld=<n>       - תמלול מחדש ל-n שיחות ישנות שעדיין בפורמט הישן (בלי
  //                        "נציג:/לקוח:"), מהחדשות לישנות. עד 6 בריצה.
  if (!isTranscriptionConfigured()) {
    result.transcriptionError = 'תמלול לא מוגדר בשרת (GROQ_API_KEY) - מדלג על תמלול';
  } else {
    try {
      const url = new URL(request.url);
      const redoId = url.searchParams.get('redo');
      const redoOld = Math.min(Math.max(parseInt(url.searchParams.get('redoOld') || '0', 10) || 0, 0), MAX_PER_RUN);

      let query = supabase
        .from('phone_calls')
        .select('id, recording_url')
        .not('recording_url', 'is', null)
        .ilike('recording_url', '%supabase%')
        .order('started_at', { ascending: false });
      if (redoId) {
        query = query.eq('id', redoId).limit(1);
      } else if (redoOld > 0) {
        query = query.not('transcript', 'is', null)
          .not('transcript', 'like', 'נציג:%')
          .not('transcript', 'like', 'לקוח:%')
          .not('transcript', 'like', `${NO_SPEECH_MARKER}%`)
          .limit(redoOld);
      } else {
        query = query.is('transcript', null).limit(MAX_PER_RUN);
      }
      const { data: queue } = await query;

      result.mode = redoId ? 'redo' : redoOld > 0 ? 'redoOld' : 'new';
      result.sttModel = getTranscriptionModel();
      result.transcriptionFailureSample = [];
      result.speakerStats = [];
      const startedAt = Date.now();

      for (const call of queue || []) {
        // לא מתחילים שיחה חדשה כשכמעט נגמר הזמן של הפונקציה - תמשיך בריצה הבאה
        if (Date.now() - startedAt > TIME_BUDGET_MS) { result.stoppedForTime = true; break; }
        try {
          const audioRes = await fetch(call.recording_url);
          if (!audioRes.ok) {
            result.transcriptionsFailed++;
            if (result.transcriptionFailureSample.length < 3) result.transcriptionFailureSample.push({ id: call.id, stage: 'fetch', status: audioRes.status });
            continue;
          }
          const bytes = Buffer.from(await audioRes.arrayBuffer());
          const { text, method, stats, agentChannel, roleSource } = await transcribeCall(bytes);
          if (text) {
            await supabase.from('phone_calls').update({ transcript: text }).eq('id', call.id);
            result.transcribed++;
            const counterKey = method === 'speakers' ? 'transcribedBySpeakers' : 'transcribedPlain';
            result[counterKey] = (result[counterKey] || 0) + 1;
            if (stats && result.speakerStats.length < 5) result.speakerStats.push({ id: call.id, ...stats, agentChannel, roleSource });
          } else {
            result.transcriptionsFailed++;
          }
        } catch (err) {
          if (err.groqStatus === 429) {
            // מגבלת קצב אצל Groq - עוצרים את הריצה (לא מסמנים כשל), הריצה הבאה תמשיך
            result.rateLimited = true;
            break;
          }
          console.error('poll-call-recordings: תמלול נכשל עבור call', call.id, err.message);
          result.transcriptionsFailed++;
          if (result.transcriptionFailureSample.length < 3) result.transcriptionFailureSample.push({ id: call.id, stage: 'transcribe', error: err.message });
        }
      }
    } catch (err) {
      result.transcriptionError = err.message;
    }
  }

  return NextResponse.json({ success: true, result });
}

// תמלול שיחה אחת: קודם לפי דוברים (פיצול ערוצים); אם ההקלטה אינה סטריאו/פורמט לא
// נתמך, או שהצינור נכשל מסיבה שאינה מגבלת קצב - חוזרים לתמלול הרגיל כדי שלא
// נאבד תמלול שהיה עובד היום.
async function transcribeCall(bytes) {
  try {
    const out = await buildSpeakerTranscript(bytes, { transcribeSegments: (wav) => transcribeAudioSegments(wav, 'audio/wav') });
    if (!out.unsupported && out.text) {
      return { text: out.text, method: 'speakers', stats: out.stats, agentChannel: out.agentChannel, roleSource: out.roleSource };
    }
  } catch (err) {
    if (err.groqStatus === 429) throw err;
    console.error('poll-call-recordings: תמלול דוברים נכשל, חוזר לתמלול רגיל:', err.message);
  }
  const text = await transcribeAudio(bytes, 'audio/wav');
  return { text, method: 'plain' };
}
