import ContactDetailContent from './ContactDetailContent';

export default async function ContactDetailPage({ params }) {
  return <ContactDetailContent contactId={params.id} isModal={false} />;
}
