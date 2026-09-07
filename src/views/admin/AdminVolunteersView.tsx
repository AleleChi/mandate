import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Users,
  Search,
  UserCheck,
  X,
  Briefcase,
  Phone,
  MessageSquare,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Filter,
  Check,
  AlertTriangle,
  FileText,
  RotateCcw,
  AlertCircle,
  ChevronDown,
  MoreHorizontal,
  Mail,
  Trash2
} from 'lucide-react';
import { api, extractApiError } from '../../services/api';
import { useNotification } from '../../context/NotificationContext';
import { Button } from '../../components/common/Button';
import { KoinoniaInlineLoader } from '../../components/common/KoinoniaInlineLoader';
import { AddVolunteerModal } from '../../components/admin/modals/AddVolunteerModal';
import { AdminSelectionCheckbox } from '../../components/common/AdminSelectionCheckbox';

interface AdminVolunteersViewProps {
  onBackToOverview: () => void;
  adminUser?: any;
}

type VolunteerTab = 'active' | 'pending' | 'declined' | 'removed';

export const AdminVolunteersView: React.FC<AdminVolunteersViewProps> = ({ onBackToOverview, adminUser }) => {
  const isSuperAdmin = adminUser?.role === 'super_admin';
  const { showError, showSuccess } = useNotification();
  const [volunteers, setVolunteers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddVolunteerModal, setShowAddVolunteerModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [teamFilter, setTeamFilter] = useState('');

  // Bulk selection & actions
  const [selectedVolIds, setSelectedVolIds] = useState<string[]>([]);
  const [showBulkAssignModal, setShowBulkAssignModal] = useState(false);
  const [bulkAssignTeam, setBulkAssignTeam] = useState('');
  const [submittingBulkAssign, setSubmittingBulkAssign] = useState(false);
  const [showBulkApproveModal, setShowBulkApproveModal] = useState(false);
  const [bulkApproveTeam, setBulkApproveTeam] = useState('');
  const [submittingBulkApprove, setSubmittingBulkApprove] = useState(false);
  const [showBulkDeclineModal, setShowBulkDeclineModal] = useState(false);
  const [submittingBulkDecline, setSubmittingBulkDecline] = useState(false);
  const [showBulkRemoveModal, setShowBulkRemoveModal] = useState(false);
  const [bulkRemoveReason, setBulkRemoveReason] = useState('');
  const [submittingBulkRemove, setSubmittingBulkRemove] = useState(false);
  const [showBulkRestoreModal, setShowBulkRestoreModal] = useState(false);
  const [submittingBulkRestore, setSubmittingBulkRestore] = useState(false);
  const [bulkMoreDropdownOpen, setBulkMoreDropdownOpen] = useState(false);

  // Bulk Permanent Delete
  const [showBulkPurgeModal, setShowBulkPurgeModal] = useState(false);
  const [bulkPurgeConfirmText, setBulkPurgeConfirmText] = useState('');
  const [submittingBulkPurge, setSubmittingBulkPurge] = useState(false);

  // Selected volunteer for profile/review modal
  const [selectedVolId, setSelectedVolId] = useState<string | null>(null);
  const [selectedVol, setSelectedVol] = useState<any | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [assignedTeam, setAssignedTeam] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [submittingAssignment, setSubmittingAssignment] = useState(false);
  const [resendingEmail, setResendingEmail] = useState(false);
  const [showMoreActions, setShowMoreActions] = useState(false);

  // Row-level overflow menus
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);
  const actionMenuRef = useRef<HTMLDivElement | null>(null);

  // Tabs
  const [activeTab, setActiveTab] = useState<VolunteerTab>('active');

  // Remove (soft-delete / archive)
  const [volToRemove, setVolToRemove] = useState<any | null>(null);
  const [removeReason, setRemoveReason] = useState('');
  const [submittingRemove, setSubmittingRemove] = useState(false);

  // Restore
  const [volToRestore, setVolToRestore] = useState<any | null>(null);
  const [submittingRestore, setSubmittingRestore] = useState(false);

  // Permanent delete
  const [volToDelete, setVolToDelete] = useState<any | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [submittingDelete, setSubmittingDelete] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [limit] = useState(25);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Stats
  const [stats, setStats] = useState<any>({
    totalVolunteers: 0,
    pendingReview: 0,
    approvedVolunteers: 0,
    declinedVolunteers: 0,
    assignedTeams: 0,
    removedVolunteers: 0
  });

  const teamOptions = [
    { value: 'Teens leaders', label: 'Teens leaders' },
    { value: 'Teens support', label: 'Teens support' },
    { value: 'Kids age 10-12', label: 'Kids age 10–12' },
    { value: 'Kids age 7-9', label: 'Kids age 7–9' },
    { value: 'Kids age 4-6', label: 'Kids age 4–6' },
    { value: 'Toddlers (1-3 yrs)', label: 'Toddlers (1–3 yrs)' },
    { value: 'Babies (under 1)', label: 'Babies (under 1)' },
    { value: 'General assistance', label: 'General assistance' },
    { value: 'Hospitality', label: 'Hospitality' },
    { value: 'Media', label: 'Media' }
  ];

  const teamLabel = (val: string) => {
    if (!val || typeof val !== 'string') return 'Not assigned';
    const match = teamOptions.find(o => o.value.toLowerCase() === val.toLowerCase());
    return match?.label || val || 'Not assigned';
  };

  const statusLabel = (vol: any): string => {
    if (!vol) return 'Unknown';
    const s = typeof vol.status === 'string' ? vol.status.toLowerCase() : '';
    if (s === 'approved' || s === 'active') return 'Active';
    if (s === 'pending_review' || s === 'pending') return 'Awaiting review';
    if (s === 'rejected' || s === 'declined') return 'Not approved';
    return vol.status || 'Unknown';
  };

  const getInitials = (name: any): string => {
    if (!name || typeof name !== 'string') return '??';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '??';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const normalizeVolunteer = (vol: any) => {
    if (!vol || typeof vol !== 'object') return null;

    const rawName =
      (typeof vol.fullName === 'string' && vol.fullName.trim()) ||
      (typeof vol.name === 'string' && vol.name.trim()) ||
      (typeof vol.full_name === 'string' && vol.full_name.trim()) ||
      '';

    const fullName = rawName || 'Volunteer';
    const initials = getInitials(rawName);

    const rawEmail = (typeof vol.email === 'string' && vol.email.trim()) || '';
    const email = rawEmail || 'Not provided';

    const rawPhone = (typeof vol.phone === 'string' && vol.phone.trim()) || '';
    const phone = rawPhone || 'Not provided';

    const hasWhatsApp = Boolean(
      vol.whatsapp === true ||
      vol.whatsapp === 1 ||
      vol.whatsapp === '1' ||
      (typeof vol.whatsapp === 'string' && vol.whatsapp.trim().length > 0 && vol.whatsapp !== '0' && vol.whatsapp !== 'false')
    );
    const whatsAppDisplay = hasWhatsApp
      ? (typeof vol.whatsapp === 'string' && vol.whatsapp.length > 2 && vol.whatsapp !== '1' ? vol.whatsapp : 'Available')
      : 'Not provided';

    const isKoinoniaWorker = Boolean(
      vol.isKoinoniaWorker === true ||
      vol.isKoinoniaWorker === 1 ||
      vol.is_koinonia_worker === 1 ||
      vol.is_koinonia_worker === true
    );

    const department = (typeof vol.department === 'string' && vol.department.trim()) || '';

    const preferredTeam =
      (typeof vol.preferredTeam === 'string' && vol.preferredTeam.trim()) ||
      (typeof vol.preferred_team === 'string' && vol.preferred_team.trim()) ||
      '';

    const assignedTeam =
      (typeof vol.assignedTeam === 'string' && vol.assignedTeam.trim()) ||
      (typeof vol.assigned_team === 'string' && vol.assigned_team.trim()) ||
      preferredTeam;

    const rawStatus = typeof vol.status === 'string' ? vol.status.toLowerCase().trim() : '';
    let status = rawStatus || 'pending';
    let sLabel = 'Awaiting review';
    if (status === 'approved' || status === 'active') {
      sLabel = 'Active';
    } else if (status === 'rejected' || status === 'declined') {
      sLabel = 'Not approved';
    } else if (status === 'pending' || status === 'pending_review') {
      sLabel = 'Awaiting review';
    } else if (status) {
      sLabel = status.charAt(0).toUpperCase() + status.slice(1);
    }

    // Safe serving experience handling (boolean / number 1/0 or text)
    const hasServingExperience = Boolean(
      vol.servingExperience === 1 ||
      vol.servingExperience === '1' ||
      vol.servingExperience === true ||
      vol.servingExperience === 'true' ||
      vol.serving_experience === 1 ||
      vol.serving_experience === '1' ||
      vol.serving_experience === true
    );

    let servingExperienceText = '';
    if (typeof vol.servingExperience === 'string' && isNaN(Number(vol.servingExperience))) {
      servingExperienceText = vol.servingExperience.trim();
    } else if (typeof vol.serving_experience === 'string' && isNaN(Number(vol.serving_experience))) {
      servingExperienceText = vol.serving_experience.trim();
    }

    const note = (typeof vol.note === 'string' && vol.note.trim()) || '';

    const photoUrl =
      (typeof vol.photoUrl === 'string' && vol.photoUrl.trim()) ||
      (typeof vol.photo_url === 'string' && vol.photo_url.trim()) ||
      '';

    const isDeleted = Boolean(vol.isDeleted === true || vol.isDeleted === 1 || vol.is_deleted === 1);

    let deletedAtFormatted = 'N/A';
    const rawDeletedAt = vol.deletedAt || vol.deleted_at;
    if (rawDeletedAt) {
      try {
        const d = new Date(rawDeletedAt);
        if (!isNaN(d.getTime())) {
          deletedAtFormatted = d.toLocaleDateString('en-GB');
        }
      } catch {
        deletedAtFormatted = 'N/A';
      }
    }

    const deletedByEmail =
      (typeof vol.deletedByEmail === 'string' && vol.deletedByEmail.trim()) ||
      (typeof vol.deleted_by_email === 'string' && vol.deleted_by_email.trim()) ||
      '';

    const deleteReason =
      (typeof vol.deleteReason === 'string' && vol.deleteReason.trim()) ||
      (typeof vol.delete_reason === 'string' && vol.delete_reason.trim()) ||
      '';

    return {
      id: String(vol.id || ''),
      fullName,
      initials,
      email,
      phone,
      hasWhatsApp,
      whatsAppDisplay,
      isKoinoniaWorker,
      roleLabel: isKoinoniaWorker ? 'Staff worker' : 'Regular member',
      department,
      preferredTeam,
      preferredTeamLabel: teamLabel(preferredTeam),
      assignedTeam,
      status,
      statusLabel: sLabel,
      hasServingExperience,
      servingExperienceText,
      note,
      photoUrl,
      isDeleted,
      deletedAtFormatted,
      deletedByEmail,
      deleteReason,
      raw: vol
    };
  };

  const fetchVolunteers = async (pageToFetch = currentPage) => {
    setLoading(true);
    try {
      const res = await api.admin.getVolunteers({
        page: pageToFetch,
        limit,
        q: searchQuery,
        status: statusFilter || activeTab,
        team: teamFilter
      });
      if (res.success) {
        setVolunteers(res.volunteers || []);
        if (res.stats) setStats(res.stats);
        if (res.pagination) {
          setCurrentPage(res.pagination.page);
          setTotalPages(res.pagination.pages || 1);
          setTotalCount(res.pagination.total || 0);
        }
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Sync failed', parsed.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (tab: VolunteerTab) => {
    setActiveTab(tab);
    setCurrentPage(1);
    setStatusFilter('');
    setOpenActionMenuId(null);
  };

  useEffect(() => {
    fetchVolunteers(currentPage);
  }, [statusFilter, teamFilter, activeTab, currentPage]);

  useEffect(() => {
    const handler = setTimeout(() => {
      fetchVolunteers(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Close action menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (actionMenuRef.current && !actionMenuRef.current.contains(e.target as Node)) {
        setOpenActionMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ---- HANDLERS ----

  const fetchVolunteerDetails = async (id: string, fallbackVol?: any) => {
    setLoadingProfile(true);
    setProfileError(null);
    try {
      const res = await api.admin.getVolunteerDetails(id);
      if (res.success && res.volunteer) {
        setSelectedVol(res.volunteer);
        const team = res.volunteer.preferredTeam || res.volunteer.assignedTeam || 'General assistance';
        setAssignedTeam(team);
        setReviewNote(res.volunteer.note || '');
      } else if (fallbackVol) {
        setSelectedVol(fallbackVol);
      } else {
        setProfileError("We couldn't load this volunteer's details.");
      }
    } catch {
      if (fallbackVol) {
        setSelectedVol(fallbackVol);
      } else {
        setProfileError("We couldn't load this volunteer's details.");
      }
    } finally {
      setLoadingProfile(false);
    }
  };

  const handleOpenReview = (vol: any) => {
    const id = vol?.id;
    if (!id) return;
    setSelectedVolId(id);
    setSelectedVol(vol);
    setAssignedTeam(vol.preferredTeam || vol.assignedTeam || 'General assistance');
    setReviewNote(vol.note || '');
    setShowMoreActions(false);
    setOpenActionMenuId(null);
    fetchVolunteerDetails(id, vol);
  };

  const handleCloseReview = () => {
    setSelectedVolId(null);
    setSelectedVol(null);
    setReviewNote('');
    setSubmittingReview(false);
    setShowMoreActions(false);
    setProfileError(null);
    setLoadingProfile(false);
  };

  const submitDecision = async (decision: 'approved' | 'rejected') => {
    if (!selectedVol) return;
    const volId = selectedVol.id;
    const volName = selectedVol.fullName || selectedVol.name || 'Volunteer';
    setSubmittingReview(true);
    try {
      const res = await api.admin.reviewVolunteer(volId, {
        status: decision,
        team: assignedTeam,
        note: reviewNote
      });
      if (res.success) {
        showSuccess(
          decision === 'approved' ? 'Volunteer approved' : 'Application updated',
          decision === 'approved'
            ? `${volName} is now an active volunteer on the ${teamLabel(assignedTeam)} team.`
            : 'The application has been marked as not approved.'
        );
        handleCloseReview();
        await fetchVolunteers();
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Action failed', parsed.message);
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleUpdateAssignment = async () => {
    if (!selectedVol) return;
    const volId = selectedVol.id;
    const volName = selectedVol.fullName || selectedVol.name || 'Volunteer';
    setSubmittingAssignment(true);
    try {
      const res = await api.admin.updateVolunteerAssignment(volId, assignedTeam);
      if (res.success) {
        showSuccess('Team updated', `${volName} has been assigned to the ${teamLabel(assignedTeam)} team.`);
        handleCloseReview();
        fetchVolunteers();
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Update failed', parsed.message);
    } finally {
      setSubmittingAssignment(false);
    }
  };

  const handleResendEmail = async () => {
    if (!selectedVol) return;
    const volId = selectedVol.id;
    const volEmail = selectedVol.email || 'the volunteer';
    setResendingEmail(true);
    setShowMoreActions(false);
    try {
      const res = await api.admin.resendVolunteerApprovalEmail(volId);
      if (res.success) {
        showSuccess('Welcome email sent', `A welcome email has been sent to ${volEmail}.`);
      }
    } catch {
      showError('Email error', 'We could not send the email. Please try again.');
    } finally {
      setResendingEmail(false);
    }
  };

  const handleRemoveVolSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!volToRemove) return;
    setSubmittingRemove(true);
    try {
      const res = await api.admin.removeVolunteer(volToRemove.id, removeReason);
      if (res.success) {
        showSuccess('Volunteer removed', 'Their profile has been archived and is available under Removed.');
        setVolToRemove(null);
        setRemoveReason('');
        await fetchVolunteers();
        if (selectedVol && selectedVol.id === volToRemove.id) handleCloseReview();
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Remove failed', parsed.message);
    } finally {
      setSubmittingRemove(false);
    }
  };

  const handleRestoreVolSubmit = async () => {
    if (!volToRestore) return;
    setSubmittingRestore(true);
    try {
      const res = await api.admin.restoreVolunteer(volToRestore.id);
      if (res.success) {
        showSuccess('Volunteer restored', 'The volunteer profile has been restored.');
        setVolToRestore(null);
        await fetchVolunteers();
        if (selectedVol && selectedVol.id === volToRestore.id) handleCloseReview();
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Restore failed', parsed.message);
    } finally {
      setSubmittingRestore(false);
    }
  };

  const handlePermanentDeleteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!volToDelete) return;
    if (deleteConfirmationText !== 'DELETE') {
      showError('Confirm required', 'Please type DELETE to confirm.');
      return;
    }
    if (!deleteReason.trim()) {
      showError('Reason required', 'Please specify a reason for deletion.');
      return;
    }
    setSubmittingDelete(true);
    try {
      const res = await api.admin.permanentlyDeleteVolunteer(volToDelete.id, {
        reason: deleteReason,
        confirmation: deleteConfirmationText
      });
      if (res.success) {
        showSuccess('Permanently deleted', 'The volunteer profile has been anonymised and login access revoked.');
        setVolToDelete(null);
        setDeleteReason('');
        setDeleteConfirmationText('');
        await fetchVolunteers();
        if (selectedVol && selectedVol.id === volToDelete.id) handleCloseReview();
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Deletion failed', parsed.message);
    } finally {
      setSubmittingDelete(false);
    }
  };

  // ---- BULK SELECTION LOGIC & HANDLERS ----
  useEffect(() => {
    setSelectedVolIds([]);
  }, [searchQuery, statusFilter, teamFilter, currentPage, activeTab]);

  const isAllVisibleSelected = volunteers.length > 0 && volunteers.every(v => selectedVolIds.includes(String(v.id)));
  const isSomeVisibleSelected = volunteers.some(v => selectedVolIds.includes(String(v.id)));
  const isIndeterminate = isSomeVisibleSelected && !isAllVisibleSelected;

  const handleToggleSelectAll = () => {
    if (isAllVisibleSelected) {
      setSelectedVolIds([]);
    } else {
      setSelectedVolIds(volunteers.map(v => String(v.id)));
    }
  };

  const handleToggleSelectVol = (id: string) => {
    setSelectedVolIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const selectedVolunteers = volunteers.filter(v => selectedVolIds.includes(String(v.id)));

  // State-aware eligibility
  const pendingVolunteers = selectedVolunteers.filter(v => !v.isDeleted && (v.status === 'pending_review' || v.status === 'pending'));
  const canBeApprovedVolunteers = selectedVolunteers.filter(v => !v.isDeleted && (v.status === 'pending_review' || v.status === 'pending' || v.status === 'rejected' || v.status === 'declined'));
  const activeVolunteers = selectedVolunteers.filter(v => !v.isDeleted && (v.status === 'approved' || v.status === 'active'));
  const notRemovedVolunteers = selectedVolunteers.filter(v => !v.isDeleted && activeTab !== 'removed');
  const removedVolunteers = selectedVolunteers.filter(v => v.isDeleted || activeTab === 'removed');

  const canApprove = canBeApprovedVolunteers.length > 0 && activeTab !== 'removed';
  const canDecline = pendingVolunteers.length > 0 && activeTab !== 'removed';
  const canAssignTeam = activeVolunteers.length > 0 && activeTab !== 'removed';
  const canRemove = notRemovedVolunteers.length > 0 && activeTab !== 'removed';
  const canRestore = removedVolunteers.length > 0 && activeTab === 'removed';
  const canPurge = isSuperAdmin && removedVolunteers.length > 0 && activeTab === 'removed';

  const handleBulkAssignTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkAssignTeam) return;
    const targetIds = activeVolunteers.map(v => String(v.id));
    if (targetIds.length === 0) return;
    setSubmittingBulkAssign(true);
    try {
      const res = await api.admin.bulkAssignVolunteerTeam({
        volunteerIds: targetIds,
        assignedTeam: bulkAssignTeam
      });
      if (res.success) {
        showSuccess('Team assigned', `${res.count || targetIds.length} volunteer(s) assigned to ${bulkAssignTeam}.`);
        setShowBulkAssignModal(false);
        setBulkAssignTeam('');
        setSelectedVolIds([]);
        await fetchVolunteers();
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Assignment failed', parsed.message);
    } finally {
      setSubmittingBulkAssign(false);
    }
  };

  const handleBulkApprove = async () => {
    const targetIds = canBeApprovedVolunteers.map(v => String(v.id));
    if (targetIds.length === 0) return;
    setSubmittingBulkApprove(true);
    try {
      const res = await api.admin.bulkReviewVolunteers({
        volunteerIds: targetIds,
        status: 'approved',
        team: bulkApproveTeam || undefined
      });
      if (res.success) {
        showSuccess('Volunteers approved', `${res.count || targetIds.length} volunteer(s) approved.`);
        setShowBulkApproveModal(false);
        setBulkApproveTeam('');
        setSelectedVolIds([]);
        await fetchVolunteers();
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Approval failed', parsed.message);
    } finally {
      setSubmittingBulkApprove(false);
    }
  };

  const handleBulkDecline = async () => {
    const targetIds = pendingVolunteers.map(v => String(v.id));
    if (targetIds.length === 0) return;
    setSubmittingBulkDecline(true);
    try {
      const res = await api.admin.bulkReviewVolunteers({
        volunteerIds: targetIds,
        status: 'rejected'
      });
      if (res.success) {
        showSuccess('Applications declined', `${res.count || targetIds.length} application(s) marked as not approved.`);
        setShowBulkDeclineModal(false);
        setSelectedVolIds([]);
        await fetchVolunteers();
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Update failed', parsed.message);
    } finally {
      setSubmittingBulkDecline(false);
    }
  };

  const handleBulkRemove = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetIds = notRemovedVolunteers.map(v => String(v.id));
    if (targetIds.length === 0) return;
    setSubmittingBulkRemove(true);
    try {
      const res = await api.admin.bulkRemoveVolunteers({
        volunteerIds: targetIds,
        reason: bulkRemoveReason || undefined
      });
      if (res.success) {
        showSuccess('Volunteers removed', `${res.count || targetIds.length} volunteer(s) removed.`);
        setShowBulkRemoveModal(false);
        setBulkRemoveReason('');
        setSelectedVolIds([]);
        await fetchVolunteers();
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Removal failed', parsed.message);
    } finally {
      setSubmittingBulkRemove(false);
    }
  };

  const handleBulkRestore = async () => {
    const targetIds = removedVolunteers.map(v => String(v.id));
    if (targetIds.length === 0) return;
    setSubmittingBulkRestore(true);
    try {
      const res = await api.admin.bulkRestoreVolunteers({
        volunteerIds: targetIds
      });
      if (res.success) {
        showSuccess('Volunteers restored', `${res.count || targetIds.length} volunteer(s) restored.`);
        setShowBulkRestoreModal(false);
        setSelectedVolIds([]);
        await fetchVolunteers();
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Restore failed', parsed.message);
    } finally {
      setSubmittingBulkRestore(false);
    }
  };

  const handleBulkPurge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (bulkPurgeConfirmText.trim() !== 'DELETE' || submittingBulkPurge) return;
    const targetIds = removedVolunteers.map(v => String(v.id));
    if (targetIds.length === 0) return;
    setSubmittingBulkPurge(true);
    try {
      const res = await api.admin.bulkPermanentlyDeleteVolunteers({
        volunteerIds: targetIds,
        confirmText: 'DELETE',
        reason: 'Bulk permanent deletion by Super Admin'
      });
      if (res.success) {
        showSuccess('Volunteers deleted', `${res.count || targetIds.length} volunteer(s) permanently deleted.`);
        setShowBulkPurgeModal(false);
        setBulkPurgeConfirmText('');
        setSelectedVolIds([]);
        await fetchVolunteers();
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Permanent delete failed', parsed.message || "We couldn't permanently delete selected volunteers. Nothing was changed.");
    } finally {
      setSubmittingBulkPurge(false);
    }
  };

  // ---- TABS CONFIG ----
  const tabs: { id: VolunteerTab; label: string }[] = [
    { id: 'active', label: 'Active' },
    { id: 'pending', label: 'Awaiting review' },
    { id: 'declined', label: 'Not approved' },
    { id: 'removed', label: 'Removed' }
  ];

  // ---- EMPTY STATE LABELS ----
  const emptyStateMessage: Record<VolunteerTab, string> = {
    active: 'No active volunteers yet.',
    pending: 'No volunteer profiles are waiting for review.',
    declined: 'No volunteers are currently marked as not approved.',
    removed: 'No removed volunteers.'
  };

  // ---- PORTAL MODALS ----
  // All modals are rendered via createPortal at document.body level
  // to guarantee they render above all ancestor CSS stacking contexts.

  const isDomReady = typeof document !== 'undefined' && Boolean(document.body);
  const norm = normalizeVolunteer(selectedVol);

  const reviewModal = (selectedVolId && isDomReady) ? createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      id="volunteer-review-modal"
      data-testid="volunteer-review-modal"
    >
      {/* Backdrop */}
      <div
        onClick={handleCloseReview}
        className="fixed inset-0 bg-black/50"
        style={{ backdropFilter: 'blur(2px)' }}
      />

      {/* Panel */}
      <div
        className="relative bg-[#FFFDF9] border border-[#EAE8E1] rounded-3xl w-full max-w-xl shadow-2xl flex flex-col"
        style={{ maxHeight: '90vh' }}
      >
        {/* Header */}
        <div className="h-16 px-6 border-b border-[#EAE8E1] flex items-center justify-between bg-white rounded-t-3xl shrink-0">
          <div>
            <h3 className="text-sm font-semibold text-[#18181B] leading-tight">
              {norm && (norm.status === 'pending_review' || norm.status === 'pending')
                ? 'Review profile'
                : 'Volunteer profile'}
            </h3>
            <p className="text-xs text-zinc-400 font-normal mt-0.5">
              {norm && (norm.status === 'pending_review' || norm.status === 'pending')
                ? 'Review details and make a decision.'
                : 'Review details and manage team assignment.'}
            </p>
          </div>
          <button
            onClick={handleCloseReview}
            className="text-zinc-400 hover:text-[#18181B] p-1.5 rounded-xl hover:bg-zinc-50 transition-colors focus:outline-none"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal content */}
        {loadingProfile && !selectedVol ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-3 min-h-[300px]">
            <KoinoniaInlineLoader variant="skeleton" size="md" label="Loading volunteer details..." centered />
            <p className="text-xs text-zinc-500 font-medium">Loading volunteer details…</p>
          </div>
        ) : profileError && !selectedVol ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-3 min-h-[300px]">
            <AlertCircle className="w-8 h-8 text-amber-500 mx-auto" />
            <p className="text-xs text-zinc-600 font-medium">We couldn’t load this volunteer’s details.</p>
            <Button onClick={() => fetchVolunteerDetails(selectedVolId)} variant="secondary" className="text-xs px-4 py-1.5">
              Try again
            </Button>
          </div>
        ) : norm ? (
          <>
            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Archived warning */}
              {norm.isDeleted && (
                <div className="bg-red-50 border border-red-200/60 text-red-800 rounded-2xl p-4 space-y-1.5 text-xs">
                  <div className="flex items-center gap-1.5 font-semibold">
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                    <span>Archived profile</span>
                  </div>
                  <p>
                    Removed on{' '}
                    <strong>{norm.deletedAtFormatted}</strong>
                    {norm.deletedByEmail && <> by <strong>{norm.deletedByEmail}</strong></>}.
                  </p>
                  {norm.deleteReason && (
                    <p className="bg-white/80 border border-red-100 p-2.5 rounded-xl italic text-red-900">
                      Reason: "{norm.deleteReason}"
                    </p>
                  )}
                </div>
              )}

              {/* Identity */}
              <div className="flex flex-col sm:flex-row gap-4 items-center sm:items-start bg-white border border-[#EAE8E1] p-5 rounded-2xl">
                {norm.photoUrl ? (
                  <img
                    src={norm.photoUrl}
                    alt={norm.fullName}
                    referrerPolicy="no-referrer"
                    className="w-16 h-16 rounded-2xl object-cover border border-[#EAE8E1] shadow-xs shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-2xl bg-[#FAF9F6] flex items-center justify-center text-[#C59B27] font-semibold shrink-0 text-xl border border-[#EAE8E1] uppercase">
                    {norm.initials}
                  </div>
                )}

                <div className="text-center sm:text-left space-y-1.5 min-w-0">
                  <h4 className="font-semibold text-base text-[#18181B] leading-snug">{norm.fullName}</h4>
                  <p className="text-xs text-zinc-400">{norm.email}</p>
                  <div className="flex flex-wrap gap-1.5 justify-center sm:justify-start pt-1">
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${
                      (norm.status === 'approved' || norm.status === 'active')
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                        : (norm.status === 'pending_review' || norm.status === 'pending')
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-red-50 text-red-700 border-red-100'
                    }`}>
                      {norm.statusLabel}
                    </span>
                    {norm.isKoinoniaWorker && (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[#FFFDF5] text-amber-800 border border-[#F5E6BE]">
                        Staff worker
                      </span>
                    )}
                    {norm.preferredTeam && (
                      <span className="px-2 py-0.5 rounded-md text-[10px] bg-zinc-100 text-zinc-600 border border-zinc-200">
                        {norm.preferredTeamLabel}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Contact details */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Contact details</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="space-y-0.5 bg-white p-3.5 rounded-2xl border border-[#EAE8E1]">
                    <span className="text-zinc-400 text-[10px] uppercase tracking-wider block">Phone</span>
                    <span className="font-medium text-zinc-800 flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      {norm.phone}
                    </span>
                  </div>
                  <div className="space-y-0.5 bg-white p-3.5 rounded-2xl border border-[#EAE8E1]">
                    <span className="text-zinc-400 text-[10px] uppercase tracking-wider block">WhatsApp</span>
                    <span className="font-medium text-zinc-800 flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      {norm.whatsAppDisplay}
                    </span>
                  </div>
                  <div className="space-y-0.5 bg-white p-3.5 rounded-2xl border border-[#EAE8E1]">
                    <span className="text-zinc-400 text-[10px] uppercase tracking-wider block">Role</span>
                    <span className="font-medium text-zinc-800">
                      {norm.roleLabel}
                    </span>
                  </div>
                  {norm.isKoinoniaWorker && norm.department && (
                    <div className="space-y-0.5 bg-white p-3.5 rounded-2xl border border-[#EAE8E1]">
                      <span className="text-zinc-400 text-[10px] uppercase tracking-wider block">Department</span>
                      <span className="font-medium text-zinc-800 flex items-center gap-1.5">
                        <Briefcase className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                        {norm.department}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Serving experience */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Serving experience</h4>
                <div className="bg-white p-4 rounded-2xl border border-[#EAE8E1] space-y-3">
                  <div className="text-xs">
                    <span className="text-zinc-400 text-[10px] uppercase tracking-wider block mb-1">Prior experience with minors</span>
                    <p className="text-zinc-700 leading-relaxed whitespace-pre-line bg-[#FAF9F6] p-3 rounded-xl border border-[#EAE8E1]">
                      {norm.hasServingExperience
                        ? 'Yes — prior experience working with minors indicated.'
                        : norm.servingExperienceText
                        ? norm.servingExperienceText
                        : 'No prior experience indicated.'}
                    </p>
                  </div>
                  {norm.note ? (
                    <div className="text-xs">
                      <span className="text-zinc-400 text-[10px] uppercase tracking-wider block mb-1">Additional note</span>
                      <p className="text-zinc-700 leading-relaxed whitespace-pre-line bg-[#FAF9F6] p-3 rounded-xl border border-[#EAE8E1]">
                        {norm.note}
                      </p>
                    </div>
                  ) : (
                    <div className="text-xs">
                      <span className="text-zinc-400 text-[10px] uppercase tracking-wider block mb-1">Additional note</span>
                      <p className="text-zinc-400 text-xs italic">
                        No notes added
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Team assignment (only for non-archived) */}
              {!norm.isDeleted && (
                <div className="space-y-3 pt-2 border-t border-[#EAE8E1]">
                  <div>
                    <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Team assignment</h4>
                    <p className="text-[11px] text-zinc-400 mt-0.5">Choose where this volunteer will serve.</p>
                  </div>
                  <div className="space-y-3 bg-white p-4 rounded-2xl border border-[#EAE8E1]">
                    <div>
                      <label className="text-zinc-400 text-[10px] uppercase tracking-wider block mb-1.5">Assigned team</label>
                      <select
                        value={assignedTeam}
                        onChange={(e) => setAssignedTeam(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-[#EAE8E1] focus:outline-none focus:border-[#C59B27] bg-[#FAF9F6] text-[#18181B] font-medium cursor-pointer"
                      >
                        {teamOptions.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-zinc-400 text-[10px] uppercase tracking-wider block mb-1.5">Decision memo / Internal notes</label>
                      <textarea
                        placeholder="Add an internal note about this volunteer..."
                        value={reviewNote}
                        onChange={(e) => setReviewNote(e.target.value)}
                        rows={2}
                        className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-[#EAE8E1] focus:outline-none focus:border-[#C59B27] transition-all bg-[#FAF9F6]/50 resize-none text-zinc-700"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div
              className="h-20 border-t border-[#EAE8E1] bg-white px-6 rounded-b-3xl flex items-center justify-between shrink-0"
            >
              {norm.isDeleted ? (
                <>
                  <span className="text-xs text-red-600 font-medium flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" /> Archived profile
                  </span>
                  <div className="flex items-center gap-2">
                    <Button onClick={handleCloseReview} variant="secondary" className="px-4 py-2 text-xs">
                      Close
                    </Button>
                    <Button
                      onClick={() => setVolToRestore(selectedVol)}
                      variant="primary"
                      className="px-5 py-2 text-xs flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl"
                    >
                      <RotateCcw className="w-3.5 h-3.5 shrink-0" /> Restore volunteer
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  {/* More actions dropdown */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowMoreActions(!showMoreActions)}
                      className="px-3 py-2 text-xs font-medium text-zinc-600 bg-zinc-50 border border-[#EAE8E1] hover:bg-zinc-100 rounded-xl flex items-center gap-1.5 transition-all focus:outline-none"
                    >
                      <span>More</span>
                      <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${showMoreActions ? 'rotate-180' : ''}`} />
                    </button>
                    {showMoreActions && (
                      <>
                        <div className="fixed inset-0 z-[9998]" onClick={() => setShowMoreActions(false)} />
                        <div className="absolute bottom-12 left-0 z-[9999] bg-white border border-[#EAE8E1] rounded-2xl shadow-xl p-1.5 min-w-[200px] flex flex-col gap-0.5 text-left">
                          {(norm.status === 'approved' || norm.status === 'active') && (
                            <button
                              type="button"
                              disabled={resendingEmail}
                              onClick={handleResendEmail}
                              className="w-full text-left px-3 py-2 text-xs text-zinc-700 hover:bg-zinc-50 rounded-xl flex items-center gap-2 font-medium disabled:opacity-50"
                            >
                              <Mail className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                              {resendingEmail ? 'Sending...' : 'Resend welcome email'}
                            </button>
                          )}
                          {(norm.status === 'pending_review' || norm.status === 'pending') && (
                            <button
                              type="button"
                              disabled={submittingReview}
                              onClick={() => { setShowMoreActions(false); submitDecision('rejected'); }}
                              className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50 rounded-xl flex items-center gap-2 font-medium disabled:opacity-50"
                            >
                              <X className="w-3.5 h-3.5 text-red-400 shrink-0" />
                              Mark as not approved
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => { setShowMoreActions(false); setVolToRemove(selectedVol); }}
                            className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50 rounded-xl flex items-center gap-2 font-medium"
                          >
                            <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                            Remove volunteer
                          </button>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Button onClick={handleCloseReview} variant="secondary" className="px-4 py-2 text-xs">
                      Cancel
                    </Button>
                    {(norm.status === 'approved' || norm.status === 'active') ? (
                      <Button
                        onClick={handleUpdateAssignment}
                        loading={submittingAssignment}
                        disabled={submittingAssignment}
                        variant="primary"
                        className="px-5 py-2 text-xs flex items-center gap-1 bg-[#C59B27] hover:bg-[#B89047] text-white rounded-xl"
                      >
                        <Check className="w-3.5 h-3.5 shrink-0" /> Save assignment
                      </Button>
                    ) : (
                      <Button
                        onClick={() => submitDecision('approved')}
                        loading={submittingReview}
                        disabled={submittingReview}
                        variant="primary"
                        className="px-5 py-2 text-xs flex items-center gap-1 bg-[#C59B27] hover:bg-[#B89047] text-white rounded-xl"
                      >
                        <Check className="w-3.5 h-3.5 shrink-0" /> Approve volunteer
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>
          </>
        ) : (
          <div className="h-20 border-t border-[#EAE8E1] bg-white px-6 rounded-b-3xl flex items-center justify-end shrink-0">
            <Button onClick={handleCloseReview} variant="secondary" className="px-4 py-2 text-xs">
              Close
            </Button>
          </div>
        )}
      </div>
    </div>,
    document.body
  ) : null;

  const removeModal = (volToRemove && isDomReady) ? createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div
        onClick={() => setVolToRemove(null)}
        className="fixed inset-0 bg-black/50"
        style={{ backdropFilter: 'blur(2px)' }}
      />
      <div className="relative bg-[#FFFDF9] border border-[#EAE8E1] rounded-3xl w-full max-w-md shadow-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
          <h4 className="font-semibold text-base text-[#18181B]">
            Remove {volToRemove.fullName || volToRemove.name || 'volunteer'}?
          </h4>
        </div>
        <p className="text-xs text-zinc-500 mb-4 leading-relaxed">
          {volToRemove.fullName || volToRemove.name || 'This volunteer'} will no longer appear under Active volunteers. Their profile and history will remain available under Removed.
        </p>
        <form onSubmit={handleRemoveVolSubmit} className="space-y-4">
          <div>
            <label className="text-zinc-500 text-[10px] font-semibold uppercase tracking-wider block mb-1.5">
              Reason for removal
            </label>
            <textarea
              placeholder="Please state the reason..."
              required
              value={removeReason}
              onChange={(e) => setRemoveReason(e.target.value)}
              rows={3}
              className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-[#EAE8E1] focus:outline-none focus:border-red-400 transition-all bg-zinc-50 resize-none text-zinc-700"
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#EAE8E1]">
            <Button
              type="button"
              onClick={() => setVolToRemove(null)}
              variant="secondary"
              className="px-4 py-2 text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              loading={submittingRemove}
              disabled={submittingRemove || !removeReason.trim()}
              className="bg-red-600 hover:bg-red-700 text-white px-5 py-2 text-xs font-semibold rounded-xl focus:outline-none"
            >
              Remove volunteer
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  ) : null;

  const restoreModal = (volToRestore && isDomReady) ? createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div
        onClick={() => setVolToRestore(null)}
        className="fixed inset-0 bg-black/50"
        style={{ backdropFilter: 'blur(2px)' }}
      />
      <div className="relative bg-[#FFFDF9] border border-[#EAE8E1] rounded-3xl w-full max-w-md shadow-2xl p-6">
        <div className="flex items-center gap-3 text-emerald-600 mb-4">
          <RotateCcw className="w-5 h-5 shrink-0" />
          <h4 className="font-semibold text-base text-[#18181B]">
            Restore {volToRestore.fullName || volToRestore.name || 'volunteer'}?
          </h4>
        </div>
        <p className="text-xs text-zinc-500 mb-6 leading-relaxed">
          This volunteer will be restored and made available for team assignments again.
        </p>
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#EAE8E1]">
          <Button
            onClick={() => setVolToRestore(null)}
            variant="secondary"
            className="px-4 py-2 text-xs"
          >
            Cancel
          </Button>
          <Button
            onClick={handleRestoreVolSubmit}
            loading={submittingRestore}
            disabled={submittingRestore}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 text-xs font-semibold rounded-xl focus:outline-none"
          >
            Restore volunteer
          </Button>
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  const permanentDeleteModal = (volToDelete && isDomReady) ? createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 animate-fade-in font-sans">
      <div
        className="fixed inset-0 bg-black/50"
        onClick={() => setVolToDelete(null)}
        style={{ backdropFilter: 'blur(2px)' }}
      />
      <div className="relative bg-[#FFFDF9] border border-red-200 rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4">
        <div className="flex items-center gap-2 text-red-600">
          <Trash2 className="w-5 h-5 shrink-0" />
          <h3 className="font-semibold text-base text-[#18181B]">
            Delete {volToDelete.fullName || volToDelete.name || 'Volunteer'} permanently?
          </h3>
        </div>
        <p className="text-xs text-zinc-600 leading-relaxed">
          Their profile and associated personal information will be permanently removed and cannot be restored.
        </p>
        <form onSubmit={handlePermanentDeleteSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-600 block">
              Type <span className="font-mono font-bold text-red-600">DELETE</span> to continue
            </label>
            <input
              required
              type="text"
              value={deleteConfirmationText}
              onChange={(e) => setDeleteConfirmationText(e.target.value)}
              placeholder="DELETE"
              className="w-full px-3 py-2 text-xs font-mono border border-zinc-200 bg-zinc-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-600/10 focus:border-red-400 transition-all text-zinc-800"
              id="single-vol-delete-confirm-input"
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#EAE8E1]">
            <Button
              type="button"
              onClick={() => setVolToDelete(null)}
              variant="secondary"
              className="px-4 py-2 text-xs"
            >
              Cancel
            </Button>
            <button
              type="submit"
              disabled={submittingDelete || deleteConfirmationText.trim() !== 'DELETE'}
              className="px-5 py-2 text-xs font-semibold rounded-xl bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all"
              id="confirm-single-vol-delete-btn"
            >
              {submittingDelete ? 'Deleting…' : 'Delete permanently'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  ) : null;

  const bulkAssignModal = (showBulkAssignModal && isDomReady) ? createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div
        onClick={() => !submittingBulkAssign && setShowBulkAssignModal(false)}
        className="fixed inset-0 bg-black/50"
        style={{ backdropFilter: 'blur(2px)' }}
      />
      <div className="relative bg-[#FFFDF9] border border-[#EAE8E1] rounded-3xl w-full max-w-md shadow-2xl p-6">
        <div className="flex items-center gap-3 text-[#C59B27] mb-4">
          <Briefcase className="w-5 h-5 shrink-0" />
          <h4 className="font-semibold text-base text-[#18181B]">
            Assign {selectedVolIds.length} volunteers
          </h4>
        </div>
        <p className="text-xs text-zinc-500 mb-5 leading-relaxed">
          Select the ministry serving team for the selected volunteers.
        </p>
        <form onSubmit={handleBulkAssignTeam} className="space-y-4">
          <div>
            <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1.5">
              Team
            </label>
            <select
              required
              value={bulkAssignTeam}
              onChange={(e) => setBulkAssignTeam(e.target.value)}
              className="w-full px-3 py-2.5 text-xs rounded-xl border border-[#EAE8E1] bg-white focus:outline-none focus:border-[#C59B27] text-zinc-800"
            >
              <option value="">Select a team...</option>
              {teamOptions.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#EAE8E1]">
            <Button
              type="button"
              onClick={() => setShowBulkAssignModal(false)}
              variant="secondary"
              disabled={submittingBulkAssign}
              className="px-4 py-2 text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={submittingBulkAssign}
              disabled={submittingBulkAssign || !bulkAssignTeam}
              className="px-5 py-2 text-xs"
            >
              Assign team
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  ) : null;

  const bulkApproveModal = (showBulkApproveModal && isDomReady) ? createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div
        onClick={() => !submittingBulkApprove && setShowBulkApproveModal(false)}
        className="fixed inset-0 bg-black/50"
        style={{ backdropFilter: 'blur(2px)' }}
      />
      <div className="relative bg-[#FFFDF9] border border-[#EAE8E1] rounded-3xl w-full max-w-md shadow-2xl p-6">
        <div className="flex items-center gap-3 text-emerald-600 mb-4">
          <UserCheck className="w-5 h-5 shrink-0" />
          <h4 className="font-semibold text-base text-[#18181B]">
            Approve {selectedVolIds.length} volunteers?
          </h4>
        </div>
        <p className="text-xs text-zinc-500 mb-5 leading-relaxed">
          Approved volunteers will be moved to Active and will receive an official welcome email with portal access instructions.
        </p>
        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1.5">
              Assign team (optional)
            </label>
            <select
              value={bulkApproveTeam}
              onChange={(e) => setBulkApproveTeam(e.target.value)}
              className="w-full px-3 py-2.5 text-xs rounded-xl border border-[#EAE8E1] bg-white focus:outline-none focus:border-[#C59B27] text-zinc-800"
            >
              <option value="">Keep current preference</option>
              {teamOptions.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#EAE8E1]">
            <Button
              type="button"
              onClick={() => setShowBulkApproveModal(false)}
              variant="secondary"
              disabled={submittingBulkApprove}
              className="px-4 py-2 text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleBulkApprove}
              loading={submittingBulkApprove}
              disabled={submittingBulkApprove}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 text-xs font-semibold rounded-xl focus:outline-none"
            >
              Approve volunteers
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  const bulkDeclineModal = (showBulkDeclineModal && isDomReady) ? createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div
        onClick={() => !submittingBulkDecline && setShowBulkDeclineModal(false)}
        className="fixed inset-0 bg-black/50"
        style={{ backdropFilter: 'blur(2px)' }}
      />
      <div className="relative bg-[#FFFDF9] border border-[#EAE8E1] rounded-3xl w-full max-w-md shadow-2xl p-6">
        <div className="flex items-center gap-3 text-zinc-700 mb-4">
          <AlertCircle className="w-5 h-5 shrink-0 text-zinc-500" />
          <h4 className="font-semibold text-base text-[#18181B]">
            Decline {selectedVolIds.length} volunteer applications?
          </h4>
        </div>
        <p className="text-xs text-zinc-500 mb-6 leading-relaxed">
          These applicants will be notified via email and their profiles will be moved to Not approved.
        </p>
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#EAE8E1]">
          <Button
            type="button"
            onClick={() => setShowBulkDeclineModal(false)}
            variant="secondary"
            disabled={submittingBulkDecline}
            className="px-4 py-2 text-xs"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleBulkDecline}
            loading={submittingBulkDecline}
            disabled={submittingBulkDecline}
            className="bg-zinc-800 hover:bg-zinc-900 text-white px-5 py-2 text-xs font-semibold rounded-xl focus:outline-none"
          >
            Decline volunteers
          </Button>
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  const bulkRemoveModal = (showBulkRemoveModal && isDomReady) ? createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div
        onClick={() => !submittingBulkRemove && setShowBulkRemoveModal(false)}
        className="fixed inset-0 bg-black/50"
        style={{ backdropFilter: 'blur(2px)' }}
      />
      <div className="relative bg-[#FFFDF9] border border-[#EAE8E1] rounded-3xl w-full max-w-md shadow-2xl p-6">
        <div className="flex items-center gap-3 text-red-600 mb-4">
          <Trash2 className="w-5 h-5 shrink-0" />
          <h4 className="font-semibold text-base text-[#18181B]">
            Remove {selectedVolIds.length} volunteers?
          </h4>
        </div>
        <p className="text-xs text-zinc-500 mb-4 leading-relaxed">
          These volunteers will no longer appear under Active Volunteers. Their event serving history and audit records will be kept. You can restore them at any time from the Removed tab.
        </p>
        <form onSubmit={handleBulkRemove} className="space-y-4">
          <div>
            <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1">
              Reason (optional)
            </label>
            <input
              type="text"
              value={bulkRemoveReason}
              onChange={(e) => setBulkRemoveReason(e.target.value)}
              placeholder="e.g., Stepping down for this season"
              className="w-full px-3 py-2 text-xs rounded-xl border border-[#EAE8E1] bg-white focus:outline-none focus:border-[#C59B27] text-zinc-800"
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#EAE8E1]">
            <Button
              type="button"
              onClick={() => setShowBulkRemoveModal(false)}
              variant="secondary"
              disabled={submittingBulkRemove}
              className="px-4 py-2 text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              loading={submittingBulkRemove}
              disabled={submittingBulkRemove}
              className="bg-red-600 hover:bg-red-700 text-white px-5 py-2 text-xs font-semibold rounded-xl focus:outline-none"
            >
              Remove volunteers
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
        className="fixed inset-0 bg-black/50"
        style={{ backdropFilter: 'blur(2px)' }}
      />
      <div className="relative bg-[#FFFDF9] border border-[#EAE8E1] rounded-3xl w-full max-w-md shadow-2xl p-6">
        <div className="flex items-center gap-3 text-emerald-600 mb-4">
          <RotateCcw className="w-5 h-5 shrink-0" />
          <h4 className="font-semibold text-base text-[#18181B]">
            Restore {selectedVolIds.length} volunteers?
          </h4>
        </div>
        <p className="text-xs text-zinc-500 mb-6 leading-relaxed">
          These volunteers will be restored and will appear under Active Volunteers again.
        </p>
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#EAE8E1]">
          <Button
            type="button"
            onClick={() => setShowBulkRestoreModal(false)}
            variant="secondary"
            disabled={submittingBulkRestore}
            className="px-4 py-2 text-xs"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleBulkRestore}
            loading={submittingBulkRestore}
            disabled={submittingBulkRestore}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 text-xs font-semibold rounded-xl focus:outline-none"
          >
            Restore volunteers
          </Button>
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  const bulkPurgeModal = (showBulkPurgeModal && isDomReady) ? createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 animate-fade-in font-sans" id="confirm-bulk-vol-purge-modal">
      <div
        onClick={() => !submittingBulkPurge && setShowBulkPurgeModal(false)}
        className="fixed inset-0 bg-black/50"
        style={{ backdropFilter: 'blur(2px)' }}
      />
      <div className="relative bg-[#FFFDF9] border border-red-200 rounded-3xl w-full max-w-md shadow-2xl p-6 space-y-4">
        <div className="flex items-center gap-2 text-red-600">
          <Trash2 className="w-5 h-5 shrink-0" />
          <h3 className="font-semibold text-base text-[#18181B]">
            Delete {selectedVolIds.length} volunteers permanently?
          </h3>
        </div>
        <p className="text-xs text-zinc-600 leading-relaxed">
          These profiles and their associated personal information will be permanently removed and cannot be restored.
        </p>
        <form onSubmit={handleBulkPurge} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-600 block">
              Type <span className="font-mono font-bold text-red-600">DELETE</span> to continue
            </label>
            <input
              required
              type="text"
              value={bulkPurgeConfirmText}
              onChange={(e) => setBulkPurgeConfirmText(e.target.value)}
              placeholder="DELETE"
              className="w-full px-3 py-2 text-xs font-mono border border-zinc-200 bg-zinc-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-600/10 focus:border-red-400 transition-all text-zinc-800"
              id="bulk-vol-purge-confirm-input"
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#EAE8E1]">
            <Button
              type="button"
              onClick={() => setShowBulkPurgeModal(false)}
              variant="secondary"
              disabled={submittingBulkPurge}
              className="px-4 py-2 text-xs"
            >
              Cancel
            </Button>
            <button
              type="submit"
              disabled={submittingBulkPurge || bulkPurgeConfirmText.trim() !== 'DELETE'}
              className="px-5 py-2 text-xs font-semibold rounded-xl bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all"
              id="confirm-bulk-vol-purge-btn"
            >
              {submittingBulkPurge ? 'Deleting…' : 'Delete permanently'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  ) : null;

  // ---- RENDER ----
  return (
    <div
      className="space-y-6"
      data-view-version="admin-volunteers-v5-refined"
      id="admin-volunteers-module-root"
    >
      {/* Portal modals */}
      {reviewModal}
      {removeModal}
      {restoreModal}
      {permanentDeleteModal}
      {bulkAssignModal}
      {bulkApproveModal}
      {bulkDeclineModal}
      {bulkRemoveModal}
      {bulkRestoreModal}
      {bulkPurgeModal}

      {/* 1. Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 pb-4 border-b border-[#EAE8E1]">
        <div>
          <h2
            className="font-serif-koinonia text-2xl font-bold text-[#18181B] tracking-tight"
            style={{ fontFamily: "'Cormorant Garamond', serif" }}
          >
            Volunteer team
          </h2>
          <p className="text-xs text-zinc-500 mt-1">Manage volunteers, team assignments and approvals.</p>
        </div>
        <Button
          onClick={() => setShowAddVolunteerModal(true)}
          variant="primary"
          className="text-xs px-4 py-2 flex items-center gap-1.5"
        >
          <Users className="w-4 h-4" />
          <span>Invite volunteer</span>
        </Button>
      </div>

      {/* 2. Compact summary strip */}
      <div className="bg-white border border-[#EAE8E1] rounded-2xl px-6 py-4">
        <div className="flex items-center divide-x divide-[#EAE8E1]">
          <div className="pr-8">
            <p className="text-[10px] text-zinc-400 mb-0.5">Volunteers</p>
            <p className="text-lg font-semibold text-[#18181B]">{stats.totalVolunteers}</p>
          </div>
          <div className="px-8">
            <p className="text-[10px] text-zinc-400 mb-0.5">Awaiting review</p>
            <p className="text-lg font-semibold text-amber-600">{stats.pendingReview}</p>
          </div>
          <div className="px-8">
            <p className="text-[10px] text-zinc-400 mb-0.5">Active</p>
            <p className="text-lg font-semibold text-emerald-600">{stats.approvedVolunteers}</p>
          </div>
          <div className="pl-8">
            <p className="text-[10px] text-zinc-400 mb-0.5">Teams</p>
            <p className="text-lg font-semibold text-zinc-700">{stats.assignedTeams}</p>
          </div>
        </div>
      </div>

      {/* 3. Tabs */}
      <div className="flex border-b border-[#EAE8E1]" id="volunteers-list-tabs">
        {tabs.map(tab => {
          const count =
            tab.id === 'active'
              ? (stats.approvedVolunteers ?? 0)
              : tab.id === 'pending'
              ? (stats.pendingReview ?? 0)
              : tab.id === 'declined'
              ? (stats.declinedVolunteers ?? 0)
              : (stats.removedVolunteers ?? 0);

          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`px-4 py-2.5 text-xs font-medium transition-all border-b-2 cursor-pointer focus:outline-none flex items-center gap-1.5 ${
                activeTab === tab.id
                  ? 'border-[#C59B27] text-[#18181B]'
                  : 'border-transparent text-zinc-400 hover:text-zinc-600'
              }`}
              id={`tab-${tab.id}-volunteers`}
            >
              <span>{tab.label}</span>
              <span
                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                  tab.id === 'pending' && count > 0
                    ? 'bg-amber-100 text-amber-700'
                    : activeTab === tab.id
                    ? 'bg-zinc-100 text-zinc-900'
                    : 'bg-zinc-100/70 text-zinc-500'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* 4. Filters & Search */}
      <div className="bg-white border border-[#EAE8E1] rounded-2xl p-4 flex flex-col md:flex-row gap-3 items-center">
        <div className="relative w-full md:flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Search volunteers by name, email, or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-[#EAE8E1] focus:outline-none focus:border-[#C59B27] transition-all bg-zinc-50/50"
          />
        </div>
        <div className="flex flex-wrap w-full md:w-auto items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-xl border border-[#EAE8E1] focus:outline-none focus:border-[#C59B27] bg-[#FAF9F6] text-zinc-700 cursor-pointer"
          >
            <option value="">Status</option>
            <option value="pending_review">Awaiting review</option>
            <option value="approved">Active</option>
            <option value="rejected">Not approved</option>
          </select>
          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-xl border border-[#EAE8E1] focus:outline-none focus:border-[#C59B27] bg-[#FAF9F6] text-zinc-700 cursor-pointer"
          >
            <option value="">Team</option>
            {teamOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          {(searchQuery || statusFilter || teamFilter) && (
            <button
              onClick={() => { setSearchQuery(''); setStatusFilter(''); setTeamFilter(''); }}
              className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors focus:outline-none"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Contextual Action Bar */}
      {selectedVolIds.length > 0 && (
        <div className="bg-[#FAF9F5] border border-[#EAE8E1] rounded-2xl px-5 py-3 flex flex-wrap items-center justify-between gap-3 text-xs shadow-2xs animate-fade-in mb-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-semibold text-[#18181B] whitespace-nowrap">
              {selectedVolIds.length} selected
            </span>
            {activeTab !== 'removed' && (
              <>
                <div className="h-4 w-px bg-[#EAE8E1] hidden sm:block" />
                <span className="text-zinc-500 font-medium">
                  {canBeApprovedVolunteers.length > 0 && activeVolunteers.length > 0
                    ? `${canBeApprovedVolunteers.length} can be approved · ${activeVolunteers.length} already active`
                    : canBeApprovedVolunteers.length > 0
                    ? `${canBeApprovedVolunteers.length} eligible for review`
                    : `${activeVolunteers.length} active`
                  }
                </span>
              </>
            )}
            {activeTab === 'removed' && (
              <>
                <div className="h-4 w-px bg-[#EAE8E1] hidden sm:block" />
                <span className="text-zinc-500 font-medium">
                  {selectedVolIds.length} removed {selectedVolIds.length === 1 ? 'record' : 'records'}
                </span>
              </>
            )}
            <div className="h-4 w-px bg-[#EAE8E1] hidden sm:block" />
            <div className="flex flex-wrap items-center gap-2">
              {activeTab !== 'removed' ? (
                <>
                  {canApprove && (
                    <button
                      type="button"
                      onClick={() => setShowBulkApproveModal(true)}
                      className="px-3.5 py-1.5 rounded-xl bg-[#C59B27] text-white font-medium hover:bg-[#b08a23] transition-colors focus:outline-none cursor-pointer"
                    >
                      {activeTab === 'declined'
                        ? (canBeApprovedVolunteers.length === selectedVolIds.length ? 'Reconsider / Approve' : `Reconsider / Approve ${canBeApprovedVolunteers.length}`)
                        : (canBeApprovedVolunteers.length === selectedVolIds.length ? 'Approve' : `Approve ${canBeApprovedVolunteers.length}`)
                      }
                    </button>
                  )}
                  {canAssignTeam && (
                    <button
                      type="button"
                      onClick={() => setShowBulkAssignModal(true)}
                      className="px-3.5 py-1.5 rounded-xl bg-white border border-[#EAE8E1] text-zinc-700 font-medium hover:bg-zinc-50 transition-colors focus:outline-none cursor-pointer"
                    >
                      Assign team{activeVolunteers.length < selectedVolIds.length ? ` (${activeVolunteers.length})` : ''}
                    </button>
                  )}
                  {canDecline && (
                    <button
                      type="button"
                      onClick={() => setShowBulkDeclineModal(true)}
                      className="px-3.5 py-1.5 rounded-xl bg-white border border-[#EAE8E1] text-zinc-700 font-medium hover:bg-zinc-50 transition-colors focus:outline-none cursor-pointer"
                    >
                      Decline{pendingVolunteers.length < selectedVolIds.length ? ` ${pendingVolunteers.length}` : ''}
                    </button>
                  )}
                  {canRemove && (
                    <div className="relative inline-block text-left" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => setBulkMoreDropdownOpen(!bulkMoreDropdownOpen)}
                        className="px-3 py-1.5 rounded-xl bg-white border border-[#EAE8E1] text-zinc-700 font-medium hover:bg-zinc-50 transition-colors focus:outline-none cursor-pointer flex items-center gap-1"
                      >
                        <span>More</span>
                        <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
                      </button>
                      {bulkMoreDropdownOpen && (
                        <div className="absolute left-0 mt-1 w-36 bg-white border border-[#EAE8E1] rounded-2xl shadow-lg py-1 z-30 animate-fade-in text-left">
                          <button
                            type="button"
                            onClick={() => {
                              setBulkMoreDropdownOpen(false);
                              setShowBulkRemoveModal(true);
                            }}
                            className="w-full text-left px-3.5 py-2 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-red-600" />
                            <span>Remove</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <>
                  {canRestore && (
                    <button
                      type="button"
                      onClick={() => setShowBulkRestoreModal(true)}
                      disabled={submittingBulkRestore}
                      className="px-3.5 py-1.5 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-700 transition-colors focus:outline-none cursor-pointer disabled:opacity-50"
                    >
                      {submittingBulkRestore ? 'Restoring…' : 'Restore'}
                    </button>
                  )}
                  {canPurge && (
                    <div className="relative inline-block text-left" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => setBulkMoreDropdownOpen(!bulkMoreDropdownOpen)}
                        className="px-3 py-1.5 rounded-xl bg-white border border-[#EAE8E1] text-zinc-700 font-medium hover:bg-zinc-50 transition-colors focus:outline-none cursor-pointer flex items-center gap-1"
                      >
                        <span>More</span>
                        <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
                      </button>
                      {bulkMoreDropdownOpen && (
                        <div className="absolute left-0 mt-1 w-44 bg-white border border-[#EAE8E1] rounded-2xl shadow-lg py-1 z-30 animate-fade-in text-left">
                          <button
                            type="button"
                            onClick={() => {
                              setBulkMoreDropdownOpen(false);
                              setBulkPurgeConfirmText('');
                              setShowBulkPurgeModal(true);
                            }}
                            className="w-full text-left px-3.5 py-2 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-red-600" />
                            <span>Delete permanently</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSelectedVolIds([])}
            className="text-zinc-500 hover:text-[#18181B] text-xs font-medium underline-offset-4 hover:underline transition-colors cursor-pointer"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* 5. Volunteer table */}
      <div className="bg-white border border-[#EAE8E1] rounded-3xl overflow-hidden shadow-xs">
        {loading ? (
          <div className="p-8">
            <KoinoniaInlineLoader variant="skeleton" size="lg" label="Loading volunteers..." centered />
          </div>
        ) : volunteers.length === 0 ? (
          <div className="text-center py-16 text-zinc-400 space-y-2">
            <Users className="w-7 h-7 stroke-[1.5] mx-auto text-zinc-300" />
            <p className="text-sm text-zinc-500 font-medium">{emptyStateMessage[activeTab]}</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="bg-[#FAF9F6] border-b border-[#EAE8E1] text-zinc-500">
                    <th className="p-4 pl-6 w-10 text-center">
                      <AdminSelectionCheckbox
                        checked={isAllVisibleSelected}
                        indeterminate={isIndeterminate}
                        onChange={handleToggleSelectAll}
                        ariaLabel="Select all visible volunteers"
                      />
                    </th>
                    <th className="p-4 text-[11px] font-semibold">Volunteer</th>
                    <th className="p-4 text-[11px] font-semibold">Contact</th>
                    <th className="p-4 text-[11px] font-semibold">Role</th>
                    <th className="p-4 text-[11px] font-semibold">Team</th>
                    <th className="p-4 text-[11px] font-semibold">Status</th>
                    <th className="p-4 pr-6 text-right text-[11px] font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EAE8E1]">
                  {volunteers.map((vol) => {
                    const sLabel = statusLabel(vol);
                    const statusCls =
                      (vol.status === 'approved' || vol.status === 'active')
                        ? 'text-emerald-700'
                        : (vol.status === 'pending_review' || vol.status === 'pending')
                        ? 'text-amber-700'
                        : 'text-zinc-500';

                    const isRemoved = vol.isDeleted || activeTab === 'removed';
                    const isPending = vol.status === 'pending_review' || vol.status === 'pending';
                    const actionLabel = isPending ? 'Review profile' : 'View profile';
                    const isSelected = selectedVolIds.includes(String(vol.id));

                    return (
                      <tr
                        key={vol.id}
                        className={`transition-colors ${isSelected ? 'bg-[#FAF8F2]' : 'hover:bg-zinc-50/50'}`}
                        data-volunteer-row-id={vol.id}
                      >
                        {/* Checkbox */}
                        <td className="p-4 pl-6 w-10 text-center" onClick={(e) => e.stopPropagation()}>
                          <AdminSelectionCheckbox
                            checked={isSelected}
                            onChange={() => handleToggleSelectVol(String(vol.id))}
                            ariaLabel={`Select ${vol.fullName || vol.name || 'volunteer'}`}
                          />
                        </td>

                        {/* Volunteer */}
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            {vol.photoUrl ? (
                              <img
                                src={vol.photoUrl}
                                alt={vol.fullName || 'Volunteer'}
                                referrerPolicy="no-referrer"
                                className="w-9 h-9 rounded-xl object-cover border border-zinc-200 shrink-0"
                              />
                            ) : (
                              <div className="w-9 h-9 rounded-xl bg-[#FAF9F6] border border-[#EAE8E1] flex items-center justify-center text-zinc-400 font-semibold shrink-0 text-sm uppercase">
                                {getInitials(vol.fullName || vol.name)}
                              </div>
                            )}
                            <div className="min-w-0">
                              <span className="font-medium text-[#18181B] block text-xs leading-snug truncate">{vol.fullName || vol.name || 'Volunteer'}</span>
                              <span className="text-[10px] text-zinc-400 block truncate">{vol.email || 'No email'}</span>
                            </div>
                          </div>
                        </td>

                        {/* Contact */}
                        <td className="p-4">
                          <span className="block text-zinc-700 font-medium">{vol.phone || 'N/A'}</span>
                          {vol.whatsapp && (
                            <span className="text-[10px] text-zinc-400 flex items-center gap-1 mt-0.5">
                              <MessageSquare className="w-3 h-3 text-emerald-500 shrink-0" />
                              WhatsApp available
                            </span>
                          )}
                        </td>

                        {/* Role */}
                        <td className="p-4">
                          {vol.isKoinoniaWorker ? (
                            <div>
                              <span className="px-1.5 py-0.5 rounded bg-[#FAF6EC] border border-[#C59B27]/20 text-[#C59B27] font-semibold text-[10px]">
                                Staff
                              </span>
                              {vol.department && (
                                <span className="block text-[10px] text-zinc-400 truncate max-w-32 mt-0.5">
                                  {vol.department}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-zinc-400 text-[11px]">Regular</span>
                          )}
                        </td>

                        {/* Team */}
                        <td className="p-4" data-volunteer-team={vol.preferredTeam}>
                          {(vol.status === 'approved' || vol.status === 'active') && !isRemoved ? (
                            <select
                              value={vol.preferredTeam || 'General assistance'}
                              onChange={async (e) => {
                                const newTeam = e.target.value;
                                try {
                                  const res = await api.admin.updateVolunteerAssignment(vol.id, newTeam);
                                  if (res.success) {
                                    showSuccess('Team updated', `${vol.fullName || vol.name || 'Volunteer'} assigned to ${teamLabel(newTeam)}.`);
                                    await fetchVolunteers();
                                  }
                                } catch (err: any) {
                                  const parsed = extractApiError(err);
                                  showError('Update failed', parsed.message);
                                }
                              }}
                              className="px-2 py-1 text-xs rounded-lg border border-[#EAE8E1] bg-[#FAF9F6] text-zinc-700 cursor-pointer focus:outline-none focus:border-[#C59B27]"
                            >
                              {teamOptions.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-zinc-400 text-[11px] italic">{teamLabel(vol.preferredTeam)}</span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="p-4">
                          <span className={`text-xs font-medium ${statusCls}`}>
                            {sLabel}
                          </span>
                        </td>

                        {/* Action */}
                        <td className="p-4 pr-6 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {/* Primary action */}
                            <button
                              onClick={() => handleOpenReview(vol)}
                              className="px-3 py-1.5 text-xs font-medium text-[#C59B27] hover:bg-[#C59B27]/5 border border-[#C59B27]/20 hover:border-[#C59B27]/40 rounded-xl transition-all cursor-pointer focus:outline-none"
                              data-volunteer-review-action={vol.id}
                            >
                              {actionLabel}
                            </button>

                            {/* Overflow menu */}
                            {isRemoved ? (
                              <div className="flex items-center gap-1.5 justify-end">
                                <button
                                  onClick={() => setVolToRestore(vol)}
                                  className="px-2.5 py-1.5 text-xs font-medium text-emerald-600 hover:bg-emerald-50 border border-emerald-200/60 hover:border-emerald-300 rounded-xl transition-all cursor-pointer focus:outline-none flex items-center gap-1"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  Restore
                                </button>
                                {isSuperAdmin && (
                                  <div className="relative inline-block text-left" ref={openActionMenuId === vol.id ? actionMenuRef : undefined}>
                                    <button
                                      onClick={() => setOpenActionMenuId(openActionMenuId === vol.id ? null : vol.id)}
                                      className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg transition-colors cursor-pointer focus:outline-none"
                                      aria-label="More options"
                                    >
                                      <MoreHorizontal className="w-4 h-4" />
                                    </button>
                                    {openActionMenuId === vol.id && (
                                      <div className="absolute right-0 top-8 z-[200] bg-white border border-[#EAE8E1] rounded-2xl shadow-xl p-1.5 min-w-[160px] flex flex-col gap-0.5 animate-fade-in text-left">
                                        <button
                                          onClick={() => {
                                            setOpenActionMenuId(null);
                                            setVolToRestore(vol);
                                          }}
                                          className="w-full text-left px-3.5 py-2 text-xs text-emerald-700 hover:bg-emerald-50 flex items-center gap-2 transition-colors cursor-pointer rounded-lg"
                                        >
                                          <RotateCcw className="w-3.5 h-3.5" />
                                          <span>Restore</span>
                                        </button>
                                        <div className="h-px bg-zinc-100 my-1" />
                                        <button
                                          onClick={() => {
                                            setOpenActionMenuId(null);
                                            setVolToDelete(vol);
                                            setDeleteConfirmationText('');
                                          }}
                                          className="w-full text-left px-3.5 py-2 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors cursor-pointer rounded-lg"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                          <span>Delete permanently</span>
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="relative" ref={openActionMenuId === vol.id ? actionMenuRef : undefined}>
                                <button
                                  onClick={() => setOpenActionMenuId(openActionMenuId === vol.id ? null : vol.id)}
                                  className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 border border-transparent hover:border-zinc-200 rounded-xl transition-all cursor-pointer focus:outline-none"
                                >
                                  <MoreHorizontal className="w-4 h-4" />
                                </button>
                                {openActionMenuId === vol.id && (
                                  <>
                                    <div
                                      className="fixed inset-0 z-[100]"
                                      onClick={() => setOpenActionMenuId(null)}
                                    />
                                    <div className="absolute right-0 top-8 z-[200] bg-white border border-[#EAE8E1] rounded-2xl shadow-xl p-1.5 min-w-[160px] flex flex-col gap-0.5">
                                      <button
                                        onClick={() => { setOpenActionMenuId(null); setVolToRemove(vol); }}
                                        className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50 rounded-xl flex items-center gap-2 font-medium"
                                      >
                                        <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                                        Remove volunteer
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-[#EAE8E1] px-6 py-4 bg-white rounded-b-3xl">
                <p className="text-xs text-zinc-400">
                  Showing{' '}
                  <span className="font-medium text-zinc-700">{((currentPage - 1) * limit) + 1}</span>
                  {' '}to{' '}
                  <span className="font-medium text-zinc-700">{Math.min(currentPage * limit, totalCount)}</span>
                  {' '}of{' '}
                  <span className="font-medium text-zinc-700">{totalCount}</span>
                </p>
                <nav className="inline-flex -space-x-px rounded-md shadow-xs">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                    disabled={currentPage === 1 || loading}
                    className="relative inline-flex items-center rounded-l-xl px-2 py-2 text-zinc-400 ring-1 ring-inset ring-[#EAE8E1] hover:bg-zinc-50 disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                    <button
                      key={p}
                      onClick={() => setCurrentPage(p)}
                      className={`relative inline-flex items-center px-4 py-2 text-xs font-medium ${
                        currentPage === p
                          ? 'bg-[#C59B27] text-white'
                          : 'text-zinc-600 ring-1 ring-inset ring-[#EAE8E1] hover:bg-zinc-50'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                  <button
                    onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                    disabled={currentPage === totalPages || loading}
                    className="relative inline-flex items-center rounded-r-xl px-2 py-2 text-zinc-400 ring-1 ring-inset ring-[#EAE8E1] hover:bg-zinc-50 disabled:opacity-40"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </nav>
              </div>
            )}
          </>
        )}
      </div>

      {/* Add / Invite Volunteer Modal */}
      <AddVolunteerModal
        isOpen={showAddVolunteerModal}
        onClose={() => setShowAddVolunteerModal(false)}
        onSuccess={() => fetchVolunteers()}
      />
    </div>
  );
};
