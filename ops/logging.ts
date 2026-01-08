/**
 * Avalo Operations - Logging Layer
 * Structured logging with PII redaction and correlation IDs
 */

import * as pino from 'pino';

// PII patterns to redact
const PII_PATTERNS = {
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  phone: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
  creditCard: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
  ipAddress: /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g,
  token: /\b[A-Za-z0-9_-]{20,}\b/g,
};

// Sensitive field names to redact
const SENSITIVE_FIELDS = [
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'apiKey',
  'secret',
  'creditCard',
  'cvv',
  'ssn',
  'pin',
  'privateKey',
];

export interface LogContext {
  requestId?: string;
  userId?: string;
  sessionId?: string;
  userAgent?: string;
  ip?: string;
  path?: string;
  method?: string;
  [key: string]: any;
}

export interface LogMetadata {
  timestamp: string;
  level: string;
  correlationId: string;
  service: string;
  environment: string;
  version: string;
  hostname: string;
}

export class Logger {
  private logger: pino.Logger;
  private context: LogContext;
  private redactionEnabled: boolean;

  constructor(options: {
    service: string;
    environment: string;
    version: string;
    context?: LogContext;
    redactionEnabled?: boolean;
    level?: pino.LevelWithSilent;
  }) {
    this.context = options.context || {};
    this.redactionEnabled = options.redactionEnabled !== false;

    this.logger = pino({
      name: options.service,
      level: options.level || 'info',
      base: {
        service: options.service,
        environment: options.environment,
        version: options.version,
        hostname: this.getHostname(),
      },
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: {
        level: (label) => ({ level: label }),
        bindings: (bindings) => ({
          pid: bindings.pid,
          hostname: bindings.hostname,
        }),
      },
      serializers: {
        req: this.requestSerializer.bind(this),
        res: this.responseSerializer.bind(this),
        err: pino.stdSerializers.err,
      },
    });
  }

  /**
   * Create child logger with additional context
   */
  child(context: LogContext): Logger {
    const childLogger = new Logger({
      service: this.logger.bindings().service as string,
      environment: this.logger.bindings().environment as string,
      version: this.logger.bindings().version as string,
      context: { ...this.context, ...context },
      redactionEnabled: this.redactionEnabled,
      level: this.logger.level as pino.LevelWithSilent,
    });

    return childLogger;
  }

  /**
   * Log debug message
   */
  debug(message: string, data?: Record<string, any>): void {
    this.log('debug', message, data);
  }

  /**
   * Log info message
   */
  info(message: string, data?: Record<string, any>): void {
    this.log('info', message, data);
  }

  /**
   * Log warning message
   */
  warn(message: string, data?: Record<string, any>): void {
    this.log('warn', message, data);
  }

  /**
   * Log error message
   */
  error(message: string, error?: Error | any, data?: Record<string, any>): void {
    const errorData = error instanceof Error ? { err: error } : { error };
    this.log('error', message, { ...errorData, ...data });
  }

  /**
   * Log fatal message
   */
  fatal(message: string, error?: Error | any, data?: Record<string, any>): void {
    const errorData = error instanceof Error ? { err: error } : { error };
    this.log('fatal', message, { ...errorData, ...data });
  }

  /**
   * Core logging method
   */
  private log(level: string, message: string, data?: Record<string, any>): void {
    const sanitizedData = this.redactionEnabled ? this.redactPII(data) : data;
    const enrichedData = {
      ...this.context,
      ...sanitizedData,
      correlationId: this.getCorrelationId(),
    };

    this.logger[level as keyof pino.Logger](enrichedData, message);
  }

  /**
   * Redact PII from data
   */
  private redactPII(data?: Record<string, any>): Record<string, any> | undefined {
    if (!data) return data;

    const redacted = { ...data };

    // Redact sensitive fields
    for (const field of SENSITIVE_FIELDS) {
      if (field in redacted) {
        redacted[field] = '[REDACTED]';
      }
    }

    // Redact PII patterns in string values
    for (const [key, value] of Object.entries(redacted)) {
      if (typeof value === 'string') {
        let sanitized = value;
        for (const pattern of Object.values(PII_PATTERNS)) {
          sanitized = sanitized.replace(pattern, '[REDACTED]');
        }
        redacted[key] = sanitized;
      } else if (typeof value === 'object' && value !== null) {
        redacted[key] = this.redactPII(value as Record<string, any>);
      }
    }

    return redacted;
  }

