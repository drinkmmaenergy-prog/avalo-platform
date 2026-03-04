import Link from 'next/link';

export default function NotFound() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <h1 style={{ fontSize: 48, fontWeight: 700, margin: 0 }}>404</h1>
      <p style={{ fontSize: 18, color: '#666', margin: 0 }}>
        This page could not be found.
      </p>
      <Link
        href="/"
        style={{
          marginTop: 8,
          color: '#7c3aed',
          textDecoration: 'underline',
          fontSize: 16,
        }}
      >
        Go back home
      </Link>
    </main>
  );
}

