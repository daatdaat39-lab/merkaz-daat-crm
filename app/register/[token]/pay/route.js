import { createAdminClient } from '../../../../lib/supabase/admin';
import { loadChecklistByToken, paymentRedirectResponse } from '../../../dashboard/lib/registrationLinks';

export const dynamic = 'force-dynamic';

// כפתור "מעבר לתשלום מאובטח" בסוף עמוד הרישום של הלקוח: אותה הפניה כמו הקישור
// הקצר /p/<קוד>, אבל לפי הטוקן של העמוד שבו הלקוח נמצא.
export async function GET(request, { params }) {
  const admin = createAdminClient();
  const row = await loadChecklistByToken(admin, params.token);
  return paymentRedirectResponse(request, admin, row);
}
