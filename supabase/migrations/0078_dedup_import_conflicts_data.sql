-- ============================================================
-- ניקוי חד-פעמי (לא מיגרציית סכימה - אין כאן DDL, יש תקדים ב-
-- 0005_fix_dana_access.sql) של תור import_conflicts: 46,247 מתוך
-- 48,139 שורות ה-pending הן שכפול מדויק (אותו contact_id+field_key
-- +existing_value+new_value, created_at שונה בשבריר שנייה) שנוצר
-- כי כל שורת-תנועה בייבוא "מערכת עסקים" (20,521 שורות) הגישה מחדש
-- את אותם שדות סטטיים לכל תורם, ואף לא נבדק אם קונפליקט זהה כבר
-- ממתין. שורה כפולה לא נושאת מידע נוסף מעבר לניצולת ששורדת -
-- מחיקתה בטוחה. ר' גם 0079 (שדות פיננסיים) ותיקון השורש שנעשה
-- בקוד (leadIntakeCore.js - מונע הישנות בייבוא הבא).
--
-- הרץ ב-Supabase SQL Editor בסדר הזה: קודם שני ה-SELECT של "שלב 1"
-- ו"שלב 2" (וידוא שהמספרים תואמים לציפייה), ואז ה-DELETE (שלב 3),
-- ואז וידוא סופי (שלב 4).
-- ============================================================

-- שלב 1 (דרייראן) - כמה שורות יימחקו? צפוי: 46,247
with ranked as (
  select id,
         row_number() over (
           partition by contact_id, field_key, existing_value, new_value
           order by created_at desc, id desc
         ) as rn
  from import_conflicts
  where status = 'pending'
)
select count(*) as would_delete from ranked where rn > 1;

-- שלב 2 (דרייראן) - כמה pending יש כרגע סה"כ? צפוי: 48,139
select count(*) as total_pending_before from import_conflicts where status = 'pending';

-- שלב 3 - המחיקה בפועל. שומר את השורה עם created_at המאוחר ביותר
-- (שובר שוויון לפי id) בכל קבוצת שכפול - ר' הערה למעלה למה זה בטוח.
with ranked as (
  select id,
         row_number() over (
           partition by contact_id, field_key, existing_value, new_value
           order by created_at desc, id desc
         ) as rn
  from import_conflicts
  where status = 'pending'
)
delete from import_conflicts
where id in (select id from ranked where rn > 1);

-- שלב 4 (וידוא) - אמור להחזיר 5,466
select count(*) as total_pending_after from import_conflicts where status = 'pending';
