import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Shield, 
  Clock, 
  Phone, 
  UserPlus, 
  CheckCircle, 
  AlertTriangle, 
  Lock, 
  Eye, 
  X, 
  Search, 
  FileText, 
  Check, 
  User, 
  MapPin, 
  HeartHandshake, 
  Loader2,
  AlertCircle
} from 'lucide-react';
import { api, extractApiError } from '../services/api';

function formatApiError(err: any): string {
  const apiErr = extractApiError(err);
  if (typeof apiErr === 'string') return apiErr;
  if (apiErr && typeof apiErr === 'object' && 'message' in apiErr) {
    return (apiErr as any).message;
  }
  return '';
}

interface ChildEmergencySummaryProps {
  alertId: string;
  onClose?: () => void;
  isAdmin?: boolean;
  onRefreshAlert?: () => void;
}

export function ChildEmergencySummary({ alertId, onClose, isAdmin = false, onRefreshAlert }: ChildEmergencySummaryProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summaryData, setSummaryData] = useState<any>(null);
  const [revealingField, setRevealingField] = useState<string | null>(null);
  const [revealedData, setRevealedData] = useState<Record<string, any>>({});
  
  // Real-time time track
  const [utcTime, setUtcTime] = useState<string>('');
  const [abujaTime, setAbujaTime] = useState<string>('');

  // Child Link state
  const [isLinking, setIsLinking] = useState(false);
  const [linkQuery, setLinkQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [linkReason, setLinkReason] = useState('');
  const [isSubmittingLink, setIsSubmittingLink] = useState(false);

  // Parent Contact Attempt state
  const [isLoggingContact, setIsLoggingContact] = useState(false);
  const [contactType, setContactType] = useState('phone_call');
  const [contactReference, setContactReference] = useState('');
  const [contactOutcome, setContactOutcome] = useState('successful');
  const [contactNote, setContactNote] = useState('');
  const [isSubmittingContact, setIsSubmittingContact] = useState(false);

  // Time ticks
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setUtcTime(now.toUTCString().replace('GMT', 'UTC'));
      
      // Abuja is UTC + 1
      const abujaOffset = 1 * 60 * 60 * 1000;
      const abujaDate = new Date(now.getTime() + abujaOffset);
      setAbujaTime(abujaDate.toUTCString().replace('GMT', 'WAT (Abuja)'));
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch summary on load
  const fetchSummary = async () => {
    setLoading(true);
    setError(null);
    try {
      const endpoint = isAdmin 
        ? `/api/admin/safety-alerts/${alertId}/child-summary`
        : `/api/volunteer/safety-alerts/${alertId}/child-summary`;
        
      const res = await api.request<any>(endpoint);
      if (res && res.success) {
        setSummaryData(res.summary);
      } else {
        setError('Failed to fetch child emergency summary');
      }
    } catch (err: any) {
      console.error('Error fetching child summary:', err);
      setError(formatApiError(err) || 'Unauthorized access: You do not have permissions to view this summary.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, [alertId, isAdmin]);

  // Handle Deliberate Reveal
  const handleReveal = async (section: string) => {
    setRevealingField(section);
    try {
      const endpoint = isAdmin
        ? `/api/admin/safety-alerts/${alertId}/child-summary/protected/${section}`
        : `/api/volunteer/safety-alerts/${alertId}/child-summary/protected/${section}`;
        
      const res = await api.request<any>(endpoint);
      if (res && res.success) {
        setRevealedData(prev => ({
          ...prev,
          [section]: res.summary
        }));
      } else {
        alert('Failed to reveal secure information.');
      }
    } catch (err: any) {
      alert(formatApiError(err) || 'Failed to reveal secure details. Your access profile might be restricted.');
    } finally {
      setRevealingField(null);
    }
  };

  // Search children for linking
  const handleSearchChildren = async () => {
    if (!linkQuery.trim()) return;
    setSearchLoading(true);
    try {
      // Use general search endpoint or volunteer search children endpoint
      const res = await api.request<any>(`/api/volunteer/search-persons?query=${encodeURIComponent(linkQuery)}`);
      if (res && res.results) {
        // filter children only
        setSearchResults(res.results.filter((r: any) => r.type === 'child' || r.child_id));
      } else {
        setSearchResults([]);
      }
    } catch (err) {
      console.error('Failed to search children:', err);
    } finally {
      setSearchLoading(false);
    }
  };

  // Submit Child Link
  const handleConfirmLink = async () => {
    if (!selectedChildId) return;
    setIsSubmittingLink(true);
    try {
      const endpoint = isAdmin
        ? `/api/admin/safety-alerts/${alertId}/link-child`
        : `/api/volunteer/safety-alerts/${alertId}/link-child`;
        
      await api.request(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          childId: selectedChildId,
          reason: linkReason
        })
      });
      
      setIsLinking(false);
      setLinkQuery('');
      setSearchResults([]);
      setSelectedChildId(null);
      setLinkReason('');
      
      // Reload everything
      await fetchSummary();
      if (onRefreshAlert) onRefreshAlert();
    } catch (err: any) {
      alert(formatApiError(err) || 'Failed to link child.');
    } finally {
      setIsSubmittingLink(false);
    }
  };

  // Submit Correct child link (Admin only)
  const handleConfirmCorrection = async () => {
    if (!selectedChildId || !linkReason.trim()) {
      alert('Replacement child and reason are required for correction.');
      return;
    }
    setIsSubmittingLink(true);
    try {
      await api.request(`/api/admin/safety-alerts/${alertId}/correct-child-link`, {
        method: 'POST',
        body: JSON.stringify({
          childId: selectedChildId,
          reason: linkReason
        })
      });
      
      setIsLinking(false);
      setLinkQuery('');
      setSearchResults([]);
      setSelectedChildId(null);
      setLinkReason('');
      
      await fetchSummary();
      if (onRefreshAlert) onRefreshAlert();
    } catch (err: any) {
      alert(formatApiError(err) || 'Failed to correct child link.');
    } finally {
      setIsSubmittingLink(false);
    }
  };

  // Submit contact attempt
  const handleSubmitContactAttempt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactReference.trim()) return;
    
    setIsSubmittingContact(true);
    try {
      const endpoint = isAdmin
        ? `/api/admin/safety-alerts/${alertId}/contact-attempt`
        : `/api/volunteer/safety-alerts/${alertId}/contact-attempt`;
        
      await api.request(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          contactType,
          contactReference,
          outcome: contactOutcome,
          safeNote: contactNote
        })
      });
      
      setIsLoggingContact(false);
      setContactReference('');
      setContactNote('');
      
      await fetchSummary();
      if (onRefreshAlert) onRefreshAlert();
    } catch (err: any) {
      alert(formatApiError(err) || 'Failed to log contact attempt.');
    } finally {
      setIsSubmittingContact(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 min-h-[350px] bg-amber-50/20" id="child-summary-loading">
        <Loader2 className="w-8 h-8 text-amber-600 animate-spin mb-3" />
        <p className="text-sm font-medium text-amber-800">Compiling Need-to-Know Safety Details...</p>
        <p className="text-xs text-amber-600/70 mt-1">Authenticating your response profile securely...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50/50 border border-red-200 rounded-xl" id="child-summary-error">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="text-sm font-semibold text-red-900">Access Restricted</h4>
            <p className="text-xs text-red-700 mt-1">{error}</p>
            <div className="mt-4 flex gap-2">
              <button 
                onClick={onClose}
                className="px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-800 rounded-lg text-xs font-medium transition"
              >
                Dismiss Summary
              </button>
              <button 
                onClick={fetchSummary}
                className="px-3 py-1.5 bg-white hover:bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs font-medium transition"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const summary = summaryData;
  const isUnidentified = summary?.isUnidentified;
  const child = isUnidentified ? null : summary?.identity;
  const context = summary?.alertContext;
  const eventStatus = summary?.eventStatus;
  const snap = summary?.alertTimeContext;
  const essentials = summary?.safetyEssentials || [];
  const careComms = summary?.careAndCommunication || [];
  const pickup = summary?.pickupAuthorisation;
  const allowedActions = summary?.allowedActions || [];

  // Revealed Contact states
  const finalGuardian = revealedData['guardian_contact']?.summary?.guardianContact || summary?.guardianContact;
  const finalEmergency = revealedData['emergency_contact']?.summary?.emergencyContact || summary?.emergencyContact;
  const finalPickup = revealedData['pickup_restrictions']?.summary?.pickupAuthorisation || summary?.pickupAuthorisation;

  // Highlights categories
  const hasCriticalAllergy = essentials.some((e: any) => e.severity === 'critical');
  const hasImportantMedical = essentials.some((e: any) => e.severity === 'important');
  const hasPickupRestriction = finalPickup?.collectors?.some((c: any) => c.relationship === 'Restricted' || c.restrictionNote?.includes('CRITICAL'));

  return (
    <div className="space-y-6" id="child-emergency-summary-root">
      
      {/* Dynamic Live Clock Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-amber-50/70 border border-amber-100 rounded-lg text-xs text-amber-900" id="summary-live-clocks">
        <div className="flex items-center gap-2 font-mono">
          <Clock className="w-3.5 h-3.5 text-amber-600" />
          <span><strong>UTC:</strong> {utcTime || 'Ticking...'}</span>
        </div>
        <div className="flex items-center gap-2 font-mono">
          <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
          <span><strong>Abuja Local:</strong> {abujaTime || 'Ticking...'}</span>
        </div>
      </div>

      {/* Unidentified Temporary Profile vs Linked Child Profile */}
      {isUnidentified ? (
        <div className="p-5 bg-amber-50/50 border border-amber-200 rounded-xl" id="unidentified-description-card">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center text-amber-600 border border-amber-200">
              <UserPlus className="w-6 h-6 animate-pulse" />
            </div>
            <div className="space-y-1.5 flex-1">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-bold tracking-wide rounded uppercase">
                  {summary.unidentifiedChild?.temporaryLabel || 'Unidentified'}
                </span>
              </div>
              <h3 className="text-base font-bold text-amber-900">
                {summary.unidentifiedChild?.displayName || 'Lost Child (No linked profile)'}
              </h3>
              <div className="grid grid-cols-2 gap-3 text-xs text-amber-800/80 mt-2">
                <div><strong>Approx. Age:</strong> {summary.unidentifiedChild?.ageGroupLabel || 'Not specified'}</div>
                <div><strong>Gender:</strong> {summary.unidentifiedChild?.gender || 'Not specified'}</div>
                <div className="col-span-2">
                  <strong>Clothing:</strong> {summary.unidentifiedChild?.clothingDescription || 'Unspecified clothing'}
                </div>
                <div className="col-span-2 bg-white/70 p-2.5 rounded border border-amber-100/50">
                  <strong>Appearance & Notes:</strong> {summary.unidentifiedChild?.physicalDescription || 'Unspecified physical description'}
                </div>
              </div>

              {/* Link child controls if allowed */}
              {allowedActions.includes('link_child') && (
                <div className="pt-3">
                  <button
                    onClick={() => {
                      setIsLinking(true);
                      setSelectedChildId(null);
                    }}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold shadow-sm transition"
                  >
                    <UserPlus className="w-4 h-4" />
                    Link to Registered Child Profile
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="p-5 bg-white border border-slate-100 rounded-xl shadow-sm space-y-4" id="identified-child-card">
          <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-50">
            <div className="flex items-center gap-3">
              {child?.photoUrl ? (
                <img 
                  src={child.photoUrl} 
                  alt={child.displayName} 
                  className="w-12 h-12 rounded-full object-cover border-2 border-amber-500/35"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center text-amber-600 border border-amber-100">
                  <User className="w-6 h-6" />
                </div>
              )}
              <div>
                <h3 className="text-base font-bold text-slate-900 leading-tight">
                  {child?.displayName || 'Linked Child'}
                </h3>
                {child?.preferredName && (
                  <p className="text-xs text-slate-500 font-medium">Goes by: "{child.preferredName}"</p>
                )}
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs font-semibold text-slate-600">{child?.ageGroupLabel}</span>
                  <span className="text-slate-300">•</span>
                  <span className="text-xs text-slate-500">{eventStatus?.assignedRoomLabel}</span>
                </div>
              </div>
            </div>

            <div className="text-right">
              {child?.identityState === 'confirmed' ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-100 text-[10px] font-bold rounded-full">
                  <CheckCircle className="w-3 h-3" /> VERIFIED
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-100 text-[10px] font-bold rounded-full">
                  <AlertTriangle className="w-3 h-3 animate-pulse" /> NEEDS REVIEW
                </span>
              )}
            </div>
          </div>

          {/* Current Event Status Detail */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-slate-50/50 p-3 rounded-lg border border-slate-100/50" id="current-event-presence">
            <div>
              <span className="text-slate-500 font-medium block">Current Event Status</span>
              <strong className="text-slate-800 block text-sm mt-0.5">{eventStatus?.statusLabel}</strong>
            </div>
            <div>
              <span className="text-slate-500 font-medium block">Reported/Last Location</span>
              <div className="flex items-center gap-1 text-slate-800 text-sm mt-0.5 font-semibold">
                <MapPin className="w-3.5 h-3.5 text-rose-500" />
                <span>{eventStatus?.lastRecordedLocationLabel}</span>
              </div>
            </div>
          </div>

          {/* Alert Time Snapshot (SECTION 18 Requirement) */}
          {snap && (
            <div className="p-3 bg-indigo-50/30 border border-indigo-100/50 rounded-lg text-xs" id="alert-time-snapshot">
              <span className="text-indigo-900 font-bold block mb-1">
                🔒 Alert-Time Snapshot (Historical Lock)
              </span>
              <div className="grid grid-cols-2 gap-2 text-indigo-950/80 font-mono text-[11px]">
                <div>Name: {snap.displayName}</div>
                <div>Age Group: {snap.ageGroupLabel}</div>
                <div>Room on Alert: {snap.assignedRoomLabel}</div>
                <div>Status on Alert: {snap.statusLabel}</div>
              </div>
              <p className="text-[10px] text-indigo-700/70 mt-1.5 leading-relaxed">
                This snapshot preserves original care details at alert time to avoid silent updates from future registrations.
              </p>
            </div>
          )}

          {/* Correct Link (Admin only) */}
          {allowedActions.includes('correct_child_link') && (
            <div className="flex justify-end">
              <button
                onClick={() => {
                  setIsLinking(true);
                  setSelectedChildId(null);
                }}
                className="flex items-center gap-1 text-xs text-amber-700 hover:text-amber-800 font-bold"
              >
                <UserPlus className="w-3.5 h-3.5" />
                Correct Incorrect Child Link
              </button>
            </div>
          )}
        </div>
      )}

      {/* Critical Allergies and Medical Warning (Red visual emphasize - SECTION 19) */}
      {essentials.length > 0 && (
        <div className="space-y-3" id="medical-essentials-container">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
            <span className="w-1.5 h-3 bg-rose-600 rounded-full" />
            Medical & Support Essentials (Restricted Access)
          </h4>
          
          <div className="grid gap-3">
            {essentials.map((item: any, idx: number) => (
              <div 
                key={idx} 
                className={`p-4 border rounded-xl flex items-start gap-3 transition ${
                  item.severity === 'critical' 
                    ? 'bg-rose-50/60 border-rose-200 text-rose-950' 
                    : item.severity === 'important'
                      ? 'bg-amber-50/40 border-amber-200 text-amber-950'
                      : 'bg-blue-50/30 border-blue-100 text-blue-950'
                }`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  item.severity === 'critical'
                    ? 'bg-rose-100 text-rose-700'
                    : 'bg-amber-100 text-amber-700'
                }`}>
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div className="space-y-1 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wide">{item.title}</span>
                    <span className="text-[10px] text-slate-500">Confirmed: {new Date(item.lastConfirmed).toLocaleDateString()}</span>
                  </div>
                  <p className="text-xs leading-relaxed font-semibold">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Care & calming instructions (Blue visual emphasize - SECTION 19) */}
      {careComms.length > 0 && (
        <div className="space-y-3" id="care-communication-container">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
            <span className="w-1.5 h-3 bg-blue-600 rounded-full" />
            Calming & Support Directions
          </h4>
          
          <div className="grid gap-3">
            {careComms.map((item: any, idx: number) => (
              <div 
                key={idx} 
                className="p-4 bg-blue-50/20 border border-blue-100 rounded-xl flex items-start gap-3"
              >
                <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-700 flex-shrink-0">
                  <HeartHandshake className="w-4 h-4" />
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-bold text-blue-900 uppercase tracking-wide block">{item.title}</span>
                  <p className="text-xs text-blue-950 leading-relaxed font-medium">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pickup Authorization Card (Amber emphasize - SECTION 19) */}
      {!isUnidentified && (
        <div className="space-y-3" id="pickup-authorization-container">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
            <span className="w-1.5 h-3 bg-amber-600 rounded-full" />
            Designated Collectors & Custody Warnings
          </h4>

          {pickup ? (
            <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-4 space-y-3">
              {pickup.restrictionWarning && (
                <div className="p-3 bg-amber-50/50 border border-amber-200 text-amber-900 rounded-lg text-xs flex items-start gap-2 font-semibold">
                  <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="text-amber-800 block font-bold">⚠️ RESTRICTION ALERT ACTIVE</span>
                    <span className="text-[11px] font-medium">{pickup.restrictionWarning}</span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-3">
                {pickup.collectors?.map((collector: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between gap-3 p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                    <div className="flex items-center gap-3">
                      {collector.photoUrl ? (
                        <img 
                          src={collector.photoUrl} 
                          alt={collector.displayName} 
                          className="w-9 h-9 rounded-full object-cover border border-slate-200"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-9 h-9 bg-slate-100 rounded-full flex items-center justify-center text-slate-500">
                          <User className="w-5 h-5" />
                        </div>
                      )}
                      <div>
                        <strong className="text-xs text-slate-900 block font-bold">{collector.displayName}</strong>
                        <span className="text-[10px] text-slate-500 font-medium block">{collector.relationship}</span>
                      </div>
                    </div>

                    <div className="text-right">
                      {collector.restrictionNote === '[REVEAL_REQUIRED]' ? (
                        <button
                          onClick={() => handleConfirmProtectedReveal('pickup_restrictions')}
                          className="px-2 py-1 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded text-[10px] font-bold flex items-center gap-1 transition"
                        >
                          <Lock className="w-3 h-3" /> Reveal Restrictions
                        </button>
                      ) : collector.restrictionNote ? (
                        <span className="px-2 py-0.5 bg-red-100 text-red-800 text-[10px] font-extrabold rounded">
                          {collector.restrictionNote}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded">
                          Approved Pickup
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl text-center text-xs text-slate-500 font-semibold">
              🔒 Pickup details are restricted for your current response role.
            </div>
          )}
        </div>
      )}

      {/* Parent Contacts & Deliberate Reveal (SECTION 15 & 29 Requirements) */}
      {!isUnidentified && (summary?.guardianContact || summary?.emergencyContact) && (
        <div className="space-y-3" id="contacts-container">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
            <span className="w-1.5 h-3 bg-emerald-600 rounded-full" />
            Parent & Emergency Contact Deliberate Reveal
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Guardian Contact Card */}
            {finalGuardian && (
              <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-4 space-y-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Primary Guardian</span>
                <strong className="text-sm font-bold text-slate-900 block">{finalGuardian.displayName}</strong>
                
                {finalGuardian.phoneNumber === '[PROTECTED_REVEAL]' ? (
                  <button
                    onClick={() => handleConfirmProtectedReveal('guardian_contact')}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-emerald-50 text-slate-800 hover:text-emerald-800 border border-slate-200 hover:border-emerald-200 rounded-lg text-xs font-bold transition"
                  >
                    <Lock className="w-3.5 h-3.5" /> Show Contact Number
                  </button>
                ) : (
                  <div className="flex items-center gap-2 p-2 bg-emerald-50 border border-emerald-100 rounded-lg text-emerald-900">
                    <Phone className="w-4 h-4 text-emerald-600" />
                    <strong className="font-mono text-xs">{finalGuardian.phoneNumber}</strong>
                  </div>
                )}
              </div>
            )}

            {/* Emergency Contact Card */}
            {finalEmergency && (
              <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-4 space-y-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Secondary Contact</span>
                <strong className="text-sm font-bold text-slate-900 block">{finalEmergency.displayName}</strong>
                
                {finalEmergency.phoneNumber === '[PROTECTED_REVEAL]' ? (
                  <button
                    onClick={() => handleConfirmProtectedReveal('emergency_contact')}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-emerald-50 text-slate-800 hover:text-emerald-800 border border-slate-200 hover:border-emerald-200 rounded-lg text-xs font-bold transition"
                  >
                    <Lock className="w-3.5 h-3.5" /> Show Contact Number
                  </button>
                ) : (
                  <div className="flex items-center gap-2 p-2 bg-emerald-50 border border-emerald-100 rounded-lg text-emerald-900">
                    <Phone className="w-4 h-4 text-emerald-600" />
                    <strong className="font-mono text-xs">{finalEmergency.phoneNumber}</strong>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Parent Contact History & Logging (SECTION 30 Requirement) */}
      {!isUnidentified && (
        <div className="space-y-3" id="parent-contact-attempts-section">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
              Contact logs & Attempts
            </h4>
            {allowedActions.includes('record_contact_attempt') && (
              <button
                onClick={() => setIsLoggingContact(true)}
                className="text-xs font-bold text-amber-700 hover:text-amber-800 flex items-center gap-1"
              >
                <Phone className="w-3 h-3" /> Log Contact Attempt
              </button>
            )}
          </div>

          {summary.contactHistory?.length > 0 ? (
            <div className="bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden" id="contact-history-list">
              <div className="divide-y divide-slate-50">
                {summary.contactHistory.map((log: any, idx: number) => (
                  <div key={idx} className="p-3 text-xs text-slate-700 hover:bg-slate-50/50">
                    <div className="flex items-center justify-between gap-2 text-slate-500 mb-1">
                      <span><strong>To:</strong> {log.contactPerson} ({log.contactType.toUpperCase().replace('_', ' ')})</span>
                      <span>{new Date(log.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    </div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded uppercase ${
                        log.outcome === 'successful' || log.outcome === 'reached'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-rose-50 text-rose-700'
                      }`}>
                        {log.outcome}
                      </span>
                      <span className="text-[10px] text-slate-400">By: {log.attemptedByEmail}</span>
                    </div>
                    {log.safeNote && <p className="text-slate-600 mt-1 bg-slate-50 p-2 rounded border border-slate-100">{log.safeNote}</p>}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl text-center text-xs text-slate-500 font-semibold">
              No contact attempts recorded yet for this alert.
            </div>
          )}
        </div>
      )}

      {/* Security accountability statement */}
      <div className="p-3 bg-slate-50 border border-slate-200/60 rounded-lg text-[10px] text-slate-500 leading-relaxed flex items-start gap-2" id="security-audit-footer">
        <Shield className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
        <div>
          <span className="font-bold block text-slate-700">🔒 SECURE END-TO-END AUDIT LOGGING ACTIVE</span>
          Your summary access has been authenticated under profile: <strong>{summary?.accessProfile || 'Event Responder'}</strong>. 
          All details shown are subject to role-based safety restrictions. Every field reveal is stored securely in audit logs.
        </div>
      </div>

      {/* DELIBERATE REVEAL MODAL/DIALOG */}
      <AnimatePresence>
        {revealingField && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 space-y-4 border border-slate-100"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center text-amber-600">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Deliberate Safety Reveal</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    You are revealing protected contact information. This action generates a permanent security audit record.
                  </p>
                </div>
              </div>

              <div className="bg-slate-50 p-3 rounded text-[11px] font-mono text-slate-600">
                AUDIT ACTION: REVEAL_{revealingField?.toUpperCase()}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setRevealingField(null)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const field = revealingField;
                    setRevealingField(null);
                    handleReveal(field);
                  }}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold"
                >
                  Proceed & Reveal
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* LINK PROFILE MODAL / DRAWER */}
      <AnimatePresence>
        {isLinking && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[85vh] flex flex-col p-5 border border-slate-100 space-y-4"
            >
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-900">
                  {summary.child_id ? 'Correct Child Profile Link' : 'Link Permanent Child Profile'}
                </h3>
                <button onClick={() => setIsLinking(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 flex-1 overflow-y-auto">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600 block">Search Registered Children</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        value={linkQuery}
                        onChange={(e) => setLinkQuery(e.target.value)}
                        placeholder="Search by name, pass, or parent..."
                        className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:bg-white focus:outline-none transition"
                        onKeyDown={(e) => e.key === 'Enter' && handleSearchChildren()}
                      />
                    </div>
                    <button
                      onClick={handleSearchChildren}
                      className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 transition"
                    >
                      {searchLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Search'}
                    </button>
                  </div>
                </div>

                {/* Search result options */}
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {searchResults.map((childItem: any) => (
                    <button
                      key={childItem.id}
                      onClick={() => setSelectedChildId(childItem.id)}
                      className={`w-full text-left p-2.5 rounded-lg border text-xs flex items-center justify-between transition ${
                        selectedChildId === childItem.id
                          ? 'bg-amber-50/60 border-amber-300'
                          : 'bg-white border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div>
                        <strong className="block font-bold text-slate-900">{childItem.full_name || childItem.childName}</strong>
                        <span className="text-[10px] text-slate-500 block">Parent: {childItem.parent_name || childItem.parentName || 'Unspecified'}</span>
                      </div>
                      {selectedChildId === childItem.id && <Check className="w-4 h-4 text-amber-600" />}
                    </button>
                  ))}
                  {searchResults.length === 0 && !searchLoading && linkQuery && (
                    <p className="text-xs text-center text-slate-400 py-4">No matching children found.</p>
                  )}
                </div>

                {/* Reason detail */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600 block">Reason for Linking / Correction</label>
                  <textarea
                    rows={2}
                    value={linkReason}
                    onChange={(e) => setLinkReason(e.target.value)}
                    placeholder="Provide a clear justification for linking/correcting this child context..."
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:bg-white focus:outline-none transition"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  onClick={() => setIsLinking(false)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={summary.child_id ? handleConfirmCorrection : handleConfirmLink}
                  disabled={isSubmittingLink || !selectedChildId}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5"
                >
                  {isSubmittingLink && <Loader2 className="w-3 h-3 animate-spin" />}
                  Confirm Linkage
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* LOG PARENT CONTACT MODAL */}
      <AnimatePresence>
        {isLoggingContact && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 border border-slate-100"
            >
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-3">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <Phone className="w-4 h-4 text-amber-600" />
                  Log Parent Contact Attempt
                </h3>
                <button onClick={() => setIsLoggingContact(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSubmitContactAttempt} className="space-y-3 text-xs">
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">Contact Channel</label>
                  <select
                    value={contactType}
                    onChange={(e) => setContactType(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  >
                    <option value="phone_call">Standard Voice Call</option>
                    <option value="whatsapp_chat">WhatsApp Chat</option>
                    <option value="in_person">In-Person contact at Desk</option>
                    <option value="sms_alert">SMS Dispatch</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">Contact Reference Name</label>
                  <input
                    type="text"
                    required
                    value={contactReference}
                    onChange={(e) => setContactReference(e.target.value)}
                    placeholder="e.g. Olusola Omikunle (Uncle)"
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">Outcome</label>
                  <select
                    value={contactOutcome}
                    onChange={(e) => setContactOutcome(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  >
                    <option value="successful">Reached successfully (Verified Safe)</option>
                    <option value="unanswered">No Answer / Line Busy</option>
                    <option value="switched_off">Line Unavailable / Switched Off</option>
                    <option value="refused_response">Refused coordination / custody issue</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">Action Notes</label>
                  <textarea
                    rows={2}
                    value={contactNote}
                    onChange={(e) => setContactNote(e.target.value)}
                    placeholder="Add safe notes here (no private details unless relevant to critical immediate safety)"
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsLoggingContact(false)}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingContact || !contactReference.trim()}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5"
                  >
                    {isSubmittingContact && <Loader2 className="w-3 h-3 animate-spin" />}
                    Save Attempt
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );

  // Helper trigger deliberate reveal with warning
  function handleConfirmProtectedReveal(section: string) {
    setRevealingField(section);
  }
}
