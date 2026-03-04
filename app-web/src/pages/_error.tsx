/**
 * Custom Pages Router _error page.
 *
 * Next.js 14 still pre-renders /404 and /500 via the Pages Router pipeline,
 * even when the project uses the App Router exclusively.  The auto-generated
 * _error.js can crash during SSR if it encounters client-only context
 * providers.  This minimal page avoids that by rendering plain HTML without
 * any React context dependencies.
 */

import type { NextPageContext } from 'next';

interface ErrorProps {
  statusCode: number | undefined;
}

function ErrorPage({ statusCode }: ErrorProps) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        gap: 12,
      }}
    >
      <h1 style={{ fontSize: 48, fontWeight: 700, margin: 0 }}>
        {statusCode ?? 'Error'}
      </h1>
      <p style={{ fontSize: 18, color: '#666', margin: 0 }}>
        {statusCode === 404
          ? 'This page could not be found.'
          : 'An unexpected error occurred.'}
      </p>
      <a
        href="/"
        style={{
          marginTop: 8,
          color: '#7c3aed',
          textDecoration: 'underline',
          fontSize: 16,
        }}
      >
        Go back home
      </a>
    </div>
  );
}

ErrorPage.getInitialProps = ({ res, err }: NextPageContext) => {
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404;
  return { statusCode };
};

export default ErrorPage;

