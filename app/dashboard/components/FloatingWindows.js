'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';

const FloatingWindowsContext = createContext(null);

// הוק לפתיחה/סגירה/מזעור של חלונות צפים מכל מקום באפליקציה - ר'
// FloatingWindowsHost.js לרינדור בפועל, ו-dashboard/layout.js להתקנה.
export function useFloatingWindows() {
  const ctx = useContext(FloatingWindowsContext);
  if (!ctx) throw new Error('useFloatingWindows must be used within FloatingWindowsProvider');
  return ctx;
}

// מנהל חלונות צפים גלובלי - כל חלון הוא { id, kind, title, props, minimized, x, y, z }.
// id ייחודי (לדוגמה contact-<contactId>) כדי שפתיחה חוזרת של אותו איש קשר
// תתמקד בחלון הקיים במקום לפתוח כפילות - זה מה שמאפשר "לפתוח 2 אנשי קשר
// יחד" (כל אחד עם id שונה) בלי לאפשר אותו איש קשר פעמיים בטעות.
export function FloatingWindowsProvider({ children }) {
  const [windows, setWindows] = useState([]);
  const zCounter = useRef(1000);

  const openWindow = useCallback((win) => {
    setWindows((prev) => {
      const existing = prev.find((w) => w.id === win.id);
      zCounter.current += 1;
      if (existing) {
        return prev.map((w) => (w.id === win.id ? { ...w, minimized: false, z: zCounter.current } : w));
      }
      const offset = (prev.length % 6) * 30;
      return [
        ...prev,
        {
          id: win.id,
          kind: win.kind,
          title: win.title,
          props: win.props || {},
          minimized: false,
          x: 100 + offset,
          y: 70 + offset,
          z: zCounter.current,
        },
      ];
    });
  }, []);

  const closeWindow = useCallback((id) => {
    setWindows((prev) => prev.filter((w) => w.id !== id));
  }, []);

  const minimizeWindow = useCallback((id) => {
    setWindows((prev) => prev.map((w) => (w.id === id ? { ...w, minimized: true } : w)));
  }, []);

  const restoreWindow = useCallback((id) => {
    zCounter.current += 1;
    const z = zCounter.current;
    setWindows((prev) => prev.map((w) => (w.id === id ? { ...w, minimized: false, z } : w)));
  }, []);

  const focusWindow = useCallback((id) => {
    zCounter.current += 1;
    const z = zCounter.current;
    setWindows((prev) => prev.map((w) => (w.id === id ? { ...w, z } : w)));
  }, []);

  const moveWindow = useCallback((id, x, y) => {
    setWindows((prev) => prev.map((w) => (w.id === id ? { ...w, x, y } : w)));
  }, []);

  return (
    <FloatingWindowsContext.Provider
      value={{ windows, openWindow, closeWindow, minimizeWindow, restoreWindow, focusWindow, moveWindow }}
    >
      {children}
    </FloatingWindowsContext.Provider>
  );
}
