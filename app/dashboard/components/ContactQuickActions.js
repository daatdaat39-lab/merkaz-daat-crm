'use client';

import { useState } from 'react';
import EmailComposeModal from '../contacts/[id]/EmailComposeModal';
import WhatsAppSendModal from '../contacts/[id]/WhatsAppSendModal';
import NotConnectedButton from './NotConnectedButton';

const iconBtnStyle = {
  width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
  border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', cursor: 'pointer', fontSize: 14,
};

// כפתורי פעולה מהירה (חיוג/וואטסאפ/מייל) לשימוש בכל טבלת אנשי קשר/לידים
// במערכת - לא רק בכרטיס עצמו. משתמש באותם חלונות שליחה בדיוק.
// departments: [{ workspaceId, workspaceName }] של המחלקות ששייך אליהן האיש קשר
// sendConnections: [{ workspace_id, email_address }] - כל תיבות השליחה המחוברות במערכת
export default function ContactQuickActions({ contact, departments = [], sendConnections = [], whatsappTemplates = [], emailTemplates = [] }) {
  const [modal, setModal] = useState(null);

  const emailConnection = departments
    .map((d) => sendConnections.find((c) => c.workspace_id === d.workspaceId))
    .find(Boolean);
  const emailDept = emailConnection ? departments.find((d) => d.workspaceId === emailConnection.workspace_id) : null;
  const whatsappDept = departments[0] || null;

  const canEmail = !!emailDept && !!contact.email && !contact.frozen;
  const canWhatsapp = !!whatsappDept && !!contact.phone && !contact.frozen;

  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <NotConnectedButton icon="📞" label="חיוג" variant="icon" message="חיוג מתוך המערכת — עדיין לא מחובר" />

      {canWhatsapp ? (
        <button onClick={() => setModal('whatsapp')} title="וואטסאפ" style={iconBtnStyle}>💬</button>
      ) : (
        <NotConnectedButton
          icon="💬" label="וואטסאפ" variant="icon"
          message={!contact.phone ? 'לאיש הקשר אין טלפון שמור' : !whatsappDept ? 'איש הקשר לא משויך למחלקה' : 'איש הקשר מוקפא'}
        />
      )}

      {canEmail ? (
        <button onClick={() => setModal('email')} title="מייל" style={iconBtnStyle}>✉️</button>
      ) : (
        <NotConnectedButton
          icon="✉️" label="מייל" variant="icon"
          message={!contact.email ? 'לאיש הקשר אין מייל שמור' : !emailDept ? 'אין תיבת שליחה מחוברת למחלקות של איש הקשר' : 'איש הקשר מוקפא'}
        />
      )}

      {modal === 'email' && emailDept && (
        <EmailComposeModal
          contactId={contact.id} workspaceId={emailDept.workspaceId}
          fromAddress={emailConnection.email_address} toAddress={contact.email}
          firstName={contact.first} templates={emailTemplates}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'whatsapp' && whatsappDept && (
        <WhatsAppSendModal
          contactId={contact.id} workspaceId={whatsappDept.workspaceId}
          phone={contact.phone} reason={contact.latestReason} thread={[]} templates={whatsappTemplates}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
