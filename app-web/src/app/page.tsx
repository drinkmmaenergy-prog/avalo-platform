import Link from 'next/link';

/**
 * Root landing page — Avalo marketing / coming-soon.
 * This is the main entry point for the web app.
 * Renders at / via App Router (src/app/page.tsx).
 */
export default function HomePage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        background: 'linear-gradient(135deg, #f5f3ff 0%, #ffffff 50%, #fdf2f8 100%)',
        padding: '40px 20px',
      }}
    >
      {/* Hero */}
      <div style={{ textAlign: 'center', maxWidth: 640, marginBottom: 48 }}>
        <h1
          style={{
            fontSize: 56,
            fontWeight: 800,
            margin: 0,
            background: 'linear-gradient(135deg, #7c3aed, #db2777)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            lineHeight: 1.1,
          }}
        >
          Avalo
        </h1>
        <p
          style={{
            fontSize: 20,
            color: '#6b7280',
            margin: '16px 0 0',
            lineHeight: 1.6,
          }}
        >
          Premium social &amp; creator economy platform.
          <br />
          Connect, create, earn — beyond boundaries.
        </p>
      </div>

      {/* CTA Buttons */}
      <nav
        style={{
          display: 'flex',
          gap: 16,
          flexWrap: 'wrap',
          justifyContent: 'center',
          marginBottom: 48,
        }}
      >
        <Link
          href="/auth/login"
          style={{
            padding: '14px 32px',
            backgroundColor: '#7c3aed',
            color: '#fff',
            borderRadius: 12,
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: 16,
            transition: 'background-color 0.2s',
          }}
        >
          Sign In
        </Link>
        <Link
          href="/auth/register"
          style={{
            padding: '14px 32px',
            backgroundColor: '#f3f4f6',
            color: '#111827',
            borderRadius: 12,
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: 16,
          }}
        >
          Create Account
        </Link>
      </nav>

      {/* Feature Highlights */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 24,
          maxWidth: 800,
          width: '100%',
        }}
      >
        {[
          { icon: '💰', title: 'Token Economy', desc: 'Buy, earn, and withdraw tokens seamlessly.' },
          { icon: '🎨', title: 'Creator Tools', desc: 'Analytics, payouts, and audience management.' },
          { icon: '🔒', title: 'Safety First', desc: 'AI-powered moderation and verified profiles.' },
          { icon: '🌍', title: 'Global Platform', desc: 'Multi-language, multi-currency support.' },
        ].map((feature) => (
          <div
            key={feature.title}
            style={{
              backgroundColor: '#ffffff',
              borderRadius: 16,
              padding: 24,
              textAlign: 'center',
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
              border: '1px solid #f3f4f6',
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 8 }}>{feature.icon}</div>
            <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 4px' }}>
              {feature.title}
            </h3>
            <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>{feature.desc}</p>
          </div>
        ))}
      </div>

      {/* Quick Links */}
      <nav
        style={{
          marginTop: 48,
          display: 'flex',
          gap: 24,
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}
      >
        {[
          { href: '/features', label: 'Features' },
          { href: '/creators', label: 'For Creators' },
          { href: '/investors', label: 'Investors' },
          { href: '/safety', label: 'Safety' },
          { href: '/download', label: 'Download App' },
        ].map((link) => (
          <Link
            key={link.href}
            href={link.href}
            style={{
              color: '#7c3aed',
              textDecoration: 'none',
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            {link.label}
          </Link>
        ))}
      </nav>

      {/* Footer */}
      <footer
        style={{
          marginTop: 64,
          color: '#9ca3af',
          fontSize: 13,
          textAlign: 'center',
        }}
      >
        © {new Date().getFullYear()} Avalo. All rights reserved.
      </footer>
    </main>
  );
}
