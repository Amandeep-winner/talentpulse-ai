'use client';

import { Badge } from '@/components/ui/badge';
import { Sparkles, Bell } from 'lucide-react';

export function Topbar() {
  return (
    <header className="h-16 border-b border-gray-800 bg-[#0E131F]/80 backdrop-blur px-6 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Badge variant="warning" className="text-[11px] py-0.5 px-2 font-medium">
          <Sparkles className="h-3 w-3 mr-1 inline" />
          Synthetic demo data
        </Badge>
        <span className="text-xs text-gray-500 hidden sm:inline">
          Deterministic simulation environment
        </span>
      </div>

      <div className="flex items-center gap-4">
        <button
          className="text-gray-400 hover:text-gray-200 transition-colors"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2 pl-2 border-l border-gray-800">
          <div className="h-7 w-7 rounded-full bg-blue-600/20 text-blue-400 flex items-center justify-center text-xs font-semibold">
            AD
          </div>
          <div className="text-left hidden md:block">
            <span className="text-xs font-medium text-gray-200 block leading-tight">Demo Admin</span>
            <span className="text-[10px] text-gray-400 block leading-tight">admin@demo.com</span>
          </div>
        </div>
      </div>
    </header>
  );
}
