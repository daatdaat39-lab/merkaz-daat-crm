const PRAISES = [
  '🎉 כל הכבוד!',
  '💪 קדימה, ממשיכים!',
  '✨ עבודה מצוינת!',
  '🔥 אש! תמשיך/י ככה',
  '👏 יופי של עבודה',
  '🚀 קדימה קדימה!',
];

export function randomPraise() {
  return PRAISES[Math.floor(Math.random() * PRAISES.length)];
}

// שולח אירוע חגיגה קטן - מוצג ע"י CelebrationHost שמותקן פעם אחת ב-layout.
// לא דורש prop drilling מכל מקום שבו קורה משהו טוב (סימון משימה, קידום שלב)
export function celebrate(message) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('crm:celebrate', { detail: { message: message || randomPraise() } }));
}
