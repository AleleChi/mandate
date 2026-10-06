import React from 'react';
import { Home, Users, Activity, QrCode, MessageSquare, User } from 'lucide-react';
import { BottomNavTab } from '../../types';

interface BottomNavProps {
  activeTab: BottomNavTab;
  onTabChange: (tab: BottomNavTab) => void;
  unreadMessagesCount?: number;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onTabChange, unreadMessagesCount = 0 }) => {
  const navItems: { label: BottomNavTab; icon: React.ReactNode; badge?: number }[] = [
    { label: 'Home', icon: <Home className="w-5 h-5" /> },
    { label: 'Children', icon: <Users className="w-5 h-5" /> },
    { label: 'Status', icon: <Activity className="w-5 h-5" /> },
    { label: 'Passes', icon: <QrCode className="w-5 h-5" /> },
    { label: 'Messages', icon: <MessageSquare className="w-5 h-5" />, badge: unreadMessagesCount },
    { label: 'Profile', icon: <User className="w-5 h-5" /> }
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 max-w-[390px] mx-auto bg-white/95 dark:bg-[#1D1D1A]/95 backdrop-blur-md border-t border-[#EAE8E1] dark:border-[#302E29] shadow-lg">
      <div className="px-2 h-16 flex items-center justify-around">
        {navItems.map((item) => {
          const isActive = activeTab === item.label;
          return (
            <button
              key={item.label}
              type="button"
              onClick={() => onTabChange(item.label)}
              className={`flex flex-col items-center justify-center flex-1 py-1.5 rounded-xl transition-all cursor-pointer focus:outline-none ${
                isActive
                  ? 'text-[#B89047] dark:text-[#D4AF37] font-semibold'
                  : 'text-[#6B7280] dark:text-[#B8B0A5] hover:text-[#18181B] dark:hover:text-[#F0EBE3]'
              }`}
            >
              <div
                className={`relative p-1 rounded-lg transition-transform ${
                  isActive ? 'bg-[#FAF6EB] dark:bg-[#262520] scale-110 text-[#C59B27] dark:text-[#D4AF37]' : ''
                }`}
              >
                {item.icon}
                {item.badge && item.badge > 0 ? (
                  <span className="absolute -top-1 -right-1.5 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-[#E07A5F] text-[9px] font-bold text-white shadow-sm ring-1 ring-white">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                ) : null}
              </div>
              <span className="text-[10px] mt-0.5 tracking-tight">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
