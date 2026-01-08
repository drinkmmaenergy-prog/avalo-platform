'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  AlertTriangle,
  Users,
  ScrollText,
  Settings,
} from 'lucide-react';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
  {
    href: '/moderator/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
  },
  {
    href: '/moderator/incidents',
    label: 'Incidents',
    icon: AlertTriangle,
  },
  {
    href: '/moderator/users',
    label: 'Users',
    icon: Users,
  },
  {
    href: '/moderator/logs',
    label: 'Logs',
    icon: ScrollText,
  },
  {
    href: '/moderator/settings',
    label: 'Settings',
    icon: Settings,
  },
];

export function ModeratorSidebar() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/moderator/dashboard') {
      return pathname === href;
    }
    return pathname?.startsWith(href);
  };

  return (
    <aside className="w-64 h-screen bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col">
      {/* Logo Section */}
      <div className="p-6 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
            <span className="text-white font-bold text-lg">A</span>
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-50">
              Avalo TrustShield
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Moderator Panel
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
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
                    ? 'bg-cyan-500/10 text-cyan-600 dark:bg-cyan-500/20 dark:text-cyan-400'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-50'
                }
              `}
            >
              <Icon className={`w-5 h-5 ${active ? 'text-cyan-500' : ''}`} />
              <span className="font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-800">
        <div className="text-xs text-slate-500 dark:text-slate-400 text-center">
          Avalo TrustShield v1.0
        </div>
      </div>
    </aside>
  );
}