-- נתוני-דמה זמניים לצורך סיור מקצה-לקצה במודול מכירות/שירות - שמות
-- מסומנים במפורש כ"דמה" כדי שיהיה ברור מה למחוק/לעדכן כשיגיעו הקורסים
-- האמיתיים של הרב יצחק ערד. כולל גם כמה שורות תוכן-עזר (playbook/kb)
-- כדי שהפאנלים במסכי-הליד/קריאה לא יהיו ריקים בסיור. אידמפוטנטי
-- (where not exists) כמו שאר המיגרציות בפרויקט - בטוח להריץ פעמיים.
insert into public.courses (name, code, price, sort_order)
select 'קורס דמה 1 - יסודות', 'DEMO1', 1200, 10
where not exists (select 1 from public.courses where code = 'DEMO1');

insert into public.courses (name, code, price, sort_order)
select 'קורס דמה 2 - מתקדמים', 'DEMO2', 1800, 20
where not exists (select 1 from public.courses where code = 'DEMO2');

insert into public.reference_content (kind, course_id, tag, title, body, sort_order)
select 'playbook', c.id, 'יקר לי', 'תגובה ל"יקר לי"',
  'דוגמת-דמה: "אני מבין לגמרי - בוא נראה ביחד מה הערך שהקורס נותן ולמה זה משתלם בטווח הארוך."', 10
from public.courses c
where c.code = 'DEMO1'
  and not exists (select 1 from public.reference_content where title = 'תגובה ל"יקר לי"');

insert into public.reference_content (kind, course_id, tag, title, body, sort_order)
select 'kb', c.id, 'בעיית-גישה', 'לא מצליח להתחבר לקורס',
  'דוגמת-דמה: לבדוק שהתלמיד קיבל קישור-גישה במייל, ולהציע איפוס-סיסמה אם צריך.', 10
from public.courses c
where c.code = 'DEMO1'
  and not exists (select 1 from public.reference_content where title = 'לא מצליח להתחבר לקורס');
