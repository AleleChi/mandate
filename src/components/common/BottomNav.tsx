import React from 'react';
import { Home, Users, Activity, QrCode, User } from 'lucide-react';
import { BottomNavTab } from '../../types';

interface BottomNavProps {
  activeTab: BottomNavTab;
  onTabChange: (tab: BottomNavTab) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onTabChange }) => {
  const navItems: { label: BottomNavTab; icon: React.ReactNode }[] = [
    { label: 'Home', icon: <Home className="w-5 h-5" /> },
    { label: 'Children', icon: <Users className="w-5 h-5" /> },
    { label: 'Status', icon: <Activity className="w-5 h-5" /> },
    { label: 'Passes', icon: <QrCode className="w-5 h-5" /> },
    { label: 'Profile', icon: <User className="w-5 h-5" /> }
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#E5E2DA] shadow-lg">
      <div className="max-w-md mx-auto px-2 h-16 flex items-center justify-around">
        {navItems.map((item) => {
          const isActive = activeTab === item.label;
          return (
            <button
              key={item.label}
              onClick={() => onTabChange(item.label)}
              className={`flex flex-col items-center justify-center flex-1 py-1.5 rounded-xl transition-all ${
                isActive
                  ? 'text-[#B89047] font-semibold'
                  : 'text-[#6B7280] hover:text-[#262626]'
              }`}
            >
              <div
                className={`p-1 rounded-lg transition-transform ${
                  isActive ? 'bg-[#FAF6EB] scale-110' : ''
                }`}
              >
                {item.icon}
              </div>
              <span className="text-[11px] mt-0.5 tracking-tight">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
