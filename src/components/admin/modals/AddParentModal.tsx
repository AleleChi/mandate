import React, { useState } from 'react';
import { X, UserPlus, AlertTriangle, CheckCircle2, Mail, Phone, Home, Shield, Plus, Trash2 } from 'lucide-react';
import { api, extractApiError } from '../../../services/api';
import { useNotification } from '../../../context/NotificationContext';
import { Button } from '../../common/Button';

interface AddParentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (parentId?: string) => void;
}

export const AddParentModal: React.FC<AddParentModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { showSuccess, showError } = useNotification();
  
  // Section form state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [preferredName, setPreferredName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [homeAddress, setHomeAddress] = useState('');
  const [city, setCity] = useState('');
  const [stateProvince, setStateProvince] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('United Kingdom');
  const [preferredContactMethod, setPreferredContactMethod] = useState<'email' | 'phone' | 'whatsapp'>('email');
  
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');
  const [isKoinoniaWorker, setIsKoinoniaWorker] = useState(false);
  const [workerDepartment, setWorkerDepartment] = useState('');

  // Account creation mode
  const [sendInvitation, setSendInvitation] = useState(true);

  // Optional Child Inline addition
  const [includeChild, setIncludeChild] = useState(false);
  const [childFirstName, setChildFirstName] = useState('');
  const [childLastName, setChildLastName] = useState('');
  const [childPreferredName, setChildPreferredName] = useState('');
  const [childDob, setChildDob] = useState('');
  const [childGender, setChildGender] = useState<'boy' | 'girl' | ''>('');
  const [childAgeGroup, setChildAgeGroup] = useState('');
  const [childMedicalNotes, setChildMedicalNotes] = useState('');
  const [childAllergies, setChildAllergies] = useState('');
  const [childSpecialNeeds, setChildSpecialNeeds] = useState('');
  const [childMediaConsent, setChildMediaConsent] = useState(true);
  const [childMedicalConsent, setChildMedicalConsent] = useState(true);
  const [registerChildForEvent, setRegisterChildForEvent] = useState(true);

  // Duplicate Check UI states
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  const [duplicateMatch, setDuplicateMatch] = useState<any | null>(null);
  const [overrideDuplicate, setOverrideDuplicate] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const resetForm = () => {
    setFirstName('');
    setLastName('');
    setPreferredName('');
    setEmail('');
    setPhone('');
    setWhatsappPhone('');
    setHomeAddress('');
    setCity('');
    setStateProvince('');
    setPostalCode('');
    setCountry('United Kingdom');
    setPreferredContactMethod('email');
    setEmergencyContactName('');
    setEmergencyContactPhone('');
    setIsKoinoniaWorker(false);
    setWorkerDepartment('');
    setSendInvitation(true);
    setIncludeChild(false);
    setChildFirstName('');
    setChildLastName('');
    setChildPreferredName('');
    setChildDob('');
    setChildGender('');
    setChildAgeGroup('');
    setChildMedicalNotes('');
    setChildAllergies('');
    setChildSpecialNeeds('');
    setChildMediaConsent(true);
    setChildMedicalConsent(true);
    setRegisterChildForEvent(true);
    setDuplicateMatch(null);
    setOverrideDuplicate(false);
  };

  const handleCheckDuplicate = async () => {
    if (!email && !phone) return;
    setCheckingDuplicate(true);
    try {
      const res = await api.admin.checkDuplicate({ type: 'parent', email, phone });
      if (res.duplicateFound) {
        setDuplicateMatch(res);
      } else {
        setDuplicateMatch(null);
      }
    } catch (e) {
      // Ignore background duplicate check errors
    } finally {
      setCheckingDuplicate(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName || !lastName || !email) {
      showError('Validation Error', 'First name, last name, and email address are required.');
      return;
    }

    if (duplicateMatch && !overrideDuplicate) {
      showError('Duplicate Record Warning', 'Please review the existing record match or check the override box to proceed.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        firstName,
        lastName,
        preferredName,
        email,
        phone,
        whatsappPhone,
        homeAddress,
        city,
        stateProvince,
        postalCode,
        country,
        preferredContactMethod,
        emergencyContactName,
        emergencyContactPhone,
        isKoinoniaWorker,
        workerDepartment,
        sendInvitation,
        overrideDuplicate,
        childDetails: includeChild ? {
          firstName: childFirstName,
          lastName: childLastName || lastName,
          preferredName: childPreferredName,
          dateOfBirth: childDob,
          gender: childGender,
          ageGroup: childAgeGroup,
          medicalNotes: childMedicalNotes,
          allergies: childAllergies,
          specialNeeds: childSpecialNeeds,
          mediaConsent: childMediaConsent,
          medicalConsent: childMedicalConsent,
          registerForCurrentEvent: registerChildForEvent
        } : undefined
      };

      const res = await api.admin.addParent(payload);
      if (res.success) {
        showSuccess('Parent Created', res.message || 'Parent record successfully created.');
        resetForm();
        onSuccess(res.parentId);
        onClose();
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      if (parsed.code === 'DUPLICATE_RECORD') {
        setDuplicateMatch({
          duplicateFound: true,
          message: parsed.message
        });
      }
      showError('Creation Failed', parsed.message || 'Could not save parent record.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-3xl rounded-3xl border border-[#EAE8E1] shadow-xl overflow-hidden my-8">
        
        {/* Modal Header */}
        <div className="p-6 border-b border-[#EAE8E1] flex items-center justify-between bg-[#FAF8F4]">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-[#C59B27]">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-serif text-lg font-bold text-[#18181B]">Add Parent / Guardian</h3>
              <p className="text-xs text-zinc-500">Create a canonical parent record with secure invitation options.</p>
            </div>
          </div>
          <button
            onClick={() => { resetForm(); onClose(); }}
            className="text-zinc-400 hover:text-zinc-600 p-2 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          
          {/* SECTION 1: Personal Details */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-[#C59B27] uppercase tracking-wider flex items-center space-x-2 border-b border-amber-100 pb-2">
              <span>1. Personal Information</span>
            </h4>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-semibold text-zinc-700 block mb-1">
                  First Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="e.g. Samuel"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-[#EAE8E1] bg-zinc-50 focus:bg-white focus:ring-2 focus:ring-amber-100 focus:border-[#C59B27] transition-all"
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
                  placeholder="e.g. Adebayo"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-[#EAE8E1] bg-zinc-50 focus:bg-white focus:ring-2 focus:ring-amber-100 focus:border-[#C59B27] transition-all"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-700 block mb-1">Preferred Name</label>
                <input
                  type="text"
                  value={preferredName}
                  onChange={(e) => setPreferredName(e.target.value)}
                  placeholder="e.g. Sam"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-[#EAE8E1] bg-zinc-50 focus:bg-white focus:ring-2 focus:ring-amber-100 focus:border-[#C59B27] transition-all"
                />
              </div>
            </div>
          </div>

          {/* SECTION 2: Contact Details */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-[#C59B27] uppercase tracking-wider flex items-center space-x-2 border-b border-amber-100 pb-2">
              <span>2. Contact Information & Address</span>
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-zinc-700 block mb-1">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onBlur={handleCheckDuplicate}
                    placeholder="parent@example.com"
                    className="w-full pl-9 pr-3.5 py-2.5 text-sm rounded-xl border border-[#EAE8E1] bg-zinc-50 focus:bg-white focus:ring-2 focus:ring-amber-100 focus:border-[#C59B27] transition-all"
                  />
                  <Mail className="w-4 h-4 text-zinc-400 absolute left-3 top-3" />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-700 block mb-1">Primary Phone Number</label>
                <div className="relative">
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    onBlur={handleCheckDuplicate}
                    placeholder="+44 7123 456789"
                    className="w-full pl-9 pr-3.5 py-2.5 text-sm rounded-xl border border-[#EAE8E1] bg-zinc-50 focus:bg-white focus:ring-2 focus:ring-amber-100 focus:border-[#C59B27] transition-all"
                  />
                  <Phone className="w-4 h-4 text-zinc-400 absolute left-3 top-3" />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-700 block mb-1">WhatsApp Number</label>
                <input
                  type="tel"
                  value={whatsappPhone}
                  onChange={(e) => setWhatsappPhone(e.target.value)}
                  placeholder="Leave blank if same as phone"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-[#EAE8E1] bg-zinc-50 focus:bg-white focus:ring-2 focus:ring-amber-100 focus:border-[#C59B27] transition-all"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-700 block mb-1">Preferred Contact Method</label>
                <select
                  value={preferredContactMethod}
                  onChange={(e: any) => setPreferredContactMethod(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-[#EAE8E1] bg-zinc-50 focus:bg-white focus:ring-2 focus:ring-amber-100 focus:border-[#C59B27] transition-all"
                >
                  <option value="email">Email</option>
                  <option value="phone">Phone call</option>
                  <option value="whatsapp">WhatsApp</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="text-xs font-semibold text-zinc-700 block mb-1">Home Address</label>
                <input
                  type="text"
                  value={homeAddress}
                  onChange={(e) => setHomeAddress(e.target.value)}
                  placeholder="Street address"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-[#EAE8E1] bg-zinc-50 focus:bg-white focus:ring-2 focus:ring-amber-100 focus:border-[#C59B27] transition-all"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-700 block mb-1">City / Town</label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="City"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-[#EAE8E1] bg-zinc-50 focus:bg-white focus:ring-2 focus:ring-amber-100 focus:border-[#C59B27] transition-all"
                />
              </div>
            </div>
          </div>

          {/* SECTION 3: Church & Emergency */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-[#C59B27] uppercase tracking-wider flex items-center space-x-2 border-b border-amber-100 pb-2">
              <span>3. Church Connection & Emergency Contact</span>
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center space-x-3 pt-2">
                <input
                  type="checkbox"
                  id="koinoniaWorker"
                  checked={isKoinoniaWorker}
                  onChange={(e) => setIsKoinoniaWorker(e.target.checked)}
                  className="w-4 h-4 text-[#C59B27] rounded focus:ring-amber-500 border-zinc-300"
                />
                <label htmlFor="koinoniaWorker" className="text-xs font-semibold text-zinc-800 cursor-pointer">
                  Koinonia Church Worker / Staff Member
                </label>
              </div>

              {isKoinoniaWorker && (
                <div>
                  <label className="text-xs font-semibold text-zinc-700 block mb-1">Department / Ministry</label>
                  <input
                    type="text"
                    value={workerDepartment}
                    onChange={(e) => setWorkerDepartment(e.target.value)}
                    placeholder="e.g. Children's Department, Ushering"
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-[#EAE8E1] bg-zinc-50 focus:bg-white focus:ring-2 focus:ring-amber-100 focus:border-[#C59B27] transition-all"
                  />
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-zinc-700 block mb-1">Emergency Contact Name</label>
                <input
                  type="text"
                  value={emergencyContactName}
                  onChange={(e) => setEmergencyContactName(e.target.value)}
                  placeholder="Full name of backup contact"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-[#EAE8E1] bg-zinc-50 focus:bg-[#FAF8F4] focus:ring-2 focus:ring-amber-100 focus:border-[#C59B27] transition-all"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-700 block mb-1">Emergency Contact Phone</label>
                <input
                  type="tel"
                  value={emergencyContactPhone}
                  onChange={(e) => setEmergencyContactPhone(e.target.value)}
                  placeholder="+44 7123 000000"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-[#EAE8E1] bg-zinc-50 focus:bg-[#FAF8F4] focus:ring-2 focus:ring-amber-100 focus:border-[#C59B27] transition-all"
                />
              </div>
            </div>
          </div>

          {/* SECTION 4: Account & Invitation Settings */}
          <div className="space-y-3 bg-amber-50/50 p-4 rounded-2xl border border-amber-100">
            <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center space-x-2">
              <Shield className="w-4 h-4 text-[#C59B27]" />
              <span>4. Account & Invitation Lifecycle</span>
            </h4>

            <div className="space-y-2">
              <label className="flex items-start space-x-3 cursor-pointer">
                <input
                  type="radio"
                  name="invitationChoice"
                  checked={sendInvitation}
                  onChange={() => setSendInvitation(true)}
                  className="mt-1 text-[#C59B27] focus:ring-[#C59B27]"
                />
                <div className="text-xs">
                  <span className="font-semibold text-zinc-900 block">
                    Send invitation email with personalized password setup link (Recommended)
                  </span>
                  <span className="text-zinc-500 block">
                    Issues a secure 72-hour invitation token to <strong className="text-zinc-700">{email || 'parent email'}</strong>. The administrator will not know or set the parent's permanent password.
                  </span>
                </div>
              </label>

              <label className="flex items-start space-x-3 cursor-pointer">
                <input
                  type="radio"
                  name="invitationChoice"
                  checked={!sendInvitation}
                  onChange={() => setSendInvitation(false)}
                  className="mt-1 text-[#C59B27] focus:ring-[#C59B27]"
                />
                <div className="text-xs">
                  <span className="font-semibold text-zinc-900 block">
                    Save parent record only (No active user login)
                  </span>
                  <span className="text-zinc-500 block">
                    Creates the canonical parent profile in database so children can be linked immediately, without triggering an automated email.
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* SECTION 5: Optional Inline Child Creation */}
          <div className="space-y-3 p-4 bg-zinc-50 rounded-2xl border border-[#EAE8E1]">
            <div className="flex items-center justify-between">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeChild}
                  onChange={(e) => setIncludeChild(e.target.checked)}
                  className="w-4 h-4 text-[#C59B27] rounded border-zinc-300"
                />
                <span className="text-xs font-bold text-zinc-900">
                  Register a child under this parent right now
                </span>
              </label>
            </div>

            {includeChild && (
              <div className="pt-3 border-t border-[#EAE8E1] space-y-4 animate-fade-in">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-zinc-700 block mb-1">Child First Name *</label>
                    <input
                      type="text"
                      required={includeChild}
                      value={childFirstName}
                      onChange={(e) => setChildFirstName(e.target.value)}
                      placeholder="e.g. David"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-[#EAE8E1] bg-white"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-zinc-700 block mb-1">Child Last Name</label>
                    <input
                      type="text"
                      value={childLastName}
                      onChange={(e) => setChildLastName(e.target.value)}
                      placeholder={lastName || "Same as parent"}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-[#EAE8E1] bg-white"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-zinc-700 block mb-1">Date of Birth</label>
                    <input
                      type="date"
                      value={childDob}
                      onChange={(e) => setChildDob(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-[#EAE8E1] bg-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-zinc-700 block mb-1">Medical Notes / Allergies</label>
                    <input
                      type="text"
                      value={childAllergies}
                      onChange={(e) => setChildAllergies(e.target.value)}
                      placeholder="e.g. Peanut allergy, Asthma"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-[#EAE8E1] bg-white"
                    />
                  </div>

                  <div className="flex items-center space-x-3 pt-4">
                    <label className="flex items-center space-x-2 text-xs text-zinc-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={registerChildForEvent}
                        onChange={(e) => setRegisterChildForEvent(e.target.checked)}
                        className="text-[#C59B27] rounded"
                      />
                      <span>Register for active event automatically</span>
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* DUPLICATE WARNING BLOCK */}
          {duplicateMatch && (
            <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 text-amber-900 space-y-3">
              <div className="flex items-start space-x-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1 text-xs">
                  <span className="font-bold text-amber-950 block">Possible Duplicate Record Detected</span>
                  <p>{duplicateMatch.message}</p>
                </div>
              </div>

              <div className="pt-2 border-t border-amber-200 flex items-center justify-between">
                <label className="flex items-center space-x-2 text-xs font-semibold text-amber-950 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={overrideDuplicate}
                    onChange={(e) => setOverrideDuplicate(e.target.checked)}
                    className="text-amber-700 rounded border-amber-300"
                  />
                  <span>Confirm and create record anyway</span>
                </label>
              </div>
            </div>
          )}

          {/* Form Action Buttons */}
          <div className="pt-4 border-t border-[#EAE8E1] flex items-center justify-end space-x-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => { resetForm(); onClose(); }}
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
              Save Parent Record
            </Button>
          </div>

        </form>
      </div>
    </div>
  );
};
