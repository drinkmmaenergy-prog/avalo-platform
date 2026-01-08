declare module 'dotenv' {
  export interface DotenvConfigOptions {
    path?: string;
    encoding?: string;
    debug?: boolean;
    override?: boolean;
  }

  export interface DotenvConfigOutput {
    parsed?: { [key: string]: string };
    error?: Error;
  }

  export function config(options?: DotenvConfigOptions): DotenvConfigOutput;
  export function parse(src: string | Buffer): { [key: string]: string };
}

declare module 'cli-progress' {
  export interface Options {
    format?: string;
    fps?: number;
    stream?: NodeJS.WriteStream;
    stopOnComplete?: boolean;
    clearOnComplete?: boolean;
    barsize?: number;
    position?: string;
    barCompleteChar?: string;
    barIncompleteChar?: string;
    hideCursor?: boolean;
    linewrap?: boolean;
    etaBuffer?: number;
    synchronousUpdate?: boolean;
  }

  export class SingleBar {
    constructor(options?: Options, preset?: any);
    start(total: number, startValue?: number, payload?: any): void;
    update(current: number, payload?: any): void;
    increment(delta?: number, payload?: any): void;
    setTotal(total: number): void;
    stop(): void;
  }

  export class MultiBar {
    constructor(options?: Options, preset?: any);
    create(total: number, startValue?: number, payload?: any): SingleBar;
    remove(bar: SingleBar): void;
    stop(): void;
  }

  export const Presets: {
    shades_classic: any;
    shades_grey: any;
    rect: any;
    legacy: any;
  };
}

declare module 'tailwindcss' {
  import { Config } from 'tailwindcss/types/config';

  export = Config;
  export type { Config };

  export interface TailwindConfig {
    content?: string[];
    darkMode?: 'media' | 'class' | ['class', string];
    theme?: {
      extend?: any;
      screens?: Record<string, string>;
      colors?: Record<string, string | Record<string, string>>;
      spacing?: Record<string, string>;
      fontFamily?: Record<string, string[]>;
      fontSize?: Record<string, [string, { lineHeight?: string; letterSpacing?: string }] | string>;
      fontWeight?: Record<string, string | number>;
      lineHeight?: Record<string, string>;
      borderRadius?: Record<string, string>;
      boxShadow?: Record<string, string>;
      [key: string]: any;
    };
    plugins?: any[];
    presets?: TailwindConfig[];
    prefix?: string;
    important?: boolean | string;
    separator?: string;
    corePlugins?: string[] | Record<string, boolean>;
    variants?: Record<string, string[]>;
  }
}

declare module '*.css' {
  const content: { [className: string]: string };
  export default content;
}

declare module '*.scss' {
  const content: { [className: string]: string };
  export default content;
}

declare module '*.module.css' {
  const classes: { [key: string]: string };
  export default classes;
}

declare module '*.module.scss' {
  const classes: { [key: string]: string };
  export default classes;
}

