-- תמלול-שיחות (015) - טקסט מחושב-פעם-אחת (לא-משתנה אחרי שנוצר, כמו
-- שאר-ה-ai_one_liner-ים בפרויקט) ע"י Groq Whisper, אחרי ש-recording_url
-- כבר מצביע-על-הקובץ-שלנו-באחסון (לא-על-הקישור-החסום-מ-015 ישירות).
alter table public.phone_calls
  add column if not exists transcript text;
