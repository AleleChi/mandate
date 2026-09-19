import React, { useState } from 'react';
import { ChevronDown, HelpCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AppRoute } from '../../types';

export interface LandingFAQProps {
  onNavigate: (route: AppRoute) => void;
  prefersReducedMotion?: boolean;
}

interface FAQItem {
  id: string;
  question: string;
  answer: string;
}

const FAQS: FAQItem[] = [
  {
    id: 'faq-1',
    question: 'How do I register my child for the gathering?',
    answer:
      'Select "Register your child" to create a parent account, enter your child’s basic details, and record care or emergency contact information. Once submitted, the team reviews the details before an event pass is issued.',
  },
  {
    id: 'faq-2',
    question: 'Is there any fee to register?',
    answer:
      'No. Registration for the Children & Teens programme is free. Pre-registration is required so the team can prepare group allocations and hall capacity.',
  },
  {
    id: 'faq-3',
    question: 'How does check-in and pickup work on event day?',
    answer:
      'At arrival, present your child’s digital pass at the entrance desk where attendance is confirmed. At dismissal, team members verify the designated pickup person before releasing the child.',
  },
  {
    id: 'faq-4',
    question: 'Can someone else pick up my child?',
    answer:
      'Yes. You can specify authorized pickup persons in your child’s profile in your parent account before or during the event.',
  },
  {
    id: 'faq-5',
    question: 'How are dietary needs or medical notes communicated?',
    answer:
      'You can add dietary restrictions, allergies, and care instructions directly during registration. Permitted duty volunteers can view these notes during the programme.',
  },
  {
    id: 'faq-6',
    question: 'How do I volunteer with Children & Teens?',
    answer:
      'Select "Volunteer sign in" to sign in to your dashboard or submit a volunteer application. All volunteers undergo review and duty assignment.',
  },
  {
    id: 'faq-7',
    question: 'What happens if registration is closed?',
    answer:
      'When registration closes, new applications are no longer accepted. However, existing registered families can still sign in anytime to view child details and event passes.',
  },
];

export const LandingFAQ: React.FC<LandingFAQProps> = ({
  prefersReducedMotion = false,
}) => {
  const [openId, setOpenId] = useState<string | null>(FAQS[0].id);

  const toggleItem = (id: string) => {
    setOpenId((prev) => (prev === id ? null : id));
  };

  return (
    <section
      id="faq"
      aria-label="Frequently Asked Questions"
      className="py-14 sm:py-20 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto w-full text-left scroll-mt-24"
    >
      <div className="max-w-2xl text-left mb-12 space-y-2">
        <span className="text-[11px] font-bold tracking-widest text-[#9A7326] dark:text-[#D4AF37] uppercase font-sans block">
          FREQUENTLY ASKED QUESTIONS
        </span>
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-sans font-bold text-[#18181B] dark:text-[#F7F4ED] tracking-tight leading-tight">
          Questions &amp; answers
        </h2>
      </div>

      {/* Accordion List */}
      <div className="space-y-3">
        {FAQS.map((faq) => {
          const isOpen = openId === faq.id;
          return (
            <div
              key={faq.id}
              className={`rounded-2xl border transition-all duration-200 bg-white dark:bg-[#1E1D1A] overflow-hidden ${
                isOpen
                  ? 'border-[#C59B27]/70 shadow-xs'
                  : 'border-[#EAE8E1] dark:border-[#2E2D29] hover:border-[#D9D6CE] dark:hover:border-[#3D3B36]'
              }`}
            >
              <h3>
                <button
                  type="button"
                  id={`faq-btn-${faq.id}`}
                  aria-expanded={isOpen}
                  aria-controls={`faq-content-${faq.id}`}
                  onClick={() => toggleItem(faq.id)}
                  className="w-full py-4.5 px-5 sm:px-6 text-left flex items-center justify-between gap-4 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C59B27]"
                >
                  <span className="text-base sm:text-lg font-semibold text-[#18181B] dark:text-[#F7F4ED] font-sans">
                    {faq.question}
                  </span>
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-transform duration-300 ${
                      isOpen
                        ? 'bg-[#FAF6EB] dark:bg-[#2A2926] text-[#C59B27] rotate-180'
                        : 'bg-stone-100 dark:bg-[#2A2926] text-stone-500 dark:text-[#A19D95]'
                    }`}
                  >
                    <ChevronDown className="w-4 h-4" />
                  </div>
                </button>
              </h3>

              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    id={`faq-content-${faq.id}`}
                    role="region"
                    aria-labelledby={`faq-btn-${faq.id}`}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{
                      duration: prefersReducedMotion ? 0 : 0.25,
                      ease: [0.16, 1, 0.3, 1] as const,
                    }}
                    className="overflow-hidden"
                  >
                    <div className="px-5 sm:px-6 pb-5 pt-1 text-xs sm:text-sm text-[#52525B] dark:text-[#C8C2B6] leading-relaxed border-t border-[#FAF9F6] dark:border-[#2A2926]">
                      {faq.answer}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </section>
  );
};
