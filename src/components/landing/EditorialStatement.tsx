import React from 'react';

export const EditorialStatement: React.FC = () => {
  return (
    <section
      className="py-14 sm:py-20 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto w-full text-center"
      aria-label="Event Introduction"
    >
      <div className="space-y-6 sm:space-y-8">
        {/* Simple, Non-Theatrical Eyebrow */}
        <span className="text-[11px] font-bold tracking-widest text-[#9A7326] uppercase font-sans block">
          CHILDREN &amp; TEENS EXPERIENCE
        </span>

        {/* Clean, Factual Headline */}
        <h2 className="text-2xl sm:text-4xl lg:text-5xl font-serif-koinonia font-bold text-[#18181B] tracking-tight leading-[1.2]">
          A safe, well-organised experience for every child.
        </h2>

        {/* Short, Natural Paragraph */}
        <p className="text-base sm:text-lg text-[#52525B] leading-relaxed max-w-2xl mx-auto font-normal">
          From registration to pickup, the Children &amp; Teens team keeps the information needed for each child in one place, so check-in, care, and pickup can be handled clearly on event day.
        </p>

        {/* One Strong Factual Visual Moment (No generic card grid) */}
        <div className="pt-6 border-t border-[#EAE8E1]/80 max-w-xl mx-auto">
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-semibold text-[#71717A] tracking-wider uppercase">
            <span>Pre-Event Registration</span>
            <span className="text-[#C59B27]">&bull;</span>
            <span>Verified Check-in</span>
            <span className="text-[#C59B27]">&bull;</span>
            <span>Controlled Pickup</span>
          </div>
        </div>
      </div>
    </section>
  );
};
