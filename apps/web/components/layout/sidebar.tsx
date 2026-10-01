'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Briefcase,
  Users,
  FileSpreadsheet,
  Megaphone,
  BarChart3,
  Sparkles,
  Sliders,
  TrendingUp,
  BookOpen,
  Network,
  ShieldCheck,
  Settings,
  Activity,
  LogOut,
} from 'lucide-react';
import { Role } from '@talentpulse/shared';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import { Badge } from '@/components/ui/badge';

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: Role[];
}

export const navigationItems: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Jobs', href: '/jobs', icon: Briefcase },
  { name: 'Candidates', href: '/candidates', icon: Users },
  { name: 'Applications', href: '/applications', icon: FileSpreadsheet },
  { name: 'Campaigns', href: '/campaigns', icon: Megaphone },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  { name: 'AI Analyst', href: '/ai', icon: Sparkles },
  { name: 'Optimize', href: '/optimize', icon: Sliders, roles: ['ADMIN', 'RECRUITER'] },
  { name: 'Forecast', href: '/forecast', icon: TrendingUp },
  { name: 'Knowledge', href: '/knowledge', icon: BookOpen },
  { name: 'Integrations', href: '/integrations', icon: Network, roles: ['ADMIN'] },
  { name: 'Audit', href: '/audit', icon: ShieldCheck },
  { name: 'Settings', href: '/settings', icon: Settings, roles: ['ADMIN'] },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const userRole = user?.role || 'ADMIN';

  const visibleItems = navigationItems.filter(
    (item) => !item.roles || item.roles.includes(userRole),
  );

  return (
    <aside className="w-64 border-r border-gray-800 bg-[#0E131F] flex flex-col shrink-0">
      <div className="h-16 flex items-center px-6 border-b border-gray-800 gap-2">
        <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold">
          <Activity className="h-5 w-5" />
        </div>
        <div>
          <span className="font-semibold text-sm tracking-tight text-white block">TalentPulse AI</span>
          <span className="text-[10px] text-gray-400 block -mt-1">
            {user?.organizationName || 'Recruitment Intelligence'}
          </span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {visibleItems.map((item) => {
          const isActive =
            pathname === item.href || (item.href !== '/dashboard' && pathname?.startsWith(item.href));
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium transition-colors',
                isActive
                  ? 'bg-blue-600/10 text-blue-400 font-semibold'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50',
              )}
            >
              <item.icon className={cn('h-4 w-4', isActive ? 'text-blue-400' : 'text-gray-400')} />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {user && (
        <div className="p-3 border-t border-gray-800 bg-gray-900/40">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-8 w-8 rounded-full bg-blue-600/20 text-blue-400 flex items-center justify-center text-xs font-semibold shrink-0">
                {user.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <span className="text-xs font-medium text-gray-200 block truncate leading-tight">
                  {user.name}
                </span>
                <span className="text-[10px] text-gray-400 block truncate leading-tight">
                  {user.email}
                </span>
              </div>
            </div>
            <button
              onClick={() => logout()}
              className="p-1.5 text-gray-400 hover:text-red-400 transition-colors rounded hover:bg-gray-800"
              title="Log out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <Badge variant="outline" className="text-[9px] py-0 px-1.5 uppercase font-mono">
              {user.role}
            </Badge>
            <span className="text-[10px] text-gray-500">v1.0.0</span>
          </div>
        </div>
      )}
    </aside>
  );
}
