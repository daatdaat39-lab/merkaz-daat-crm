'use client';

import { useMemo, useState } from 'react';
import MeetingRow from './MeetingRow';
import TaskRow from '../tasks/TaskRow';
import EventModal from './EventModal';

const WEEKDAY_LABELS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const MAX_CHIPS_PER_DAY = 3;

function pad(n) { return n.toString().padStart(2, '0'); }
function toDateStr(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function startOfWeek(d) { const r = new Date(d); r.setDate(r.getDate() - r.getDay()); return r; }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }

// יומן משולב פגישות+משימות - תצוגת חודש/שבוע/יום (ברירת מחדל: שבוע),
// עם ניווט קדימה/אחורה/היום, ולחיצה על תא ריק או "+ אירוע חדש" פותחת
// יצירה ישירה של פגישה או משימה (EventModal). בתצוגות שבוע/יום נעשה
// שימוש חוזר ב-MeetingRow/TaskRow הקיימים כדי לאפשר עריכה מלאה במקום.
export default function CalendarBoard({ meetings, tasks, contacts, members, currentUserId, addMeetingAction, addTaskAction, initialContactId = null, autoOpenToday = false }) {
  const [view, setView] = useState('week');
  const [anchor, setAnchor] = useState(() => new Date());
  const [modalDate, setModalDate] = useState(() => (autoOpenToday ? toDateStr(new Date()) : null));

  const todayStr = toDateStr(new Date());

  const eventsByDate = useMemo(() => {
    const map = new Map();
    for (const m of meetings) {
      if (!map.has(m.meeting_date)) map.set(m.meeting_date, []);
      map.get(m.meeting_date).push({ kind: 'meeting', time: m.meeting_time, id: m.id, raw: m });
    }
    for (const t of tasks) {
      if (!t.due_date) continue;
      if (!map.has(t.due_date)) map.set(t.due_date, []);
      map.get(t.due_date).push({ kind: 'task', time: t.due_time, id: t.id, raw: t });
    }
    for (const list of map.values()) list.sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
    return map;
  }, [meetings, tasks]);

  const undatedTasks = useMemo(() => tasks.filter((t) => !t.due_date && !t.done), [tasks]);

  function goPrev() {
    if (view === 'month') setAnchor((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
    else if (view === 'week') setAnchor((d) => addDays(d, -7));
    else setAnchor((d) => addDays(d, -1));
  }
  function goNext() {
    if (view === 'month') setAnchor((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
    else if (view === 'week') setAnchor((d) => addDays(d, 7));
    else setAnchor((d) => addDays(d, 1));
  }
  function goToday() { setAnchor(new Date()); }

  function openDay(dateStr) {
    setAnchor(new Date(dateStr));
    setView('day');
  }

  const headerLabel = useMemo(() => {
    if (view === 'month') return anchor.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
    if (view === 'day') return anchor.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const start = startOfWeek(anchor);
    const end = addDays(start, 6);
    return `${start.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  }, [view, anchor]);

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 18 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={goPrev} style={navBtnStyle()}>›</button>
          <button onClick={goToday} style={{ ...navBtnStyle(), width: 'auto', padding: '0 12px' }}>היום</button>
          <button onClick={goNext} style={navBtnStyle()}>‹</button>
        </div>
        <div style={{ fontSize: 15, fontWeight: 600 }}>{headerLabel}</div>

        <div style={{ display: 'flex', gap: 4, marginInlineStart: 'auto' }}>
          {[{ id: 'month', label: 'חודש' }, { id: 'week', label: 'שבוע' }, { id: 'day', label: 'יום' }].map((v) => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              style={{
                padding: '6px 14px', borderRadius: 6, fontSize: 12.5, cursor: 'pointer',
                border: view === v.id ? '1px solid #0a0a0a' : '1px solid #e5e5e5',
                background: view === v.id ? '#0a0a0a' : '#fff', color: view === v.id ? '#fff' : '#333',
              }}
            >
              {v.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => setModalDate(toDateStr(anchor))}
          style={{ background: '#0a0a0a', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 14px', fontSize: 12.5, cursor: 'pointer' }}
        >
          + אירוע חדש
        </button>
      </div>

      {view === 'month' && (
        <MonthGrid anchor={anchor} eventsByDate={eventsByDate} todayStr={todayStr} onDayClick={setModalDate} onEventClick={openDay} />
      )}
      {view === 'week' && (
        <WeekGrid anchor={anchor} eventsByDate={eventsByDate} todayStr={todayStr} onDayClick={setModalDate} onEventClick={openDay} />
      )}
      {view === 'day' && (
        <DayList
          anchor={anchor} eventsByDate={eventsByDate}
          contacts={contacts} members={members} currentUserId={currentUserId}
          onAdd={() => setModalDate(toDateStr(anchor))}
        />
      )}

      {undatedTasks.length > 0 && (
        <details style={{ marginTop: 24 }}>
          <summary style={{ fontSize: 12, color: '#9b9b9b', cursor: 'pointer' }}>משימות ללא תאריך יעד ({undatedTasks.length})</summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
            {undatedTasks.map((t) => <TaskRow key={t.id} t={t} contacts={contacts} members={members} currentUserId={currentUserId} />)}
          </div>
        </details>
      )}

      {modalDate && (
        <EventModal
          date={modalDate}
          contactId={initialContactId}
          contacts={contacts}
          members={members}
          currentUserId={currentUserId}
          addMeetingAction={addMeetingAction}
          addTaskAction={addTaskAction}
          onClose={() => setModalDate(null)}
        />
      )}
    </div>
  );
}

function navBtnStyle() {
  return { width: 32, height: 32, borderRadius: 6, border: '1px solid #e5e5e5', background: 'var(--bg)', cursor: 'pointer', fontSize: 14 };
}

function EventChip({ ev }) {
  const isMeeting = ev.kind === 'meeting';
  const label = isMeeting
    ? `${ev.raw.meeting_time?.slice(0, 5) || ''} ${ev.raw.contacts?.first || ''} ${ev.raw.contacts?.last || ''}`.trim()
    : `${ev.raw.due_time ? ev.raw.due_time.slice(0, 5) + ' ' : ''}${ev.raw.title}`;
  return (
    <div style={{
      fontSize: 10.5, padding: '2px 6px', borderRadius: 4, marginBottom: 2, overflow: 'hidden',
      whiteSpace: 'nowrap', textOverflow: 'ellipsis',
      background: isMeeting ? '#eff6ff' : '#f5f3ff', color: isMeeting ? '#2563eb' : '#7c3aed',
      textDecoration: ev.kind === 'task' && ev.raw.done ? 'line-through' : 'none',
    }}>
      {isMeeting ? '📅 ' : '✅ '}{label}
    </div>
  );
}

function MonthGrid({ anchor, eventsByDate, todayStr, onDayClick, onEventClick }) {
  const firstOfMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const gridStart = startOfWeek(firstOfMonth);
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const currentMonth = anchor.getMonth();

  return (
    <div style={{ border: '1px solid #e5e5e5', borderRadius: 8, overflow: 'hidden', background: 'var(--bg)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: 'var(--bg-secondary, #f5f5f5)' }}>
        {WEEKDAY_LABELS.map((d) => (
          <div key={d} style={{ padding: '8px 10px', fontSize: 11, fontWeight: 600, color: '#9b9b9b', textAlign: 'center' }}>{d}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {days.map((day) => {
          const dateStr = toDateStr(day);
          const events = eventsByDate.get(dateStr) || [];
          const isToday = dateStr === todayStr;
          const inMonth = day.getMonth() === currentMonth;
          const visible = events.slice(0, MAX_CHIPS_PER_DAY);
          const hidden = events.length - visible.length;
          return (
            <div
              key={dateStr}
              onClick={() => onDayClick(dateStr)}
              style={{
                minHeight: 92, borderTop: '1px solid #f0f0f0', borderInlineStart: '1px solid #f0f0f0',
                padding: 6, cursor: 'pointer', opacity: inMonth ? 1 : 0.4,
              }}
            >
              <div style={{
                fontSize: 11.5, fontWeight: isToday ? 700 : 400, marginBottom: 4,
                color: isToday ? '#fff' : '#333',
                background: isToday ? '#0a0a0a' : 'transparent',
                display: 'inline-flex', width: 20, height: 20, alignItems: 'center', justifyContent: 'center', borderRadius: '50%',
              }}>
                {day.getDate()}
              </div>
              {visible.map((ev) => (
                <div key={`${ev.kind}-${ev.id}`} onClick={(e) => { e.stopPropagation(); onEventClick(dateStr); }}>
                  <EventChip ev={ev} />
                </div>
              ))}
              {hidden > 0 && (
                <div style={{ fontSize: 10, color: '#9b9b9b' }}>+{hidden} עוד</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekGrid({ anchor, eventsByDate, todayStr, onDayClick, onEventClick }) {
  const start = startOfWeek(anchor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
      {days.map((day) => {
        const dateStr = toDateStr(day);
        const events = eventsByDate.get(dateStr) || [];
        const isToday = dateStr === todayStr;
        return (
          <div key={dateStr} style={{ border: '1px solid #e5e5e5', borderRadius: 8, background: 'var(--bg)', minHeight: 220, display: 'flex', flexDirection: 'column' }}>
            <div
              onClick={() => onDayClick(dateStr)}
              style={{
                padding: '8px 10px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', textAlign: 'center',
                color: isToday ? '#fff' : '#6b6b6b', background: isToday ? '#0a0a0a' : 'var(--bg-secondary, #f5f5f5)',
                borderRadius: '8px 8px 0 0',
              }}
            >
              {day.toLocaleDateString('he-IL', { weekday: 'short' })} {day.getDate()}
            </div>
            <div style={{ padding: 6, flex: 1 }}>
              {events.map((ev) => (
                <div key={`${ev.kind}-${ev.id}`} onClick={() => onEventClick(dateStr)}>
                  <EventChip ev={ev} />
                </div>
              ))}
              {events.length === 0 && (
                <div onClick={() => onDayClick(dateStr)} style={{ height: '100%', minHeight: 60, cursor: 'pointer' }} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DayList({ anchor, eventsByDate, contacts, members, currentUserId, onAdd }) {
  const dateStr = toDateStr(anchor);
  const events = eventsByDate.get(dateStr) || [];

  return (
    <div>
      <button
        onClick={onAdd}
        style={{ marginBottom: 14, background: 'var(--bg)', border: '1px dashed #d0d0d0', borderRadius: 6, padding: '7px 14px', fontSize: 12.5, color: '#666', cursor: 'pointer' }}
      >
        + הוספת אירוע ליום זה
      </button>
      {events.length === 0 && <div style={{ fontSize: 13, color: '#9b9b9b' }}>אין אירועים ביום זה</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {events.map((ev) => (
          ev.kind === 'meeting'
            ? <MeetingRow key={`m-${ev.id}`} m={ev.raw} members={members} currentUserId={currentUserId} />
            : <TaskRow key={`t-${ev.id}`} t={ev.raw} contacts={contacts} members={members} currentUserId={currentUserId} />
        ))}
      </div>
    </div>
  );
}
