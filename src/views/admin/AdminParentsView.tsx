import React, { useEffect, useState, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Users,
  Search,
  RotateCcw,
  Trash2,
  Plus,
  MoreHorizontal,
  AlertTriangle,
  ChevronDown,
  MapPin,
  Briefcase,
  ShieldCheck,
  Download,
  Eye,
  X,
  Filter,
  CheckCircle2,
  MessageSquare,
  Home,
  Globe,
  Building2,
  UserCheck,
  HeartHandshake
} from 'lucide-react';
import { api, extractApiError } from '../../services/api';
import { useNotification } from '../../context/NotificationContext';
import { Button } from '../../components/common/Button';
import { KoinoniaInlineLoader } from '../../components/common/KoinoniaInlineLoader';
import { AddParentModal } from '../../components/admin/modals/AddParentModal';
import { AdminSelectionCheckbox } from '../../components/common/AdminSelectionCheckbox';
import { AppRoute } from '../../types';

interface AdminParentsViewProps {
  onBackToOverview?: () => void;
  onNavigate: (route: AppRoute) => void;
  adminUser?: any;
}

type ParentTab = 'active' | 'removed';
type WorkerFilterType = 'all' | 'worker' | 'non_worker';
type ChildrenFilterType = 'all' | 'has_children' | 'no_children';
type LocationFilterType = 'all' | 'has_location' | 'missing_location';

