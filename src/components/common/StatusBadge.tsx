import React from 'react';
import { CheckCircle2, Clock, ShieldCheck, AlertCircle } from 'lucide-react';

export type StatusType = 
  | 'Draft' 
  | 'Incomplete' 
  | 'Under review' 
  | 'Pass ready' 
  | 'Selected' 
  | 'Waiting list' 
  | 'Not selected' 
  | 'Withdrawn' 
  | 'Checked in' 
  | 'Inside' 
  | 'Picked up' 
  | 'Checked out';

interface StatusBadgeProps {
  status: StatusType;
  size?: 'sm' | 'md';
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'sm', className = '' }) => {
  const getBadgeConfig = () => {
    switch (status) {
      case 'Incomplete':
      case 'Draft':
        return {
          bg: 'bg-[#F3EFE6] text-[#715D3A] border border-[#D9D6CE]',
          icon: <Clock className="w-3.5 h-3.5 mr-1 text-[#9A7326] shrink-0" />
        };
      case 'Pass ready':
      case 'Selected':
        return {
          bg: 'bg-[#ECFDF5] text-[#065F46] border border-[#A7F3D0]',
          icon: <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-[#059669] shrink-0" />
        };
      case 'Checked in':
      case 'Inside':
        // Restrained blue/green treatment
        return {
          bg: 'bg-emerald-50 text-emerald-800 border border-emerald-200/90',
          icon: <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600 shrink-0" />
        };
      case 'Picked up':
      case 'Checked out':
        // Quiet completed-state treatment
        return {
          bg: 'bg-zinc-100 text-zinc-600 border border-zinc-200',
          icon: <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-zinc-400 shrink-0" />
        };
      case 'Under review':
        return {
          bg: 'bg-[#FFFBEB] text-[#92400E] border border-[#FDE68A]',
          icon: <Clock className="w-3.5 h-3.5 mr-1 text-[#D97706] shrink-0" />
        };
      case 'Waiting list':
        return {
          bg: 'bg-[#FFF7ED] text-[#9A3412] border border-[#FED7AA]',
          icon: <AlertCircle className="w-3.5 h-3.5 mr-1 text-[#EA580C] shrink-0" />
        };
      case 'Not selected':
        return {
          bg: 'bg-[#F3F4F6] text-[#4B5563] border border-[#E5E7EB]',
          icon: <ShieldCheck className="w-3.5 h-3.5 mr-1 text-[#6B7280] shrink-0" />
        };
      case 'Withdrawn':
        return {
          bg: 'bg-gray-100 text-gray-500 border border-gray-200',
          icon: <AlertCircle className="w-3.5 h-3.5 mr-1 text-gray-400 shrink-0" />
        };
      default:
        return {
          bg: 'bg-[#F3F4F6] text-[#4B5563] border border-[#E5E7EB]',
          icon: <ShieldCheck className="w-3.5 h-3.5 mr-1 text-[#6B7280] shrink-0" />
        };
    }
  };

  const config = getBadgeConfig();
  const sizeClasses = size === 'sm' 
    ? 'px-2.5 py-0.5 text-xs font-medium' 
    : 'px-3 py-1 text-sm font-medium';

  return (
    <span 
      className={`inline-flex items-center rounded-lg whitespace-nowrap shrink-0 font-sans ${config.bg} ${sizeClasses} ${className}`}
    >
      {config.icon}
      <span>{status}</span>
    </span>
  );
};
