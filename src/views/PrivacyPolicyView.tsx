import React, { useState, useEffect } from 'react';
import { Seo } from '../components/common/Seo';
import { PublicPolicyLayout, PolicyTocItem } from '../components/legal/PublicPolicyLayout';
import { OFFICIAL_PUBLIC_CONTACT_EMAIL } from '../constants/contact';

interface PrivacyPolicyViewProps {
  onNavigate: (route: string) => void;
}

const TOC_ITEMS: PolicyTocItem[] = [
  { id: 'toc-1', number: '1', title: 'What information do we collect?', targetId: 'section-1' },
  { id: 'toc-2', number: '2', title: 'How do we process your information?', targetId: 'section-2' },
  { id: 'toc-3', number: '3', title: 'When and with whom do we share personal information?', targetId: 'section-3' },
  { id: 'toc-4', number: '4', title: 'Do we use cookies and other tracking technologies?', targetId: 'section-4' },
  { id: 'toc-5', number: '5', title: 'How long do we keep your information?', targetId: 'section-5' },
  { id: 'toc-6', number: '6', title: 'How do we keep your information safe?', targetId: 'section-6' },
  { id: 'toc-7', number: '7', title: "Our approach to children's personal information", targetId: 'section-7' },
  { id: 'toc-8', number: '8', title: 'What are your privacy rights?', targetId: 'section-8' },
  { id: 'toc-9', number: '9', title: 'Controls for do-not-track features', targetId: 'section-9' },
  { id: 'toc-10', number: '10', title: 'Do we make updates to this notice?', targetId: 'section-10' },
  { id: 'toc-11', number: '11', title: 'How can you contact us about this notice?', targetId: 'section-11' },
];

