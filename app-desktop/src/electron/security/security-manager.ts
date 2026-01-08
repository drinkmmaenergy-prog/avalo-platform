import { app, session, BrowserWindow } from 'electron';
import { createHash } from 'crypto';
import Store from 'electron-store';

interface SecurityConfig {
  allowedDomains: string[];
  trustedCertificates: string[];
  maxLoginAttempts: number;
  sessionTimeout: number;
}

interface SecurityEvent {
  type: 'blocked_request' | 'permission_denied' | 'csp_violation' | 'suspicious_activity';
  timestamp: number;
  details: any;
}

export class SecurityManager {
  private store: Store;
  private securityEvents: SecurityEvent[] = [];
  private loginAttempts: Map<string, number> = new Map();
  private config: SecurityConfig = {
    allowedDomains: [
      'avalo.com',
      'firebaseio.com',
      'googleapis.com',
      'google.com',
      'googleusercontent.com',
      'gstatic.com',
      'localhost'
    ],
    trustedCertificates: [],
    maxLoginAttempts: 5,
    sessionTimeout: 3600000
  };

  constructor() {
    this.store = new Store({
      name: 'avalo-security',
      encryptionKey: this.generateEncryptionKey()
    });
  }

  async initialize(): Promise<void> {
    this.setupCSPViolationHandler();
    this.setupCertificateValidation();
    this.setupSessionManagement();
    console.log('SecurityManager initialized');
  }

  private generateEncryptionKey(): string {
    const machineId = app.getName() + app.getVersion() + process.platform;
    return createHash('sha256').update(machineId).digest('hex');
  }

  private setupCSPViolationHandler(): void {
    app.on('web-contents-created', (event, contents) => {
      contents.on('console-message', (event, level, message, line, sourceId) => {
        if (message.includes('Content Security Policy')) {
          this.logSecurityEvent({
            type: 'csp_violation',
            timestamp: Date.now(),
            details: { message, line, sourceId }
          });
        }
      });
    });
  }

  private setupCertificateValidation(): void {
    app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
      event.preventDefault();
      
      const urlObj = new URL(url);
      const isAllowedDomain = this.config.allowedDomains.some(domain =>
        urlObj.hostname === domain || urlObj.hostname.endsWith(`.${domain}`)
      );

      if (!isAllowedDomain) {
        this.logSecurityEvent({
          type: 'blocked_request',
          timestamp: Date.now(),
          details: { url, error: 'Unauthorized domain' }
        });
        callback(false);
        return;
      }

      if (process.env.NODE_ENV === 'development' && urlObj.hostname === 'localhost') {
        callback(true);
        return;
      }

      const certificateFingerprint = this.getCertificateFingerprint(certificate);
      const isTrusted = this.config.trustedCertificates.includes(certificateFingerprint);

      if (isTrusted) {
        callback(true);
      } else {
        this.logSecurityEvent({
          type: 'blocked_request',
          timestamp: Date.now(),
          details: { url, error, certificate: certificateFingerprint }
        });
        callback(false);
      }
    });
  }

  private setupSessionManagement(): void {
    setInterval(() => {
      this.cleanupExpiredSessions();
    }, 60000);
  }

  private getCertificateFingerprint(certificate: Electron.Certificate): string {
    return createHash('sha256')
      .update(certificate.data.toString())
      .digest('hex');
  }

  private cleanupExpiredSessions(): void {
    const now = Date.now();
    const sessions = this.store.get('sessions', {}) as Record<string, any>;
    
    Object.keys(sessions).forEach(sessionId => {
      const session = sessions[sessionId];
      if (now - session.lastActivity > this.config.sessionTimeout) {
        delete sessions[sessionId];
      }
    });

    this.store.set('sessions', sessions);
  }

  logSecurityEvent(event: SecurityEvent): void {
    this.securityEvents.push(event);
    
    if (this.securityEvents.length > 100) {
      this.securityEvents = this.securityEvents.slice(-100);
    }

    this.store.set('recent_security_events', this.securityEvents);

    if (event.type === 'suspicious_activity') {
      console.warn('Security alert:', event);
    }
  }

  validateDomain(url: string): boolean {
    try {
      const urlObj = new URL(url);
      return this.config.allowedDomains.some(domain =>
        urlObj.hostname === domain || urlObj.hostname.endsWith(`.${domain}`)
      );
    } catch {
      return false;
    }
  }

  recordLoginAttempt(userId: string, success: boolean): boolean {
    const attempts = this.loginAttempts.get(userId) || 0;

    if (success) {
      this.loginAttempts.delete(userId);
      return true;
    }

    const newAttempts = attempts + 1;
    this.loginAttempts.set(userId, newAttempts);

    if (newAttempts >= this.config.maxLoginAttempts) {
      this.logSecurityEvent({
        type: 'suspicious_activity',
        timestamp: Date.now(),
        details: { userId, attempts: newAttempts, reason: 'Max login attempts exceeded' }
      });
      return false;
    }

    return true;
  }

  isUserLockedOut(userId: string): boolean {
    const attempts = this.loginAttempts.get(userId) || 0;
    return attempts >= this.config.maxLoginAttempts;
  }

  resetLoginAttempts(userId: string): void {
    this.loginAttempts.delete(userId);
  }

  getSecurityEvents(count: number = 10): SecurityEvent[] {
    return this.securityEvents.slice(-count);
  }

  clearSecurityEvents(): void {
    this.securityEvents = [];
    this.store.delete('recent_security_events');
  }

  enableStrictMode(): void {
    session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
      const headers = { ...details.requestHeaders };
      
      delete headers['Referer'];
      delete headers['Origin'];
      
      headers['X-Content-Type-Options'] = 'nosniff';
      headers['X-Frame-Options'] = 'DENY';
      headers['X-XSS-Protection'] = '1; mode=block';
      
      callback({ requestHeaders: headers });
    });
  }

  disableRemoteContent(): void {
    session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
      const url = new URL(details.url);
      
      if (details.resourceType === 'script' || details.resourceType === 'stylesheet') {
        if (!this.validateDomain(details.url)) {
          callback({ cancel: true });
          return;
        }
      }
      
      callback({ cancel: false });
    });
  }

  cleanup(): void {
    this.clearSecurityEvents();
    this.loginAttempts.clear();
  }
}