import React, { useEffect, useState } from 'react';
import { ShieldCheck, ArrowLeft, Mail, Phone, MapPin, Globe, Clock, ShieldAlert, FileText, CheckCircle } from 'lucide-react';
import { api } from '../services/api';
import { PrivacyPolicyView } from './PrivacyPolicyView';

interface LegalPagesViewProps {
  page: 'privacy' | 'terms' | 'child-safety' | 'contact';
  onNavigate: (route: string) => void;
}

export const LegalPagesView: React.FC<LegalPagesViewProps> = ({ page, onNavigate }) => {
  if (page === 'privacy') {
    return <PrivacyPolicyView onNavigate={onNavigate} />;
  }
  const [copyright, setCopyright] = useState<{ copyrightYear: number; copyrightText: string }>({
    copyrightYear: 2026,
    copyrightText: 'Koinonia Children and Teens. All rights reserved.'
  });

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await api.admin.getFooterSettings();
        if (res && res.success && res.settings) {
          setCopyright(res.settings);
        }
      } catch (err) {
        console.error('Failed to load footer settings for legal page:', err);
      }
    };
    fetchSettings();
  }, []);

  const renderContent = () => {
    switch (page) {
      case 'terms':
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3 pb-4 border-b border-[#EAE8E1]">
              <FileText className="w-8 h-8 text-[#C59B27]" />
              <h2 className="text-2xl font-semibold text-[#18181B] tracking-tight">Terms of Service</h2>
            </div>
            <p className="text-sm text-stone-600 leading-relaxed">
              These Parent Terms govern the registration and participation of children and teens in all Koinonia events, services, and associated programs. By registering your child, you agree to these operational protocols.
            </p>

            <div className="space-y-4">
              <h3 className="text-base font-semibold text-[#18181B]">1. Verification & Compliance</h3>
              <p className="text-xs text-stone-500 leading-relaxed">
                Parents must complete their own verified profile, including a clear and identifiable headshot, before register-submitting children. All information regarding child date of birth, age groups, and emergency contacts must be accurate and true.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="text-base font-semibold text-[#18181B]">2. Exclusive Guardian Pickup Release</h3>
              <p className="text-xs text-stone-500 leading-relaxed">
                Children will be released ONLY to the specific parent or designated secondary backup pickup person registered on the child's active digital pass. Stewards and security coordinators will verify matches via photo-terminal checks. Phone calls, chat messages, or paper claims will not bypass this security barrier.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="text-base font-semibold text-[#18181B]">3. Medical Declarations & First Aid</h3>
              <p className="text-xs text-stone-500 leading-relaxed">
                Parents are required to declare any critical medical histories, asthma/respiratory needs, allergies, or special requirements during registration. In case of safety alerts or medical urgencies, on-site first aid staff will reference these declarations to administer care safely.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="text-base font-semibold text-[#18181B]">4. Conduct & Responsibilities</h3>
              <p className="text-xs text-stone-500 leading-relaxed">
                To guarantee the safety of all children, parents must abide by the designated arrival, drop-off, and pick-up window schedules. Any child showing signs of contagious illness should not be checked into communal halls to prevent cross-contamination.
              </p>
            </div>
          </div>
        );

      case 'child-safety':
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3 pb-4 border-b border-[#EAE8E1]">
              <ShieldAlert className="w-8 h-8 text-[#C59B27]" />
              <h2 className="text-2xl font-semibold text-[#18181B] tracking-tight">Child Safety Policy</h2>
            </div>
            <p className="text-sm text-stone-600 leading-relaxed">
              Our absolute and uncompromising priority is the safety, protection, and physical wellbeing of every child and teen placed in our care. This Safeguarding Policy defines our operational security standards.
            </p>

            <div className="bg-amber-50/50 border border-[#C59B27]/10 rounded-xl p-4 flex gap-3">
              <ShieldCheck className="w-5 h-5 text-[#C59B27] shrink-0 mt-0.5" />
              <div className="text-xs text-[#18181B] space-y-1">
                <span className="font-semibold block">Zero-Tolerance Safeguarding Rule</span>
                <p className="text-stone-500 leading-relaxed">
                  Every volunteer, steward, teacher, and administrator must complete criminal history background vetting, standard safeguarding interviews, and on-site training sessions before receiving on-duty assignments.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-base font-semibold text-[#18181B]">1. Live Tracking & Scanner Audits</h3>
              <p className="text-xs text-stone-500 leading-relaxed">
                All children receive a secure QR-code entry pass. Every move into event halls, location transfers, or releases must be scanned and synchronized to the central operational command dashboard in real-time. Unscanned entries or manual overrides trigger immediate attention flags.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="text-base font-semibold text-[#18181B]">2. Incident & Incident Reports Handling</h3>
              <p className="text-xs text-stone-500 leading-relaxed">
                Any accident, medical alert, or unusual behavioral sign must be immediately documented in an immutable Incident Record. Urgent alerts initiate the automated, multi-tier Escalation Protections to contact parents and assign responders instantly.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="text-base font-semibold text-[#18181B]">3. Hall Supervision Ratios</h3>
              <p className="text-xs text-stone-500 leading-relaxed">
                We maintain strictly mandated supervisor-to-child ratios in all classrooms: Under-3s have a 1:4 ratio, Ages 4-9 have a 1:8 ratio, and Teens are monitored by dedicated peer mentors and senior stewards. Room capacity thresholds are monitored dynamically on the Admin Duty screen.
              </p>
            </div>
          </div>
        );

      case 'contact':
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3 pb-4 border-b border-[#EAE8E1]">
              <Mail className="w-8 h-8 text-[#C59B27]" />
              <h2 className="text-2xl font-semibold text-[#18181B] tracking-tight">Contact Us</h2>
            </div>
            <p className="text-sm text-stone-600 leading-relaxed">
              Have questions regarding digital parent registrations, active volunteer applications, safety controls, or event operational check-in? Reach out directly to our dedicated Protocol & Care team.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="p-4 bg-stone-50 rounded-xl border border-stone-200/50 flex items-start gap-3">
                <Phone className="w-4 h-4 text-[#C59B27] shrink-0 mt-1" />
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-stone-700 block">Care & Support Desk</span>
                  <p className="text-xs font-mono text-stone-500">+234 (0) 900 123 4567</p>
                  <p className="text-[10px] text-stone-400">Available during major convocations</p>
                </div>
              </div>

              <div className="p-4 bg-stone-50 rounded-xl border border-stone-200/50 flex items-start gap-3">
                <Mail className="w-4 h-4 text-[#C59B27] shrink-0 mt-1" />
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-stone-700 block">General Inquiries</span>
                  <p className="text-xs font-mono text-stone-500">care@koinoniachildren.org</p>
                  <p className="text-[10px] text-stone-400">Response within 24 operational hours</p>
                </div>
              </div>

              <div className="p-4 bg-stone-50 rounded-xl border border-stone-200/50 flex items-start gap-3">
                <MapPin className="w-4 h-4 text-[#C59B27] shrink-0 mt-1" />
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-stone-700 block">Auditorium Address</span>
                  <p className="text-xs text-stone-500">Koinonia Global Auditorium & Children Pavilion, Abuja, Nigeria.</p>
                </div>
              </div>

              <div className="p-4 bg-stone-50 rounded-xl border border-stone-200/50 flex items-start gap-3">
                <Clock className="w-4 h-4 text-[#C59B27] shrink-0 mt-1" />
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-stone-700 block">Service Schedule</span>
                  <p className="text-xs text-stone-500">Fridays: 4:00 PM - 9:00 PM</p>
                  <p className="text-xs text-stone-500">Sunday Classes: 8:00 AM - 1:00 PM</p>
                </div>
              </div>
            </div>

            <div className="bg-stone-50 p-5 rounded-xl border border-stone-200/60 mt-4 space-y-3">
              <h3 className="text-xs font-semibold text-stone-700 uppercase tracking-wider flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-[#C59B27]" />
                Digital Self-Service Support
              </h3>
              <p className="text-xs text-stone-500 leading-relaxed">
                Need immediate help with a digital pass? Log into your parent account, navigate to the <strong>Passes</strong> tab, and show the unique security barcode at any steward booth. If your scanner won't unlock or you require assistance with backup pickup approvals, please walk over to the Protocol Desk inside the Children Pavilion.
              </p>
            </div>
          </div>
        );
    }
  };

  const getPageTitle = () => {
    switch (page) {
      case 'terms': return 'Terms of Service';
      case 'child-safety': return 'Child Safety Policy';
      case 'contact': return 'Contact Us';
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] font-sans flex flex-col justify-between" data-component-version="legal-page-v1">
      <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-12 md:py-16 flex-grow">
        {/* Navigation back */}
        <button
          onClick={() => onNavigate('/')}
          className="inline-flex items-center gap-2 text-xs font-semibold text-[#18181B] hover:text-[#C59B27] transition-all duration-300 group mb-8 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          Back to Home Page
        </button>

        {/* Content Card */}
        <div className="bg-white border border-[#EAE8E1] rounded-2xl p-6 sm:p-10 shadow-sm space-y-8">
          {renderContent()}
        </div>
      </div>

      {/* Mini Footer */}
      <footer className="bg-white border-t border-[#EAE8E1] py-8 text-center text-xs text-stone-400">
        <p className="max-w-xl mx-auto px-4">
          © {copyright.copyrightYear} {copyright.copyrightText}
        </p>
      </footer>
    </div>
  );
};