export const AdminParentsView: React.FC<AdminParentsViewProps> = ({ onNavigate, adminUser }) => {
  const isSuperAdmin = adminUser?.role === 'super_admin';
  const { showError, showSuccess } = useNotification();
  const [parents, setParents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<ParentTab>('active');

  // Enhanced Filter States
  const [workerFilter, setWorkerFilter] = useState<WorkerFilterType>('all');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [selectedCountry, setSelectedCountry] = useState<string>('all');
  const [selectedState, setSelectedState] = useState<string>('all');
  const [selectedCity, setSelectedCity] = useState<string>('all');
  const [hasChildrenFilter, setHasChildrenFilter] = useState<ChildrenFilterType>('all');
  const [hasLocationFilter, setHasLocationFilter] = useState<LocationFilterType>('all');
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);

  // Available filter options returned by backend
  const [filterOptions, setFilterOptions] = useState<{
    departments: { department: string; count: number }[];
    countries: { country: string; count: number }[];
    states: { state_region: string; count: number }[];
    cities: { city: string; count: number }[];
  }>({
    departments: [],
    countries: [],
    states: [],
    cities: []
  });

  // Bulk selection & actions
  const [selectedParentIds, setSelectedParentIds] = useState<string[]>([]);
  const [showBulkRemoveModal, setShowBulkRemoveModal] = useState(false);
  const [bulkRemoveReason, setBulkRemoveReason] = useState('');
  const [submittingBulkRemove, setSubmittingBulkRemove] = useState(false);
  const [showBulkRestoreModal, setShowBulkRestoreModal] = useState(false);
  const [submittingBulkRestore, setSubmittingBulkRestore] = useState(false);
  const [bulkMoreDropdownOpen, setBulkMoreDropdownOpen] = useState(false);
  const bulkMoreDropdownRef = useRef<HTMLDivElement>(null);

  // Bulk Permanent Delete
  const [showBulkPurgeModal, setShowBulkPurgeModal] = useState(false);
  const [bulkPurgeConfirmText, setBulkPurgeConfirmText] = useState('');
  const [submittingBulkPurge, setSubmittingBulkPurge] = useState(false);

  // Stats across parents
  const [stats, setStats] = useState({
    parents: 0,
    childrenLinked: 0,
    teamMembers: 0,
    regularParents: 0,
    locationsCount: 0,
    whatsAppNumbers: 0,
    whatsAppOptedIn: 0
  });

  // Quick View Modal
  const [quickViewParent, setQuickViewParent] = useState<any | null>(null);

  // Overflow menu state per row
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);
  const actionMenuRef = useRef<HTMLDivElement | null>(null);

  // Soft remove confirmation modal
  const [parentToRemove, setParentToRemove] = useState<any | null>(null);
  const [removeReason, setRemoveReason] = useState('');
  const [submittingRemove, setSubmittingRemove] = useState(false);

  // Restore confirmation modal
  const [parentToRestore, setParentToRestore] = useState<any | null>(null);
  const [submittingRestore, setSubmittingRestore] = useState(false);

  // Permanent delete modal
  const [parentToDelete, setParentToDelete] = useState<any | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [submittingDelete, setSubmittingDelete] = useState(false);

  // Add parent modal
  const [showAddParentModal, setShowAddParentModal] = useState(false);

  // Active filters count
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (workerFilter !== 'all') count++;
    if (selectedDepartment !== 'all') count++;
    if (selectedCountry !== 'all') count++;
    if (selectedState !== 'all') count++;
    if (selectedCity !== 'all') count++;
    if (hasChildrenFilter !== 'all') count++;
    if (hasLocationFilter !== 'all') count++;
    if (searchQuery.trim()) count++;
    return count;
  }, [
    workerFilter,
    selectedDepartment,
    selectedCountry,
    selectedState,
    selectedCity,
    hasChildrenFilter,
    hasLocationFilter,
    searchQuery
  ]);

  const handleResetFilters = () => {
    setSearchQuery('');
    setWorkerFilter('all');
    setSelectedDepartment('all');
    setSelectedCountry('all');
    setSelectedState('all');
    setSelectedCity('all');
    setHasChildrenFilter('all');
    setHasLocationFilter('all');
  };

  const fetchParents = async () => {
    setLoading(true);
    try {
      const res = await api.admin.getParents({
        q: searchQuery,
        status: activeTab,
        workerStatus: workerFilter,
        department: selectedDepartment,
        country: selectedCountry,
        stateRegion: selectedState,
        city: selectedCity,
        hasChildren: hasChildrenFilter,
        hasLocation: hasLocationFilter
      });

      if (res.success) {
        const list = res.parents || [];
        setParents(list);

        if (res.filterOptions) {
          setFilterOptions(res.filterOptions);
        }

        // Calculate statistics based on fetched slice or entire active list
        const distinctCities = new Set(
          list.map((p: any) => p.city).filter((c: any) => Boolean(c && String(c).trim()))
        );

        setStats({
          parents: list.length,
          childrenLinked: list.reduce((sum: number, p: any) => sum + Number(p.childrenCount || 0), 0),
          teamMembers: list.filter((p: any) => p.isKoinoniaWorker).length,
          regularParents: list.filter((p: any) => !p.isKoinoniaWorker).length,
          locationsCount: distinctCities.size,
          whatsAppNumbers: list.filter((p: any) => Boolean(p.whatsapp && String(p.whatsapp).trim())).length,
          whatsAppOptedIn: list.filter((p: any) => p.whatsappConsentStatus === 'opted_in').length
        });
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Unable to load parents', parsed.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchParents();
  }, [
    searchQuery,
    activeTab,
    workerFilter,
    selectedDepartment,
    selectedCountry,
    selectedState,
    selectedCity,
    hasChildrenFilter,
    hasLocationFilter
  ]);

  // Clear bulk selection on tab switch or search change
  useEffect(() => {
    setSelectedParentIds([]);
  }, [
    searchQuery,
    activeTab,
    workerFilter,
    selectedDepartment,
    selectedCountry,
    selectedState,
    selectedCity
  ]);

  const isAllVisibleSelected = parents.length > 0 && parents.every(p => selectedParentIds.includes(String(p.id)));
  const isSomeVisibleSelected = parents.some(p => selectedParentIds.includes(String(p.id)));
  const isIndeterminate = isSomeVisibleSelected && !isAllVisibleSelected;

  const handleToggleSelectAll = () => {
    if (isAllVisibleSelected) {
      setSelectedParentIds([]);
    } else {
      setSelectedParentIds(parents.map(p => String(p.id)));
    }
  };

  const handleToggleSelectParent = (id: string) => {
    setSelectedParentIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleBulkRemoveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingBulkRemove(true);
    try {
      const res = await api.admin.bulkRemoveParents({
        parentIds: selectedParentIds,
        reason: bulkRemoveReason || undefined
      });
      if (res.success) {
        showSuccess('Parents removed', `${res.count} parent(s) moved to Removed. Linked children and event history are preserved.`);
        setShowBulkRemoveModal(false);
        setBulkRemoveReason('');
        setSelectedParentIds([]);
        fetchParents();
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Removal failed', parsed.message);
    } finally {
      setSubmittingBulkRemove(false);
    }
  };

  const handleBulkRestoreSubmit = async () => {
    setSubmittingBulkRestore(true);
    try {
      const res = await api.admin.bulkRestoreParents({
        parentIds: selectedParentIds
      });
      if (res.success) {
        showSuccess('Parents restored', `${res.count} parent(s) restored to Active.`);
        setShowBulkRestoreModal(false);
        setSelectedParentIds([]);
        fetchParents();
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Restore failed', parsed.message);
    } finally {
      setSubmittingBulkRestore(false);
    }
  };

  const handleBulkPurge = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (submittingBulkPurge || selectedParentIds.length === 0) return;
    setSubmittingBulkPurge(true);
    try {
      const res = await api.admin.bulkPermanentlyDeleteParents({
        parentIds: selectedParentIds,
        confirmText: 'DELETE',
        reason: 'Bulk permanent deletion by Super Admin'
      });
      if (res.success && (res.count > 0 || !res.failures || res.failures.length === 0)) {
        showSuccess('Parents permanently deleted', `${res.count ?? selectedParentIds.length} parent(s) permanently deleted.`);
        setShowBulkPurgeModal(false);
        setBulkPurgeConfirmText('');
        setSelectedParentIds([]);
        fetchParents();
      } else if (res.failures && res.failures.length > 0) {
        showError('Permanent delete failed', res.failures[0]?.reason || "We couldn't permanently delete selected parents.");
      } else {
        showError('Permanent delete failed', res.message || "We couldn't permanently delete selected parents. Nothing was changed.");
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Permanent delete failed', parsed.message || "We couldn't permanently delete selected parents. Nothing was changed.");
    } finally {
      setSubmittingBulkPurge(false);
    }
  };

  // Close overflow action menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (actionMenuRef.current && !actionMenuRef.current.contains(e.target as Node)) {
        setOpenActionMenuId(null);
      }
      if (bulkMoreDropdownRef.current && !bulkMoreDropdownRef.current.contains(e.target as Node)) {
        setBulkMoreDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleTabChange = (tab: ParentTab) => {
    setActiveTab(tab);
    setOpenActionMenuId(null);
    setBulkMoreDropdownOpen(false);
    setSelectedParentIds([]);
  };

  const handleRemoveParentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!parentToRemove) return;
    setSubmittingRemove(true);
    try {
      const res = await api.admin.removeParent(parentToRemove.id, removeReason);
      if (res.success) {
        showSuccess('Parent removed', 'Their account will move to Removed and can be restored later.');
        setParentToRemove(null);
        setRemoveReason('');
        setOpenActionMenuId(null);
        fetchParents();
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Action failed', parsed.message);
    } finally {
      setSubmittingRemove(false);
    }
  };

  const handleRestoreParentSubmit = async () => {
    if (!parentToRestore) return;
    setSubmittingRestore(true);
    try {
      const res = await api.admin.restoreParent(parentToRestore.id);
      if (res.success) {
        showSuccess('Parent restored', 'The parent profile has been restored to Active.');
        setParentToRestore(null);
        setOpenActionMenuId(null);
        fetchParents();
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Action failed', parsed.message);
    } finally {
      setSubmittingRestore(false);
    }
  };

  const handlePermanentDeleteSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!parentToDelete || submittingDelete) return;
    setSubmittingDelete(true);
    try {
      const res = await api.admin.permanentlyDeleteParent(parentToDelete.id, {
        reason: 'Single permanent deletion by Super Admin',
        confirmation: 'DELETE'
      });
      if (res.success) {
        showSuccess('Parent permanently deleted', `${getDisplayName(parentToDelete)} was permanently deleted.`);
        setParentToDelete(null);
        setDeleteReason('');
        setDeleteConfirmationText('');
        setOpenActionMenuId(null);
        fetchParents();
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Permanent delete failed', parsed.message || "We couldn't permanently delete this parent. Nothing was changed.");
    } finally {
      setSubmittingDelete(false);
    }
  };

  // Export filtered parents list as CSV
  const handleExportCSV = () => {
    if (parents.length === 0) {
      showError('Export empty', 'There are no parents matching your current filters.');
      return;
    }

    const headers = [
      'Full Name',
      'Worker Status',
      'Department',
      'Email',
      'Phone Number',
      'WhatsApp Number',
      'Country',
      'State/Region',
      'City',
      'Home Address',
      'Children Count',
      'Children Names',
      'Account Status',
      'Created Date'
    ];

    const escapeCsv = (val: any) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = parents.map(p => {
      const childrenNames = (p.children || []).map((c: any) => `${c.fullName}${c.age ? ` (${c.age}y)` : ''}`).join('; ');
      return [
        escapeCsv(p.fullName),
        escapeCsv(p.isKoinoniaWorker ? 'Koinonia Worker' : 'Parent'),
        escapeCsv(p.department || ''),
        escapeCsv(p.email || ''),
        escapeCsv(p.phone || ''),
        escapeCsv(p.whatsapp || ''),
        escapeCsv(p.country || ''),
        escapeCsv(p.stateRegion || ''),
        escapeCsv(p.city || ''),
        escapeCsv(p.homeAddress || ''),
        escapeCsv(p.childrenCount || 0),
        escapeCsv(childrenNames),
        escapeCsv(p.isDeleted ? 'Removed' : 'Active'),
        escapeCsv(p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '')
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `koinonia_parents_directory_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showSuccess('Export Complete', `Exported ${parents.length} parent records to CSV.`);
  };

  const getInitials = (name: any): string => {
    if (!name || typeof name !== 'string') return 'P';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'P';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const getDisplayName = (p: any): string => {
    const raw = typeof p?.fullName === 'string' ? p.fullName.trim() : '';
    if (!raw || raw.toLowerCase() === 'invited user') return 'Invited parent';
    return raw;
  };

  const formatChildrenCount = (count: number): string => {
    if (count === 1) return '1 child';
    return `${count} children`;
  };

  const isDomReady = typeof document !== 'undefined' && Boolean(document.body);

  // ---- QUICK FAMILY OVERVIEW MODAL ----
  // ---- QUICK FAMILY OVERVIEW MODAL ----
  const quickViewModal = (quickViewParent && isDomReady) ? createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div
        onClick={() => setQuickViewParent(null)}
        className="fixed inset-0 bg-black/50 transition-opacity backdrop-blur-2xs"
      />
      <div className="relative bg-[#FFFDF9] dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#2A2926] rounded-xl w-full max-w-xl shadow-xl overflow-hidden text-neutral-900 dark:text-neutral-100">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#EAE8E1] dark:border-[#2A2926] bg-[#FAF9F6] dark:bg-[#20201E]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-[#C59B27]/10 text-[#C59B27] flex items-center justify-center font-bold text-sm shrink-0 border border-[#C59B27]/20">
              {getInitials(getDisplayName(quickViewParent))}
            </div>
            <div>
              <h3 className="font-semibold text-sm text-neutral-900 dark:text-neutral-100 leading-tight flex items-center gap-2">
                <span>{getDisplayName(quickViewParent)}</span>
                {quickViewParent.isKoinoniaWorker && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#C59B27]/15 text-[#C59B27] border border-[#C59B27]/30">
                    Worker
                  </span>
                )}
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{quickViewParent.email || 'No email registered'}</p>
            </div>
          </div>
          <button
            onClick={() => setQuickViewParent(null)}
            className="p-1 rounded-md text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-[#20201E] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-5 max-h-[75vh] overflow-y-auto text-xs">
          {/* Quick Stat Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <div className="p-3 rounded-md bg-neutral-50/70 dark:bg-[#20201E] border border-[#EAE8E1] dark:border-[#2A2926]">
              <span className="text-[10px] font-medium text-neutral-400 dark:text-neutral-500 uppercase tracking-wider block mb-1">Role / Status</span>
              <p className="font-semibold text-neutral-900 dark:text-neutral-100">
                {quickViewParent.isKoinoniaWorker ? `Worker (${quickViewParent.department || 'General'})` : 'Regular Parent'}
              </p>
            </div>

            <div className="p-3 rounded-md bg-neutral-50/70 dark:bg-[#20201E] border border-[#EAE8E1] dark:border-[#2A2926]">
              <span className="text-[10px] font-medium text-neutral-400 dark:text-neutral-500 uppercase tracking-wider block mb-1">Phone & WhatsApp</span>
              <p className="font-semibold text-neutral-900 dark:text-neutral-100">
                {quickViewParent.phone || 'None'}
              </p>
            </div>

            <div className="p-3 rounded-md bg-neutral-50/70 dark:bg-[#20201E] border border-[#EAE8E1] dark:border-[#2A2926] col-span-2 sm:col-span-1">
              <span className="text-[10px] font-medium text-neutral-400 dark:text-neutral-500 uppercase tracking-wider block mb-1">Children Registered</span>
              <p className="font-semibold text-[#C59B27]">
                {formatChildrenCount(quickViewParent.childrenCount || 0)}
              </p>
            </div>
          </div>

          {/* Location Origin Section */}
          <div className="p-3.5 rounded-md bg-[#FAF9F6] dark:bg-[#20201E] border border-[#EAE8E1] dark:border-[#2A2926] space-y-2">
            <div className="flex items-center gap-1.5 font-semibold text-neutral-900 dark:text-neutral-100">
              <MapPin className="w-3.5 h-3.5 text-[#C59B27]" />
              <span>Geographic Origin & Residence</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 border-t border-[#EAE8E1] dark:border-[#2A2926]">
              <div>
                <span className="text-[10px] text-neutral-400 dark:text-neutral-500 block">City</span>
                <span className="font-medium text-neutral-800 dark:text-neutral-200">{quickViewParent.city || 'Not specified'}</span>
              </div>
              <div>
                <span className="text-[10px] text-neutral-400 dark:text-neutral-500 block">State / Region</span>
                <span className="font-medium text-neutral-800 dark:text-neutral-200">{quickViewParent.stateRegion || 'Not specified'}</span>
              </div>
              <div>
                <span className="text-[10px] text-neutral-400 dark:text-neutral-500 block">Country</span>
                <span className="font-medium text-neutral-800 dark:text-neutral-200">{quickViewParent.country || 'Nigeria'}</span>
              </div>
            </div>
            {quickViewParent.homeAddress && (
              <div className="pt-2 border-t border-[#EAE8E1] dark:border-[#2A2926]">
                <span className="text-[10px] text-neutral-400 dark:text-neutral-500 block">Home Address</span>
                <p className="text-neutral-700 dark:text-neutral-300 font-medium leading-relaxed">{quickViewParent.homeAddress}</p>
              </div>
            )}
          </div>

          {/* Connected Children Section */}
          <div className="space-y-2.5">
            <h4 className="font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-[#C59B27]" />
              <span>Connected Children ({quickViewParent.children?.length || 0})</span>
            </h4>

            {(!quickViewParent.children || quickViewParent.children.length === 0) ? (
              <div className="p-3.5 rounded-md bg-neutral-50 dark:bg-[#20201E] border border-[#EAE8E1] dark:border-[#2A2926] text-center text-neutral-400 dark:text-neutral-500">
                No children profiles linked to this parent yet.
              </div>
            ) : (
              <div className="space-y-1.5">
                {quickViewParent.children.map((child: any) => (
                  <div
                    key={child.id}
                    className="p-3 rounded-md bg-white dark:bg-[#20201E] border border-[#EAE8E1] dark:border-[#2A2926] flex items-center justify-between"
                  >
                    <div>
                      <p className="font-semibold text-neutral-900 dark:text-neutral-100">{child.fullName}</p>
                      <p className="text-[11px] text-neutral-400 dark:text-neutral-500">
                        {child.gender || 'Unknown gender'} · {child.age ? `${child.age} yrs` : 'Age not calculated'} {child.ageGroup ? `(${child.ageGroup})` : ''}
                      </p>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40">
                      Registered
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 bg-[#FAF9F6] dark:bg-[#20201E] border-t border-[#EAE8E1] dark:border-[#2A2926] flex items-center justify-between">
          <button
            onClick={() => {
              const pid = quickViewParent.id;
              setQuickViewParent(null);
              onNavigate(`/admin/parents/${pid}` as AppRoute);
            }}
            className="text-xs font-semibold text-[#C59B27] hover:text-[#B08921] transition-colors cursor-pointer"
          >
            Open Full Profile & History →
          </button>
          <Button
            onClick={() => setQuickViewParent(null)}
            variant="secondary"
            className="px-3.5 py-1.5 text-xs rounded-md"
          >
            Close
          </Button>
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  // ---- PORTAL MODALS ----
  const removeModal = (parentToRemove && isDomReady) ? createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div
        onClick={() => setParentToRemove(null)}
        className="fixed inset-0 bg-black/50 backdrop-blur-2xs"
      />
      <div className="relative bg-[#FFFDF9] dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#2A2926] rounded-xl w-full max-w-md shadow-xl p-5 text-neutral-900 dark:text-neutral-100">
        <div className="flex items-center gap-2.5 mb-3 text-amber-600 dark:text-amber-400">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <h4 className="font-semibold text-sm">
            Remove this parent?
          </h4>
        </div>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-4 leading-relaxed">
          Their account will move to Removed and can be restored later. Linked children records remain safe.
        </p>
        <form onSubmit={handleRemoveParentSubmit} className="space-y-3.5">
          <div>
            <label className="text-neutral-500 dark:text-neutral-400 text-[10px] font-semibold uppercase tracking-wider block mb-1">
              Reason for removal (optional)
            </label>
            <textarea
              placeholder="State a reason for your records..."
              value={removeReason}
              onChange={(e) => setRemoveReason(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 text-xs rounded-md border border-[#EAE8E1] dark:border-[#2A2926] focus:outline-none focus:border-red-400 bg-neutral-50 dark:bg-[#20201E] resize-none text-neutral-800 dark:text-neutral-200"
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#EAE8E1] dark:border-[#2A2926]">
            <Button
              type="button"
              onClick={() => setParentToRemove(null)}
              variant="secondary"
              className="px-3.5 py-1.5 text-xs rounded-md"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              loading={submittingRemove}
              disabled={submittingRemove}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-1.5 text-xs font-semibold rounded-md focus:outline-none"
            >
              Remove parent
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  ) : null;

  const restoreModal = (parentToRestore && isDomReady) ? createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div
        onClick={() => setParentToRestore(null)}
        className="fixed inset-0 bg-black/50 backdrop-blur-2xs"
      />
      <div className="relative bg-[#FFFDF9] dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#2A2926] rounded-xl w-full max-w-md shadow-xl p-5 text-neutral-900 dark:text-neutral-100">
        <div className="flex items-center gap-2.5 text-emerald-600 dark:text-emerald-400 mb-3">
          <RotateCcw className="w-5 h-5 shrink-0" />
          <h4 className="font-semibold text-sm">
            Restore this parent?
          </h4>
        </div>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-4 leading-relaxed">
          This parent will be restored and will appear under Active parents again.
        </p>
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#EAE8E1] dark:border-[#2A2926]">
          <Button
            onClick={() => setParentToRestore(null)}
            variant="secondary"
            className="px-3.5 py-1.5 text-xs rounded-md"
          >
            Cancel
          </Button>
          <Button
            onClick={handleRestoreParentSubmit}
            loading={submittingRestore}
            disabled={submittingRestore}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-1.5 text-xs font-semibold rounded-md focus:outline-none"
          >
            Restore parent
          </Button>
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  const permanentDeleteModal = (parentToDelete && isDomReady) ? createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 font-sans" id="confirm-single-parent-delete-modal">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-2xs"
        onClick={() => !submittingDelete && setParentToDelete(null)}
      />
      <div className="relative bg-[#FFFDF9] dark:bg-[#1D1D1A] border border-red-200 dark:border-red-900/40 rounded-xl w-full max-w-md p-5 shadow-xl space-y-3.5 text-neutral-900 dark:text-neutral-100">
        <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
          <Trash2 className="w-5 h-5 shrink-0" />
          <h3 className="font-semibold text-sm">
            Delete {getDisplayName(parentToDelete)} permanently?
          </h3>
        </div>
        <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
          This cannot be undone. The selected parent record will be permanently removed.
        </p>
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#EAE8E1] dark:border-[#2A2926]">
          <Button
            type="button"
            onClick={() => setParentToDelete(null)}
            variant="secondary"
            disabled={submittingDelete}
            className="px-3.5 py-1.5 text-xs rounded-md"
          >
            Cancel
          </Button>
          <button
            type="button"
            onClick={() => handlePermanentDeleteSubmit()}
            disabled={submittingDelete}
            className="px-4 py-1.5 text-xs font-semibold rounded-md bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all"
            id="confirm-single-parent-delete-btn"
          >
            {submittingDelete ? 'Deleting…' : 'Delete permanently'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  const bulkRemoveModal = (showBulkRemoveModal && isDomReady) ? createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div
        onClick={() => setShowBulkRemoveModal(false)}
        className="fixed inset-0 bg-black/50 backdrop-blur-2xs"
      />
      <div className="relative bg-[#FFFDF9] dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#2A2926] rounded-xl w-full max-w-md shadow-xl p-5 text-neutral-900 dark:text-neutral-100">
        <div className="flex items-center gap-2.5 text-red-600 dark:text-red-400 mb-3">
          <Trash2 className="w-5 h-5 shrink-0" />
          <h4 className="font-semibold text-sm">
            Remove {selectedParentIds.length} parents?
          </h4>
        </div>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3 leading-relaxed">
          These parents will be moved to the Removed tab. All linked children and attendance records will be safely preserved.
        </p>
        <form onSubmit={handleBulkRemoveSubmit} className="space-y-3.5">
          <div>
            <label className="text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider block mb-1">
              Reason (optional)
            </label>
            <input
              type="text"
              value={bulkRemoveReason}
              onChange={(e) => setBulkRemoveReason(e.target.value)}
              placeholder="e.g., Requested account closure"
              className="w-full px-3 py-1.5 text-xs rounded-md border border-[#EAE8E1] dark:border-[#2A2926] bg-white dark:bg-[#20201E] focus:outline-none focus:border-[#C59B27] text-neutral-800 dark:text-neutral-200"
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#EAE8E1] dark:border-[#2A2926]">
            <Button
              type="button"
              onClick={() => setShowBulkRemoveModal(false)}
              variant="secondary"
              disabled={submittingBulkRemove}
              className="px-3.5 py-1.5 text-xs rounded-md"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              loading={submittingBulkRemove}
              disabled={submittingBulkRemove}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-1.5 text-xs font-semibold rounded-md focus:outline-none"
            >
              Remove parents
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  ) : null;

  const bulkRestoreModal = (showBulkRestoreModal && isDomReady) ? createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div
        onClick={() => !submittingBulkRestore && setShowBulkRestoreModal(false)}
        className="fixed inset-0 bg-black/50 backdrop-blur-2xs"
      />
      <div className="relative bg-[#FFFDF9] dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#2A2926] rounded-xl w-full max-w-md shadow-xl p-5 text-neutral-900 dark:text-neutral-100">
        <div className="flex items-center gap-2.5 text-emerald-600 dark:text-emerald-400 mb-3">
          <RotateCcw className="w-5 h-5 shrink-0" />
          <h4 className="font-semibold text-sm">
            Restore {selectedParentIds.length} parents?
          </h4>
        </div>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-4 leading-relaxed">
          These parent profiles will be restored and will appear under Active parents again.
        </p>
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#EAE8E1] dark:border-[#2A2926]">
          <Button
            type="button"
            onClick={() => setShowBulkRestoreModal(false)}
            variant="secondary"
            disabled={submittingBulkRestore}
            className="px-3.5 py-1.5 text-xs rounded-md"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            onClick={handleBulkRestoreSubmit}
            loading={submittingBulkRestore}
            disabled={submittingBulkRestore}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-1.5 text-xs font-semibold rounded-md focus:outline-none"
          >
            Restore parents
          </Button>
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  const bulkPurgeModal = (showBulkPurgeModal && isDomReady) ? createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 font-sans">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-2xs"
        onClick={() => !submittingBulkPurge && setShowBulkPurgeModal(false)}
      />
      <div className="relative bg-[#FFFDF9] dark:bg-[#1D1D1A] border border-red-200 dark:border-red-900/40 rounded-xl w-full max-w-md p-5 shadow-xl space-y-3.5 text-neutral-900 dark:text-neutral-100">
        <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
          <Trash2 className="w-5 h-5 shrink-0" />
          <h3 className="font-semibold text-sm">
            Permanently delete {selectedParentIds.length} parents?
          </h3>
        </div>
        <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
          Type <strong>DELETE</strong> below to confirm. This action cannot be reversed.
        </p>
        <input
          type="text"
          value={bulkPurgeConfirmText}
          onChange={(e) => setBulkPurgeConfirmText(e.target.value)}
          placeholder="Type DELETE to confirm"
          className="w-full px-3 py-1.5 text-xs rounded-md border border-red-300 dark:border-red-800 bg-white dark:bg-[#20201E] focus:outline-none focus:border-red-500 text-neutral-800 dark:text-neutral-200"
        />
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#EAE8E1] dark:border-[#2A2926]">
          <Button
            type="button"
            onClick={() => setShowBulkPurgeModal(false)}
            variant="secondary"
            disabled={submittingBulkPurge}
            className="px-3.5 py-1.5 text-xs rounded-md"
          >
            Cancel
          </Button>
          <button
            type="button"
            onClick={() => handleBulkPurge()}
            disabled={submittingBulkPurge || bulkPurgeConfirmText !== 'DELETE'}
            className="px-4 py-1.5 text-xs font-semibold rounded-md bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all"
          >
            {submittingBulkPurge ? 'Deleting…' : 'Confirm purge'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <div
      className="space-y-6"
      data-view-version="admin-parents-enhanced-directory"
      id="admin-parents-module-root"
    >
      {/* Portal modals */}
      {removeModal}
      {restoreModal}
      {permanentDeleteModal}
      {bulkRemoveModal}
      {bulkRestoreModal}
      {bulkPurgeModal}
      {quickViewModal}

      {/* 1. Header with title and actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-[#EAE8E1] dark:border-[#2A2926]">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
            Parents & Workers
          </h1>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            View and manage registered parents, Koinonia workers, locations and linked children.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            onClick={handleExportCSV}
            variant="secondary"
            className="text-xs px-3.5 py-1.5 flex items-center gap-1.5 shrink-0 rounded-md shadow-2xs"
          >
            <Download className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
            <span>Export CSV</span>
          </Button>
          <Button
            onClick={() => setShowAddParentModal(true)}
            variant="primary"
            className="text-xs px-3.5 py-1.5 flex items-center gap-1.5 shrink-0 rounded-md shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add parent</span>
          </Button>
        </div>
      </div>

      {/* 2. Unified Flat Directory Summary Strip */}
      <div className="bg-white dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#2A2926] rounded-lg shadow-2xs overflow-hidden">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 divide-y sm:divide-y-0 sm:divide-x divide-[#EAE8E1] dark:divide-[#2A2926]">
          {/* 1. Total Parents */}
          <div className="p-3.5 sm:p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400 mb-1">
              <span className="text-[11px] font-medium uppercase tracking-wider">Total Parents</span>
              <Users className="w-4 h-4 text-[#C59B27]" />
            </div>
            <div>
              <div className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">{stats.parents}</div>
              <div className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-0.5">Profiles in view</div>
            </div>
          </div>

          {/* 2. Koinonia Workers */}
          <div className="p-3.5 sm:p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400 mb-1">
              <span className="text-[11px] font-medium uppercase tracking-wider">Koinonia Workers</span>
              <Briefcase className="w-4 h-4 text-[#C59B27]" />
            </div>
            <div>
              <div className="text-xl sm:text-2xl font-bold tracking-tight text-[#C59B27]">{stats.teamMembers}</div>
              <div className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-0.5">Ministry team</div>
            </div>
          </div>

          {/* 3. Regular Parents */}
          <div className="p-3.5 sm:p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400 mb-1">
              <span className="text-[11px] font-medium uppercase tracking-wider">Regular Parents</span>
              <HeartHandshake className="w-4 h-4 text-[#C59B27]" />
            </div>
            <div>
              <div className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">{stats.regularParents}</div>
              <div className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-0.5">Non-worker guardians</div>
            </div>
          </div>

          {/* 4. Children Linked */}
          <div className="p-3.5 sm:p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400 mb-1">
              <span className="text-[11px] font-medium uppercase tracking-wider">Children Linked</span>
              <Users className="w-4 h-4 text-[#C59B27]" />
            </div>
            <div>
              <div className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">{stats.childrenLinked}</div>
              <div className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-0.5">Connected family</div>
            </div>
          </div>

          {/* 5. Locations / Cities */}
          <div className="p-3.5 sm:p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400 mb-1">
              <span className="text-[11px] font-medium uppercase tracking-wider">Locations / Cities</span>
              <MapPin className="w-4 h-4 text-[#C59B27]" />
            </div>
            <div>
              <div className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">{stats.locationsCount}</div>
              <div className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-0.5">Regions represented</div>
            </div>
          </div>

          {/* 6. WhatsApp Ready */}
          <div className="p-3.5 sm:p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400 mb-1">
              <span className="text-[11px] font-medium uppercase tracking-wider">WhatsApp Ready</span>
              <MessageSquare className="w-4 h-4 text-[#C59B27]" />
            </div>
            <div>
              <div className="text-xl sm:text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">{stats.whatsAppOptedIn}</div>
              <div className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-0.5">Verified & opted in</div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Status Tabs (Active vs Removed) */}
      <div className="flex items-center justify-between border-b border-[#EAE8E1] dark:border-[#2A2926]" id="parents-directory-tabs">
        <div className="flex gap-6">
          <button
            onClick={() => handleTabChange('active')}
            className={`pb-2.5 text-xs font-medium transition-colors border-b-2 cursor-pointer focus:outline-none flex items-center gap-1.5 ${
              activeTab === 'active'
                ? 'border-[#C59B27] text-neutral-950 dark:text-neutral-100 font-semibold'
                : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200'
            }`}
            id="tab-active-parents"
          >
            <span>Active Accounts</span>
            {activeTab === 'active' && (
              <span className="w-1.5 h-1.5 rounded-full bg-[#C59B27]" />
            )}
          </button>
          <button
            onClick={() => handleTabChange('removed')}
            className={`pb-2.5 text-xs font-medium transition-colors border-b-2 cursor-pointer focus:outline-none flex items-center gap-1.5 ${
              activeTab === 'removed'
                ? 'border-[#C59B27] text-neutral-950 dark:text-neutral-100 font-semibold'
                : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200'
            }`}
            id="tab-removed-parents"
          >
            <span>Removed & Archived</span>
          </button>
        </div>

        {activeFiltersCount > 0 && (
          <button
            onClick={handleResetFilters}
            className="pb-2.5 text-xs text-[#C59B27] hover:underline cursor-pointer flex items-center gap-1 focus:outline-none font-medium"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset {activeFiltersCount} filter{activeFiltersCount > 1 ? 's' : ''}</span>
          </button>
        )}
      </div>

      {/* 4. Single Unified Search & Filter Toolbar */}
      <div className="bg-white dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#2A2926] rounded-lg p-3 sm:p-3.5 shadow-2xs space-y-3">
        {/* Top: Search + Restrained Worker Segment */}
        <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
          {/* Search bar */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 dark:text-neutral-500 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by parent name, phone, email, city, state, address, or child name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-9 pl-9 pr-8 text-xs rounded-md border border-[#EAE8E1] dark:border-[#2A2926] focus:outline-none focus:border-[#C59B27] bg-[#FAF9F6]/50 dark:bg-[#20201E] text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer p-0.5"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Role Segment Toggle (Restrained, not large pills) */}
          <div className="inline-flex p-0.5 rounded-md bg-neutral-100/80 dark:bg-[#20201E] border border-[#EAE8E1] dark:border-[#2A2926] shrink-0 h-9 items-center">
            <button
              onClick={() => setWorkerFilter('all')}
              className={`h-full px-3 text-xs rounded transition-all cursor-pointer font-medium ${
                workerFilter === 'all'
                  ? 'bg-white dark:bg-[#2A2926] text-neutral-950 dark:text-neutral-100 font-semibold shadow-2xs'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
              }`}
            >
              All Members
            </button>
            <button
              onClick={() => setWorkerFilter('worker')}
              className={`h-full px-3 text-xs rounded transition-all cursor-pointer flex items-center gap-1.5 font-medium ${
                workerFilter === 'worker'
                  ? 'bg-[#C59B27] text-white font-semibold shadow-2xs'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
              }`}
            >
              <Briefcase className="w-3 h-3" />
              <span>Koinonia Workers</span>
            </button>
            <button
              onClick={() => setWorkerFilter('non_worker')}
              className={`h-full px-3 text-xs rounded transition-all cursor-pointer font-medium ${
                workerFilter === 'non_worker'
                  ? 'bg-white dark:bg-[#2A2926] text-neutral-950 dark:text-neutral-100 font-semibold shadow-2xs'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
              }`}
            >
              Regular Parents
            </button>
          </div>
        </div>

        {/* Detailed Geographical & Status Selectors */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-2 border-t border-[#EAE8E1] dark:border-[#2A2926]">
          {/* Department Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500 block">
              Department
            </label>
            <select
              value={selectedDepartment}
              onChange={(e) => setSelectedDepartment(e.target.value)}
              className="w-full h-8 px-2 text-xs rounded-md border border-[#EAE8E1] dark:border-[#2A2926] bg-[#FAF9F6]/40 dark:bg-[#20201E] text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-[#C59B27] cursor-pointer"
            >
              <option value="all">All Departments</option>
              {filterOptions.departments.map(d => (
                <option key={d.department} value={d.department}>
                  {d.department} ({d.count})
                </option>
              ))}
            </select>
          </div>

          {/* Country Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500 block">
              Country
            </label>
            <select
              value={selectedCountry}
              onChange={(e) => setSelectedCountry(e.target.value)}
              className="w-full h-8 px-2 text-xs rounded-md border border-[#EAE8E1] dark:border-[#2A2926] bg-[#FAF9F6]/40 dark:bg-[#20201E] text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-[#C59B27] cursor-pointer"
            >
              <option value="all">All Countries</option>
              {filterOptions.countries.map(c => (
                <option key={c.country} value={c.country}>
                  {c.country} ({c.count})
                </option>
              ))}
            </select>
          </div>

          {/* State / Region Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500 block">
              State / Region
            </label>
            <select
              value={selectedState}
              onChange={(e) => setSelectedState(e.target.value)}
              className="w-full h-8 px-2 text-xs rounded-md border border-[#EAE8E1] dark:border-[#2A2926] bg-[#FAF9F6]/40 dark:bg-[#20201E] text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-[#C59B27] cursor-pointer"
            >
              <option value="all">All States / Regions</option>
              {filterOptions.states.map(s => (
                <option key={s.state_region} value={s.state_region}>
                  {s.state_region} ({s.count})
                </option>
              ))}
            </select>
          </div>

          {/* City Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500 block">
              City
            </label>
            <select
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value)}
              className="w-full h-8 px-2 text-xs rounded-md border border-[#EAE8E1] dark:border-[#2A2926] bg-[#FAF9F6]/40 dark:bg-[#20201E] text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-[#C59B27] cursor-pointer"
            >
              <option value="all">All Cities</option>
              {filterOptions.cities.map(c => (
                <option key={c.city} value={c.city}>
                  {c.city} ({c.count})
                </option>
              ))}
            </select>
          </div>

          {/* Children Connected Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500 block">
              Children Status
            </label>
            <select
              value={hasChildrenFilter}
              onChange={(e) => setHasChildrenFilter(e.target.value as ChildrenFilterType)}
              className="w-full h-8 px-2 text-xs rounded-md border border-[#EAE8E1] dark:border-[#2A2926] bg-[#FAF9F6]/40 dark:bg-[#20201E] text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-[#C59B27] cursor-pointer"
            >
              <option value="all">All Parents</option>
              <option value="has_children">Has Children Linked</option>
              <option value="no_children">No Children Linked</option>
            </select>
          </div>

          {/* Location Details Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500 block">
              Location Data
            </label>
            <select
              value={hasLocationFilter}
              onChange={(e) => setHasLocationFilter(e.target.value as LocationFilterType)}
              className="w-full h-8 px-2 text-xs rounded-md border border-[#EAE8E1] dark:border-[#2A2926] bg-[#FAF9F6]/40 dark:bg-[#20201E] text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-[#C59B27] cursor-pointer"
            >
              <option value="all">All Records</option>
              <option value="has_location">Has Address / Location</option>
              <option value="missing_location">Missing Location Info</option>
            </select>
          </div>
        </div>
      </div>

      {/* Contextual Action Bar when rows are selected */}
      {selectedParentIds.length > 0 && (
        <div className="bg-[#FAF8F2] dark:bg-[#20201E] border border-[#EAE8E1] dark:border-[#2A2926] rounded-md px-4 py-2.5 flex items-center justify-between shadow-2xs animate-fade-in">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#C59B27]" />
            <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
              {selectedParentIds.length} {selectedParentIds.length === 1 ? 'parent selected' : 'parents selected'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {activeTab === 'active' ? (
              <button
                onClick={() => setShowBulkRemoveModal(true)}
                className="px-3 py-1 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/50 rounded transition-colors cursor-pointer"
              >
                Remove selected
              </button>
            ) : (
              <button
                onClick={() => setShowBulkRestoreModal(true)}
                className="px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-950/50 rounded transition-colors cursor-pointer"
              >
                Restore selected
              </button>
            )}

            {isSuperAdmin && activeTab === 'removed' && (
              <button
                onClick={() => {
                  setBulkPurgeConfirmText('');
                  setShowBulkPurgeModal(true);
                }}
                className="px-3 py-1 text-xs font-medium text-red-700 dark:text-red-400 bg-red-100/70 dark:bg-red-950/60 hover:bg-red-200 dark:hover:bg-red-900/60 rounded transition-colors cursor-pointer"
              >
                Permanently delete
              </button>
            )}

            <button
              onClick={() => setSelectedParentIds([])}
              className="text-xs text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200 px-2 py-1 transition-colors cursor-pointer"
            >
              Clear selection
            </button>
          </div>
        </div>
      )}

      {/* 5. Comprehensive Parents & Workers Table */}
      <div className="bg-white dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#2A2926] rounded-lg overflow-hidden shadow-2xs">
        {loading ? (
          <div className="p-12">
            <KoinoniaInlineLoader
              variant="skeleton"
              size="lg"
              label="Loading parent and worker profiles..."
              centered
            />
          </div>
        ) : parents.length === 0 ? (
          <div className="text-center py-16 text-neutral-400 dark:text-neutral-500 space-y-3">
            <Users className="w-8 h-8 stroke-[1.5] mx-auto text-neutral-300 dark:text-neutral-600" />
            <div>
              <p className="text-sm text-neutral-700 dark:text-neutral-300 font-semibold">
                {activeTab === 'active' ? 'No parents match the selected criteria.' : 'No removed parents found.'}
              </p>
              <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1">
                Try adjusting your search query, location filters, or worker status pills.
              </p>
            </div>
            {activeFiltersCount > 0 && (
              <Button
                onClick={handleResetFilters}
                variant="secondary"
                className="text-xs px-3.5 py-1.5 mx-auto mt-2 rounded-md"
              >
                Clear all filters
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="bg-[#FAF9F6] dark:bg-[#20201E] border-b border-[#EAE8E1] dark:border-[#2A2926] text-neutral-500 dark:text-neutral-400">
                  <th className="py-3 px-3 pl-4 w-10 text-center">
                    <AdminSelectionCheckbox
                      checked={isAllVisibleSelected}
                      indeterminate={isIndeterminate}
                      onChange={handleToggleSelectAll}
                      ariaLabel="Select all visible parents"
                    />
                  </th>
                  <th className="py-3 px-4 text-[11px] font-semibold tracking-wider uppercase">Parent Profile</th>
                  <th className="py-3 px-4 text-[11px] font-semibold tracking-wider uppercase">Worker Status</th>
                  <th className="py-3 px-4 text-[11px] font-semibold tracking-wider uppercase">Origin & Location</th>
                  <th className="py-3 px-4 text-[11px] font-semibold tracking-wider uppercase">Connected Children</th>
                  <th className="py-3 px-4 text-[11px] font-semibold tracking-wider uppercase">WhatsApp</th>
                  <th className="py-3 px-4 pr-6 text-right text-[11px] font-semibold tracking-wider uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAE8E1] dark:divide-[#2A2926]">
                {parents.map((p) => {
                  const displayName = getDisplayName(p);
                  const isRemoved = p.isDeleted || activeTab === 'removed';
                  const isSelected = selectedParentIds.includes(String(p.id));

                  const hasLocationData = Boolean(p.city || p.stateRegion || p.country || p.homeAddress);

                  return (
                    <tr
                      key={p.id}
                      className={`transition-colors ${
                        isSelected
                          ? 'bg-[#FAF8F2] dark:bg-[#20201E]'
                          : 'hover:bg-neutral-50/70 dark:hover:bg-[#22211E]'
                      }`}
                      data-parent-row-id={p.id}
                    >
                      {/* Checkbox */}
                      <td className="py-3 px-3 pl-4 w-10 text-center" onClick={(e) => e.stopPropagation()}>
                        <AdminSelectionCheckbox
                          checked={isSelected}
                          onChange={() => handleToggleSelectParent(String(p.id))}
                          ariaLabel={`Select ${displayName}`}
                        />
                      </td>

                      {/* Parent Profile */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          {p.photoUrl ? (
                            <img
                              src={p.photoUrl}
                              alt={displayName}
                              referrerPolicy="no-referrer"
                              className="w-9 h-9 rounded-full object-cover border border-[#EAE8E1] dark:border-[#3A3835] shrink-0"
                            />
                          ) : (
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs uppercase shrink-0 border ${
                              p.isKoinoniaWorker
                                ? 'bg-[#C59B27]/10 text-[#C59B27] border-[#C59B27]/30'
                                : 'bg-[#FAF9F6] dark:bg-[#20201E] text-neutral-600 dark:text-neutral-400 border-[#EAE8E1] dark:border-[#2A2926]'
                            }`}>
                              {getInitials(displayName)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <span 
                              onClick={() => setQuickViewParent(p)}
                              className="font-semibold text-neutral-900 dark:text-neutral-100 block text-xs leading-tight hover:text-[#C59B27] cursor-pointer truncate"
                              title="Click for quick family overview"
                            >
                              {displayName}
                            </span>
                            <span className="text-[11px] text-neutral-500 dark:text-neutral-400 block truncate mt-0.5">
                              {p.email || 'No email registered'}
                            </span>
                            {p.phone && (
                              <span className="text-[10px] text-neutral-400 dark:text-neutral-500 block truncate">
                                📞 {p.phone}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Worker / Ministry Role Status */}
                      <td className="py-3 px-4">
                        {p.isKoinoniaWorker ? (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#C59B27]">
                              <Briefcase className="w-3.5 h-3.5" />
                              <span>Koinonia Worker</span>
                            </span>
                            {p.department && (
                              <span className="block text-[11px] text-neutral-500 dark:text-neutral-400 font-medium">
                                {p.department}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-neutral-500 dark:text-neutral-400 font-normal">
                            Parent
                          </span>
                        )}
                      </td>

                      {/* Geographic Origin & Residence */}
                      <td className="py-3 px-4 max-w-xs">
                        {hasLocationData ? (
                          <div className="space-y-0.5">
                            <div className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                              {p.city ? p.city : (p.stateRegion || 'Nigeria')}
                              {p.stateRegion && p.city ? ` · ${p.stateRegion}` : ''}
                              {p.country ? `, ${p.country}` : ''}
                            </div>
                            {p.homeAddress && (
                              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate flex items-center gap-1" title={p.homeAddress}>
                                <Home className="w-3 h-3 text-neutral-400 shrink-0" />
                                <span className="truncate">{p.homeAddress}</span>
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-neutral-400 dark:text-neutral-500 italic text-[11px]">
                            Location not provided
                          </span>
                        )}
                      </td>

                      {/* Connected Children */}
                      <td className="py-3 px-4">
                        <div className="space-y-1">
                          <span className="font-semibold text-neutral-900 dark:text-neutral-100 text-xs block">
                            {formatChildrenCount(Number(p.childrenCount || 0))}
                          </span>
                          {p.children && p.children.length > 0 && (
                            <div className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate max-w-xs" title={p.children.map((c: any) => c.fullName).join(', ')}>
                              {p.children.map((c: any) => `${c.fullName?.split(' ')[0] || 'Child'}${c.age ? ` (${c.age}y)` : ''}`).join(', ')}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* WhatsApp Readiness */}
                      <td className="py-3 px-4">
                        {p.whatsappConsentStatus === 'opted_in' ? (
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                            <span>Opted in</span>
                          </span>
                        ) : p.whatsapp ? (
                          <span className="text-[11px] text-neutral-500 dark:text-neutral-400 font-medium">
                            Provided
                          </span>
                        ) : (
                          <span className="text-[11px] text-neutral-400 dark:text-neutral-500 italic">
                            None
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 pr-6 text-right">
                        <div className="inline-flex items-center gap-1 justify-end">
                          <button
                            onClick={() => setQuickViewParent(p)}
                            className="p-1.5 text-neutral-400 hover:text-neutral-800 dark:text-neutral-500 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-[#20201E] rounded transition-colors cursor-pointer"
                            title="Quick preview"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => onNavigate(`/admin/parents/${p.id}` as AppRoute)}
                            className="px-2.5 py-1 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:text-neutral-950 dark:hover:text-white bg-white dark:bg-[#20201E] hover:bg-neutral-50 dark:hover:bg-neutral-800 border border-[#EAE8E1] dark:border-[#2A2926] rounded transition-colors cursor-pointer focus:outline-none"
                          >
                            Profile
                          </button>

                          {/* Overflow Menu */}
                          <div className="relative inline-block text-left" ref={openActionMenuId === p.id ? actionMenuRef : undefined}>
                            <button
                              onClick={() => setOpenActionMenuId(openActionMenuId === p.id ? null : p.id)}
                              className="p-1.5 text-neutral-400 hover:text-neutral-800 dark:text-neutral-500 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-[#20201E] rounded transition-colors cursor-pointer focus:outline-none"
                              aria-label="More options"
                            >
                              <MoreHorizontal className="w-3.5 h-3.5" />
                            </button>

                            {openActionMenuId === p.id && (
                              <div className="absolute right-0 mt-1 w-44 bg-white dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#2A2926] rounded-md shadow-lg py-1 z-30 text-left">
                                <button
                                  onClick={() => {
                                    setOpenActionMenuId(null);
                                    setQuickViewParent(p);
                                  }}
                                  className="w-full text-left px-3 py-1.5 text-xs text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-[#242320] flex items-center gap-2 transition-colors cursor-pointer"
                                >
                                  <Eye className="w-3.5 h-3.5 text-neutral-400" />
                                  <span>Quick family view</span>
                                </button>

                                <button
                                  onClick={() => {
                                    setOpenActionMenuId(null);
                                    onNavigate(`/admin/parents/${p.id}` as AppRoute);
                                  }}
                                  className="w-full text-left px-3 py-1.5 text-xs text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-[#242320] flex items-center gap-2 transition-colors cursor-pointer"
                                >
                                  <Users className="w-3.5 h-3.5 text-neutral-400" />
                                  <span>View full details</span>
                                </button>

                                <div className="h-px bg-[#EAE8E1] dark:bg-[#2A2926] my-1" />

                                {!isRemoved ? (
                                  <button
                                    onClick={() => {
                                      setOpenActionMenuId(null);
                                      setParentToRemove(p);
                                    }}
                                    className="w-full text-left px-3 py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center gap-2 transition-colors cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>Remove parent</span>
                                  </button>
                                ) : (
                                  <>
                                    <button
                                      onClick={() => {
                                        setOpenActionMenuId(null);
                                        setParentToRestore(p);
                                      }}
                                      className="w-full text-left px-3 py-1.5 text-xs text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 flex items-center gap-2 transition-colors cursor-pointer"
                                    >
                                      <RotateCcw className="w-3.5 h-3.5" />
                                      <span>Restore parent</span>
                                    </button>
                                    {isSuperAdmin && (
                                      <>
                                        <div className="h-px bg-[#EAE8E1] dark:bg-[#2A2926] my-1" />
                                        <button
                                          onClick={() => {
                                            setOpenActionMenuId(null);
                                            setParentToDelete(p);
                                            setDeleteConfirmationText('');
                                          }}
                                          className="w-full text-left px-3 py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center gap-2 transition-colors cursor-pointer"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                          <span>Delete permanently</span>
                                        </button>
                                      </>
                                    )}
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Parent Modal */}
      <AddParentModal
        isOpen={showAddParentModal}
        onClose={() => setShowAddParentModal(false)}
        onSuccess={() => fetchParents()}
      />
    </div>
  );
};
