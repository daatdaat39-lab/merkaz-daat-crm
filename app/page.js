import { redirect } from 'next/navigation';

// אין תוכן משלו ל-"/" - מפנה תמיד ל-/dashboard, שכבר בודק בעצמו (וגם
// ה-middleware, ר' middleware.js) אם המשתמש מחובר ומפנה ל-/login אם לא.
export default function RootPage() {
  redirect('/dashboard');
}
