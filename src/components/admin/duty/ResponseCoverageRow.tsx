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
  Users, 
  UserCheck, 
  ShieldCheck, 
  ExternalLink,
  MoreVertical,
  MapPin,
  CheckCircle2
} from 'lucide-react';

type DutyTabType = 'devices_readiness' | 'event_team' | 'alert_routing' | 'response_coverage' | 'event_locations';

export interface Responder {
  userId: string;
  name: string;
  responsibility: string;
  onDuty: boolean;
  readyDevices: number;
  locationName?: string | null;
}

export interface CoverageCategory {
  id: string;
  categoryKey: string;
  name: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low' | string;
  expectedRoles: string[];
  primaryResponders: Responder[];
  backupResponders: Responder[];
  deviceReadiness: {
    primaryReady: boolean;
    backupReady: boolean;
    summary: string;
  };
  coverageStatus: 'Complete' | 'Limited' | 'No coverage' | 'Routing issue';
  coverageReason: string;
  recommendedAction: string;
  allowedActions: string[];
}

interface ResponseCoverageRowProps {
  item: CoverageCategory;
  onNavigateTab?: (tab: DutyTabType) => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

export function formatDisplayName(name?: string): string {
  if (!name || name.trim().length === 0) return 'Administrator';
  if (!name.includes('@')) return name.trim();
  const handle = name.split('@')[0];
  const parts = handle.split(/[\._-]/);
  return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

export function formatRoleName(roleKey: string): string {
  const map: Record<string, string> = {
    care_lead: 'Care Lead',
    general_response: 'General Response',
    medical_lead: 'Medical Lead',
    medical_team: 'Medical Team',
    pickup_lead: 'Pickup Lead',
    pickup_volunteer: 'Pickup Volunteer',
    gate_lead: 'Gate Lead',
    gate_volunteer: 'Gate Volunteer',
    security_lead: 'Security Lead',
    security_marshal: 'Security Marshal',
    room_operator: 'Room Operator',
    volunteer: 'Volunteer',
    admin: 'Administrator'
  };
  const normalized = roleKey.toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (map[normalized]) return map[normalized];
  return roleKey.split(/[\_ -]/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

export function getInitials(name: string): string {
  const clean = formatDisplayName(name);
  const parts = clean.split(' ').filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return clean.substring(0, 2).toUpperCase();
}

export default function ResponseCoverageRow({
  item,
  onNavigateTab,
  isExpanded,
  onToggleExpand
}: ResponseCoverageRowProps) {
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showRolePopover, setShowRolePopover] = useState(false);
  const [showBackupsPopover, setShowBackupsPopover] = useState(false);

  const isComplete = item.coverageStatus === 'Complete';
  const isLimited = item.coverageStatus === 'Limited';
  const isNoCoverage = item.coverageStatus === 'No coverage';
  const isRoutingIssue = item.coverageStatus === 'Routing issue';

  // Severity styling
  let severityBadgeClass = 'bg-stone-100 text-stone-700 border-stone-200';
  if (item.severity === 'Critical') severityBadgeClass = 'bg-rose-50 text-rose-800 border-rose-200/80';
  else if (item.severity === 'High') severityBadgeClass = 'bg-orange-50 text-orange-800 border-orange-200/80';
  else if (item.severity === 'Medium') severityBadgeClass = 'bg-amber-50 text-amber-800 border-amber-200/80';
  else if (item.severity === 'Low') severityBadgeClass = 'bg-emerald-50 text-emerald-800 border-emerald-200/80';

  // Expected roles
  const visibleRoles = item.expectedRoles.slice(0, 2);
  const hiddenRolesCount = Math.max(0, item.expectedRoles.length - 2);

  // Backup responders
  const visibleBackups = item.backupResponders.slice(0, 2);
  const hiddenBackupsCount = Math.max(0, item.backupResponders.length - 2);

  // Calculate device readiness numbers for progress bar
  // Format from server summary e.g. "3/4 devices ready" or "1/1 devices ready"
  let readyCount = 0;
  let totalCount = 0;
  const match = item.deviceReadiness.summary.match(/(\d+)\/(\d+)/);
  if (match) {
    readyCount = parseInt(match[1], 10);
    totalCount = parseInt(match[2], 10);
  } else {
    // Calculate manually from responders
    const allResponders = [...item.primaryResponders, ...item.backupResponders];
    totalCount = allResponders.length;
    readyCount = allResponders.filter(r => r.readyDevices > 0).length;
  }
  const readinessPercent = totalCount > 0 ? Math.round((readyCount / totalCount) * 100) : 0;

  // Short status reason
  let statusReason = item.coverageReason;
  if (!statusReason) {
    if (isComplete) statusReason = 'Primary and backup available';
    else if (isLimited) statusReason = 'Primary available, no backup';
    else if (isNoCoverage) statusReason = 'Primary responder required';
    else if (isRoutingIssue) statusReason = 'No valid response role';
  }

  // Concise Action text
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
    <>
      <tr 
        className={`group transition-colors border-b border-stone-100 ${
          isExpanded ? 'bg-amber-50/20' : 'hover:bg-stone-50/60 bg-white'
        }`}
      >
        {/* 1. Alert Type (220-250px) */}
        <td className="p-4 align-top w-60 min-w-[220px]">
          <div className="space-y-1.5">
            <span className="font-serif font-semibold text-stone-900 text-sm leading-tight block">
              {item.name}
            </span>
            <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
              <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-semibold border ${severityBadgeClass}`}>
                {item.severity}
              </span>
              <span className="text-[10px] font-mono text-stone-400 uppercase tracking-wide">
                {item.categoryKey}
              </span>
            </div>
            <p className="text-[11px] text-stone-500 leading-snug">
              Applies across all event locations
            </p>
          </div>
        </td>

        {/* 2. Expected Roles (180-220px) */}
        <td className="p-4 align-top w-52 min-w-[180px]">
          <div className="space-y-1.5">
            <span className="text-[10px] font-mono font-bold text-stone-400 uppercase tracking-wider block">
              Expected roles
            </span>
            <div className="flex flex-col gap-1">
              {visibleRoles.map((role, idx) => (
                <span 
                  key={idx} 
                  className="bg-stone-100 border border-stone-200/80 text-stone-800 text-[11px] font-medium px-2.5 py-1 rounded-lg inline-flex items-center space-x-1 w-fit"
                >
                  <span>{formatRoleName(role)}</span>
                </span>
              ))}
              {hiddenRolesCount > 0 && (
                <div className="relative">
                  <button
                    onClick={() => setShowRolePopover(!showRolePopover)}
                    className="text-[10px] font-bold text-[#C59B27] hover:text-[#A47F1E] hover:underline cursor-pointer transition-colors"
                  >
                    +{hiddenRolesCount} more role{hiddenRolesCount > 1 ? 's' : ''}
                  </button>

                  {showRolePopover && (
                    <div className="absolute left-0 top-full mt-1 z-30 bg-white border border-stone-200 rounded-xl p-3 shadow-lg w-48 space-y-1 animate-fade-in">
                      <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">All Expected Roles</span>
                      {item.expectedRoles.map((r, i) => (
                        <div key={i} className="text-xs text-stone-800 font-medium py-0.5 border-b border-stone-100 last:border-0">
                          {formatRoleName(r)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </td>

        {/* 3. Response Team (Primary & Backup combined) */}
        <td className="p-4 align-top min-w-[340px]">
          <div className="space-y-3">
            {/* PRIMARY GROUP */}
            <div className="space-y-1">
              <span className="text-[10px] font-mono font-bold text-stone-400 uppercase tracking-wider block">
                Primary
              </span>

              {item.primaryResponders.length === 0 ? (
                <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-2.5 flex items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <span className="font-semibold text-xs text-amber-900 block leading-tight">Primary responder needed</span>
                    <span className="text-[10px] text-amber-700/90 block">No on-duty responder assigned</span>
                  </div>
                  <button
                    onClick={() => onNavigateTab?.('event_team')}
                    className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-bold rounded-lg transition-all shadow-2xs shrink-0 cursor-pointer"
                  >
                    Assign primary
                  </button>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {item.primaryResponders.map((resp) => {
                    const initials = getInitials(resp.name);
                    const displayName = formatDisplayName(resp.name);
                    return (
                      <div key={resp.userId} className="flex items-start space-x-2.5 bg-stone-50/80 p-2 rounded-xl border border-stone-200/60">
                        <div className="w-7 h-7 rounded-full bg-stone-200 text-stone-700 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                          {initials}
                        </div>
                        <div className="flex-1 min-w-0 space-y-0.5">
                          <div className="flex items-center space-x-1.5">
                            <span className="font-semibold text-stone-900 text-xs truncate">{displayName}</span>
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${resp.onDuty ? 'bg-emerald-500' : 'bg-stone-300'}`} title={resp.onDuty ? 'On duty' : 'Off duty'} />
                          </div>
                          <div className="flex items-center space-x-1.5 text-[10px] text-stone-500 flex-wrap">
                            <span className="font-medium">{formatRoleName(resp.responsibility)}</span>
                            <span>•</span>
                            <span className={`font-medium ${resp.readyDevices > 0 ? 'text-emerald-700' : 'text-amber-600'}`}>
                              {resp.readyDevices > 0 ? `${resp.readyDevices} device ready` : 'Needs device'}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* BACKUP GROUP */}
            <div className="space-y-1 pt-1 border-t border-stone-100">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold text-stone-400 uppercase tracking-wider block">
                  Backup ({item.backupResponders.length})
                </span>
              </div>

              {item.backupResponders.length === 0 ? (
                <span className="text-[11px] text-stone-400 italic block pl-1">No backup assigned</span>
              ) : (
                <div className="space-y-1.5">
                  {visibleBackups.map((resp) => {
                    const initials = getInitials(resp.name);
                    const displayName = formatDisplayName(resp.name);
                    return (
                      <div key={resp.userId} className="flex items-center space-x-2 text-xs">
                        <div className="w-5 h-5 rounded-full bg-stone-100 text-stone-600 text-[9px] font-bold flex items-center justify-center shrink-0">
                          {initials}
                        </div>
                        <span className="font-medium text-stone-800 text-[11px] truncate">{displayName}</span>
                        <span className="text-stone-300">•</span>
                        <span className="text-[10px] text-stone-500 truncate">{formatRoleName(resp.responsibility)}</span>
                        <span className="text-stone-300">•</span>
                        <span className={`text-[10px] font-semibold ${resp.readyDevices > 0 ? 'text-emerald-700' : 'text-amber-600'}`}>
                          {resp.readyDevices > 0 ? 'Ready' : 'No device'}
                        </span>
                      </div>
                    );
                  })}

                  {hiddenBackupsCount > 0 && (
                    <div className="relative pt-0.5">
                      <button
                        onClick={() => setShowBackupsPopover(!showBackupsPopover)}
                        className="text-[10px] font-bold text-[#C59B27] hover:text-[#A47F1E] hover:underline cursor-pointer"
                      >
                        +{hiddenBackupsCount} more backup{hiddenBackupsCount > 1 ? 's' : ''}
                      </button>

                      {showBackupsPopover && (
                        <div className="absolute left-0 top-full mt-1 z-30 bg-white border border-stone-200 rounded-xl p-3 shadow-lg w-64 space-y-2 animate-fade-in">
                          <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">All Backup Responders</span>
                          {item.backupResponders.map((r) => (
                            <div key={r.userId} className="text-xs space-y-0.5 border-b border-stone-100 pb-1.5 last:border-0 last:pb-0">
                              <div className="font-semibold text-stone-900">{formatDisplayName(r.name)}</div>
                              <div className="text-[10px] text-stone-500 flex items-center space-x-1.5">
                                <span>{formatRoleName(r.responsibility)}</span>
                                <span>•</span>
                                <span className={r.readyDevices > 0 ? 'text-emerald-700 font-semibold' : 'text-amber-600 font-semibold'}>
                                  {r.readyDevices > 0 ? 'Device ready' : 'No device'}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </td>

        {/* 4. Device Readiness (140-160px) */}
        <td className="p-4 align-top w-40 min-w-[140px]">
          <div className="space-y-2">
            <span className="text-[10px] font-mono font-bold text-stone-400 uppercase tracking-wider block">
              Device readiness
            </span>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs font-semibold text-stone-800">
                <span>{totalCount > 0 ? `${readyCount} of ${totalCount} ready` : 'No devices'}</span>
                <span className="text-[10px] font-mono text-stone-400">{readinessPercent}%</span>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-stone-100 h-2 rounded-full overflow-hidden flex border border-stone-200/60">
                <div 
                  className={`h-full transition-all duration-300 ${readyCount === totalCount && totalCount > 0 ? 'bg-emerald-500' : readyCount > 0 ? 'bg-amber-500' : 'bg-stone-300'}`}
                  style={{ width: `${readinessPercent}%` }}
                />
              </div>

              <p className="text-[10px] text-stone-500 font-medium pt-0.5">
                {totalCount === 0 
                  ? 'No responder devices' 
                  : (totalCount - readyCount) > 0 
                  ? `${totalCount - readyCount} device needs attention` 
                  : 'All responder devices active'}
              </p>
            </div>
          </div>
        </td>

        {/* 5. Coverage Status (130-150px) */}
        <td className="p-4 align-top w-36 min-w-[130px]">
          <div className="space-y-1.5">
            <span className="text-[10px] font-mono font-bold text-stone-400 uppercase tracking-wider block">
              Coverage
            </span>

            <span className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${
              isComplete 
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200/80' 
                : isLimited 
                ? 'bg-amber-50 text-amber-800 border-amber-200/80' 
                : isNoCoverage 
                ? 'bg-rose-50 text-rose-800 border-rose-200/80'
                : 'bg-purple-50 text-purple-800 border-purple-200/80'
            }`}>
              {isComplete && <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
              {isLimited && <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />}
              {isNoCoverage && <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />}
              {isRoutingIssue && <AlertCircle className="w-3.5 h-3.5 text-purple-600 shrink-0" />}
              <span>{item.coverageStatus}</span>
            </span>

            <p className="text-[10px] text-stone-500 font-medium leading-tight">
              {statusReason}
            </p>
          </div>
        </td>

        {/* 6. Action (200-230px) */}
        <td className="p-4 align-top w-56 min-w-[200px]">
          <div className="space-y-2">
            <span className="text-[10px] font-mono font-bold text-stone-400 uppercase tracking-wider block">
              Action
            </span>

            <p className="text-xs text-stone-700 font-semibold leading-tight">
              {actionTitle}
            </p>

            <div className="flex items-center space-x-2 pt-1">
              {isNoCoverage ? (
                <button
                  onClick={() => onNavigateTab?.('event_team')}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center space-x-1.5 cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Assign responder</span>
                </button>
              ) : isLimited ? (
                <button
                  onClick={() => onNavigateTab?.('event_team')}
                  className="px-3 py-1.5 bg-[#C59B27] hover:bg-[#A47F1E] text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center space-x-1.5 cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Assign backup</span>
                </button>
              ) : isRoutingIssue ? (
                <button
                  onClick={() => onNavigateTab?.('alert_routing')}
                  className="px-3 py-1.5 bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center space-x-1.5 cursor-pointer"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>Review routing</span>
                </button>
              ) : (
                <button
                  onClick={() => onNavigateTab?.('alert_routing')}
                  className="px-3 py-1.5 bg-white hover:bg-stone-50 border border-stone-200 text-stone-800 text-xs font-bold rounded-xl transition-all shadow-2xs flex items-center space-x-1.5 cursor-pointer"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-stone-500" />
                  <span>View rule</span>
                </button>
              )}

              {/* Expand Toggle */}
              <button
                onClick={onToggleExpand}
                className="p-1.5 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-colors cursor-pointer"
                title={isExpanded ? "Collapse details" : "View full details"}
              >
                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </td>
      </tr>

      {/* EXPANDABLE DETAILS PANEL */}
      {isExpanded && (
        <tr className="bg-amber-50/30 border-b border-stone-200">
          <td colSpan={6} className="p-6">
            <div className="space-y-4 animate-fade-in text-xs">
              <div className="flex items-center justify-between border-b border-stone-200/80 pb-3">
                <div className="flex items-center space-x-2">
                  <ShieldCheck className="w-5 h-5 text-[#C59B27]" />
                  <span className="font-bold text-sm text-stone-900">{item.name} — Full Coverage Breakdown</span>
                </div>
                <button
                  onClick={onToggleExpand}
                  className="text-stone-500 hover:text-stone-800 text-xs font-semibold cursor-pointer"
                >
                  Close details
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Panel Column 1: Expected Roles & Criteria */}
                <div className="bg-white p-4 rounded-2xl border border-stone-200/80 space-y-3 shadow-2xs">
                  <span className="text-[10px] font-mono font-bold text-stone-400 uppercase tracking-wider block">Required Response Roles</span>
                  <div className="space-y-1.5">
                    {item.expectedRoles.map((r, i) => (
                      <div key={i} className="flex items-center justify-between bg-stone-50 p-2 rounded-xl border border-stone-100">
                        <span className="font-semibold text-stone-800">{formatRoleName(r)}</span>
                        <span className="text-[10px] font-mono text-stone-400">{r}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-stone-500 leading-relaxed pt-1">
                    Alerts routed to this category require active on-duty personnel matching these assigned roles.
                  </p>
                </div>

                {/* Panel Column 2: All Primary & Backup Personnel */}
                <div className="bg-white p-4 rounded-2xl border border-stone-200/80 space-y-3 shadow-2xs md:col-span-2">
                  <span className="text-[10px] font-mono font-bold text-stone-400 uppercase tracking-wider block">Assigned Personnel Details</span>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Primary List */}
                    <div className="space-y-2">
                      <span className="font-bold text-stone-700 text-xs block">Primary Responders</span>
                      {item.primaryResponders.length === 0 ? (
                        <p className="text-amber-700 text-xs bg-amber-50 p-3 rounded-xl border border-amber-200 font-medium">
                          No primary responder assigned. Navigate to Event Team to assign a responder to this category role.
                        </p>
                      ) : (
                        item.primaryResponders.map((p) => (
                          <div key={p.userId} className="p-2.5 bg-stone-50 rounded-xl border border-stone-200/80 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-stone-900">{formatDisplayName(p.name)}</span>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${p.onDuty ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-200 text-stone-700'}`}>
                                {p.onDuty ? 'On Duty' : 'Off Duty'}
                              </span>
                            </div>
                            <div className="text-[11px] text-stone-600">{formatRoleName(p.responsibility)}</div>
                            <div className="text-[10px] text-stone-500 flex items-center space-x-1">
                              <Smartphone className="w-3 h-3 text-stone-400" />
                              <span>{p.readyDevices > 0 ? `${p.readyDevices} device(s) ready` : 'No active device'}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Backup List */}
                    <div className="space-y-2">
                      <span className="font-bold text-stone-700 text-xs block">Backup Responders</span>
                      {item.backupResponders.length === 0 ? (
                        <p className="text-stone-500 text-xs bg-stone-50 p-3 rounded-xl border border-stone-200 font-medium">
                          No backup responders currently configured.
                        </p>
                      ) : (
                        item.backupResponders.map((b) => (
                          <div key={b.userId} className="p-2.5 bg-stone-50 rounded-xl border border-stone-200/80 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-stone-800">{formatDisplayName(b.name)}</span>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${b.onDuty ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-200 text-stone-700'}`}>
                                {b.onDuty ? 'On Duty' : 'Off Duty'}
                              </span>
                            </div>
                            <div className="text-[11px] text-stone-600">{formatRoleName(b.responsibility)}</div>
                            <div className="text-[10px] text-stone-500 flex items-center space-x-1">
                              <Smartphone className="w-3 h-3 text-stone-400" />
                              <span>{b.readyDevices > 0 ? `${b.readyDevices} device(s) ready` : 'No active device'}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-end space-x-2 border-t border-stone-100">
                    <button
                      onClick={() => onNavigateTab?.('event_team')}
                      className="px-3 py-1.5 bg-[#C59B27] text-white text-xs font-bold rounded-xl hover:bg-[#A47F1E] transition-all shadow-xs cursor-pointer"
                    >
                      Manage Event Team Assignments
                    </button>
                    <button
                      onClick={() => onNavigateTab?.('alert_routing')}
                      className="px-3 py-1.5 bg-white border border-stone-200 text-stone-800 text-xs font-bold rounded-xl hover:bg-stone-50 transition-all cursor-pointer"
                    >
                      Manage Routing Rules
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
