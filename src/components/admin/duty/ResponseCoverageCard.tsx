import React, { useState } from 'react';
import { 
  CheckCircle, 
  AlertTriangle, 
  XCircle, 
  AlertCircle, 
  Smartphone, 
  UserPlus, 
  SlidersHorizontal, 
  ChevronDown, 
  ChevronUp, 
  ShieldCheck,
  Users
} from 'lucide-react';
import { CoverageCategory, formatDisplayName, formatRoleName, getInitials } from './ResponseCoverageRow';

type DutyTabType = 'devices_readiness' | 'event_team' | 'alert_routing' | 'response_coverage' | 'event_locations';

interface ResponseCoverageCardProps {
  item: CoverageCategory;
  onNavigateTab?: (tab: DutyTabType) => void;
}

export default function ResponseCoverageCard({ item, onNavigateTab }: ResponseCoverageCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const isComplete = item.coverageStatus === 'Complete';
  const isLimited = item.coverageStatus === 'Limited';
  const isNoCoverage = item.coverageStatus === 'No coverage';
  const isRoutingIssue = item.coverageStatus === 'Routing issue';

  // Severity styling
  let severityBadgeClass = 'bg-stone-100 dark:bg-[#262520] text-stone-700 dark:text-[#B8B0A5] border-stone-200 dark:border-[#302E29]';
  if (item.severity === 'Critical') severityBadgeClass = 'bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-400 border-rose-200/80 dark:border-rose-800/40';
  else if (item.severity === 'High') severityBadgeClass = 'bg-orange-50 dark:bg-orange-950/30 text-orange-800 dark:text-orange-400 border-orange-200/80 dark:border-orange-800/40';
  else if (item.severity === 'Medium') severityBadgeClass = 'bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-400 border-amber-200/80 dark:border-amber-800/40';
  else if (item.severity === 'Low') severityBadgeClass = 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-400 border-emerald-200/80 dark:border-emerald-800/40';

  // Device calculations
  let readyCount = 0;
  let totalCount = 0;
  const match = item.deviceReadiness.summary.match(/(\d+)\/(\d+)/);
  if (match) {
    readyCount = parseInt(match[1], 10);
    totalCount = parseInt(match[2], 10);
  } else {
    const allResponders = [...item.primaryResponders, ...item.backupResponders];
    totalCount = allResponders.length;
    readyCount = allResponders.filter(r => r.readyDevices > 0).length;
  }
  const readinessPercent = totalCount > 0 ? Math.round((readyCount / totalCount) * 100) : 0;

  let actionTitle = 'Assign an on-duty Care Lead';
  if (isNoCoverage) {
    const roleName = item.expectedRoles[0] ? formatRoleName(item.expectedRoles[0]) : 'Responder';
    actionTitle = `Assign on-duty ${roleName}`;
  } else if (isLimited) {
    actionTitle = 'Assign backup responder';
  } else if (isRoutingIssue) {
    actionTitle = 'Review routing rule';
  } else {
    actionTitle = 'Coverage active';
  }

  return (
    <div className="bg-white dark:bg-[#1D1D1A] border border-stone-200 dark:border-[#302E29] rounded-2xl p-4 sm:p-5 shadow-2xs space-y-4">
      {/* Header: Title, Severity, and Coverage Status */}
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-stone-100 dark:border-[#302E29] pb-3">
        <div className="space-y-1">
          <h3 className="font-serif font-bold text-stone-900 dark:text-[#F0EBE3] text-base">{item.name}</h3>
          <div className="flex items-center space-x-2">
            <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${severityBadgeClass}`}>
              {item.severity} Priority
            </span>
            <span className="text-[10px] font-mono text-stone-400 dark:text-[#7A7570] uppercase">
              {item.categoryKey}
            </span>
          </div>
        </div>

        {/* Coverage Status Badge */}
        <span className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
          isComplete
            ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-400 border-emerald-200/80 dark:border-emerald-800/40'
            : isLimited
            ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-400 border-amber-200/80 dark:border-amber-800/40'
            : isNoCoverage
            ? 'bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-400 border-rose-200/80 dark:border-rose-800/40'
            : 'bg-purple-50 dark:bg-purple-950/30 text-purple-800 dark:text-purple-400 border-purple-200/80 dark:border-purple-800/40'
        }`}>
          {isComplete && <CheckCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />}
          {isLimited && <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />}
          {isNoCoverage && <XCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />}
          {isRoutingIssue && <AlertCircle className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 shrink-0" />}
          <span>{item.coverageStatus}</span>
        </span>
      </div>

      {/* Expected Roles */}
      <div className="space-y-1.5">
        <span className="text-[10px] font-mono font-bold text-stone-400 dark:text-[#7A7570] uppercase tracking-wider block">Expected roles</span>
        <div className="flex flex-wrap gap-1.5">
          {item.expectedRoles.map((role, idx) => (
            <span key={idx} className="bg-stone-100 dark:bg-[#262520] border border-stone-200 dark:border-[#302E29] text-stone-800 dark:text-[#F0EBE3] text-xs font-medium px-2.5 py-1 rounded-lg">
              {formatRoleName(role)}
            </span>
          ))}
        </div>
      </div>

      {/* Primary & Backup Responders */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
        {/* Primary */}
        <div className="space-y-1.5 bg-stone-50/80 dark:bg-[#21211E] p-3 rounded-xl border border-stone-200/60 dark:border-[#302E29]">
          <span className="text-[10px] font-mono font-bold text-stone-400 dark:text-[#7A7570] uppercase tracking-wider block">Primary</span>
          {item.primaryResponders.length === 0 ? (
            <div className="space-y-1.5">
              <span className="font-semibold text-xs text-rose-800 dark:text-rose-400 block">Primary responder needed</span>
              <button
                onClick={() => onNavigateTab?.('event_team')}
                className="w-full min-h-[44px] px-3 py-2 bg-rose-600 text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center justify-center space-x-1.5 cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                <span>Assign primary responder</span>
              </button>
            </div>
          ) : (
            item.primaryResponders.map((resp) => (
              <div key={resp.userId} className="flex items-center space-x-2">
                <div className="w-7 h-7 rounded-full bg-stone-200 dark:bg-[#2A2926] text-stone-700 dark:text-[#F0EBE3] text-xs font-bold flex items-center justify-center shrink-0">
                  {getInitials(resp.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-stone-900 dark:text-[#F0EBE3] text-xs truncate">{formatDisplayName(resp.name)}</div>
                  <div className="text-[10px] text-stone-500 dark:text-[#7A7570]">{formatRoleName(resp.responsibility)}</div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Backup */}
        <div className="space-y-1.5 bg-stone-50/80 dark:bg-[#21211E] p-3 rounded-xl border border-stone-200/60 dark:border-[#302E29]">
          <span className="text-[10px] font-mono font-bold text-stone-400 dark:text-[#7A7570] uppercase tracking-wider block">Backup ({item.backupResponders.length})</span>
          {item.backupResponders.length === 0 ? (
            <span className="text-xs text-stone-400 dark:text-[#7A7570] italic block">No backup assigned</span>
          ) : (
            item.backupResponders.map((resp) => (
              <div key={resp.userId} className="flex items-center space-x-2">
                <div className="w-6 h-6 rounded-full bg-stone-200 dark:bg-[#2A2926] text-stone-700 dark:text-[#F0EBE3] text-[10px] font-bold flex items-center justify-center shrink-0">
                  {getInitials(resp.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-stone-800 dark:text-[#F0EBE3] text-xs truncate">{formatDisplayName(resp.name)}</div>
                  <div className="text-[10px] text-stone-500 dark:text-[#7A7570]">{formatRoleName(resp.responsibility)}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Device Readiness */}
      <div className="space-y-1.5 pt-1">
        <div className="flex items-center justify-between text-xs font-semibold text-stone-700 dark:text-[#B8B0A5]">
          <span>Device Readiness</span>
          <span>{totalCount > 0 ? `${readyCount} of ${totalCount} ready` : 'No devices'}</span>
        </div>
        <div className="w-full bg-stone-100 dark:bg-[#262520] h-2 rounded-full overflow-hidden flex border border-stone-200/60 dark:border-[#302E29]">
          <div 
            className={`h-full ${readyCount === totalCount && totalCount > 0 ? 'bg-emerald-500' : readyCount > 0 ? 'bg-amber-500' : 'bg-stone-300 dark:bg-stone-700'}`}
            style={{ width: `${readinessPercent}%` }}
          />
        </div>
      </div>

      {/* Recommended Action & Primary Action Buttons */}
      <div className="pt-2 border-t border-stone-100 dark:border-[#302E29] space-y-2">
        <p className="text-xs font-semibold text-stone-800 dark:text-[#F0EBE3]">{actionTitle}</p>

        <div className="flex flex-col sm:flex-row gap-2">
          {isNoCoverage ? (
            <button
              onClick={() => onNavigateTab?.('event_team')}
              className="w-full min-h-[44px] px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center justify-center space-x-2 cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>Assign responder</span>
            </button>
          ) : isLimited ? (
            <button
              onClick={() => onNavigateTab?.('event_team')}
              className="w-full min-h-[44px] px-4 py-2.5 bg-[#C59B27] hover:bg-[#A47F1E] text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center justify-center space-x-2 cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>Assign backup responder</span>
            </button>
          ) : isRoutingIssue ? (
            <button
              onClick={() => onNavigateTab?.('alert_routing')}
              className="w-full min-h-[44px] px-4 py-2.5 bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center justify-center space-x-2 cursor-pointer"
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span>Review routing rule</span>
            </button>
          ) : (
            <button
              onClick={() => onNavigateTab?.('alert_routing')}
              className="w-full min-h-[44px] px-4 py-2.5 bg-stone-100 dark:bg-[#21211E] hover:bg-stone-200 dark:hover:bg-[#262520] text-stone-800 dark:text-[#F0EBE3] text-xs font-bold rounded-xl transition-all flex items-center justify-center space-x-2 cursor-pointer"
            >
              <SlidersHorizontal className="w-4 h-4 text-stone-500 dark:text-[#7A7570]" />
              <span>View routing rule</span>
            </button>
          )}

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full min-h-[44px] px-4 py-2.5 bg-white dark:bg-[#21211E] border border-stone-200 dark:border-[#302E29] text-stone-700 dark:text-[#B8B0A5] hover:bg-stone-50 dark:hover:bg-[#262520] text-xs font-bold rounded-xl transition-all flex items-center justify-center space-x-1.5 cursor-pointer"
          >
            <span>{isExpanded ? 'Hide details' : 'View details'}</span>
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div className="pt-3 border-t border-stone-200 dark:border-[#302E29] space-y-3 text-xs animate-fade-in bg-stone-50/60 dark:bg-[#21211E] p-3 rounded-xl">
          <span className="font-bold text-stone-900 dark:text-[#F0EBE3] block">Full Category Details</span>
          <p className="text-stone-600 dark:text-[#B8B0A5]">{item.recommendedAction}</p>
          <div className="space-y-1">
            <span className="font-semibold text-stone-700 dark:text-[#B8B0A5] block">Status reason:</span>
            <span className="text-stone-600 dark:text-[#7A7570]">{item.coverageReason || 'Primary and backup response evaluated'}</span>
          </div>
        </div>
      )}
    </div>
  );
}
