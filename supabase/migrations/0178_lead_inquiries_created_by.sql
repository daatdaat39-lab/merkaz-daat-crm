-- תיעוד-נציג שכתב/שלח-הערה (lead_inquiries) - נבחר כ"הערה" הנכונה
-- לתעד-מחבר (contacts.notes היא עמודת-טקסט-חופשי בודדת, לא-מופיעה
-- בכלל במסך-הליד - lead_inquiries כבר מוצגת-בשני-המקומות). אותו-דפוס
-- בדיוק כמו service_case_notes.created_by (migration 0160). nullable -
-- נתיבי-קליטה-אוטומטיים (webhook/ייבוא/מייל) לא-כותבים-אליו, רק
-- פעולות-ידניות-של-נציג (logQuickActivity/logNewInquiry/updateLeadCourse).
alter table public.lead_inquiries
  add column if not exists created_by uuid references auth.users(id);
