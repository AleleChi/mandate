import React, { useEffect, useState } from 'react';
import { AppRoute } from '../../types';
import { 
  Users, 
  UserCheck, 
  Clock, 
  Calendar, 
  ClipboardList, 
  ShieldAlert,
  LogOut, 
  RefreshCw, 
  Bell, 
  Settings, 
  Search,
  MessageSquare,
  FileCheck2,
  TrendingUp,
  Award,
  Menu,
  X,
  Lock,
  UserPlus,
  ShieldCheck,
  Check,
  Shield,
  Loader2,
  ChevronRight
} from 'lucide-react';
import { api, extractApiError } from '../../services/api';
import { useNotification } from '../../context/NotificationContext';
import { BrandLogo } from '../../components/common/BrandLogo';
import { Button } from '../../components/common/Button';
import { KoinoniaInlineLoader } from '../../components/common/KoinoniaInlineLoader';
import { AdminApplicationsView } from './AdminApplicationsView';
import { AdminReviewBoardView } from './AdminReviewBoardView';
import { AdminChildrenView } from './AdminChildrenView';
import { AdminAttendanceView } from './AdminAttendanceView';
import { AdminReportsView } from './AdminReportsView';
import { AdminMessagesView } from './AdminMessagesView';
import { AdminVolunteersView } from './AdminVolunteersView';
import { AdminParentsView } from './AdminParentsView';
import { AdminParentDetailView } from './AdminParentDetailView';
import { AdminSettingsView } from './AdminSettingsView';
import { AdminEventsView } from './AdminEventsView';

type AdminTab = 'overview' | 'events' | 'applications' | 'review' | 'children' | 'attendance' | 'reports' | 'messages' | 'settings' | 'volunteers' | 'parents';

interface AdminOverviewViewProps {
  onNavigate: (route: AppRoute) => void;
  onSignOut: () => void;
  adminUser: any;
  initialTab?: AdminTab;
  currentRoute?: string;
}

