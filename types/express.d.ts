import { Request as ExpressRequest } from 'express';

declare global {
  namespace Express {
    interface Request {
      ip?: string;
      body?: any;
      headers: Record<string, string | string[] | undefined>;
      path?: string;
      method?: string;
    }
  }
}

declare module 'express' {
  export interface Request {
    ip?: string;
    body?: any;
    headers: Record<string, string | string[] | undefined>;
    path?: string;
    method?: string;
  }
}

declare module 'body-parser';
declare module 'cors';


