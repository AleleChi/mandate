import React from 'react';
import { ShieldCheck, Mail, Users, FileText, LogOut, Phone, MessageSquare, Briefcase, CheckSquare } from 'lucide-react';
import { AppRoute } from '../types';
import { Button } from '../components/common/Button';

interface VolunteerPendingReviewViewProps {
  onNavigate: (route: AppRoute) => void;
  volunteerProfile: any;
  onSignOut: () => void;
  hasParentProfile?: boolean;
}

export const VolunteerPendingReviewView: React.FC<VolunteerPendingReviewViewProps> = ({
  onNavigate,
  volunteerProfile,
  onSignOut,
  hasParentProfile
}) => {
  const fullName = volunteerProfile?.full_name || 'Volunteer';
  const preferredTeam = volunteerProfile?.preferred_team || 'General Assistance';
  const phone = volunteerProfile?.phone || '';
  const whatsapp = volunteerProfile?.whatsapp || '';
  const isWorker = volunteerProfile?.is_koinonia_worker;
  const department = volunteerProfile?.department || '';
  const experience = volunteerProfile?.serving_experience || '';
  const photoFileId = volunteerProfile?.photo_file_id;

  return (
    <div className="min-h-screen bg-[#FAF9F6] font-sans flex flex-col justify-between pb-12">
      {/* Header Bar */}
      <div className="h-16 px-4 flex items-center justify-between border-b border-[#EAE8E1] bg-white">
        <div className="w-8" />
        <span className="text-xs font-mono font-bold text-gray-400 tracking-wider">VOLUNTEER SERVICE</span>
        <button
          onClick={onSignOut}
          className="p-2 text-gray-400 hover:text-red-600 rounded-full hover:bg-gray-50 flex items-center justify-center cursor-pointer transition-colors"
          title="Sign Out"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center p-4 pt-8 pb-12">
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#EAE8E1] shadow-sm max-w-lg w-full text-center space-y-6">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#FAF6EC] text-[#C59B27] border border-[#E5D5AE]/30">
            <ShieldCheck className="h-8 w-8 stroke-[1.5]" />
          </div>

          <div className="space-y-1.5">
            <h1 className="text-2xl font-bold font-serif-koinonia text-[#18181B] tracking-tight">Profile Under Review</h1>
            <p className="text-xs font-mono font-bold text-[#C59B27] tracking-wider uppercase">
              APPROVED ACCESS REQUIRED
            </p>
          </div>

          <p className="text-xs text-[#52525B] leading-relaxed max-w-md mx-auto">
            Thank you for applying to serve Koinonia Children and Teens on the <span className="font-semibold text-[#18181B]">{preferredTeam}</span> team. 
            An administrator is currently reviewing and activating your volunteer credentials before you can access event-day tools.
          </p>

          {/* Submitted Details Review Panel */}
          <div className="border border-[#EAE8E1] rounded-2xl p-5 bg-[#FAF9F6] text-left space-y-4">
            <div className="flex items-center justify-between border-b border-[#EAE8E1] pb-2.5">
              <h2 className="text-xs font-bold text-[#18181B] tracking-wider uppercase">Your Submitted Details</h2>
              <span className="text-[10px] font-mono text-[#C59B27] font-bold uppercase bg-[#FAF6EC] px-2 py-0.5 rounded-lg border border-[#EBE3D3]">
                Pending review
              </span>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 items-center sm:items-start">
              {photoFileId ? (
                <img
                  src={`/api/media/files/${photoFileId}`}
                  alt="Profile Headshot"
                  referrerPolicy="no-referrer"
                  className="w-16 h-16 rounded-2xl object-cover border-2 border-[#C59B27]/30 shadow-xs"
                />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-400 border border-dashed border-gray-300">
                  <Users className="w-6 h-6 stroke-[1.5]" />
                </div>
              )}

              <div className="flex-1 w-full space-y-2.5 text-xs text-[#52525B]">
                <div className="grid grid-cols-3 gap-2">
                  <span className="font-medium text-gray-400">Full Name:</span>
                  <span className="col-span-2 font-bold text-[#18181B]">{fullName}</span>
                </div>
                {phone && (
                  <div className="grid grid-cols-3 gap-2">
                    <span className="font-medium text-gray-400 flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5 text-gray-300 shrink-0" /> Phone:
                    </span>
                    <span className="col-span-2 font-semibold text-gray-700">{phone}</span>
                  </div>
                )}
                {whatsapp && (
                  <div className="grid grid-cols-3 gap-2">
                    <span className="font-medium text-gray-400 flex items-center gap-1">
                      <MessageSquare className="w-3.5 h-3.5 text-gray-300 shrink-0" /> WhatsApp:
                    </span>
                    <span className="col-span-2 font-semibold text-gray-700">{whatsapp}</span>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2">
                  <span className="font-medium text-gray-400 flex items-center gap-1">
                    <Briefcase className="w-3.5 h-3.5 text-gray-300 shrink-0" /> Koinonia Worker:
                  </span>
                  <span className="col-span-2 font-semibold text-gray-700">
                    {isWorker ? `Yes (${department || 'General'})` : 'No'}
                  </span>
                </div>
                {experience && (
                  <div className="grid grid-cols-3 gap-2">
                    <span className="font-medium text-gray-400 flex items-center gap-1">
                      <CheckSquare className="w-3.5 h-3.5 text-gray-300 shrink-0" /> Experience:
                    </span>
                    <span className="col-span-2 text-gray-600 italic line-clamp-2">{experience}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Stitches Onboarding Status Timeline */}
          <div className="border border-gray-100 rounded-2xl p-5 bg-gray-50/50 space-y-4 text-left">
            <h2 className="text-xs font-bold text-[#18181B] tracking-wide uppercase">Your Onboarding Status</h2>
            <div className="space-y-4">
              <div className="flex items-start space-x-3.5">
                <div className="mt-0.5 w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center text-white text-[10px] font-bold shadow-sm">✓</div>
                <div>
                  <h3 className="text-xs font-bold text-gray-800">Account Registered</h3>
                  <p className="text-[10px] text-gray-400 leading-normal">Basic details, password, and secure photo collected.</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3.5">
                <div className="mt-0.5 w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center text-white text-[10px] font-bold shadow-sm">✓</div>
                <div>
                  <h3 className="text-xs font-bold text-gray-800">Email Verified</h3>
                  <p className="text-[10px] text-gray-400 leading-normal">Secure ownership of your inbox has been confirmed.</p>
                </div>
              </div>

              <div className="flex items-start space-x-3.5">
                <div className="mt-1 w-5 h-5 rounded-full border-2 border-[#C59B27] border-t-transparent animate-spin shrink-0"></div>
                <div>
                  <h3 className="text-xs font-bold text-gray-800">Admin Approval</h3>
                  <p className="text-[10px] text-gray-500 font-medium leading-normal">
                    Administrator is checking background eligibility and team assignment.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <Button
              variant="secondary"
              fullWidth
              onClick={() => {
                window.location.reload();
              }}
            >
              Check My Approval Status
            </Button>

            {hasParentProfile && (
              <Button
                variant="primary"
                fullWidth
                onClick={() => onNavigate('/parent/home')}
              >
                Go back to Parent Home
              </Button>
            )}

            <button
              onClick={onSignOut}
              className="text-xs font-semibold text-gray-400 hover:text-red-600 block mx-auto cursor-pointer focus:outline-none transition-colors"
            >
              Sign out of my account
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
