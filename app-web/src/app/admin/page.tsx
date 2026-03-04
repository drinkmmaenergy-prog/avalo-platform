import Link from 'next/link';

/**
 * Admin hub page — placeholder for parity with mobile app.
 * No business logic. Links to existing admin sub-routes.
 */
export default function AdminPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
        fontFamily: 'system-ui, sans-serif',
        padding: 40,
      }}
    >
      <h1 style={{ fontSize: 32, fontWeight: 700, margin: 0 }}>Admin Panel</h1>
      <p style={{ fontSize: 16, color: '#666', margin: 0, textAlign: 'center' }}>
        Platform administration and moderation tools.
      </p>
      <nav style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
        <Link
          href="/admin/moderation"
          style={{
            padding: '12px 24px',
            backgroundColor: '#7c3aed',
            color: '#fff',
            borderRadius: 8,
            textDecoration: 'none',
            fontWeight: 600,
          }}
        >
          Moderation
        </Link>
        <Link
          href="/admin/ops"
          style={{
            padding: '12px 24px',
            backgroundColor: '#f3f4f6',
            color: '#111',
            borderRadius: 8,
            textDecoration: 'none',
            fontWeight: 600,
          }}
        >
          Operations
        </Link>
      </nav>
    </main>
  );
}