export const PrivacyPolicyView: React.FC<PrivacyPolicyViewProps> = ({ onNavigate }) => {

  return (
    <PublicPolicyLayout
      title="Privacy Notice"
      subtitle="How information provided through the Children & Teens event portal is accessed, collected, stored, and processed."
      lastUpdated="September 05, 2026"
      tocItems={TOC_ITEMS}
      onNavigate={onNavigate}
    >
      <Seo
        title="Privacy Notice | Koinonia Children and Teens"
        description="Privacy Notice for The Koinonia General Assembly Children & Teens services and events."
        canonical="https://koinonia12.netlify.app/#/privacy"
        robots="index, follow"
        ogTitle="Privacy Notice | Koinonia Children and Teens"
        ogDescription="How we access, collect, store, and process personal information for Children's Session."
      />

      {/* Opening statement */}
      <div className="space-y-5 text-base sm:text-[17px] text-stone-700 leading-[1.75]">
        <p>
          This Privacy Notice for <strong className="font-semibold text-stone-900">The Koinonia General Assembly</strong> (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) describes how and why we may access, collect, store, use, and/or share (&quot;process&quot;) your and your child&apos;s personal information when you use our services, including when you:
        </p>

        <ul className="list-disc pl-5 space-y-2 text-stone-700">
          <li>
            Register a child for, or otherwise engage with, our children&apos;s ministry programme, in person or through our web application (<a href="https://koinonia12.netlify.app/#/" target="_blank" rel="noopener noreferrer" className="text-stone-900 underline underline-offset-4 hover:text-[#9A7326] transition-colors">https://koinonia12.netlify.app/#/</a>)
          </li>
          <li>
            Engage with us in other related ways, including communications about the children&apos;s programme
          </li>
        </ul>

        <p>
          <strong className="font-semibold text-stone-900">Questions or concerns?</strong> Reading this Privacy Notice will help you understand your privacy rights and choices as a parent or guardian. If you do not agree with our policies and practices, please do not use our Services. If you still have questions, contact us at <a href={`mailto:${OFFICIAL_PUBLIC_CONTACT_EMAIL}`} className="text-stone-900 font-medium underline underline-offset-4 hover:text-[#9A7326] transition-colors">{OFFICIAL_PUBLIC_CONTACT_EMAIL}</a>.
        </p>

        <p>
          <strong className="font-semibold text-stone-900">A note on this Notice:</strong> Because our Services exist specifically to run a children&apos;s programme, the personal information we process is mostly about children under 13, always provided to us by a parent or legal guardian. Section 7 explains this directly; we do not say we &quot;don&apos;t knowingly collect data from children,&quot; because doing so, with proper parental consent, is the entire purpose of Children&apos;s Session.
        </p>
      </div>

      {/* SECTION 1 */}
      <article id="section-1" className="scroll-mt-24 pt-10 border-t border-[#EAE8E1] space-y-5 text-left">
        <h2 className="text-xl sm:text-2xl font-serif-koinonia font-normal text-stone-900 tracking-tight leading-snug">
          1. WHAT INFORMATION DO WE COLLECT?
        </h2>

        <p className="text-stone-500 italic text-sm sm:text-[15px] leading-relaxed">
          In Short: We collect the personal information that a parent or guardian provides when registering a child for Children&apos;s Session, and basic information if you use our web application.
        </p>

        <div className="space-y-5 text-base sm:text-[17px] text-stone-700 leading-[1.75]">
          <div>
            <h3 className="font-semibold text-stone-900 pb-2 text-base">
              Personal information provided by a parent/guardian, about your child:
            </h3>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Full name</li>
              <li>Date of birth or age</li>
              <li>Emergency contact name and phone number</li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-stone-900 pb-2 text-base">
              Personal information provided by you, the parent/guardian:
            </h3>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Name</li>
              <li>Phone number</li>
              <li>Email address</li>
              <li>Home address (only if you choose to provide it, e.g. in case we need to contact you for emergency reasons)</li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-stone-900 pb-2 text-base">
              Sensitive information. <span className="font-normal text-stone-700">With your explicit consent, we process:</span>
            </h3>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Health data — allergies, medical conditions, and medications your child may need us to be aware of, so we can keep them safe during the programme.</li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-stone-900 pb-2 text-base">
              Application data. <span className="font-normal text-stone-700">If you use our web application at <a href="https://koinonia12.netlify.app/#/" target="_blank" rel="noopener noreferrer" className="text-stone-900 underline underline-offset-4 hover:text-[#9A7326] transition-colors">https://koinonia12.netlify.app/#/</a>, we may also collect:</span>
            </h3>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Login/account information, if you create an account</li>
              <li>Basic technical data (e.g., device or browser type, IP address) for security, troubleshooting, and keeping the application working properly</li>
              <li>Push notifications, if enabled, about registration confirmations or programme updates. You can turn these off in your device&apos;s settings at any time.</li>
            </ul>
          </div>

          <div className="space-y-4 pt-1">
            <p>
              <strong className="font-semibold text-stone-900">Photographs and videos:</strong> With your separate, specific consent, we may photograph or record your child during Children&apos;s Session activities, either (a) for internal safety and attendance records, or (b) for sharing on our ministry&apos;s social media or promotional materials. You may consent to (a) without consenting to (b).
            </p>
            <p>
              We do not collect any information about you or your child from third parties. All information you provide must be accurate, and you must tell us if anything changes (for example, a new emergency contact number).
            </p>
          </div>
        </div>
      </article>

      {/* SECTION 2 */}
      <article id="section-2" className="scroll-mt-24 pt-10 border-t border-[#EAE8E1] space-y-5 text-left">
        <h2 className="text-xl sm:text-2xl font-serif-koinonia font-normal text-stone-900 tracking-tight leading-snug">
          2. HOW DO WE PROCESS YOUR INFORMATION?
        </h2>

        <p className="text-stone-500 italic text-sm sm:text-[15px] leading-relaxed">
          In Short: We process your information to register and run Children&apos;s Session safely, to communicate with you, to respond to emergencies, and to comply with the law.
        </p>

        <div className="space-y-4 text-base sm:text-[17px] text-stone-700 leading-[1.75]">
          <p>We process personal information to:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li>Register your child and manage attendance for Children&apos;s Session, including through our web application;</li>
            <li>Ensure appropriate supervision and respond to your child&apos;s medical needs or an emergency during the programme;</li>
            <li>Communicate with you about registration, schedule changes, and (only if you have separately opted in) future Koinonia General Assembly children&apos;s programmes;</li>
            <li>Maintain the security and proper functioning of our web application, including troubleshooting and preventing misuse;</li>
            <li>Comply with our legal obligations, including under the Nigeria Data Protection Act, 2023 and the Child&apos;s Rights Act, 2003.</li>
          </ul>
          <p className="pt-2">
            We do not use your child&apos;s information for advertising, profiling, or automated decision-making.
          </p>
        </div>
      </article>

      {/* SECTION 3 */}
      <article id="section-3" className="scroll-mt-24 pt-10 border-t border-[#EAE8E1] space-y-5 text-left">
        <h2 className="text-xl sm:text-2xl font-serif-koinonia font-normal text-stone-900 tracking-tight leading-snug">
          3. WHEN AND WITH WHOM DO WE SHARE PERSONAL INFORMATION?
        </h2>

        <p className="text-stone-500 italic text-sm sm:text-[15px] leading-relaxed">
          In Short: Only with those who need it to keep your child safe, or where the law requires it. We do not sell your information.
        </p>

        <div className="space-y-4 text-base sm:text-[17px] text-stone-700 leading-[1.75]">
          <p>We may share personal information:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li>With our vetted children&apos;s ministry volunteers and workers, strictly on a need-to-know basis;</li>
            <li>With emergency or medical services, if needed during the programme;</li>
            <li>With government authorities such as the Nigeria Data Protection Commission (NDPC), the Nigeria Police Force, or NAPTIP, where required or permitted by law;</li>
            <li>With service providers who help us run our web application (e.g., hosting), under confidentiality obligations.</li>
          </ul>
          <p className="pt-2">
            We do not sell or rent your or your child&apos;s personal information, and we do not share it with third parties for their own marketing or advertising purposes.
          </p>
        </div>
      </article>

      {/* SECTION 4 */}
      <article id="section-4" className="scroll-mt-24 pt-10 border-t border-[#EAE8E1] space-y-5 text-left">
        <h2 className="text-xl sm:text-2xl font-serif-koinonia font-normal text-stone-900 tracking-tight leading-snug">
          4. DO WE USE COOKIES AND OTHER TRACKING TECHNOLOGIES?
        </h2>

        <p className="text-stone-500 italic text-sm sm:text-[15px] leading-relaxed">
          In Short: Our web application may use minimal cookies necessary for it to function. We do not currently use cookies or trackers for advertising.
        </p>

        <div className="space-y-4 text-base sm:text-[17px] text-stone-700 leading-[1.75]">
          <p>
            We may use limited cookies or similar technologies (e.g., to keep you logged in, remember your preferences, or keep the application secure). We do not currently permit third parties to use our Services for advertising or ad-tracking purposes.
          </p>
        </div>
      </article>

      {/* SECTION 5 */}
      <article id="section-5" className="scroll-mt-24 pt-10 border-t border-[#EAE8E1] space-y-5 text-left">
        <h2 className="text-xl sm:text-2xl font-serif-koinonia font-normal text-stone-900 tracking-tight leading-snug">
          5. HOW LONG DO WE KEEP YOUR INFORMATION?
        </h2>

        <p className="text-stone-500 italic text-sm sm:text-[15px] leading-relaxed">
          In Short: Only for as long as necessary for the programme, or as the law requires, then we delete or anonymise it.
        </p>

        <div className="space-y-4 text-base sm:text-[17px] text-stone-700 leading-[1.75]">
          <ul className="list-disc pl-5 space-y-3">
            <li>
              <strong className="font-semibold text-stone-900">Registration and health information:</strong> retained for the duration of the relevant Children&apos;s Session programme, and until the next assembly season in case of a follow-up safety concern, then securely deleted, unless you have separately opted in to further contact.
            </li>
            <li>
              <strong className="font-semibold text-stone-900">Any safeguarding or incident reports:</strong> retained for a longer period on legal advice, given their potential importance to a child&apos;s ongoing welfare.
            </li>
            <li>
              <strong className="font-semibold text-stone-900">Application account data (if applicable):</strong> retained while your account is active, and deleted on your request.
            </li>
          </ul>
        </div>
      </article>

      {/* SECTION 6 */}
      <article id="section-6" className="scroll-mt-24 pt-10 border-t border-[#EAE8E1] space-y-5 text-left">
        <h2 className="text-xl sm:text-2xl font-serif-koinonia font-normal text-stone-900 tracking-tight leading-snug">
          6. HOW DO WE KEEP YOUR INFORMATION SAFE?
        </h2>

        <p className="text-stone-500 italic text-sm sm:text-[15px] leading-relaxed">
          In Short: We use reasonable organisational and technical measures to protect personal information.
        </p>

        <div className="space-y-4 text-base sm:text-[17px] text-stone-700 leading-[1.75]">
          <p>
            We restrict access to registration and health forms to those who need them to run the programme safely, and apply reasonable technical safeguards to our web application. However, no method of electronic storage or transmission is 100% secure, so we cannot guarantee absolute security. Given that this information often concerns children, we treat its protection as a priority, not an afterthought.
          </p>
        </div>
      </article>

      {/* SECTION 7 */}
      <article id="section-7" className="scroll-mt-24 pt-10 border-t border-[#EAE8E1] space-y-5 text-left">
        <h2 className="text-xl sm:text-2xl font-serif-koinonia font-normal text-stone-900 tracking-tight leading-snug">
          7. OUR APPROACH TO CHILDREN&apos;S PERSONAL INFORMATION
        </h2>

        <p className="text-stone-500 italic text-sm sm:text-[15px] leading-relaxed">
          In Short: Children&apos;s Session is built specifically to serve children under 18, so, unlike a typical online service, we <em>do</em> knowingly collect children&apos;s personal information, always through and with the verified consent of a parent or legal guardian.
        </p>

        <div className="space-y-4 text-base sm:text-[17px] text-stone-700 leading-[1.75]">
          <ul className="list-disc pl-5 space-y-3">
            <li>
              All information about a child is provided, and consented to, by that child&apos;s parent or legal guardian — never by the child alone — in line with the Nigeria Data Protection Act 2023 (which treats minors as unable to give their own consent to data processing) and the Child&apos;s Rights Act 2003.
            </li>
            <li>
              We only use a child&apos;s information for the purposes stated in this Notice: safely running Children&apos;s Session. We never use it to advertise to children or profile them.
            </li>
            <li>
              A parent/guardian may withdraw consent, or ask us to delete their child&apos;s information, at any time, by contacting us using the details in Section 11. Please note that withdrawing certain information (e.g., emergency or health details) may mean we cannot safely admit the child to future sessions.
            </li>
            <li>
              If you believe we hold information about a child that was not provided with proper parental or guardian consent, please contact us immediately at <a href={`mailto:${OFFICIAL_PUBLIC_CONTACT_EMAIL}`} className="text-stone-900 font-medium underline underline-offset-4 hover:text-[#9A7326] transition-colors">{OFFICIAL_PUBLIC_CONTACT_EMAIL}</a> and we will investigate and delete it as appropriate.
            </li>
          </ul>
        </div>
      </article>

      {/* SECTION 8 */}
      <article id="section-8" className="scroll-mt-24 pt-10 border-t border-[#EAE8E1] space-y-5 text-left">
        <h2 className="text-xl sm:text-2xl font-serif-koinonia font-normal text-stone-900 tracking-tight leading-snug">
          8. WHAT ARE YOUR PRIVACY RIGHTS?
        </h2>

        <p className="text-stone-500 italic text-sm sm:text-[15px] leading-relaxed">
          In Short: As a parent or guardian, you may review, correct, or delete your child&apos;s information, and withdraw your consent, at any time.
        </p>

        <div className="space-y-4 text-base sm:text-[17px] text-stone-700 leading-[1.75]">
          <ul className="list-disc pl-5 space-y-3">
            <li>
              <strong className="font-semibold text-stone-900">Withdrawing consent:</strong> Where we rely on your consent, you may withdraw it at any time by contacting us (Section 11). This does not affect the lawfulness of processing carried out before withdrawal.
            </li>
            <li>
              <strong className="font-semibold text-stone-900">Access, correction, deletion:</strong> You may ask to see what information we hold about your child, ask us to correct it, or ask us to delete it, subject to any legal or safety record-keeping requirement.
            </li>
            <li>
              <strong className="font-semibold text-stone-900">Account information:</strong> If you have an account on our web application, you may review or update it directly, or ask us to close it.
            </li>
            <li>
              <strong className="font-semibold text-stone-900">Complaints:</strong> If you believe your rights have been infringed, you may contact us first, or lodge a complaint with the Nigeria Data Protection Commission (NDPC).
            </li>
          </ul>

          <p className="pt-2">
            To exercise any of these rights, email us at <a href={`mailto:${OFFICIAL_PUBLIC_CONTACT_EMAIL}`} className="text-stone-900 font-medium underline underline-offset-4 hover:text-[#9A7326] transition-colors">{OFFICIAL_PUBLIC_CONTACT_EMAIL}</a>.
          </p>
        </div>
      </article>

      {/* SECTION 9 */}
      <article id="section-9" className="scroll-mt-24 pt-10 border-t border-[#EAE8E1] space-y-5 text-left">
        <h2 className="text-xl sm:text-2xl font-serif-koinonia font-normal text-stone-900 tracking-tight leading-snug">
          9. CONTROLS FOR DO-NOT-TRACK FEATURES
        </h2>

        <div className="space-y-4 text-base sm:text-[17px] text-stone-700 leading-[1.75]">
          <p>
            Most web browsers include a &quot;Do-Not-Track&quot; (DNT) signal. As no uniform technical standard for recognising DNT signals currently exists, we do not respond to DNT signals at this time. If a recognised standard is adopted, we will update this Notice accordingly.
          </p>
        </div>
      </article>

      {/* SECTION 10 */}
      <article id="section-10" className="scroll-mt-24 pt-10 border-t border-[#EAE8E1] space-y-5 text-left">
        <h2 className="text-xl sm:text-2xl font-serif-koinonia font-normal text-stone-900 tracking-tight leading-snug">
          10. DO WE MAKE UPDATES TO THIS NOTICE?
        </h2>

        <div className="space-y-4 text-base sm:text-[17px] text-stone-700 leading-[1.75]">
          <h3 className="text-base font-semibold text-stone-900">
            Yes, we will update this Notice as needed, and note the &quot;Last updated&quot; date above when we do.
          </h3>
          <p>
            If we make a material change to how we handle your child&apos;s information, we will notify parents/guardians directly (e.g., by email or at registration), not only by updating this page.
          </p>
        </div>
      </article>

      {/* SECTION 11 */}
      <article id="section-11" className="scroll-mt-24 pt-10 border-t border-[#EAE8E1] space-y-5 text-left">
        <h2 className="text-xl sm:text-2xl font-serif-koinonia font-normal text-stone-900 tracking-tight leading-snug">
          11. HOW CAN YOU CONTACT US ABOUT THIS NOTICE?
        </h2>

        <div className="space-y-4 text-base sm:text-[17px] text-stone-700 leading-[1.75]">
          <p>
            If you have questions or comments about this Notice, contact us at:
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

export default PrivacyPolicyView;
