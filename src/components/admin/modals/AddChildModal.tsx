import React, { useState, useEffect } from 'react';
import { X, Baby, Search, AlertTriangle, Plus, Trash2, CheckCircle2 } from 'lucide-react';
import { api, extractApiError } from '../../../services/api';
import { useNotification } from '../../../context/NotificationContext';
import { Button } from '../../common/Button';

interface AddChildModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (childId?: string) => void;
  preselectedParentId?: string;
  preselectedParentName?: string;
}

export const AddChildModal: React.FC<AddChildModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  preselectedParentId,
  preselectedParentName
}) => {
  const { showSuccess, showError } = useNotification();

  // Parent selection state
  const [parentSearch, setParentSearch] = useState('');
  const [parentResults, setParentResults] = useState<any[]>([]);
  const [selectedParent, setSelectedParent] = useState<any | null>(null);
  const [searchingParents, setSearchingParents] = useState(false);

  // Child details
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [preferredName, setPreferredName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState<'boy' | 'girl' | ''>('');
  const [ageGroup, setAgeGroup] = useState('');
  const [medicalNotes, setMedicalNotes] = useState('');
  const [allergies, setAllergies] = useState('');
  const [specialNeeds, setSpecialNeeds] = useState('');
  const [mediaConsent, setMediaConsent] = useState(true);
  const [medicalConsent, setMedicalConsent] = useState(true);

  // Authorized pickup list
  const [authorizedPickups, setAuthorizedPickups] = useState<Array<{ fullName: string; phone: string; relationship: string }>>([
    { fullName: '', phone: '', relationship: '' }
  ]);

  // Event registration toggle
  const [registerForCurrentEvent, setRegisterForCurrentEvent] = useState(true);

  // Duplicate Check
  const [duplicateMatch, setDuplicateMatch] = useState<any | null>(null);
  const [overrideDuplicate, setOverrideDuplicate] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (preselectedParentId) {
      setSelectedParent({ id: preselectedParentId, fullName: preselectedParentName || 'Parent Profile' });
    }
  }, [preselectedParentId, preselectedParentName]);

  if (!isOpen) return null;

  const handleSearchParents = async (query: string) => {
    setParentSearch(query);
    if (!query.trim() || query.length < 2) {
      setParentResults([]);
      return;
    }
    setSearchingParents(true);
    try {
      const res = await api.admin.getParents({ q: query, status: 'active' });
      if (res.success) {
        setParentResults(res.parents || []);
      }
    } catch (e) {
      // Ignore background errors
    } finally {
      setSearchingParents(false);
    }
  };

  const addPickupRow = () => {
    setAuthorizedPickups([...authorizedPickups, { fullName: '', phone: '', relationship: '' }]);
  };

  const updatePickupRow = (index: number, field: string, value: string) => {
    const updated = [...authorizedPickups];
    updated[index] = { ...updated[index], [field]: value };
    setAuthorizedPickups(updated);
  };

  const removePickupRow = (index: number) => {
    setAuthorizedPickups(authorizedPickups.filter((_, i) => i !== index));
  };

  const handleCheckDuplicate = async () => {
    if (!selectedParent || !firstName || !lastName) return;
    try {
      const res = await api.admin.checkDuplicate({
        type: 'child',
        firstName,
        lastName,
        parentId: selectedParent.id
      });
      if (res.duplicateFound) {
        setDuplicateMatch(res);
      } else {
        setDuplicateMatch(null);
      }
    } catch (e) {}
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedParent) {
      showError('Validation Error', 'Please select a parent or guardian profile to link this child to.');
      return;
    }

    if (!firstName || !lastName) {
      showError('Validation Error', 'Child first name and last name are required.');
      return;
    }

    if (duplicateMatch && !overrideDuplicate) {
      showError('Duplicate Warning', 'A child with this name is already registered under this parent. Please check override to continue.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        parentProfileId: selectedParent.id,
        firstName,
        lastName,
        preferredName,
        dateOfBirth,
        gender,
        ageGroup,
        medicalNotes,
        allergies,
        specialNeeds,
        mediaConsent,
        medicalConsent,
        authorizedPickups: authorizedPickups.filter(p => p.fullName.trim().length > 0),
        registerForCurrentEvent,
        overrideDuplicate
      };

      const res = await api.admin.addChild(payload);
      if (res.success) {
        showSuccess('Child Created', res.message || 'Child record created successfully.');
        onSuccess(res.childId);
        onClose();
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      if (parsed.code === 'DUPLICATE_RECORD') {
        setDuplicateMatch({ duplicateFound: true, message: parsed.message });
      }
      showError('Creation Failed', parsed.message || 'Could not save child record.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-2xl rounded-3xl border border-[#EAE8E1] shadow-xl overflow-hidden my-8">
        
        {/* Header */}
        <div className="p-6 border-b border-[#EAE8E1] flex items-center justify-between bg-[#FAF8F4]">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-[#C59B27]">
              <Baby className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-serif text-lg font-bold text-[#18181B]">Add Child Record</h3>
              <p className="text-xs text-zinc-500">Link a child to a parent profile and configure attendance settings.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 p-2 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          
          {/* SECTION 1: Parent Selection */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-[#C59B27] uppercase tracking-wider pb-1 border-b border-amber-100">
              1. Parent / Guardian Link
            </h4>

            {selectedParent ? (
              <div className="p-3.5 bg-amber-50/70 rounded-2xl border border-amber-200 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider block">Linked Parent</span>
                  <span className="text-sm font-bold text-zinc-900 block">{selectedParent.fullName}</span>
                  {selectedParent.phone && <span className="text-xs text-zinc-500">{selectedParent.phone}</span>}
                </div>
                {!preselectedParentId && (
                  <button
                    type="button"
                    onClick={() => setSelectedParent(null)}
                    className="text-xs text-amber-900 hover:underline font-semibold"
                  >
                    Change Parent
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-zinc-700 block">
                  Search Parent by Name, Email or Phone <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={parentSearch}
                    onChange={(e) => handleSearchParents(e.target.value)}
                    placeholder="Type parent name, email or phone..."
                    className="w-full pl-9 pr-3.5 py-2.5 text-sm rounded-xl border border-[#EAE8E1] bg-zinc-50 focus:bg-white focus:ring-2 focus:ring-amber-100 focus:border-[#C59B27]"
                  />
                  <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-3" />
                </div>

                {parentResults.length > 0 && (
                  <div className="border border-[#EAE8E1] rounded-2xl bg-white divide-y divide-[#EAE8E1] max-h-40 overflow-y-auto shadow-sm">
                    {parentResults.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setSelectedParent(p);
                          setParentResults([]);
                          if (!lastName && p.fullName) {
                            const parts = p.fullName.trim().split(' ');
                            if (parts.length > 1) setLastName(parts[parts.length - 1]);
                          }
                        }}
                        className="w-full text-left p-3 hover:bg-amber-50/50 transition-colors flex items-center justify-between text-xs"
                      >
                        <div>
                          <span className="font-bold text-zinc-900 block">{p.fullName}</span>
                          <span className="text-zinc-500">{p.email} · {p.phone || 'No phone'}</span>
                        </div>
                        <span className="text-[#C59B27] font-semibold">Select</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* SECTION 2: Child Personal Information */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-[#C59B27] uppercase tracking-wider pb-1 border-b border-amber-100">
              2. Child Details
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-semibold text-zinc-700 block mb-1">
                  First Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  onBlur={handleCheckDuplicate}
                  placeholder="e.g. Samuel"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-[#EAE8E1] bg-zinc-50 focus:bg-white"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-700 block mb-1">
                  Last Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  onBlur={handleCheckDuplicate}
                  placeholder="e.g. Adebayo"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-[#EAE8E1] bg-zinc-50 focus:bg-white"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-700 block mb-1">Preferred Name</label>
                <input
                  type="text"
                  value={preferredName}
                  onChange={(e) => setPreferredName(e.target.value)}
                  placeholder="e.g. Sammy"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-[#EAE8E1] bg-zinc-50 focus:bg-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-semibold text-zinc-700 block mb-1">Date of Birth</label>
                <input
                  type="date"
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-[#EAE8E1] bg-zinc-50 focus:bg-white"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-700 block mb-1">Gender</label>
                <select
                  value={gender}
                  onChange={(e: any) => setGender(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-[#EAE8E1] bg-zinc-50 focus:bg-white"
                >
                  <option value="">Select gender</option>
                  <option value="boy">Boy</option>
                  <option value="girl">Girl</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-700 block mb-1">Age Group / Class</label>
                <select
                  value={ageGroup}
                  onChange={(e) => setAgeGroup(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-[#EAE8E1] bg-zinc-50 focus:bg-white"
                >
                  <option value="">Auto-assign or select</option>
                  <option value="Toddlers (1-3)">Toddlers (1-3)</option>
                  <option value="Juniors (4-7)">Juniors (4-7)</option>
                  <option value="Seniors (8-12)">Seniors (8-12)</option>
                  <option value="Teens (13-17)">Teens (13-17)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-zinc-700 block mb-1">Allergies & Medical Notes</label>
                <input
                  type="text"
                  value={allergies}
                  onChange={(e) => setAllergies(e.target.value)}
                  placeholder="e.g. Nuts, Dairy, Asthma"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-[#EAE8E1] bg-zinc-50 focus:bg-white"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-700 block mb-1">Special Needs / Care Instructions</label>
                <input
                  type="text"
                  value={specialNeeds}
                  onChange={(e) => setSpecialNeeds(e.target.value)}
                  placeholder="e.g. Needs quiet environment during worship"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-[#EAE8E1] bg-zinc-50 focus:bg-white"
                />
              </div>
            </div>
          </div>

          {/* SECTION 3: Authorized Pickup Persons */}
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-1 border-b border-amber-100">
              <h4 className="text-xs font-bold text-[#C59B27] uppercase tracking-wider">
                3. Authorized Pickup Persons
              </h4>
              <button
                type="button"
                onClick={addPickupRow}
                className="text-xs text-[#C59B27] hover:underline font-semibold flex items-center space-x-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Pickup Person</span>
              </button>
            </div>

            {authorizedPickups.map((pickup, idx) => (
              <div key={idx} className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-center bg-zinc-50 p-2.5 rounded-xl border border-[#EAE8E1]">
                <input
                  type="text"
                  value={pickup.fullName}
                  onChange={(e) => updatePickupRow(idx, 'fullName', e.target.value)}
                  placeholder="Full Name"
                  className="px-3 py-1.5 text-xs rounded-lg border border-[#EAE8E1] bg-white"
                />
                <input
                  type="tel"
                  value={pickup.phone}
                  onChange={(e) => updatePickupRow(idx, 'phone', e.target.value)}
                  placeholder="Phone Number"
                  className="px-3 py-1.5 text-xs rounded-lg border border-[#EAE8E1] bg-white"
                />
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={pickup.relationship}
                    onChange={(e) => updatePickupRow(idx, 'relationship', e.target.value)}
                    placeholder="Relationship (e.g. Uncle)"
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-[#EAE8E1] bg-white"
                  />
                  {authorizedPickups.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removePickupRow(idx)}
                      className="text-zinc-400 hover:text-red-600 p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* SECTION 4: Event Registration & Consents */}
          <div className="space-y-3 bg-amber-50/50 p-4 rounded-2xl border border-amber-100">
            <label className="flex items-center space-x-3 cursor-pointer">
              <input
                type="checkbox"
                checked={registerForCurrentEvent}
                onChange={(e) => setRegisterForCurrentEvent(e.target.checked)}
                className="w-4 h-4 text-[#C59B27] rounded focus:ring-[#C59B27]"
              />
              <span className="text-xs font-bold text-zinc-900">
                Register for current Koinonia Children & Teens event immediately
              </span>
            </label>

            <div className="flex items-center space-x-6 text-xs text-zinc-700 pt-1">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={mediaConsent}
                  onChange={(e) => setMediaConsent(e.target.checked)}
                  className="text-[#C59B27] rounded"
                />
                <span>Media / Photography consent granted</span>
              </label>

              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={medicalConsent}
                  onChange={(e) => setMedicalConsent(e.target.checked)}
                  className="text-[#C59B27] rounded"
                />
                <span>Emergency medical consent granted</span>
              </label>
            </div>
          </div>

          {/* DUPLICATE WARNING */}
          {duplicateMatch && (
            <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 text-amber-900 space-y-2 text-xs">
              <div className="flex items-start space-x-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>{duplicateMatch.message}</span>
              </div>
              <label className="flex items-center space-x-2 font-semibold text-amber-950 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={overrideDuplicate}
                  onChange={(e) => setOverrideDuplicate(e.target.checked)}
                  className="text-amber-700 rounded"
                />
                <span>Override and add child anyway</span>
              </label>
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-4 border-t border-[#EAE8E1] flex items-center justify-end space-x-3">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={submitting}
              disabled={submitting}
            >
              Save Child Record
            </Button>
          </div>

        </form>
      </div>
    </div>
  );
};
