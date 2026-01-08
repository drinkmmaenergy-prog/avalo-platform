declare module 'lucide-react' {
;
;
  import { FC, SVGProps } from 'react';

  export type IconProps = SVGProps<SVGSVGElement> & {
    size?: number | string;
    color?: string;
    strokeWidth?: number | string;
    absoluteStrokeWidth?: boolean;
  };

  export type Icon = FC<IconProps>;

  // Common icons used in the codebase
  export const AlertCircle: Icon;
  export const ArrowRight: Icon;
  export const Calendar: Icon;
  export const Check: Icon;
  export const CheckCircle: Icon;
  export const ChevronDown: Icon;
  export const ChevronLeft: Icon;
  export const ChevronRight: Icon;
  export const ChevronUp: Icon;
  export const Clock: Icon;
  export const Copy: Icon;
  export const CreditCard: Icon;
  export const DollarSign: Icon;
  export const Download: Icon;
  export const Edit: Icon;
  export const ExternalLink: Icon;
  export const Eye: Icon;
  export const EyeOff: Icon;
  export const Filter: Icon;
  export const Heart: Icon;
  export const Home: Icon;
  export const Info: Icon;
  export const Loader: Icon;
  export const Lock: Icon;
  export const LogOut: Icon;
  export const Mail: Icon;
  export const Menu: Icon;
  export const MessageCircle: Icon;
  export const MoreVertical: Icon;
  export const Plus: Icon;
  export const Search: Icon;
  export const Send: Icon;
  export const Settings: Icon;
  export const Share: Icon;
  export const Shield: Icon;
  export const Star: Icon;
  export const Trash: Icon;
  export const TrendingUp: Icon;
  export const User: Icon;
  export const Users: Icon;
  export const Wallet: Icon;
  export const X: Icon;
  export const Zap: Icon;

  // Export all icons as a namespace
  export * from 'lucide-react';
}