  /**
   * Get or generate correlation ID
   */
  private getCorrelationId(): string {
    return this.context.requestId || this.generateCorrelationId();
  }

  /**
   * Generate correlation ID
   */
  private generateCorrelationId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Get hostname
   */
  private getHostname(): string {
    if (typeof process !== 'undefined' && process.env.HOSTNAME) {
      return process.env.HOSTNAME;
    }
    if (typeof window !== 'undefined') {
      return window.location.hostname;
    }
    return 'unknown';
  }

  /**
   * Request serializer
   */
  private requestSerializer(req: any): any {
    return {
      id: req.id || this.context.requestId,
      method: req.method,
      url: req.url,
      headers: this.redactHeaders(req.headers),
      remoteAddress: req.remoteAddress,
      remotePort: req.remotePort,
    };
  }

  /**
   * Response serializer
   */
  private responseSerializer(res: any): any {
    return {
      statusCode: res.statusCode,
      headers: this.redactHeaders(res.headers),
    };
  }

  /**
   * Redact sensitive headers
   */
  private redactHeaders(headers?: Record<string, any>): Record<string, any> {
    if (!headers) return {};

    const sensitiveHeaders = [
      'authorization',
      'cookie',
      'x-api-key',
      'x-auth-token',
    ];

    const redacted = { ...headers };
    for (const header of sensitiveHeaders) {
      if (header in redacted) {
        redacted[header] = '[REDACTED]';
      }
    }

    return redacted;
  }

  /**
   * Export logs to BigQuery
   */
  async exportToBigQuery(logs: any[]): Promise<void> {
    // Implementation for BigQuery export
    // This would use @google-cloud/bigquery client
    console.log('Exporting logs to BigQuery:', logs.length);
  }

  /**
   * Export logs to Cloud Logging
   */
  async exportToCloudLogging(logs: any[]): Promise<void> {
    // Implementation for Cloud Logging export
    // This would use @google-cloud/logging client
    console.log('Exporting logs to Cloud Logging:', logs.length);
  }
}

/**
 * Request logging middleware
 */
export function requestLogger(logger: Logger) {
  return (req: any, res: any, next: any) => {
    const start = Date.now();
    const requestId = req.headers['x-request-id'] || logger['generateCorrelationId']();

    req.log = logger.child({
      requestId,
      method: req.method,
      path: req.path,
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });

    req.log.info('Request started');

    res.on('finish', () => {
      const duration = Date.now() - start;
      req.log.info('Request completed', {
        statusCode: res.statusCode,
        duration,
      });
    });

    next();
  };
}

/**
 * Error logging middleware
 */
export function errorLogger(logger: Logger) {
  return (err: Error, req: any, res: any, next: any) => {
    const requestLogger = req.log || logger;
    requestLogger.error('Request error', err, {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
    });
    next(err);
  };
}

/**
 * Async operation logger
 */
export async function logAsyncOperation<T>(
  logger: Logger,
  operationName: string,
  operation: () => Promise<T>,
  context?: Record<string, any>
): Promise<T> {
  const start = Date.now();
  logger.info(`${operationName} started`, context);

  try {
    const result = await operation();
    const duration = Date.now() - start;
    logger.info(`${operationName} completed`, { ...context, duration });
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    logger.error(`${operationName} failed`, error as Error, { ...context, duration });
    throw error;
  }
}

/**
 * Create default logger instance
 */
export function createLogger(options?: {
  service?: string;
  environment?: string;
  version?: string;
  level?: pino.LevelWithSilent;
}): Logger {
  return new Logger({
    service: options?.service || 'avalo',
    environment: options?.environment || process.env.NODE_ENV || 'development',
    version: options?.version || '1.0.0',
    level: options?.level,
  });
}

// Export default instance
export const defaultLogger = createLogger();