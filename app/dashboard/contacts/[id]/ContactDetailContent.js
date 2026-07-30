import { redirect, notFound } from 'next/navigation';
import { updateContactNotes } from '../actions';
import { toggleTask } from '../../tasks/actions';
import { loadContactCardData } from './loadContactCardData';
import ContactDetailClient from './ContactDetailClient';

// שולף את כל הנתונים בצד השרת (דרך loadContactCardData.js, משותף גם
// עם FloatingContactCard.js לחלון הצף) ומעביר ל-ContactDetailClient.
// isModal שולט רק בהבדלים קוסמטיים (קישור חזרה, ריווח חיצוני).
export default async function ContactDetailContent({ contactId, isModal }) {
  const data = await loadContactCardData(contactId);
  if (data.redirectToLogin) redirect('/login');
  if (data.notFound) notFound();

  return (
    <ContactDetailClient
      {...data.props}
      isModal={isModal}
      toggleTaskAction={toggleTask}
      updateNotesAction={updateContactNotes}
    />
  );
}
