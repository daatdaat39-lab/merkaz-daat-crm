-- שדה-אישי חדש למילוי-מהיר במסך-הטיפול (עיצוב-מחדש של לידים/שירות) -
-- "ת.ז" ו"תאריך-לידה"/"עיר" כבר קיימים (idnum/birth_date/city, ר'
-- app/dashboard/lib/contactFieldsList.js) - רק "מקצוע" חסר בפועל.
alter table public.contacts
  add column if not exists occupation text;

-- קאשינג לסיכום-AI של ציר-הזמן המלא (נפרד מ-ai_action_summary הקיים).
-- מתיישן לא ע"י טריגר (ציר-הזמן מורכב מ-7 טבלאות שונות) אלא ע"י השוואת
-- מספר-הפריטים הכולל שנטען בכל פעם (item_count) למספר שהיה שמור - שינוי
-- במספר = נוסף פריט חדש לציר-הזמן = יש לרענן את הסיכום.
alter table public.contact_departments
  add column if not exists ai_timeline_summary text,
  add column if not exists ai_timeline_summary_item_count int;

alter table public.service_cases
  add column if not exists ai_timeline_summary text,
  add column if not exists ai_timeline_summary_item_count int;
