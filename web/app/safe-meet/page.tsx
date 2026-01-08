/**
 * Safe-Meet Information Page (Web)
 * Phase 25: Informational page about Safe-Meet feature
 */

import React from 'react';

export default function SafeMeetPage() {
  return (
    <div style={styles.container}>
      <div style={styles.content}>
        {/* Hero Section */}
        <div style={styles.hero}>
          <div style={styles.heroIcon}>🛡️</div>
          <h1 style={styles.title}>Safe-Meet</h1>
          <p style={styles.subtitle}>
            Bezpieczne spotkania z potwierdzeniem QR
          </p>
        </div>

        {/* What is Safe-Meet */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>What is Safe-Meet?</h2>
          <p style={styles.text}>
            Safe-Meet is a safety feature designed to protect you during offline meetings.
            Before or at the start of a meeting, you can create a Safe-Meet session and
            have your meeting partner scan a QR code to confirm their presence.
          </p>
          <p style={styles.text}>
            In case of emergency, you can trigger an SOS alert that will immediately
            notify your trusted contact.
          </p>
        </section>

        {/* How it Works */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>How QR Codes Work</h2>
          <div style={styles.steps}>
            <div style={styles.step}>
              <div style={styles.stepNumber}>1</div>
              <div style={styles.stepContent}>
                <h3 style={styles.stepTitle}>Set a Trusted Contact</h3>
                <p style={styles.stepText}>
                  Choose someone close to you who should be notified in case of emergency.
                  Enter their name, phone number, and email address.
                </p>
              </div>
            </div>

            <div style={styles.step}>
              <div style={styles.stepNumber}>2</div>
              <div style={styles.stepContent}>
                <h3 style={styles.stepTitle}>Create a Session</h3>
                <p style={styles.stepText}>
                  Before your meeting, create a Safe-Meet session. The app will generate
                  a unique QR code for that meeting.
                </p>
              </div>
            </div>

            <div style={styles.step}>
              <div style={styles.stepNumber}>3</div>
              <div style={styles.stepContent}>
                <h3 style={styles.stepTitle}>Scan to Confirm</h3>
                <p style={styles.stepText}>
                  Show the QR code to your meeting partner. They scan it with their Avalo
                  app to confirm the meeting and link both accounts.
                </p>
              </div>
            </div>

            <div style={styles.step}>
              <div style={styles.stepNumber}>4</div>
              <div style={styles.stepContent}>
                <h3 style={styles.stepTitle}>Stay Safe</h3>
                <p style={styles.stepText}>
                  During the meeting, you can use the SOS button or SOS PIN if you feel
                  unsafe. Your trusted contact will be notified immediately.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Why Set a Trusted Contact */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Why Add a Trusted Contact?</h2>
          <div style={styles.features}>
            <div style={styles.feature}>
              <div style={styles.featureIcon}>👤</div>
              <h3 style={styles.featureTitle}>Emergency Notification</h3>
              <p style={styles.featureText}>
                Your trusted contact receives immediate email notification if you trigger SOS
              </p>
            </div>

            <div style={styles.feature}>
              <div style={styles.featureIcon}>⚡</div>
              <h3 style={styles.featureTitle}>Fast Response</h3>
              <p style={styles.featureText}>
                They can take action quickly, including contacting authorities if needed
              </p>
            </div>

            <div style={styles.feature}>
              <div style={styles.featureIcon}>🔒</div>
              <h3 style={styles.featureTitle}>Private & Secure</h3>
              <p style={styles.featureText}>
                Your trusted contact information is encrypted and only used for emergencies
              </p>
            </div>
          </div>
        </section>

        {/* Safety Notice */}
        <section style={styles.noticeSection}>
          <div style={styles.notice}>
            <h3 style={styles.noticeTitle}>⚠️ Important Safety Information</h3>
            <p style={styles.noticeText}>
              In case of SOS, your trusted contact is notified and our safety team may
              prepare a report for authorities where supported. Safe-Meet is a safety tool,
              but it does not replace common sense and personal safety measures.
            </p>
            <p style={styles.noticeText}>
              <strong>Always:</strong> Meet in public places, tell someone where you're going,
              trust your instincts, and have an exit plan.
            </p>
          </div>
        </section>

        {/* CTA Section */}
        <section style={styles.ctaSection}>
          <h2 style={styles.ctaTitle}>Ready to Stay Safe?</h2>
          <p style={styles.ctaText}>
            Safe-Meet is available in the Avalo mobile app
          </p>
          <a href="avalo://safe-meet" style={styles.ctaButton}>
            Open Safe-Meet in App
          </a>
          <p style={styles.ctaHint}>
            (Requires Avalo app to be installed)
          </p>
        </section>

        {/* Footer */}
        <footer style={styles.footer}>
          <p style={styles.footerText}>
            © {new Date().getFullYear()} Avalo. All rights reserved.
          </p>
        </footer>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#F8F9FA',
  },
  content: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '40px 20px',
  },
  hero: {
    textAlign: 'center',
    padding: '60px 20px',
    backgroundColor: '#FFF',
    borderRadius: '16px',
    marginBottom: '40px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
  },
  heroIcon: {
    fontSize: '80px',
    marginBottom: '20px',
  },
  title: {
    fontSize: '48px',
    fontWeight: 'bold',
    color: '#212529',
    marginBottom: '16px',
  },
  subtitle: {
    fontSize: '20px',
    color: '#6C757D',
  },
  section: {
    backgroundColor: '#FFF',
    padding: '40px',
    borderRadius: '16px',
    marginBottom: '32px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
  },
  sectionTitle: {
    fontSize: '32px',
    fontWeight: 'bold',
    color: '#212529',
    marginBottom: '24px',
  },
  text: {
    fontSize: '18px',
    color: '#495057',
    lineHeight: '1.8',
    marginBottom: '16px',
  },
  steps: {
    display: 'flex',
    flexDirection: 'column',
    gap: '32px',
    marginTop: '32px',
  },
  step: {
    display: 'flex',
    gap: '24px',
    alignItems: 'flex-start',
  },
  stepNumber: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    backgroundColor: '#007AFF',
    color: '#FFF',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '24px',
    fontWeight: 'bold',
    flexShrink: 0,
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#212529',
    marginBottom: '8px',
  },
  stepText: {
    fontSize: '16px',
    color: '#6C757D',
    lineHeight: '1.6',
  },
  features: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '24px',
    marginTop: '32px',
  },
  feature: {
    padding: '24px',
    backgroundColor: '#F8F9FA',
    borderRadius: '12px',
    textAlign: 'center',
  },
  featureIcon: {
    fontSize: '48px',
    marginBottom: '16px',
  },
  featureTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#212529',
    marginBottom: '8px',
  },
  featureText: {
    fontSize: '14px',
    color: '#6C757D',
    lineHeight: '1.6',
  },
  noticeSection: {
    marginBottom: '32px',
  },
  notice: {
    backgroundColor: '#FFF3CD',
    padding: '32px',
    borderRadius: '16px',
    borderLeft: '6px solid #FFC107',
  },
  noticeTitle: {
    fontSize: '20px',
    fontWeight: 'bold',
    color: '#856404',
    marginBottom: '16px',
  },
  noticeText: {
    fontSize: '16px',
    color: '#856404',
    lineHeight: '1.6',
    marginBottom: '12px',
  },
  ctaSection: {
    textAlign: 'center',
    backgroundColor: '#007AFF',
    padding: '60px 40px',
    borderRadius: '16px',
    color: '#FFF',
    marginBottom: '40px',
  },
  ctaTitle: {
    fontSize: '36px',
    fontWeight: 'bold',
    marginBottom: '16px',
  },
  ctaText: {
    fontSize: '18px',
    marginBottom: '32px',
    opacity: 0.9,
  },
  ctaButton: {
    display: 'inline-block',
    padding: '16px 48px',
    backgroundColor: '#FFF',
    color: '#007AFF',
    fontSize: '18px',
    fontWeight: '600',
    borderRadius: '12px',
    textDecoration: 'none',
    transition: 'transform 0.2s',
    cursor: 'pointer',
  },
  ctaHint: {
    fontSize: '14px',
    marginTop: '16px',
    opacity: 0.8,
  },
  footer: {
    textAlign: 'center',
    padding: '32px 20px',
  },
  footerText: {
    fontSize: '14px',
    color: '#6C757D',
  },
};