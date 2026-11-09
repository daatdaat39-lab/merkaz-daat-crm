-- 0188 - שיוך תבניות למחלקה ולשלב בתהליך (אדיטיבי בלבד, בטוח להרצה חוזרת)
--
-- מטרה: שהנציג יראה בחלון השליחה רק כמה תבניות מומלצות לשלב שבו הליד נמצא
-- (עד 4 לכל ערוץ), ואת כל השאר מקובצות לפי קטגוריה - ולא רשימה ארוכה אחת.
--
--   workspace_id  - מחלקה. ריק = מתאים לכל המחלקות
--   stage_key     - שלב בתהליך (stage_key מ-pipeline_stages). ריק = מתאים לכל השלבים
--   category      - קטגוריה חופשית לקיבוץ ("פתיחה", "מעקב", "תשלום", "מידע"...)
--   is_active     - הסתרה בלי מחיקה
--   course_id     - (מיילים בלבד; בוואטסאפ העמודה כבר קיימת ממיגרציה 0151)
--
-- כל התבניות הקיימות נשארות ריקות בעמודות החדשות = ממשיכות להופיע בכל מקום
-- בדיוק כמו היום. המנהל משייך אותן בהגדרות לפי הצורך.

alter table public.whatsapp_templates
  add column if not exists workspace_id uuid references public.workspaces(id) on delete set null,
  add column if not exists stage_key text,
  add column if not exists category text,
  add column if not exists is_active boolean not null default true;

alter table public.email_templates
  add column if not exists workspace_id uuid references public.workspaces(id) on delete set null,
  add column if not exists stage_key text,
  add column if not exists category text,
  add column if not exists course_id uuid references public.courses(id) on delete set null,
  add column if not exists is_active boolean not null default true;

create index if not exists whatsapp_templates_targeting_idx
  on public.whatsapp_templates (workspace_id, stage_key);
create index if not exists email_templates_targeting_idx
  on public.email_templates (workspace_id, stage_key);

-- ביטול (rollback), אם צריך:
--   alter table public.whatsapp_templates drop column if exists workspace_id, drop column if exists stage_key, drop column if exists category, drop column if exists is_active;
--   alter table public.email_templates drop column if exists workspace_id, drop column if exists stage_key, drop column if exists category, drop column if exists course_id, drop column if exists is_active;
