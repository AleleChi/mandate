import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  CheckCircle, 
  AlertCircle 
} from 'lucide-react';

const REAL_EVENT_ID = 'the-general-assembly-2026';

interface CoverageSummary {
  totalActiveResponders: number;
  criticalGapsCount: number;
  averageOnDutyPerCategory: number;
  unmappedCategoriesCount: number;
}

interface CoverageItem {
  categoryKey: string;
  categoryName: string;
  assignedRoles: string[];
  primaryOnDutyCount: number;
  backupOnDutyCount: number;
  riskLevel: 'optimal' | 'adequate' | 'low' | 'critical';
  recommendation: string;
}

export default function ResponseCoverageTab() {
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [summary, setSummary] = useState<CoverageSummary>({
    totalActiveResponders: 0,
    criticalGapsCount: 0,
    averageOnDutyPerCategory: 0.0,
    unmappedCategoriesCount: 0
  });
  const [coverageList, setCoverageList] = useState<CoverageItem[]>([]);

  const fetchCoverageReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/duty/events/${REAL_EVENT_ID}/response-coverage`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setSummary(data.summary || {
            totalActiveResponders: 0,
            criticalGapsCount: 0,
            averageOnDutyPerCategory: 0.0,
            unmappedCategoriesCount: 0
          });
          setCoverageList(data.coverage || []);
        } else {
          setError(data.error || 'Failed to generate live coverage assessment');
        }
      } else {
        setError('Failed to fetch coverage report');
      }
    } catch (err) {
      console.error('Failed fetching coverage report:', err);
      setError('An error occurred during coverage computation');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCoverageReport();
  }, []);

  return (
    <div className="space-y-6 animate-fade-in" data-view-version="admin-response-coverage-v1">
      {success && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-950 rounded-2xl flex items-center space-x-2 text-xs font-semibold animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{success}</span>
        </div>
      )}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-950 rounded-2xl flex items-center space-x-2 text-xs font-semibold animate-fade-in">
          <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#EAE8E1] pb-4">
        <div>
          <h2 className="text-lg font-bold text-zinc-900 font-sans tracking-tight">Roster Coverage & Risk Assessment</h2>
          <p className="text-xs text-zinc-500">Live auditing comparing active on-duty devices and schedules against current incident routing policies.</p>
        </div>
        <button
          onClick={fetchCoverageReport}
          disabled={loading}
          className="flex items-center space-x-2 px-3.5 py-2 bg-white hover:bg-zinc-50 border border-[#EAE8E1] text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-[#C59B27] ${loading ? 'animate-spin' : ''}`} />
          <span>Re-compute Coverage</span>
        </button>
      </div>

      {loading && coverageList.length === 0 ? (
        <div className="p-12 text-center text-xs text-zinc-500 bg-white border border-[#EAE8E1] rounded-3xl">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-[#C59B27]" />
          <span>Computing coverage matrices...</span>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Summary KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-[#EAE8E1] p-5 rounded-2xl space-y-1 shadow-2xs">
              <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider">Active Responders</span>
              <div className="text-2xl font-bold text-zinc-900 font-mono tracking-tight">{summary.totalActiveResponders}</div>
              <p className="text-[10px] font-semibold text-zinc-500">On-duty team members</p>
            </div>

            <div className="bg-white border border-[#EAE8E1] p-5 rounded-2xl space-y-1 shadow-2xs">
              <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider">Coverage Gaps</span>
              <div className={`text-2xl font-bold font-mono tracking-tight ${summary.criticalGapsCount > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                {summary.criticalGapsCount}
              </div>
              <p className="text-[10px] font-semibold text-zinc-500">Categories with zero coverage</p>
            </div>

            <div className="bg-white border border-[#EAE8E1] p-5 rounded-2xl space-y-1 shadow-2xs">
              <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider">Average Depth</span>
              <div className="text-2xl font-bold text-zinc-900 font-mono tracking-tight">
                {Number(summary.averageOnDutyPerCategory).toFixed(1)}
              </div>
              <p className="text-[10px] font-semibold text-zinc-500">Responders per category</p>
            </div>

            <div className="bg-white border border-[#EAE8E1] p-5 rounded-2xl space-y-1 shadow-2xs">
              <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider">Routing Errors</span>
              <div className={`text-2xl font-bold font-mono tracking-tight ${summary.unmappedCategoriesCount > 0 ? 'text-amber-600' : 'text-zinc-500'}`}>
                {summary.unmappedCategoriesCount}
              </div>
              <p className="text-[10px] font-semibold text-zinc-500">Unmapped alert categories</p>
            </div>
          </div>

          {/* Matrix assessment Table */}
          <div className="bg-white border border-[#EAE8E1] rounded-3xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#FAF9F5] border-b border-[#EAE8E1] text-zinc-500 font-mono text-[10px] uppercase tracking-wider">
                    <th className="p-4 font-bold">Alert Category</th>
                    <th className="p-4 font-bold">Assigned Roles</th>
                    <th className="p-4 font-bold">Primary On-Duty</th>
                    <th className="p-4 font-bold">Backup On-Duty</th>
                    <th className="p-4 font-bold">Coverage Status</th>
                    <th className="p-4 font-bold">Response Guideline / Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 font-semibold text-zinc-700">
                  {coverageList.map((item) => {
                    const isOptimal = item.riskLevel === 'optimal';
                    const isAdequate = item.riskLevel === 'adequate';
                    const isLow = item.riskLevel === 'low';
                    const isCritical = item.riskLevel === 'critical';

                    return (
                      <tr key={item.categoryKey} className="hover:bg-zinc-50/50 transition-colors">
                        <td className="p-4 font-bold text-zinc-900">
                          {item.categoryName}
                        </td>
                        <td className="p-4">
                          <div className="flex flex-wrap gap-1">
                            {item.assignedRoles.map((role, idx) => (
                              <span key={idx} className="bg-[#FAF9F5] border border-[#EAE8E1] text-[10px] px-2 py-0.5 rounded-md text-zinc-600">
                                {role}
                              </span>
                            ))}
                            {item.assignedRoles.length === 0 && (
                              <span className="text-rose-600 text-[10px] font-bold">UNASSIGNED POLICY</span>
                            )}
                          </div>
                        </td>
                        <td className="p-4 text-center font-mono font-bold text-sm text-zinc-800">
                          {item.primaryOnDutyCount}
                        </td>
                        <td className="p-4 text-center font-mono font-bold text-sm text-zinc-800">
                          {item.backupOnDutyCount}
                        </td>
                        <td className="p-4">
                          <span className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                            isOptimal 
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                              : isAdequate 
                              ? 'bg-blue-50 text-blue-700 border-blue-200' 
                              : isLow 
                              ? 'bg-amber-50 text-amber-700 border-amber-200' 
                              : 'bg-rose-50 text-rose-700 border-rose-200 animate-pulse'
                          }`}>
                            {isOptimal && <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />}
                            {isAdequate && <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />}
                            {isLow && <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />}
                            {isCritical && <AlertCircle className="w-3.5 h-3.5 text-rose-600" />}
                            <span className="uppercase">{item.riskLevel} COVERAGE</span>
                          </span>
                        </td>
                        <td className="p-4 text-xs text-zinc-500 font-semibold leading-relaxed max-w-xs">
                          {item.recommendation}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
