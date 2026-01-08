'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  AlertTriangle,
  Flag,
  Shield,
  ListOrdered,
  TrendingUp,
  Sparkles,
} from 'lucide-react';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
  {
    href: '/admin/moderation',
    label: 'Dashboard',
    icon: LayoutDashboard,
  },
  {
    href: '/admin/moderation/queue',
    label: 'Priority Queue',
    icon: ListOrdered,
  },
  {
    href: '/admin/moderation/analytics',
    label: 'Analytics',
    icon: TrendingUp,
  },
  {
    href: '/admin/moderation/users',
    label: 'Users',
    icon: Users,
  },
  {
    href: '/admin/moderation/incidents',
    label: 'Incidents',
    icon: AlertTriangle,
  },
  {
    href: '/admin/moderation/appeals',
    label: 'Appeals',
    icon: Flag,
  },
  {
    href: '/admin/moderation/assistant',
    label: 'Assistant ✨ AI',
    icon: Sparkles,
  },
];

export function ModerationSidebar() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/admin/moderation') {
      return pathname === href;
    }
    return pathname?.startsWith(href);
  };

  return (
    <aside className="w-64 h-screen bg-gradient-to-b from-[#40E0D0] via-[#2A9D8F] to-[#0F0F0F] flex flex-col">
      {/* Logo Section */}
      <div className="p-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-[#D4AF37] flex items-center justify-center shadow-lg">
            <Shield className="w-7 h-7 text-[#0F0F0F]" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">
              Avalo
            </h1>
            <p className="text-sm text-white/80 font-medium">
              Moderator Panel
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200
                ${
                  active
                    ? 'bg-[#0F0F0F] text-white border-l-4 border-[#D4AF37] shadow-lg'
                    : 'text-white/80 hover:bg-white/10 hover:text-white'
                }
              `}
            >
              <Icon className={`w-5 h-5 ${active ? 'text-[#D4AF37]' : ''}`} />
              <span className="font-medium text-base">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-white/10">
        <div className="text-sm text-white/60 text-center">
          Avalo Moderation v1.0
        </div>
      </div>
    </aside>
  );
}