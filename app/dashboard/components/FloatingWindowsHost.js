'use client';

import { useRef } from 'react';
import { useFloatingWindows } from './FloatingWindows';
import FloatingContactCard from '../contacts/[id]/FloatingContactCard';
import FloatingChat from '../chat/FloatingChat';

const KIND_COMPONENTS = {
  contact: FloatingContactCard,
  chat: FloatingChat,
};

// מרנדר בפועל את כל החלונות הצפים הפתוחים + "מגש" קטן למטה עם החלונות
// הממוזערים. מותקן פעם אחת ב-layout, מעל כל שאר האתר (position: fixed).
export default function FloatingWindowsHost() {
  const { windows, closeWindow, minimizeWindow, restoreWindow, focusWindow, moveWindow } = useFloatingWindows();

  const visible = windows.filter((w) => !w.minimized);
  const minimized = windows.filter((w) => w.minimized);

  return (
    <>
      {visible.map((w) => {
        const Content = KIND_COMPONENTS[w.kind];
        return (
          <FloatingWindowFrame
            key={w.id}
            win={w}
            onClose={() => closeWindow(w.id)}
            onMinimize={() => minimizeWindow(w.id)}
            onFocus={() => focusWindow(w.id)}
            onMove={(x, y) => moveWindow(w.id, x, y)}
          >
            {Content ? <Content {...w.props} /> : null}
          </FloatingWindowFrame>
        );
      })}

      {minimized.length > 0 && (
        <div style={{
          position: 'fixed', bottom: 16, insetInlineStart: 16, display: 'flex', gap: 8,
          zIndex: 998, flexWrap: 'wrap', maxWidth: 'calc(100vw - 32px)',
        }}>
          {minimized.map((w) => (
            <button
              key={w.id}
              onClick={() => restoreWindow(w.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, background: '#0a0a0a', color: '#fff',
                border: 'none', borderRadius: 999, padding: '9px 16px', fontSize: 12.5, cursor: 'pointer',
                boxShadow: '0 8px 24px rgba(0,0,0,0.25)', maxWidth: 220,
              }}
              title={w.title}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.title}</span>
              <span
                onClick={(e) => { e.stopPropagation(); closeWindow(w.id); }}
                style={{ opacity: 0.7, fontSize: 11 }}
              >✕</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function FloatingWindowFrame({ win, onClose, onMinimize, onFocus, onMove, children }) {
  const dragState = useRef(null);

  function handleDragStart(e) {
    onFocus();
    dragState.current = { startX: e.clientX, startY: e.clientY, origX: win.x, origY: win.y };

    function onMouseMove(ev) {
      if (!dragState.current) return;
      const dx = ev.clientX - dragState.current.startX;
      const dy = ev.clientY - dragState.current.startY;
      onMove(dragState.current.origX + dx, dragState.current.origY + dy);
    }
    function onMouseUp() {
      dragState.current = null;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    }
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  return (
    <div
      onMouseDownCapture={onFocus}
      style={{
        position: 'fixed', top: win.y, left: win.x, width: 640, maxWidth: '92vw', maxHeight: '82vh',
        background: 'var(--bg, #fff)', border: '1px solid #d0d0d0', borderRadius: 10,
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)', zIndex: win.z, display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        onMouseDown={handleDragStart}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', background: '#f2f2f2',
          borderBottom: '1px solid #e5e5e5', cursor: 'move', userSelect: 'none', flexShrink: 0,
        }}
      >
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {win.title}
        </span>
        <button onClick={onMinimize} title="מזעור" style={frameBtnStyle()}>—</button>
        <button onClick={onClose} title="סגירה" style={frameBtnStyle()}>✕</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>
        {children}
      </div>
    </div>
  );
}

function frameBtnStyle() {
  return {
    width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#fff', border: '1px solid #e5e5e5', borderRadius: 5, cursor: 'pointer', fontSize: 12, lineHeight: 1,
  };
}
