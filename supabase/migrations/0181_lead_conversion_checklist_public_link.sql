-- (א) קישור-אישי-ציבורי ללקוח (token ארוך-ואקראי, לא JWT/expiry - ר'
-- דיון "קישור-מאוחד"): ייווצר-עצלנית (לא-ב-insert הראשוני של-השורה)
-- בלחיצת-הנציג על "יצירת קישור", לא-בכל-יצירת-שורת-צ'קליסט. רענון =
-- overwrite התוקן הקיים - מבטל-אוטומטית קישור-קודם-שנשלח (lookup הוא
-- שוויון-מחרוזת-מדויק, אין-טבלת-טוקנים-היסטורית). לא-time-based-
-- expiry בכוונה (רישום יכול-לקחת-כמה-ימים). public_link_last_opened_at
-- מתעדכן בכל-טעינה של עמוד-הקישור (לא-רק-בשינוי) - כדי-שהנציג יראה
-- הבדל בין "עוד-לא-נפתח" ל"נפתח-אבל-לא-התקדם".
-- (ב) קישור-תשלום לליד-ספציפי (seed חד-פעמי מ-courses.payment_page_url,
-- בדיוק-כמו forms_link/signatures_link - נציג יכול-לערוך-ידנית אחרי).
-- (ג) ארטיפקט-חתימה-דיגיטלית-פנימי (קנבס, לא-קישור-חיצוני) - נשאר
-- **בנוסף-ל**-signatures_link/signatures_note הקיימים (לא-מוחליף) -
-- קורס יכול עדיין-להשתמש-בקישור-חיצוני אם-ירצה; signatures_done=true
-- מסומן משני-המקורות (צ'קבוקס-ידני *או* הגשת-חתימה בפועל).

alter table public.lead_conversion_checklist
  add column if not exists public_token text,
  add column if not exists public_token_created_at timestamptz,
  add column if not exists public_link_last_opened_at timestamptz,
  add column if not exists payment_link text,
  add column if not exists payment_link_sent_at timestamptz,
  add column if not exists signature_image_path text,
  add column if not exists signature_typed_name text,
  add column if not exists signature_ip text;

create unique index if not exists lead_conversion_checklist_public_token_idx
  on public.lead_conversion_checklist(public_token)
  where public_token is not null;
