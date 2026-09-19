import React, { useState, useEffect } from 'react';
import { Seo } from '../components/common/Seo';
import { PublicPolicyLayout, PolicyTocItem } from '../components/legal/PublicPolicyLayout';
import { OFFICIAL_PUBLIC_CONTACT_EMAIL } from '../constants/contact';

interface TermsOfServiceViewProps {
  onNavigate: (route: string) => void;
}

const TOC_ITEMS: PolicyTocItem[] = [
  { id: 'toc-1', number: '1', title: 'Verification & profile compliance', targetId: 'section-1' },
  { id: 'toc-2', number: '2', title: 'Exclusive guardian pickup release', targetId: 'section-2' },
  { id: 'toc-3', number: '3', title: 'Medical declarations & first aid', targetId: 'section-3' },
  { id: 'toc-4', number: '4', title: 'Arrival schedules & conduct', targetId: 'section-4' },
  { id: 'toc-5', number: '5', title: 'Digital event passes & account security', targetId: 'section-5' },
  { id: 'toc-6', number: '6', title: 'Contact & inquiries', targetId: 'section-6' },
];

export const TermsOfServiceView: React.FC<TermsOfServiceViewProps> = ({ onNavigate }) => {

  return (
    <PublicPolicyLayout
      title="Terms of Service"
      subtitle="The operational terms and responsibilities that apply when registering and participating in the Children & Teens event portal."
      lastUpdated="September 05, 2026"
      tocItems={TOC_ITEMS}
      onNavigate={onNavigate}
    >
      <Seo
        title="Terms of Service | Koinonia Children and Teens"
        description="Terms of Service governing registration, attendance, and child safety for The Koinonia General Assembly."
        canonical="https://koinonia12.netlify.app/#/terms"
        robots="index, follow"
        ogTitle="Terms of Service | Koinonia Children and Teens"
        ogDescription="Operational protocols for child registration, exclusive pickup release, and care safety."
      />

      {/* Opening Statement */}
      <div className="space-y-5 text-base sm:text-[17px] text-stone-700 leading-[1.75]">
        <p>
          These Parent Terms govern the registration, attendance, and participation of children and teens in all <strong className="font-semibold text-stone-900">The Koinonia General Assembly</strong> events, services, and associated ministry programmes, whether accessed online through our event portal or in person at designated event halls.
        </p>

        <p>
          By creating an account, submitting a child registration, or presenting a digital pass at check-in, you confirm that you are the parent or lawful legal guardian of the registered child and agree to abide by these operational safety protocols.
        </p>

        <p>
          <strong className="font-semibold text-stone-900">Our safeguarding foundation:</strong> These terms exist solely to safeguard every child placed in our care and ensure an orderly, transparent, and secure environment during gathering sessions.
        </p>
      </div>

      {/* SECTION 1 */}
      <article id="section-1" className="scroll-mt-24 pt-10 border-t border-[#EAE8E1] space-y-5 text-left">
        <h2 className="text-xl sm:text-2xl font-serif-koinonia font-normal text-stone-900 tracking-tight leading-snug">
          1. VERIFICATION &amp; PROFILE COMPLIANCE
        </h2>

        <p className="text-stone-500 italic text-sm sm:text-[15px] leading-relaxed">
          In Short: Parents must maintain complete, verified profiles with accurate contact and age information before submitting registrations.
        </p>

        <div className="space-y-4 text-base sm:text-[17px] text-stone-700 leading-[1.75]">
          <p>
            To ensure the integrity of the safeguarding perimeter, parents and legal guardians must complete their own verified parent profile prior to registering children for the event.
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong className="font-semibold text-stone-900">Profile accuracy:</strong> You agree to provide a clear, identifiable parent headshot photo and valid telephone contact numbers.
            </li>
            <li>
              <strong className="font-semibold text-stone-900">Child details:</strong> All information submitted regarding the child&apos;s legal name, date of birth, age cohort, and active emergency contacts must be accurate, true, and current.
            </li>
            <li>
              <strong className="font-semibold text-stone-900">Cohort placement:</strong> Children are placed into designated age groups based strictly on verified age to ensure age-appropriate teaching, supervision ratios, and hall capacity limits.
            </li>
          </ul>
        </div>
      </article>

      {/* SECTION 2 */}
      <article id="section-2" className="scroll-mt-24 pt-10 border-t border-[#EAE8E1] space-y-5 text-left">
        <h2 className="text-xl sm:text-2xl font-serif-koinonia font-normal text-stone-900 tracking-tight leading-snug">
          2. EXCLUSIVE GUARDIAN PICKUP RELEASE
        </h2>

        <p className="text-stone-500 italic text-sm sm:text-[15px] leading-relaxed">
          In Short: Children are released only to the registered parent or pre-authorized secondary backup pickup person through live photo-terminal verification.
        </p>

        <div className="space-y-4 text-base sm:text-[17px] text-stone-700 leading-[1.75]">
          <p>
            Children will be released strictly to the specific parent or designated secondary backup pickup person registered on the child&apos;s active digital pass record.
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong className="font-semibold text-stone-900">Terminal match:</strong> Stewards and security coordinators verify physical identity against the system photo record at the pickup checkout counter before any child is released.
            </li>
            <li>
              <strong className="font-semibold text-stone-900">No informal overrides:</strong> Verbal claims, phone calls, text messages, or third-party paper claims will not bypass this security barrier under any circumstances.
            </li>
            <li>
              <strong className="font-semibold text-stone-900">Designated backup:</strong> If someone other than the primary registering parent is picking up the child, their identity details and photograph must be registered in the portal prior to checkout.
            </li>
          </ul>
        </div>
      </article>

      {/* SECTION 3 */}
      <article id="section-3" className="scroll-mt-24 pt-10 border-t border-[#EAE8E1] space-y-5 text-left">
        <h2 className="text-xl sm:text-2xl font-serif-koinonia font-normal text-stone-900 tracking-tight leading-snug">
          3. MEDICAL DECLARATIONS &amp; FIRST AID
        </h2>

        <p className="text-stone-500 italic text-sm sm:text-[15px] leading-relaxed">
          In Short: Parents must declare medical conditions, allergies, and critical needs so our on-site team can provide prompt, safe assistance.
        </p>

        <div className="space-y-4 text-base sm:text-[17px] text-stone-700 leading-[1.75]">
          <p>
            Parents are required to declare any critical medical histories, asthma or respiratory needs, food or environmental allergies, and special physical requirements during registration.
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong className="font-semibold text-stone-900">Emergency reference:</strong> In the event of a health alert or medical urgency, on-site first aid workers reference these declarations to administer appropriate care safely and immediately.
            </li>
            <li>
              <strong className="font-semibold text-stone-900">Parent notification:</strong> In any situation requiring medical attention or specialized escalation, our system initiates automated communications to reach parents via phone, SMS, or WhatsApp immediately.
            </li>
          </ul>
        </div>
      </article>

      {/* SECTION 4 */}
      <article id="section-4" className="scroll-mt-24 pt-10 border-t border-[#EAE8E1] space-y-5 text-left">
        <h2 className="text-xl sm:text-2xl font-serif-koinonia font-normal text-stone-900 tracking-tight leading-snug">
          4. ARRIVAL SCHEDULES &amp; CONDUCT
        </h2>

        <p className="text-stone-500 italic text-sm sm:text-[15px] leading-relaxed">
          In Short: Please respect scheduled arrival and pickup windows. For the safety of other children, children showing contagious symptoms cannot be admitted.
        </p>

        <div className="space-y-4 text-base sm:text-[17px] text-stone-700 leading-[1.75]">
          <p>
            To maintain orderly flow and proper supervisor-to-child ratios throughout each session:
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong className="font-semibold text-stone-900">Drop-off &amp; pickup windows:</strong> Parents must adhere to designated session schedules. Prompt pickup at the conclusion of main services is essential for worker handover and hall sanitation.
            </li>
            <li>
              <strong className="font-semibold text-stone-900">Health &amp; wellness:</strong> Any child exhibiting signs of acute contagious illness (e.g. fever, active vomiting, infectious rashes) should remain in the parent&apos;s personal care and will not be checked into communal halls to prevent cross-contamination.
            </li>
            <li>
              <strong className="font-semibold text-stone-900">Respectful conduct:</strong> Parents and volunteers are expected to cooperate courteously with stewards and protocol officers performing check-in security duties.
            </li>
          </ul>
        </div>
      </article>

      {/* SECTION 5 */}
      <article id="section-5" className="scroll-mt-24 pt-10 border-t border-[#EAE8E1] space-y-5 text-left">
        <h2 className="text-xl sm:text-2xl font-serif-koinonia font-normal text-stone-900 tracking-tight leading-snug">
          5. DIGITAL EVENT PASSES &amp; ACCOUNT SECURITY
        </h2>

        <p className="text-stone-500 italic text-sm sm:text-[15px] leading-relaxed">
          In Short: Event passes contain sensitive child security data. Protect your account credentials and do not share QR passes publicly.
        </p>

        <div className="space-y-4 text-base sm:text-[17px] text-stone-700 leading-[1.75]">
          <p>
            Upon successful registration and verification, a digital event pass with an encrypted QR code is issued for each child.
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong className="font-semibold text-stone-900">Pass confidentiality:</strong> Event passes should be kept private. Do not publish pass barcodes or QR codes on public social media.
            </li>
            <li>
              <strong className="font-semibold text-stone-900">Account credentials:</strong> Parents are responsible for safeguarding their login credentials and ensuring unauthorized individuals do not access pass management controls.
            </li>
            <li>
              <strong className="font-semibold text-stone-900">Pass reissuance:</strong> If you lose access to your device or suspect pass compromise, report immediately to the Protocol Desk inside the Children Pavilion for immediate pass invalidation and re-issue.
            </li>
          </ul>
        </div>
      </article>

      {/* SECTION 6 */}
      <article id="section-6" className="scroll-mt-24 pt-10 border-t border-[#EAE8E1] space-y-5 text-left">
        <h2 className="text-xl sm:text-2xl font-serif-koinonia font-normal text-stone-900 tracking-tight leading-snug">
          6. CONTACT &amp; INQUIRIES
        </h2>

        <div className="space-y-4 text-base sm:text-[17px] text-stone-700 leading-[1.75]">
          <p>
            If you have any questions regarding these Terms of Service, operational protocols, or child registration requirements, please contact our team:
          </p>

          <div className="pt-2 space-y-1.5 text-stone-700">
            <p className="font-semibold text-stone-900">
              The Koinonia General Assembly
            </p>
            <p>
              Email:{' '}
              <a href={`mailto:${OFFICIAL_PUBLIC_CONTACT_EMAIL}`} className="text-stone-900 underline underline-offset-4 hover:text-[#9A7326] transition-colors">
                {OFFICIAL_PUBLIC_CONTACT_EMAIL}
              </a>
            </p>
          </div>
        </div>
      </article>
    </PublicPolicyLayout>
  );
};

export default TermsOfServiceView;
