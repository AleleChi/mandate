import React, { useState } from 'react';
import { X, Heart, Mail, Phone, Shield, AlertTriangle } from 'lucide-react';
import { api, extractApiError } from '../../../services/api';
import { useNotification } from '../../../context/NotificationContext';
import { Button } from '../../common/Button';

interface AddVolunteerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (volunteerId?: string) => void;
}

export const AddVolunteerModal: React.FC<AddVolunteerModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { showSuccess, showError } = useNotification();

  // Volunteer Fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [preferredName, setPreferredName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');
  const [preferredTeam, setPreferredTeam] = useState('General Assistance');
  const [skillsExperience, setSkillsExperience] = useState('');
  const [availabilityNotes, setAvailabilityNotes] = useState('');
  const [assignedDutyRole, setAssignedDutyRole] = useState('');

  // Account creation mode
  const [sendInvitation, setSendInvitation] = useState(true);

  // Duplicate Check
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
    setEmergencyContactName('');
    setEmergencyContactPhone('');
    setPreferredTeam('General Assistance');
    setSkillsExperience('');
    setAvailabilityNotes('');
    setAssignedDutyRole('');
    setSendInvitation(true);
    setDuplicateMatch(null);
    setOverrideDuplicate(false);
  };

  const handleCheckDuplicate = async () => {
    if (!email) return;
    try {
      const res = await api.admin.checkDuplicate({ type: 'volunteer', email });
      if (res.duplicateFound) {
        setDuplicateMatch(res);
      } else {
        setDuplicateMatch(null);
      }
    } catch (e) {}
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName || !lastName || !email) {
      showError('Validation Error', 'First name, last name, and email address are required.');
      return;
    }

    if (duplicateMatch && !overrideDuplicate) {
      showError('Duplicate Warning', 'A volunteer record with this email already exists. Please confirm override to proceed.');
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
        emergencyContactName,
        emergencyContactPhone,
        preferredTeam,
        skillsExperience,
        availabilityNotes,
        assignedDutyRole,
        sendInvitation,
        overrideDuplicate
      };

      const res = await api.admin.addVolunteer(payload);
      if (res.success) {
        showSuccess('Volunteer Created', res.message || 'Volunteer record created successfully.');
        resetForm();
        onSuccess(res.volunteerId);
        onClose();
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      if (parsed.code === 'DUPLICATE_RECORD') {
        setDuplicateMatch({ duplicateFound: true, message: parsed.message });
      }
      showError('Creation Failed', parsed.message || 'Could not save volunteer record.');
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
              <Heart className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-serif text-lg font-bold text-[#18181B]">Add Volunteer Record</h3>
              <p className="text-xs text-zinc-500">Create a canonical volunteer profile and set up onboarding access.</p>
            </div>
          </div>
          <button
            onClick={() => { resetForm(); onClose(); }}
            className="text-zinc-400 hover:text-zinc-600 p-2 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          
          {/* Personal Info */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-[#C59B27] uppercase tracking-wider pb-1 border-b border-amber-100">
              1. Personal Information
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
                  placeholder="e.g. Grace"
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
                  placeholder="e.g. Okafor"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-[#EAE8E1] bg-zinc-50 focus:bg-white"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-700 block mb-1">Preferred Name</label>
                <input
                  type="text"
                  value={preferredName}
                  onChange={(e) => setPreferredName(e.target.value)}
                  placeholder="e.g. Gracie"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-[#EAE8E1] bg-zinc-50 focus:bg-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                    placeholder="volunteer@example.com"
                    className="w-full pl-9 pr-3.5 py-2.5 text-sm rounded-xl border border-[#EAE8E1] bg-zinc-50 focus:bg-white"
                  />
                  <Mail className="w-4 h-4 text-zinc-400 absolute left-3 top-3" />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-700 block mb-1">Phone Number</label>
                <div className="relative">
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+44 7123 000000"
                    className="w-full pl-9 pr-3.5 py-2.5 text-sm rounded-xl border border-[#EAE8E1] bg-zinc-50 focus:bg-white"
                  />
                  <Phone className="w-4 h-4 text-zinc-400 absolute left-3 top-3" />
                </div>
              </div>
            </div>
          </div>

          {/* Team & Role Assignment */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-[#C59B27] uppercase tracking-wider pb-1 border-b border-amber-100">
              2. Ministry Team & Duty Assignment
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-zinc-700 block mb-1">Preferred Ministry Team</label>
                <select
                  value={preferredTeam}
                  onChange={(e) => setPreferredTeam(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-[#EAE8E1] bg-zinc-50 focus:bg-white"
                >
                  <option value="General Assistance">General Assistance</option>
                  <option value="Registration & Check-in">Registration & Check-in</option>
                  <option value="Children's Teaching">Children's Teaching</option>
                  <option value="Teens Mentorship">Teens Mentorship</option>
                  <option value="First Aid & Safety">First Aid & Safety</option>
                  <option value="Logistics & Ushering">Logistics & Ushering</option>
                  <option value="Media & Technical">Media & Technical</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-700 block mb-1">Assigned Duty / Specific Role</label>
                <input
                  type="text"
                  value={assignedDutyRole}
                  onChange={(e) => setAssignedDutyRole(e.target.value)}
                  placeholder="e.g. Lead Teacher - Juniors"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-[#EAE8E1] bg-zinc-50 focus:bg-white"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-zinc-700 block mb-1">Skills & Previous Experience</label>
              <textarea
                value={skillsExperience}
                onChange={(e) => setSkillsExperience(e.target.value)}
                placeholder="DBS checked, First aid certified, teaching background..."
                rows={2}
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-[#EAE8E1] bg-zinc-50 focus:bg-white"
              />
            </div>
          </div>

          {/* Emergency Contact */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-[#C59B27] uppercase tracking-wider pb-1 border-b border-amber-100">
              3. Emergency Contact
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-zinc-700 block mb-1">Emergency Contact Name</label>
                <input
                  type="text"
                  value={emergencyContactName}
                  onChange={(e) => setEmergencyContactName(e.target.value)}
                  placeholder="Contact Name"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-[#EAE8E1] bg-zinc-50 focus:bg-white"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-700 block mb-1">Emergency Contact Phone</label>
                <input
                  type="tel"
                  value={emergencyContactPhone}
                  onChange={(e) => setEmergencyContactPhone(e.target.value)}
                  placeholder="Contact Phone"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-[#EAE8E1] bg-zinc-50 focus:bg-white"
                />
              </div>
            </div>
          </div>

          {/* Account & Invitation */}
          <div className="space-y-3 bg-amber-50/50 p-4 rounded-2xl border border-amber-100">
            <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center space-x-2">
              <Shield className="w-4 h-4 text-[#C59B27]" />
              <span>4. Account Access & Invitation</span>
            </h4>

            <div className="space-y-2">
              <label className="flex items-start space-x-3 cursor-pointer">
                <input
                  type="radio"
                  name="volInviteChoice"
                  checked={sendInvitation}
                  onChange={() => setSendInvitation(true)}
                  className="mt-1 text-[#C59B27] focus:ring-[#C59B27]"
                />
                <div className="text-xs">
                  <span className="font-semibold text-zinc-900 block">
                    Send invitation email with password setup link (Recommended)
                  </span>
                  <span className="text-zinc-500 block">
                    Issues a secure 72-hour invitation token to <strong className="text-zinc-700">{email || 'volunteer email'}</strong> allowing them to set up their Volunteer portal password.
                  </span>
                </div>
              </label>

              <label className="flex items-start space-x-3 cursor-pointer">
                <input
                  type="radio"
                  name="volInviteChoice"
                  checked={!sendInvitation}
                  onChange={() => setSendInvitation(false)}
                  className="mt-1 text-[#C59B27] focus:ring-[#C59B27]"
                />
                <div className="text-xs">
                  <span className="font-semibold text-zinc-900 block">
                    Save volunteer record only (No login email sent)
                  </span>
                  <span className="text-zinc-500 block">
                    Creates the volunteer profile for record-keeping and duty assignment without sending an onboarding email.
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* Duplicate Match Warning */}
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
                <span>Override and create volunteer anyway</span>
              </label>
            </div>
          )}

          {/* Action Buttons */}
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
              Save Volunteer Record
            </Button>
          </div>

        </form>
      </div>
    </div>
  );
};
