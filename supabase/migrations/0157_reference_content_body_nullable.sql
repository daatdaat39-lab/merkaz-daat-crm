-- תיקון באג אמיתי שנתפס באימות-חי: reference_content.body הוא
-- not null מאז migration 0149 (תסריטים/מאגר-ידע תמיד השתמשו בו), אבל
-- kind='rule' (migration 0156) משתמש ב-trigger_condition/suggested_action
-- במקום body - יצירת כלל-AI הייתה נכשלת עם "null value in column body
-- violates not-null constraint". body נשאר חובה לשני ה-kind הישנים
-- ברמת-האפליקציה (ר' addReferenceContent), רק לא ב-DB יותר.
alter table public.reference_content alter column body drop not null;
