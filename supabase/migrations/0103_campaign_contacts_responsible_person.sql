-- שדה-טקסט חופשי "מי לקח אחריות" - נפרד מ"נציג מטפל" (assigned_to, שיוך
-- רשמי מתוך רשימת המשתמשים במערכת) ומ-"הערה" (חופשי לגמרי, לא רק אחריות).
alter table public.campaign_contacts
  add column if not exists responsible_person text;
