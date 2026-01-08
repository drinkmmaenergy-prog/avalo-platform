declare module 'next' {
  export interface Metadata {
    title?: string;
    description?: string;
    keywords?: string[];
    authors?: Array<{ name: string; url?: string }>;
    creator?: string;
    publisher?: string;
    formatDetection?: {
      email?: boolean;
      address?: boolean;
      telephone?: boolean;
    };
    icons?: {
      icon?: string | Array<{ url: string; sizes?: string; type?: string }>;
      apple?: string | Array<{ url: string; sizes?: string; type?: string }>;
    };
    manifest?: string;
    openGraph?: {
      title?: string;
      description?: string;
      url?: string;
      siteName?: string;
      images?: Array<{
        url: string;
        width?: number;
        height?: number;
        alt?: string;
      }>;
      locale?: string;
      type?: string;
    };
    twitter?: {
      card?: string;
      title?: string;
      description?: string;
      creator?: string;
      images?: string[];
    };
    viewport?: string | {
      width?: string | number;
      height?: string | number;
      initialScale?: number;
      maximumScale?: number;
      minimumScale?: number;
      userScalable?: boolean;
    };
    themeColor?: string | Array<{ media?: string; color: string }>;
  }
}

declare module 'next/link' {
;
;
  import { DetailedHTMLProps, AnchorHTMLAttributes, PropsWithChildren } from 'react';

  export interface LinkProps extends PropsWithChildren<Omit<DetailedHTMLProps<AnchorHTMLAttributes<HTMLAnchorElement>, HTMLAnchorElement>, 'href' | 'ref'>> {
    href: string | object;
    as?: string;
    replace?: boolean;
    scroll?: boolean;
    shallow?: boolean;
    passHref?: boolean;
    prefetch?: boolean;
    locale?: string | false;
    legacyBehavior?: boolean;
  }

  export default function Link(props: LinkProps): JSX.Element;
}

declare module 'next/image' {
  import { DetailedHTMLProps, ImgHTMLAttributes } from 'react';

  export interface ImageProps extends Omit<DetailedHTMLProps<ImgHTMLAttributes<HTMLImageElement>, HTMLImageElement>, 'src' | 'srcSet' | 'ref' | 'width' | 'height' | 'loading'> {
    src: string | { src: string; height: number; width: number };
    alt: string;
    width?: number | string;
    height?: number | string;
    fill?: boolean;
    loader?: (props: { src: string; width: number; quality?: number }) => string;
    quality?: number | string;
    priority?: boolean;
    loading?: 'lazy' | 'eager';
    placeholder?: 'blur' | 'empty';
    blurDataURL?: string;
    unoptimized?: boolean;
    onLoadingComplete?: (img: HTMLImageElement) => void;
    layout?: string;
    objectFit?: string;
    objectPosition?: string;
    lazyBoundary?: string;
    lazyRoot?: string;
  }

  export default function Image(props: ImageProps): JSX.Element;
}

declare module 'next/navigation' {
  export function useRouter(): {
    push: (href: string, options?: { scroll?: boolean }) => void;
    replace: (href: string, options?: { scroll?: boolean }) => void;
    refresh: () => void;
    prefetch: (href: string) => void;
    back: () => void;
    forward: () => void;
  };

  export function usePathname(): string;
  export function useSearchParams(): URLSearchParams;
  export function useParams(): Record<string, string | string[]>;
  export function redirect(url: string): never;
  export function notFound(): never;

  export function useSelectedLayoutSegment(): string | null;
  export function useSelectedLayoutSegments(): string[];
}

declare module 'next/server' {
  import { NextRequest as Request } from 'next/dist/server/web/spec-extension/request';
  import { NextResponse as Response } from 'next/dist/server/web/spec-extension/response';

  export { Request as NextRequest, Response as NextResponse };

  export interface NextResponse<T = any> extends Response {
    json(body: T, init?: ResponseInit): NextResponse<T>;
  }

  export interface NextRequest extends Request {
    nextUrl: URL & {
      searchParams: URLSearchParams;
    };
    geo?: {
      city?: string;
      country?: string;
      region?: string;
    };
    ip?: string;
    cookies: {
      get(name: string): { name: string; value: string } | undefined;
      getAll(): Array<{ name: string; value: string }>;
      set(name: string, value: string, options?: any): void;
      delete(name: string): void;
    };
  }
}

declare module 'next/font/google' {
  export interface FontOptions {
    weight?: string | string[];
    style?: string | string[];
    subsets?: string[];
    display?: 'auto' | 'block' | 'swap' | 'fallback' | 'optional';
    preload?: boolean;
    fallback?: string[];
    adjustFontFallback?: boolean;
    variable?: string;
  }

  export interface Font {
    className: string;
    style: {
      fontFamily: string;
      fontWeight?: number;
      fontStyle?: string;
    };
  }

  export function Inter(options?: FontOptions): Font;
  export function Roboto(options?: FontOptions): Font;
  export function Open_Sans(options?: FontOptions): Font;
  export function Lato(options?: FontOptions): Font;
  export function Montserrat(options?: FontOptions): Font;
  export function Poppins(options?: FontOptions): Font;
  export function Source_Sans_Pro(options?: FontOptions): Font;
}

