import React from 'react';
import { CheckCircle2, Clock, ShieldCheck, AlertCircle } from 'lucide-react';

export type StatusType = 'Draft' | 'Incomplete' | 'Under review' | 'Pass ready' | 'Selected' | 'Waiting list' | 'Not selected' | 'Withdrawn' | 'Checked in' | 'Inside' | 'Picked up' | 'Checked out';

interface StatusBadgeProps {
  status: StatusType;
  size?: 'sm' | 'md';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'sm' }) => {
  const getBadgeConfig = () => {
    switch (status) {
      case 'Incomplete':
      case 'Draft':
        return {
          bg: 'bg-[#F3EFE6] text-[#715D3A] border border-[#D9D6CE]',
          icon: <Clock className="w-3.5 h-3.5 mr-1 text-[#9A7326]" />
        };
      case 'Pass ready':
      case 'Selected':
        return {
          bg: 'bg-[#ECFDF5] text-[#065F46] border border-[#A7F3D0]',
          icon: <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-[#059669]" />
        };
      case 'Checked in':
      case 'Inside':
        return {
          bg: 'bg-blue-50 text-blue-800 border border-blue-200',
          icon: <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-blue-600" />
        };
      case 'Picked up':
      case 'Checked out':
        return {
          bg: 'bg-purple-50 text-purple-800 border border-purple-200',
          icon: <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-purple-600" />
        };
      case 'Under review':
        return {
          bg: 'bg-[#FFFBEB] text-[#92400E] border border-[#FDE68A]',
          icon: <Clock className="w-3.5 h-3.5 mr-1 text-[#D97706]" />
        };
      case 'Waiting list':
        return {
          bg: 'bg-[#FFF7ED] text-[#9A3412] border border-[#FED7AA]',
          icon: <AlertCircle className="w-3.5 h-3.5 mr-1 text-[#EA580C]" />
        };
      case 'Not selected':
        return {
          bg: 'bg-[#F3F4F6] text-[#4B5563] border border-[#E5E7EB]',
          icon: <ShieldCheck className="w-3.5 h-3.5 mr-1 text-[#6B7280]" />
        };
      case 'Withdrawn':
        return {
          bg: 'bg-gray-100 text-gray-500 border border-gray-200',
          icon: <AlertCircle className="w-3.5 h-3.5 mr-1 text-gray-400" />
        };
      default:
        return {
          bg: 'bg-[#F3F4F6] text-[#4B5563] border border-[#E5E7EB]',
          icon: <ShieldCheck className="w-3.5 h-3.5 mr-1 text-[#6B7280]" />
        };
    }
  };

  const config = getBadgeConfig();
  const sizeClasses = size === 'sm' ? 'px-2.5 py-1 text-xs font-semibold' : 'px-3 py-1.5 text-sm font-semibold';

  return (
    <span className={`inline-flex items-center rounded-full ${config.bg} ${sizeClasses}`}>
      {config.icon}
      {status}
    </span>
  );
};
