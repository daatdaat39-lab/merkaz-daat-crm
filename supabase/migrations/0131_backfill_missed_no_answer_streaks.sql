-- מילוי-לאחור חד-פעמי: 2 אנשי-קשר בקמפיין שהיסטוריית-השיחות המלאה שלהם
-- (מדומה באותה לוגיקת reset/increment בדיוק כמו log_campaign_call_attempt,
-- migration 0121) מגיעה לרצף של 3+ "לא ענה" - אבל 0121 עלתה אחרי
-- שהשיחות האלה כבר קרו, אז no_answer_streak שלהם נשאר 0 והם לא יצאו
-- מהתור אוטומטית כמו שהיו אמורים. שני המזהים אומתו ידנית מול יומן-
-- השיחות המלא לפני הכתיבה - לא שאילתה כללית.
update public.campaign_contacts
set no_answer_streak = 3, in_call_queue = false
where id in ('0b5de4c2-de33-408d-ba27-7abec433ba24', '0410892b-f1bd-4e7c-9d8f-e5e37d0599a5')
  and campaign_id = '4d985b67-8f2b-4c6b-b1f9-23850dc233c5';
