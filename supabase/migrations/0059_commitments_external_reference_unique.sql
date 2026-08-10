-- אינדקס ייחודי חלקי על commitments(workspace_id, external_reference) - רשת
-- ביטחון מפני יצירת שתי שורות commitments כפולות לאותה אסמכתא חיצונית
-- (לדוגמה שתי ריצות ייבוא חופפות), לתמיכה בייבוא אידמפוטנטי ממערכת עסקים
-- (ובעתיד גם קשר) - אותו רעיון בדיוק כמו האינדקס הייחודי הקיים על
-- donation_transactions.external_doc_number (מיגרציה 0031). חלקי (where
-- external_reference is not null) כי התחייבויות שהוזנו ידנית בלי אסמכתא
-- ימשיכו ללא הגבלה.
--
-- לפני ההרצה: לוודא שאין כבר כפילויות קיימות
--   select workspace_id, external_reference, count(*) from commitments
--   where external_reference is not null group by 1,2 having count(*) > 1;
create unique index if not exists commitments_workspace_external_ref_uniq
  on public.commitments (workspace_id, external_reference)
  where external_reference is not null;
