export default function ComingSoon({ title }) {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#9b9b9b',
        textAlign: 'center',
        padding: 40,
      }}
    >
      <div style={{ fontSize: 40, marginBottom: 12 }}>🏗️</div>
      <div style={{ fontSize: 15, fontWeight: 500, color: '#0a0a0a' }}>{title}</div>
      <div style={{ fontSize: 13, marginTop: 4 }}>המסך הזה בבנייה — בקרוב</div>
    </div>
  );
}