export const AdminOverviewView: React.FC<AdminOverviewViewProps> = ({
  onNavigate,
  onSignOut,
  adminUser,
  initialTab = 'overview',
  currentRoute
}) => {
  const { showError, showSuccess } = useNotification();
  const [activeTab, setActiveTab] = useState<AdminTab>((initialTab || 'overview') as AdminTab);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [headerTab, setHeaderTab] = useState<'current' | 'upcoming'>('current');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Rich dashboard dynamic dataset
  const [overviewData, setOverviewData] = useState<any>(null);

  // Fallback stats for quick reference/backwards compatibility
  const [stats, setStats] = useState<any>({
    totalChildren: 0,
    underReview: 0,
    approved: 0,
    totalParents: 0,
    totalVolunteers: 0,
    pendingVolunteers: 0,
    checkedIn: 0,
    pickedUp: 0
  });
  const [recentSubmissions, setRecentSubmissions] = useState<any[]>([]);

  // Password change states
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // Invite states
  const [adminsList, setAdminsList] = useState<any[]>([]);
  const [loadingAdmins, setLoadingAdmins] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'super_admin' | 'team'>('admin');
  const [sendingInvite, setSendingInvite] = useState(false);

  // Attention filter modal
  const [activeAttentionModal, setActiveAttentionModal] = useState<{ id: string, label: string } | null>(null);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab as AdminTab);
    }
  }, [initialTab]);

  const fetchDashboardData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await api.admin.getOverview();
      if (res.success) {
        setOverviewData(res);
        setStats({
          totalChildren: res.metrics?.totalChildren ?? res.stats?.totalChildren ?? 0,
          underReview: res.metrics?.underReview ?? res.stats?.underReview ?? 0,
          approved: res.metrics?.selected ?? res.stats?.approved ?? 0,
          totalParents: res.metrics?.totalParents ?? res.stats?.totalParents ?? 0,
          totalVolunteers: res.stats?.totalVolunteers ?? 0,
          pendingVolunteers: res.stats?.pendingVolunteers ?? 0,
          checkedIn: res.metrics?.checkedIn ?? res.stats?.checkedIn ?? 0,
          pickedUp: res.metrics?.pickedUp ?? 0
        });
        setRecentSubmissions(res.recentSubmissions || []);
        if (isRefresh) {
          showSuccess('Synchronized', 'Dashboard analytics refreshed.');
        }
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Sync Failed', parsed.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchAdminsList = async () => {
    setLoadingAdmins(true);
    try {
      const res = await api.admin.listAdmins();
      if (res.success) {
        setAdminsList(res.admins || []);
      }
    } catch (err: any) {
      console.error('Failed to load admin directory:', err);
    } finally {
      setLoadingAdmins(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  useEffect(() => {
    if (activeTab === 'settings') {
      fetchAdminsList();
    }
  }, [activeTab]);

  const handleSignOut = () => {
    onSignOut();
    onNavigate('/');
  };

  const handleTabChange = (tab: AdminTab) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
    if (tab === 'overview') {
      onNavigate('/admin/overview');
    } else if (tab === 'settings') {
      onNavigate('/admin/settings');
    } else if (tab === 'applications') {
      onNavigate('/admin/applications');
    } else if (tab === 'review') {
      onNavigate('/admin/review');
    } else if (tab === 'children') {
      onNavigate('/admin/children');
    } else if (tab === 'attendance') {
      onNavigate('/admin/attendance');
    } else if (tab === 'reports') {
      onNavigate('/admin/reports');
    } else if (tab === 'messages') {
      onNavigate('/admin/messages');
    } else if (tab === 'parents') {
      onNavigate('/admin/parents');
    } else if (tab === 'volunteers') {
      onNavigate('/admin/volunteers');
    }
  };

  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword || !confirmNewPassword) {
      showError('Error', 'All password fields are required.');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      showError('Mismatch', 'New passwords do not match.');
      return;
    }

    const hasLetter = /[a-zA-Z]/.test(newPassword);
    const hasNumber = /[0-9]/.test(newPassword);
    if (newPassword.length < 8 || !hasLetter || !hasNumber) {
      showError('Weak Password', 'New password must be at least 8 characters and contain both letters and numbers.');
      return;
    }

    setChangingPassword(true);
    try {
      const res = await api.admin.changePassword({ currentPassword, newPassword });
      if (res.success) {
        showSuccess('Password Updated', 'Your admin password was updated successfully.');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmNewPassword('');
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Update Failed', parsed.message || 'Could not update your password.');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) {
      showError('Error', 'Email address is required.');
      return;
    }

    setSendingInvite(true);
    try {
      const res = await api.admin.inviteAdmin({ email: inviteEmail, role: inviteRole });
      if (res.success) {
        showSuccess('Invitation Sent', `Sent admin invitation link to ${inviteEmail}.`);
        setInviteEmail('');
        fetchAdminsList(); // refresh list
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Invitation Failed', parsed.message || 'Could not send invitation.');
    } finally {
      setSendingInvite(false);
    }
  };

  const isSuperAdmin = adminUser?.role === 'super_admin';
  const adminRoleTitle = overviewData?.admin?.roleTitle || (adminUser?.role === 'super_admin' ? 'Global Director' : adminUser?.role === 'admin' ? 'Senior Director' : 'Ministry Admin');
  const adminFullName = overviewData?.admin?.fullName || adminUser?.fullName || 'Admin User';

  const demographics = overviewData?.demographics || [];
  const needsAttentionList = overviewData?.needsAttention?.items || [];
  const needsAttentionTotal = overviewData?.needsAttention?.total || 0;
  const reviewProgress = overviewData?.reviewProgress || { selected: 0, underReview: 0, notSelected: 0 };
  const attendanceData = overviewData?.attendance || { expected: 0, checkedIn: 0, stillInside: 0, pickedUp: 0, notArrived: 0 };
  const recentActivityList = overviewData?.recentActivity || [];

  const renderPlaceholderSection = (tabName: string) => (
    <div className="bg-white border border-[#EAE8E1] rounded-2xl p-12 text-center max-w-2xl mx-auto space-y-4 shadow-xs">
      <div className="w-12 h-12 bg-[#C59B27]/5 border border-[#C59B27]/15 text-[#C59B27] rounded-2xl flex items-center justify-center mx-auto">
        <ClipboardList className="w-6 h-6" />
      </div>
      <h3 className="font-serif text-lg font-bold text-[#18181B]">{tabName}</h3>
      <p className="text-xs text-zinc-500 leading-relaxed max-w-md mx-auto">
        This view displays event records and information. Select a primary option above or return to the overview page.
      </p>
      <button
        onClick={() => setActiveTab('overview')}
        className="text-xs font-semibold text-[#C59B27] hover:underline block mx-auto"
      >
        Return to Overview
      </button>
    </div>
  );

  // Sidebar navigation element markup - Approved Light Design
  const renderSidebarContent = () => (
    <div className="flex flex-col h-full justify-between" data-component-version="admin-sidebar-approved-v1">
      <div className="flex flex-col">
        {/* Brand block - Light warm design */}
        <div className="h-20 px-6 border-b border-[#EAE8E1] flex items-center justify-between">
          <div className="flex flex-col justify-center items-start">
            <BrandLogo
              context="admin"
              data-component-version="admin-brand-logo-v1-configured"
            />
          </div>
          {/* Mobile close button */}
          <button 
            onClick={() => setMobileMenuOpen(false)}
            className="lg:hidden text-zinc-500 hover:text-[#18181B] p-1 rounded-lg focus:outline-none"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav Items - Approved Light styling */}
        <nav className="p-4 space-y-1">
          <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest px-3 mb-2">
            Ministry Admin
          </div>
          
          {[
            { id: 'overview', label: 'Overview', icon: ClipboardList },
            { id: 'events', label: 'Events', icon: Calendar },
            { id: 'applications', label: 'Applications', icon: Users },
            { id: 'volunteers', label: 'Volunteers', icon: Award },
            { id: 'parents', label: 'Parents', icon: Users },
            { id: 'review', label: 'Review', icon: ShieldAlert },
            { id: 'children', label: 'Children', icon: Users },
            { id: 'attendance', label: 'Attendance', icon: UserCheck },
            { id: 'reports', label: 'Reports', icon: TrendingUp },
            { id: 'messages', label: 'Messages', icon: MessageSquare },
            { id: 'settings', label: 'Settings', icon: Settings },
          ].map((item) => {
            const IconComponent = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleTabChange(item.id as AdminTab)}
                className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-[#C59B27]/5 text-[#18181B] border-l-4 border-[#C59B27] pl-2 font-semibold'
                    : 'text-zinc-500 hover:bg-zinc-50 hover:text-[#18181B] border-l-4 border-transparent'
                }`}
              >
                <IconComponent className={`w-4 h-4 ${isActive ? 'text-[#C59B27]' : 'text-zinc-400'}`} />
                <span>{item.label}</span>
                {item.id === 'review' && stats.pendingVolunteers > 0 && (
                  <span className="ml-auto bg-[#C59B27] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                    {stats.pendingVolunteers}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* User profile & Sign Out inside Sidebar - Approved Light aesthetics */}
      <div className="p-4 border-t border-[#EAE8E1] bg-[#FAF9F6]">
        <div className="flex items-center space-x-3 mb-3">
          <div className="w-9 h-9 rounded-full bg-[#C59B27]/10 flex items-center justify-center text-[#C59B27] font-bold text-xs shrink-0 border border-[#C59B27]/20">
            {adminFullName.substring(0, 2).toUpperCase()}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-semibold text-[#18181B] truncate">
              {adminFullName}
            </span>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="w-full flex items-center justify-center space-x-2 px-3 py-2 rounded-xl text-xs font-semibold bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 hover:text-red-700 transition-all focus:outline-none cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );

  // Filter submissions by attention type for dynamic attention viewing
  const getFilteredAttentionChildren = (filterId: string) => {
    if (!recentSubmissions || recentSubmissions.length === 0) return [];
    if (filterId === 'below_age') {
      return recentSubmissions.filter((s: any) => s.age < 1 || String(s.age_group).toLowerCase().includes('below 1') || String(s.age_group).toLowerCase().includes('under 1'));
    }
    if (filterId === 'medical') {
      return recentSubmissions.filter((s: any) => s.status === 'under_review' || s.has_medical_notes || s.medical_notes);
    }
    if (filterId === 'missing_pickup') {
      return recentSubmissions.filter((s: any) => !s.photo_file_id && !s.photo_url);
    }
    return recentSubmissions;
  };

  const activeFilteredKids = activeAttentionModal ? getFilteredAttentionChildren(activeAttentionModal.id) : [];

  return (
    <div 
      className="min-h-screen bg-[#FAF9F6] text-[#18181B] flex font-sans antialiased relative overflow-hidden"
      data-view-version="admin-layout-v2-approved-design"
      data-layout-mode="admin-responsive-v1"
    >
      
      {/* DESKTOP SIDEBAR - Approved Light Background */}
      <aside className="w-64 bg-[#F9F8F3] flex flex-col justify-between shrink-0 border-r border-[#EAE8E1] hidden lg:flex">
        {renderSidebarContent()}
      </aside>

      {/* MOBILE DRAWER SIDEBAR */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          {/* Backdrop */}
          <div 
            onClick={() => setMobileMenuOpen(false)}
            className="fixed inset-0 bg-black/40 transition-opacity backdrop-blur-xs" 
          />
          {/* Drawer Panel */}
          <div className="relative flex w-full max-w-xs flex-1 flex-col bg-[#F9F8F3] h-full animate-slide-in-left shadow-2xl">
            {renderSidebarContent()}
          </div>
        </div>
      )}

      {/* RIGHT MAIN WINDOW */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        
        {/* Top bar header - Styled with warm ivory theme */}
        <header className="h-20 bg-white border-b border-[#EAE8E1] px-4 sm:px-8 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3 sm:space-x-4">
            {/* Hamburger Button */}
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="p-2 -ml-2 rounded-xl text-zinc-500 hover:text-[#18181B] hover:bg-zinc-50 lg:hidden focus:outline-none"
              title="Toggle Menu"
            >
              <Menu className="w-5.5 h-5.5" />
            </button>
            
            <h1 className="text-base sm:text-lg font-serif font-medium text-zinc-800 tracking-normal">
              Children and Teens Admin
            </h1>

            {/* Custom Tabs */}
            <div className="hidden sm:flex items-center bg-zinc-50 p-1 rounded-xl border border-[#EAE8E1] ml-4">
              <button
                onClick={() => setHeaderTab('current')}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                  headerTab === 'current'
                    ? 'bg-white text-[#18181B] shadow-xs'
                    : 'text-zinc-500 hover:text-[#18181B]'
                }`}
              >
                Current Event
              </button>
              <button
                onClick={() => setHeaderTab('upcoming')}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                  headerTab === 'upcoming'
                    ? 'bg-white text-[#18181B] shadow-xs'
                    : 'text-zinc-500 hover:text-[#18181B]'
                }`}
              >
                Upcoming
              </button>
            </div>
          </div>

          <div className="flex items-center space-x-2 sm:space-x-4">
            {/* Search Input field (Desktop) */}
            <div className="relative max-w-xs hidden md:block">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-zinc-400">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search children, parents, applications..."
                className="w-56 lg:w-72 pl-9 pr-3 py-1.5 text-xs rounded-xl border border-[#EAE8E1] bg-[#FAF9F6] focus:outline-none focus:ring-2 focus:ring-[#C59B27]/10 focus:border-[#C59B27] transition-all"
              />
            </div>

            {/* Refresh Sync button */}
            <button
              onClick={() => activeTab === 'overview' ? fetchDashboardData(true) : fetchAdminsList()}
              disabled={refreshing || (activeTab === 'settings' && loadingAdmins)}
              className="p-2 text-zinc-500 hover:text-[#18181B] hover:bg-zinc-50 rounded-full transition-colors focus:outline-none cursor-pointer"
              title="Refresh Analytics"
            >
              <RefreshCw className={`w-4 h-4 ${(refreshing || loadingAdmins) ? 'animate-spin text-[#C59B27]' : ''}`} />
            </button>

            <button
              className="p-2 text-zinc-500 hover:text-[#18181B] hover:bg-zinc-50 rounded-full transition-colors relative"
              title="Notifications"
            >
              <Bell className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[#C59B27]" />
            </button>
          </div>
        </header>

        {/* Dashboard Main container */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto space-y-6 sm:space-y-8 bg-[#FAF9F6]">
          
          {/* TAB 1: OVERVIEW DASHBOARD */}
          {activeTab === 'overview' && (
            <div data-view-version="admin-overview-v2-approved-design">
              {headerTab === 'upcoming' ? (
                <div className="bg-white border border-[#EAE8E1] rounded-2xl p-8 text-center max-w-xl mx-auto my-12 shadow-xs animate-fade-in space-y-4">
                  <div className="w-12 h-12 bg-[#C59B27]/5 rounded-full flex items-center justify-center text-[#C59B27] mx-auto">
                    <Calendar className="w-6 h-6" />
                  </div>
                  <h3 className="font-serif text-lg font-bold text-[#18181B]">Upcoming Events</h3>
                  <p className="text-xs text-zinc-500 leading-relaxed">
                    There are no upcoming events scheduled at this time. The current active event is undergoing registration and admissions review.
                  </p>
                  <Button
                    type="button"
                    onClick={() => setHeaderTab('current')}
                    className="text-xs bg-[#C59B27] text-white hover:bg-[#b58c22] px-4 py-2 rounded-xl"
                  >
                    View Active Event
                  </Button>
                </div>
              ) : (
                <>
                  {/* Slim warm alert strip for pending reviews (restyled) */}
                  {stats.pendingVolunteers > 0 && (
                    <div className="bg-[#FFFDF5] border border-[#F5E6BE] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs text-amber-800 shadow-xs mb-6 animate-fade-in">
                      <div className="flex items-center space-x-3">
                        <ShieldAlert className="w-4 h-4 text-[#C59B27] shrink-0" />
                        <span>
                          You have <strong>{stats.pendingVolunteers} volunteer application(s)</strong> awaiting review.
                        </span>
                      </div>
                      <Button
                        type="button"
                        onClick={() => setActiveTab('review')}
                        className="text-[10px] font-bold bg-[#C59B27] text-white hover:bg-[#b58c22] px-3.5 py-1.5 rounded-xl self-start sm:self-center shrink-0 shadow-sm"
                      >
                        Review applications
                      </Button>
                    </div>
                  )}

                  {loading ? (
                    <div data-view-version="admin-dashboard-loading-v2-koinonia" className="w-full">
                      <KoinoniaInlineLoader
                        variant="logo"
                        size="md"
                        label="Loading dashboard..."
                        centered
                      />
                    </div>
                  ) : (
                    <div className="space-y-6 sm:space-y-8">
                      {/* Event Hero Block */}
                      <div 
                        className="bg-white border border-[#EAE8E1] rounded-2xl p-6 sm:p-8 flex flex-col md:flex-row md:items-center md:justify-between gap-6 shadow-xs"
                        data-component-version="admin-event-hero-approved-v1"
                      >
                        <div className="space-y-3.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="bg-[#C59B27]/10 text-[#C59B27] text-[10px] font-bold px-2 py-0.5 rounded-md tracking-wider uppercase">
                              Active Event
                            </span>
                            <span className="bg-emerald-50 text-emerald-700 border border-emerald-100 text-[10px] font-bold px-2 py-0.5 rounded-md tracking-wider uppercase">
                              Registration Open
                            </span>
                          </div>
                          
                          <div>
                            <h2 className="font-serif text-2xl sm:text-3xl font-semibold text-zinc-800 tracking-tight">
                              {overviewData?.event?.name || 'The General Assembly'}
                            </h2>
                            <p className="text-xs text-zinc-500 font-medium mt-1">
                              {overviewData?.event?.section || 'Children and Teens'}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-zinc-500">
                            <span className="flex items-center">
                              <Calendar className="w-3.5 h-3.5 mr-1.5 text-[#C59B27]" />
                              {overviewData?.event?.dateLabel || '22 Nov 2025'}
                            </span>
                            <span className="flex items-center">
                              <Clock className="w-3.5 h-3.5 mr-1.5 text-[#C59B27]" />
                              {overviewData?.event?.timeLabel || '9:00 AM to 7:00 PM'}
                            </span>
                          </div>
                        </div>

                        <div className="flex sm:items-center gap-3 self-start md:self-center shrink-0">
                          <button
                            onClick={() => setActiveTab('reports')}
                            className="text-xs bg-white text-[#18181B] border border-[#EAE8E1] hover:bg-zinc-50 px-4 py-2.5 rounded-xl font-semibold transition-colors"
                          >
                            View reports
                          </button>
                          <button
                            onClick={() => setActiveTab('applications')}
                            className="text-xs bg-[#C59B27] text-white hover:bg-[#b58c22] px-4 py-2.5 rounded-xl font-semibold transition-colors shadow-sm"
                          >
                            Review applications
                          </button>
                        </div>
                      </div>

                      {/* Split Main Content Area */}
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8 items-start">
                        
                        {/* LEFT COLUMN: Overview Metrics & Demographics */}
                        <div className="lg:col-span-2 space-y-6 sm:space-y-8">
                          
                          {/* Overview Metrics section */}
                          <div className="space-y-4" data-component-version="admin-overview-metrics-approved-v1">
                            <h3 className="font-serif text-lg font-medium text-zinc-800 tracking-normal">
                              Overview
                            </h3>

                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                              {[
                                { label: 'Total Children', val: stats.totalChildren, sub: 'registered', tab: 'children' },
                                { label: 'Total Parents', val: stats.totalParents, sub: 'associated', tab: 'parents' },
                                { label: 'Total Volunteers', val: stats.totalVolunteers, sub: 'assigned', tab: 'volunteers' },
                                { label: 'Under Review', val: stats.underReview, sub: 'pending children', tab: 'applications' },
                                { label: 'Selected', val: stats.approved, sub: 'approved passes', tab: 'attendance' },
                                { label: 'Checked In', val: stats.checkedIn, sub: 'on-site today', tab: 'attendance' },
                                { label: 'Picked Up', val: stats.pickedUp, sub: 'safely released', tab: 'attendance' }
                              ].map((item, idx) => (
                                <button 
                                  key={idx} 
                                  onClick={() => handleTabChange(item.tab as AdminTab)}
                                  className="bg-white border border-[#EAE8E1] rounded-2xl p-5 hover:shadow-md transition-all text-left duration-300 relative group cursor-pointer focus:outline-none"
                                >
                                  <span className="text-[10px] font-bold text-zinc-400 group-hover:text-[#C59B27] uppercase tracking-wider block transition-colors">
                                    {item.label}
                                  </span>
                                  <span className="text-2xl font-bold font-serif text-[#18181B] mt-2 block">
                                    {item.val}
                                  </span>
                                  <span className="text-[9px] text-zinc-400 block mt-1 uppercase tracking-wider">
                                    {item.sub}
                                  </span>
                                  <ChevronRight className="w-4 h-4 text-zinc-300 group-hover:text-[#C59B27] absolute right-4 bottom-4 transition-all opacity-0 group-hover:opacity-100 transform group-hover:translate-x-1" />
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Demographics & Status Section */}
                          <div className="space-y-4" data-component-version="admin-demographics-approved-v1">
                            <div className="flex items-baseline justify-between pb-1">
                              <h3 className="font-serif text-lg font-medium text-zinc-800 tracking-normal">
                                Demographics & Status
                              </h3>
                              <button 
                                onClick={() => setActiveTab('reports')}
                                className="text-xs text-[#C59B27] font-semibold hover:underline"
                              >
                                View Full Demographics
                              </button>
                            </div>

                            <div className="bg-white border border-[#EAE8E1] rounded-2xl overflow-hidden shadow-xs">
                              <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs min-w-[500px]">
                                  <thead>
                                    <tr className="border-b border-[#EAE8E1] bg-[#FAF9F6] text-zinc-500 font-bold uppercase tracking-wider text-[9px]">
                                      <th className="py-3.5 px-4 font-semibold">Age Group</th>
                                      <th className="py-3.5 px-4 font-semibold">Boys</th>
                                      <th className="py-3.5 px-4 font-semibold">Girls</th>
                                      <th className="py-3.5 px-4 font-semibold">Total</th>
                                      <th className="py-3.5 px-4 font-semibold">Under Review</th>
                                      <th className="py-3.5 px-4 font-semibold">Selected</th>
                                      <th className="py-3.5 px-4 font-semibold">Checked In</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-[#EAE8E1]">
                                    {demographics.length === 0 ? (
                                      <tr>
                                        <td colSpan={7} className="py-12 px-4 text-center text-zinc-400 font-medium">
                                          No demographic breakdown is available yet.
                                        </td>
                                      </tr>
                                    ) : (
                                      demographics.map((row: any, i: number) => (
                                        <tr key={i} className="hover:bg-zinc-50/50 transition-colors">
                                          <td className="py-3.5 px-4 font-semibold text-[#18181B]">{row.ageGroup}</td>
                                          <td className="py-3.5 px-4 text-zinc-600">{row.boys}</td>
                                          <td className="py-3.5 px-4 text-zinc-600">{row.girls}</td>
                                          <td className="py-3.5 px-4 font-bold text-[#18181B]">{row.total}</td>
                                          <td className="py-3.5 px-4 text-zinc-500">{row.underReview}</td>
                                          <td className="py-3.5 px-4 text-zinc-500">{row.selected}</td>
                                          <td className="py-3.5 px-4 text-emerald-600 font-semibold">{row.checkedIn}</td>
                                        </tr>
                                      ))
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </div>

                        </div>

                        {/* RIGHT COLUMN: Insight Panels */}
                        <div className="space-y-6 sm:space-y-8">
                          
                          {/* Needs attention Panel */}
                          <div 
                            className="bg-[#FFF5F5] border border-[#FEE2E2] rounded-2xl p-5 space-y-4"
                            data-component-version="admin-needs-attention-approved-v1"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-semibold text-red-700 uppercase tracking-widest block">
                                Needs attention
                              </span>
                              {needsAttentionTotal > 0 && (
                                <span className="bg-red-100 text-red-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                  {needsAttentionTotal}
                                </span>
                              )}
                            </div>

                            <div className="divide-y divide-red-100/50 text-xs">
                              {needsAttentionList.length === 0 ? (
                                <p className="text-zinc-500 py-2">No items require immediate attention.</p>
                              ) : (
                                needsAttentionList.map((item: any) => (
                                  <div key={item.id} className="py-2.5 flex items-center justify-between">
                                    <span className="text-zinc-700 font-medium">{item.label}</span>
                                    <div className="flex items-center space-x-2">
                                      <span className="font-bold text-red-700 mr-1.5">{item.count}</span>
                                      <button 
                                        onClick={() => setActiveAttentionModal({ id: item.id, label: item.label })}
                                        className="text-red-700 font-semibold hover:underline"
                                      >
                                        View
                                      </button>
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>

                          {/* Review Progress Panel */}
                          <div 
                            className="bg-white border border-[#EAE8E1] rounded-2xl p-5 space-y-4"
                            data-component-version="admin-review-progress-approved-v1"
                          >
                            <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest block">
                              Review Progress
                            </span>

                            <div className="space-y-4">
                              {[
                                { label: 'Selected', val: reviewProgress.selected || stats.approved, color: 'bg-[#C59B27]' },
                                { label: 'Under review', val: reviewProgress.underReview || stats.underReview, color: 'bg-amber-400' },
                                { label: 'Not selected', val: reviewProgress.notSelected || 0, color: 'bg-zinc-300' }
                              ].map((bar, idx) => {
                                const total = stats.totalChildren || 1;
                                const pct = Math.min(100, Math.round((bar.val / total) * 100));
                                return (
                                  <div key={idx} className="space-y-1">
                                    <div className="flex items-center justify-between text-xs">
                                      <span className="text-zinc-600 font-medium">{bar.label}</span>
                                      <span className="text-[#18181B] font-semibold">{bar.val}</span>
                                    </div>
                                    <div className="w-full bg-zinc-100 h-1.5 rounded-full overflow-hidden">
                                      <div className={`${bar.color} h-full rounded-full`} style={{ width: `${pct}%` }} />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* Today's Attendance Panel */}
                          <div 
                            className="bg-white border border-[#EAE8E1] rounded-2xl p-5 space-y-4"
                            data-component-version="admin-attendance-approved-v1"
                          >
                            <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest block">
                              Today’s Attendance
                            </span>

                            <div className="space-y-4">
                              <div className="flex items-baseline space-x-1">
                                <span className="font-serif text-2xl font-bold text-[#C59B27]">
                                  {attendanceData.checkedIn}
                                </span>
                                <span className="text-xs text-zinc-400 font-medium">
                                  / {attendanceData.expected} Expected
                                </span>
                              </div>

                              <div className="grid grid-cols-2 gap-x-4 gap-y-3.5 text-xs border-t border-zinc-50 pt-3">
                                {[
                                  { label: 'Checked in', val: attendanceData.checkedIn },
                                  { label: 'Still inside', val: attendanceData.stillInside },
                                  { label: 'Picked up', val: attendanceData.pickedUp },
                                  { label: 'Not arrived', val: attendanceData.notArrived }
                                ].map((statItem, idx) => (
                                  <div key={idx} className="space-y-0.5">
                                    <span className="text-zinc-400 text-[10px] uppercase block">{statItem.label}</span>
                                    <span className="text-sm font-semibold text-[#18181B] block">{statItem.val}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>

                          {/* Recent Activity Panel */}
                          <div 
                            className="bg-white border border-[#EAE8E1] rounded-2xl p-5 space-y-4"
                            data-component-version="admin-recent-activity-approved-v1"
                          >
                            <div className="flex items-center justify-between pb-1">
                              <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest block">
                                Recent Activity
                              </span>
                              <button 
                                onClick={() => setActiveTab('attendance')}
                                className="text-[10px] font-bold text-[#C59B27] hover:underline"
                              >
                                View All
                              </button>
                            </div>

                            <div className="space-y-3.5">
                              {recentActivityList.length === 0 ? (
                                <p className="text-xs text-zinc-400 text-center py-4">No recent activity yet.</p>
                              ) : (
                                recentActivityList.map((act: any) => (
                                  <div key={act.id} className="flex items-start space-x-2.5 text-xs">
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#C59B27] mt-1.5 shrink-0" />
                                    <div className="space-y-0.5">
                                      <p className="text-zinc-700 leading-tight font-medium">{act.text}</p>
                                      <p className="text-[10px] text-zinc-400">{act.time}</p>
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>

                        </div>

                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* TAB 2: SYSTEM SETTINGS - Ivory and Cream design restyled */}
          {activeTab === 'settings' && (
            <AdminSettingsView 
              onBackToOverview={() => handleTabChange('overview')}
              isSuperAdmin={isSuperAdmin}
            />
          )}

          {/* APPLICATIONS REGISTRY VIEW PANEL */}
          {activeTab === 'applications' && (
            <AdminApplicationsView onBackToOverview={() => handleTabChange('overview')} />
          )}

          {/* REVIEW BOARD VIEW PANEL */}
          {activeTab === 'review' && (
            <AdminReviewBoardView onBackToOverview={() => handleTabChange('overview')} />
          )}

          {/* CHILDREN MODULE VIEW PANEL */}
          {activeTab === 'children' && (
            <AdminChildrenView onBackToOverview={() => handleTabChange('overview')} />
          )}

          {/* ATTENDANCE VIEW PANEL */}
          {activeTab === 'attendance' && (
            <AdminAttendanceView 
              onBackToOverview={() => handleTabChange('overview')} 
              onNavigate={onNavigate}
            />
          )}

          {/* REPORTS VIEW PANEL */}
          {activeTab === 'reports' && (
            <AdminReportsView 
              onBackToOverview={() => handleTabChange('overview')} 
              onNavigate={onNavigate}
            />
          )}

          {/* MESSAGES VIEW PANEL */}
          {activeTab === 'messages' && (
            <AdminMessagesView 
              onBackToOverview={() => handleTabChange('overview')} 
              onNavigate={onNavigate}
            />
          )}

          {/* VOLUNTEERS MODULE VIEW PANEL */}
          {activeTab === 'volunteers' && (
            <AdminVolunteersView onBackToOverview={() => handleTabChange('overview')} />
          )}

          {/* PARENTS MODULE VIEW PANEL */}
          {activeTab === 'parents' && (
            currentRoute && currentRoute.startsWith('/admin/parents/') ? (
              <AdminParentDetailView 
                parentId={currentRoute.split('/').pop() || ''} 
                onNavigate={onNavigate} 
                onBack={() => onNavigate('/admin/parents')}
                adminUser={adminUser}
              />
            ) : (
              <AdminParentsView onBackToOverview={() => handleTabChange('overview')} onNavigate={onNavigate} />
            )
          )}

          {/* EVENTS VIEW PANEL */}
          {activeTab === 'events' && (
            <AdminEventsView onBackToOverview={() => handleTabChange('overview')} />
          )}

          {/* OTHER ADMIN TABS: DYNAMIC PLACEHOLDER INSIDE THE SHELL */}
          {activeTab !== 'overview' && activeTab !== 'settings' && activeTab !== 'applications' && activeTab !== 'review' && activeTab !== 'children' && activeTab !== 'attendance' && activeTab !== 'reports' && activeTab !== 'messages' && activeTab !== 'volunteers' && activeTab !== 'parents' && activeTab !== 'events' && (
            renderPlaceholderSection(
              activeTab.charAt(0).toUpperCase() + activeTab.slice(1)
            )
          )}

        </main>
      </div>

      {/* ATTENTION CATEGORY FILTER MODAL */}
      {activeAttentionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            onClick={() => setActiveAttentionModal(null)}
            className="fixed inset-0 bg-black/40 backdrop-blur-xs" 
          />
          <div className="relative bg-white border border-[#EAE8E1] rounded-2xl w-full max-w-lg p-6 shadow-2xl animate-fade-in space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-[#EAE8E1]">
              <div className="flex items-center space-x-2">
                <ShieldAlert className="w-4 h-4 text-red-600" />
                <h4 className="font-serif font-bold text-[#18181B]">
                  {activeAttentionModal.label} List
                </h4>
              </div>
              <button 
                onClick={() => setActiveAttentionModal(null)}
                className="text-zinc-400 hover:text-[#18181B] p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1 py-1 text-xs">
              {activeFilteredKids.length === 0 ? (
                <div className="text-center py-12 text-zinc-400">
                  No active registration entries found matching this alert category in current scope.
                </div>
              ) : (
                activeFilteredKids.map((kid: any) => (
                  <div key={kid.id} className="p-3.5 bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl flex items-center justify-between gap-4">
                    <div className="space-y-0.5 min-w-0">
                      <span className="font-semibold text-[#18181B] block truncate">{kid.name}</span>
                      <span className="text-[10px] text-zinc-400 block">{kid.age_group || `Age ${kid.age}`}</span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-100">
                        {kid.status || 'Under Review'}
                      </span>
                      <button
                        onClick={() => {
                          setActiveAttentionModal(null);
                          setActiveTab('applications');
                        }}
                        className="text-[#C59B27] font-semibold hover:underline"
                      >
                        Review
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-[#EAE8E1] flex justify-end">
              <Button
                type="button"
                onClick={() => setActiveAttentionModal(null)}
                className="text-xs bg-zinc-100 text-[#18181B] hover:bg-zinc-200 px-4 py-2"
              >
                Close Window
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
