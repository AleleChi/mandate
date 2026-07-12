import React, { useState, useEffect } from 'react';
import { X, Save, Check, AlertCircle, Loader2 } from 'lucide-react';
import { api, extractApiError } from '../../services/api';
import { useNotification } from '../../context/NotificationContext';

// Proof: data-component-version="incident-edit-modal-v1"

interface IncidentEditModalProps {
  alertId: string;
  incidentId?: string | null; // Pass existing incident ID if updating
  currentUser: { id: string; role: string; email: string };
  onClose: () => void;
  onSaveSuccess?: (incident: any) => void;
}

export const IncidentEditModal: React.FC<IncidentEditModalProps> = ({
  alertId,
  incidentId: initialIncidentId,
  currentUser,
  onClose,
  onSaveSuccess,
}) => {
  const { showSuccess, showError } = useNotification();
  const [incidentId, setIncidentId] = useState<string | null>(initialIncidentId || null);
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);

  // Core Form Fields
  const [category, setCategory] = useState<string>('medical');
  const [title, setTitle] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [parentContact, setParentContact] = useState<string>('');
  const [firstAid, setFirstAid] = useState<string>('');
  const [securityField, setSecurityField] = useState<string>('');
  const [version, setVersion] = useState<number>(1);
  const [status, setStatus] = useState<string>('draft');

  // Category Specific Fields
  // Medical
  const [medSymptoms, setMedSymptoms] = useState<string>('');
  const [medTreatment, setMedTreatment] = useState<string>('');
  const [medVitals, setMedVitals] = useState<string>('');
  const [medDoctorNotified, setMedDoctorNotified] = useState<boolean>(false);
  const [medHospitalVisit, setMedHospitalVisit] = useState<boolean>(false);

  // Behavioral
  const [behSeverity, setBehSeverity] = useState<'low' | 'medium' | 'high'>('low');
  const [behStaff, setBehStaff] = useState<string>('');
  const [behNarrative, setBehNarrative] = useState<string>('');
  const [behSafeguarding, setBehSafeguarding] = useState<boolean>(false);

  // Missing Child
  const [missTime, setMissTime] = useState<string>('');
  const [missLocation, setMissLocation] = useState<string>('');
  const [missClothing, setMissClothing] = useState<string>('');
  const [missDuration, setMissDuration] = useState<number>(0);

  // Security
  const [secType, setSecType] = useState<string>('');
  const [secAuthorities, setSecAuthorities] = useState<boolean>(false);
  const [secDamage, setSecDamage] = useState<boolean>(false);

  // Other
  const [othDetails, setOthDetails] = useState<string>('');

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Load existing incident if available
  useEffect(() => {
    const fetchIncident = async () => {
      try {
        setLoading(true);
        // First try to load by incidentId, fallback to loading by alertId
        let data: any = null;
        if (incidentId) {
          const res = await api.incidents.get(incidentId);
          if (res && res.success) {
            data = res.incident;
          }
        } else {
          const res = await api.incidents.getByAlert(alertId);
          if (res && res.success && res.incident) {
            data = res.incident;
            setIncidentId(res.incident.id);
          }
        }

        if (data) {
          setCategory(data.category || 'medical');
          setTitle(data.title || '');
          setDescription(data.description || '');
          setParentContact(data.parentContact || '');
          setFirstAid(data.firstAid || '');
          setSecurityField(data.security || '');
          setVersion(data.version || 1);
          setStatus(data.status || 'draft');

          const struct = data.structuredData || {};
          if (data.category === 'medical') {
            setMedSymptoms(struct.symptoms || '');
            setMedTreatment(struct.treatment || '');
            setMedVitals(struct.vitals || '');
            setMedDoctorNotified(!!struct.doctorNotified);
            setMedHospitalVisit(!!struct.hospitalVisitRequired);
          } else if (data.category === 'behavioral') {
            setBehSeverity(struct.severity || 'low');
            setBehStaff(struct.staffInvolved || '');
            setBehNarrative(struct.narrative || '');
            setBehSafeguarding(!!struct.safeguardingEscalation);
          } else if (data.category === 'missing_child') {
            setMissTime(struct.lastSeenTime || '');
            setMissLocation(struct.lastSeenLocation || '');
            setMissClothing(struct.clothingDetails || '');
            setMissDuration(struct.searchDurationMins || 0);
          } else if (data.category === 'security') {
            setSecType(struct.incidentType || '');
            setSecAuthorities(!!struct.authoritiesContacted);
            setSecDamage(!!struct.propertyDamage);
          } else if (data.category === 'other') {
            setOthDetails(struct.details || '');
          }
        }
      } catch (err) {
        console.error('Error fetching incident:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchIncident();
  }, [alertId, incidentId]);

  const assembleStructuredData = (cat: string) => {
    if (cat === 'medical') {
      return {
        symptoms: medSymptoms,
        treatment: medTreatment,
        vitals: medVitals,
        doctorNotified: medDoctorNotified,
        hospitalVisitRequired: medHospitalVisit,
      };
    } else if (cat === 'behavioral') {
      return {
        severity: behSeverity,
        staffInvolved: behStaff,
        narrative: behNarrative,
        safeguardingEscalation: behSafeguarding,
      };
    } else if (cat === 'missing_child') {
      return {
        lastSeenTime: missTime,
        lastSeenLocation: missLocation,
        clothingDetails: missClothing,
        searchDurationMins: Number(missDuration),
      };
    } else if (cat === 'security') {
      return {
        incidentType: secType,
        authoritiesContacted: secAuthorities,
        propertyDamage: secDamage,
      };
    } else {
      return {
        details: othDetails,
      };
    }
  };

  const handleSave = async (submitForReview: boolean = false) => {
    setFieldErrors({});
    setSaving(true);
    const structData = assembleStructuredData(category);

    try {
      let result: any = null;

      if (!incidentId) {
        // Create new
        result = await api.incidents.create({
          alertId,
          category,
          title,
          description,
          structuredData: structData,
          parentContact,
          firstAid,
          security: securityField,
          status: submitForReview ? 'submitted' : 'draft',
        });
      } else {
        // Update existing
        if (submitForReview) {
          result = await api.incidents.submit(incidentId, {
            expectedVersion: version,
            category,
            title,
            description,
            structuredData: structData,
            parentContact,
            firstAid,
            security: securityField,
          });
        } else {
          result = await api.incidents.updateDraft(incidentId, {
            expectedVersion: version,
            category,
            title,
            description,
            structuredData: structData,
            parentContact,
            firstAid,
            security: securityField,
          });
        }
      }

      if (result && result.success) {
        showSuccess(
          submitForReview ? 'Incident Submitted' : 'Draft Saved',
          submitForReview
            ? 'The incident report has been successfully submitted for administrative review.'
            : 'Your draft report has been stored securely.'
        );
        if (result.incident) {
          setIncidentId(result.incident.id);
          setVersion(result.incident.version);
          setStatus(result.incident.status);
          if (onSaveSuccess) onSaveSuccess(result.incident);
        }
        if (submitForReview) {
          onClose();
        }
      }
    } catch (err: any) {
      const parsedErr = extractApiError(err) as any;
      if (parsedErr.fieldErrors) {
        setFieldErrors(parsedErr.fieldErrors);
      }
      showError(submitForReview ? 'Submission Failed' : 'Save Draft Failed', parsedErr.message || 'Validation or database lock issue occurred.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#18181B]/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white w-full max-w-xl rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 bg-[#FAF9F6]">
          <div>
            <h3 className="font-serif font-bold text-sm text-[#18181B]">
              {incidentId ? `Edit Incident Report (${status.toUpperCase()})` : 'Initialize Incident Report'}
            </h3>
            <p className="text-[10px] text-zinc-400 mt-0.5">Enforcing "One-Alert-One-Incident" Safety Boundary</p>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 bg-transparent border-none cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-2">
              <Loader2 className="w-8 h-8 text-[#C59B27] animate-spin" />
              <span className="text-xs text-zinc-400">Loading record metadata...</span>
            </div>
          ) : (
            <>
              {/* Category selector */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Incident Category</label>
                  <select
                    disabled={!!incidentId && status !== 'draft'}
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl p-3 text-xs text-zinc-800"
                  >
                    <option value="medical">Medical / First Aid</option>
                    <option value="behavioral">Behavioral / Safeguarding</option>
                    <option value="missing_child">Missing / Lost Child</option>
                    <option value="security">Security Protocol</option>
                    <option value="other">Other Incident</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Report Title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Brief descriptive title..."
                    className="w-full bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl p-3 text-xs text-zinc-800 focus:outline-none focus:border-[#C59B27]"
                  />
                  {fieldErrors.title && <span className="text-[10px] text-red-500 font-semibold">{fieldErrors.title}</span>}
                </div>
              </div>

              {/* Description / Summary */}
              <div className="space-y-1">
                <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Detailed Narrative</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Record precise narrative event log (exact observations, chronological staff actions)..."
                  className="w-full bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl p-3 text-xs text-zinc-800 h-20 resize-none focus:outline-none focus:border-[#C59B27]"
                />
                {fieldErrors.description && <span className="text-[10px] text-red-500 font-semibold">{fieldErrors.description}</span>}
              </div>

              {/* Dynamic Category Specific Fields */}
              <div className="p-4 bg-[#FAF9F6] border border-[#EAE8E1] rounded-2xl space-y-4">
                <h4 className="text-[10px] text-[#C59B27] font-bold uppercase tracking-wider border-b border-[#EAE8E1] pb-1.5">
                  Category-Specific Protocol Fields
                </h4>

                {category === 'medical' && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Symptoms / Complaint</label>
                        <input
                          type="text"
                          value={medSymptoms}
                          onChange={(e) => setMedSymptoms(e.target.value)}
                          placeholder="Fever, rash, scrape, allergy..."
                          className="w-full bg-white border border-[#EAE8E1] rounded-xl p-3 text-xs text-zinc-800"
                        />
                        {fieldErrors.symptoms && <span className="text-[10px] text-red-500 font-semibold">{fieldErrors.symptoms}</span>}
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Treatment Administered</label>
                        <input
                          type="text"
                          value={medTreatment}
                          onChange={(e) => setMedTreatment(e.target.value)}
                          placeholder="Ice pack, bandage, antiseptic..."
                          className="w-full bg-white border border-[#EAE8E1] rounded-xl p-3 text-xs text-zinc-800"
                        />
                        {fieldErrors.treatment && <span className="text-[10px] text-red-500 font-semibold">{fieldErrors.treatment}</span>}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Vitals / Notes (Optional)</label>
                      <input
                        type="text"
                        value={medVitals}
                        onChange={(e) => setMedVitals(e.target.value)}
                        placeholder="Pulse, temperature, pupil responsiveness..."
                        className="w-full bg-white border border-[#EAE8E1] rounded-xl p-3 text-xs text-zinc-800"
                      />
                    </div>
                    <div className="flex gap-6 pt-1">
                      <label className="flex items-center gap-2 cursor-pointer text-xs text-zinc-700 font-medium">
                        <input
                          type="checkbox"
                          checked={medDoctorNotified}
                          onChange={(e) => setMedDoctorNotified(e.target.checked)}
                          className="w-4 h-4 text-[#C59B27]"
                        />
                        Medical Doctor Notified
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer text-xs text-zinc-700 font-medium">
                        <input
                          type="checkbox"
                          checked={medHospitalVisit}
                          onChange={(e) => setMedHospitalVisit(e.target.checked)}
                          className="w-4 h-4 text-[#C59B27]"
                        />
                        Hospital/ER Visit Required
                      </label>
                    </div>
                  </div>
                )}

                {category === 'behavioral' && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Behavior Severity</label>
                        <select
                          value={behSeverity}
                          onChange={(e) => setBehSeverity(e.target.value as any)}
                          className="w-full bg-white border border-[#EAE8E1] rounded-xl p-3 text-xs text-zinc-800"
                        >
                          <option value="low">Low (Disruption)</option>
                          <option value="medium">Medium (Aggression/Safety Risk)</option>
                          <option value="high">High (Severe Harm / Crisis)</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Staff Members Present</label>
                        <input
                          type="text"
                          value={behStaff}
                          onChange={(e) => setBehStaff(e.target.value)}
                          placeholder="Names of supervising workers..."
                          className="w-full bg-white border border-[#EAE8E1] rounded-xl p-3 text-xs text-zinc-800"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Behavioral Assessment Narrative</label>
                      <textarea
                        value={behNarrative}
                        onChange={(e) => setBehNarrative(e.target.value)}
                        placeholder="Detail the triggers, behavioral symptoms, and restorative actions..."
                        className="w-full bg-white border border-[#EAE8E1] rounded-xl p-3 text-xs text-zinc-800 h-16 resize-none"
                      />
                      {fieldErrors.narrative && <span className="text-[10px] text-red-500 font-semibold">{fieldErrors.narrative}</span>}
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-zinc-700 font-medium pt-1">
                      <input
                        type="checkbox"
                        checked={behSafeguarding}
                        onChange={(e) => setBehSafeguarding(e.target.checked)}
                        className="w-4 h-4 text-[#C59B27]"
                      />
                      Escalate as Formal Safeguarding Review
                    </label>
                  </div>
                )}

                {category === 'missing_child' && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Last Seen Time</label>
                        <input
                          type="text"
                          value={missTime}
                          onChange={(e) => setMissTime(e.target.value)}
                          placeholder="e.g., 10:15 AM"
                          className="w-full bg-white border border-[#EAE8E1] rounded-xl p-3 text-xs text-zinc-800"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Last Seen Location</label>
                        <input
                          type="text"
                          value={missLocation}
                          onChange={(e) => setMissLocation(e.target.value)}
                          placeholder="e.g., Sports Field, Hall B..."
                          className="w-full bg-white border border-[#EAE8E1] rounded-xl p-3 text-xs text-zinc-800"
                        />
                        {fieldErrors.lastSeenLocation && <span className="text-[10px] text-red-500 font-semibold">{fieldErrors.lastSeenLocation}</span>}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Child clothing details</label>
                        <input
                          type="text"
                          value={missClothing}
                          onChange={(e) => setMissClothing(e.target.value)}
                          placeholder="Blue shirt, sneakers..."
                          className="w-full bg-white border border-[#EAE8E1] rounded-xl p-3 text-xs text-zinc-800"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Search Duration (Minutes)</label>
                        <input
                          type="number"
                          value={missDuration}
                          onChange={(e) => setMissDuration(parseInt(e.target.value) || 0)}
                          className="w-full bg-white border border-[#EAE8E1] rounded-xl p-3 text-xs text-zinc-800"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {category === 'security' && (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Security Incident Type</label>
                      <input
                        type="text"
                        value={secType}
                        onChange={(e) => setSecType(e.target.value)}
                        placeholder="Unauthorized access, structural failure, dispute..."
                        className="w-full bg-white border border-[#EAE8E1] rounded-xl p-3 text-xs text-zinc-800"
                      />
                      {fieldErrors.incidentType && <span className="text-[10px] text-red-500 font-semibold">{fieldErrors.incidentType}</span>}
                    </div>
                    <div className="flex gap-6 pt-1">
                      <label className="flex items-center gap-2 cursor-pointer text-xs text-zinc-700 font-medium">
                        <input
                          type="checkbox"
                          checked={secAuthorities}
                          onChange={(e) => setSecAuthorities(e.target.checked)}
                          className="w-4 h-4 text-[#C59B27]"
                        />
                        Authorities / Security Team Contacted
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer text-xs text-zinc-700 font-medium">
                        <input
                          type="checkbox"
                          checked={secDamage}
                          onChange={(e) => setSecDamage(e.target.checked)}
                          className="w-4 h-4 text-[#C59B27]"
                        />
                        Property Damage Incurred
                      </label>
                    </div>
                  </div>
                )}

                {category === 'other' && (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Additional Protocol Details</label>
                      <textarea
                        value={othDetails}
                        onChange={(e) => setOthDetails(e.target.value)}
                        placeholder="Record precise structural or protocol concerns here..."
                        className="w-full bg-white border border-[#EAE8E1] rounded-xl p-3 text-xs text-zinc-800 h-20 resize-none"
                      />
                      {fieldErrors.details && <span className="text-[10px] text-red-500 font-semibold">{fieldErrors.details}</span>}
                    </div>
                  </div>
                )}
              </div>

              {/* Secure Logs / Restrictive inputs (Admins or Creator only) */}
              {(currentUser.role === 'admin' || currentUser.role === 'superadmin' || !incidentId || status === 'draft') && (
                <div className="space-y-4 pt-2 border-t border-zinc-100">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Parent Contact Logs</label>
                      <span className="text-[9px] text-[#C59B27] font-semibold">🔒 RESTRICTED CASE LOG</span>
                    </div>
                    <input
                      type="text"
                      value={parentContact}
                      onChange={(e) => setParentContact(e.target.value)}
                      placeholder="e.g. Called mother (+234 803 111 2222) at 10:20 AM. Verified pickup status."
                      className="w-full bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl p-3 text-xs text-zinc-800"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">First Aid Logs</label>
                      <input
                        type="text"
                        value={firstAid}
                        onChange={(e) => setFirstAid(e.target.value)}
                        placeholder="Medication, bandage application..."
                        className="w-full bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl p-3 text-xs text-zinc-800"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Security Logs</label>
                      <input
                        type="text"
                        value={securityField}
                        onChange={(e) => setSecurityField(e.target.value)}
                        placeholder="Device lockout, cordon, area sweeps..."
                        className="w-full bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl p-3 text-xs text-zinc-800"
                      />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 border-t border-zinc-100 bg-[#FAF9F6] flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-xs text-zinc-500 hover:text-zinc-700 bg-transparent border border-zinc-200 cursor-pointer font-semibold"
          >
            Cancel
          </button>

          <div className="flex items-center gap-3">
            {/* Save draft button (only if draft or not created yet) */}
            {(status === 'draft' || !incidentId) && (
              <button
                disabled={saving}
                onClick={() => handleSave(false)}
                className="flex items-center gap-1.5 bg-white hover:bg-zinc-50 text-zinc-700 border border-zinc-300 font-semibold py-2.5 px-4 rounded-xl text-xs transition-all cursor-pointer"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save Draft
              </button>
            )}

            {/* Submit button */}
            {status !== 'closed' && status !== 'voided' && (
              <button
                disabled={saving}
                onClick={() => handleSave(true)}
                className="flex items-center gap-1.5 bg-[#C59B27] hover:bg-[#B08621] text-white font-bold py-2.5 px-5 rounded-xl text-xs transition-all border-none cursor-pointer"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Submit Report
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
