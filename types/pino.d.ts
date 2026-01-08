declare module 'pino' {
  export type LevelWithSilent = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';

  export interface LoggerOptions {
    level?: LevelWithSilent | string;
    name?: string;
    base?: Record<string, any> | null;
    serializers?: Record<string, any>;
    formatters?: {
      level?: (label: string, number: number) => object;
      bindings?: (bindings: Record<string, any>) => Record<string, any>;
      log?: (object: Record<string, any>) => Record<string, any>;
    };
    redact?: string[] | { paths: string[]; censor?: string; remove?: boolean };
    hooks?: {
      logMethod?: (args: any[], method: any, level: number) => void;
    };
    transport?: any;
    timestamp?: boolean | (() => string);
  }

  export interface Logger {
    fatal(obj: object, msg?: string, ...args: any[]): void;
    fatal(msg: string, ...args: any[]): void;
    error(obj: object, msg?: string, ...args: any[]): void;
    error(msg: string, ...args: any[]): void;
    warn(obj: object, msg?: string, ...args: any[]): void;
    warn(msg: string, ...args: any[]): void;
    info(obj: object, msg?: string, ...args: any[]): void;
    info(msg: string, ...args: any[]): void;
    debug(obj: object, msg?: string, ...args: any[]): void;
    debug(msg: string, ...args: any[]): void;
    trace(obj: object, msg?: string, ...args: any[]): void;
    trace(msg: string, ...args: any[]): void;
    child(bindings: Record<string, any>): Logger;
    bindings(): Record<string, any>;
    level: string;
  }

  export const stdTimeFunctions: {
    epochTime: () => string;
    unixTime: () => string;
    nullTime: () => string;
    isoTime: () => string;
  };

  export const stdSerializers: {
    err: (err: Error) => any;
    req: (req: any) => any;
    res: (res: any) => any;
  };

  interface PinoConstructor {
    (options?: LoggerOptions): Logger;
    (stream: any): Logger;
    (options: LoggerOptions, stream: any): Logger;
    stdTimeFunctions: typeof stdTimeFunctions;
    stdSerializers: typeof stdSerializers;
  }

  const pino: PinoConstructor;
  export default pino;
}

declare module 'pino-http' {
  import { Logger } from 'pino';

  interface HttpLoggerOptions {
    logger?: Logger;
    serializers?: Record<string, any>;
    customLogLevel?: (req: any, res: any, err?: Error) => string;
  }

  function pinoHttp(options?: HttpLoggerOptions): any;
  export default pinoHttp;
}


