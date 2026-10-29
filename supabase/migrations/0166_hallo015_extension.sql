-- חיוג-יזום (click-to-dial) - לכל נציג יש שלוחת-015 משלו (הקו שיצלצל
-- ראשון, לפני שמחברים אותו ללקוח). ממולא-ידנית ע"י owner/admin ב-
-- Settings → חברי הצוות, לפי רשימת "Telephone lines" בפאנל של 015
-- (פורמט ארוך, למשל "5668598446" - לא השלוחה הקצרה "211").
alter table public.profiles add column if not exists hallo015_extension text;
