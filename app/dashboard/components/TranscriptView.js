// תצוגת תמלול שיחה. תמלולים חדשים בנויים משורות "נציג: ..." / "לקוח: ..." (תמלול לפי
// דוברים) - כאן מובחנת התווית בצבע ובמשקל. תמלול ישן (טקסט רציף אחד) מוצג כמו שהיה.
// בלי hooks - אפשר להשתמש גם בקומפוננטות שרת.
const LABEL_RE = /^(נציג|לקוח): (.*)$/;

export default function TranscriptView({ text, style }) {
  const value = String(text || '');
  const lines = value.split('\n');
  if (!lines.some((l) => LABEL_RE.test(l))) {
    return <div style={{ whiteSpace: 'pre-wrap', ...style }}>{value}</div>;
  }
  return (
    <div style={style}>
      {lines.map((line, i) => {
        const m = line.match(LABEL_RE);
        if (!m) return <div key={i}>{line}</div>;
        const isAgent = m[1] === 'נציג';
        return (
          <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 3, lineHeight: 1.55 }}>
            <span style={{ fontWeight: 700, flexShrink: 0, color: isAgent ? 'var(--k-accent, var(--accent))' : 'var(--k-text, var(--text))' }}>{m[1]}:</span>
            <span>{m[2]}</span>
          </div>
        );
      })}
    </div>
  );
}
