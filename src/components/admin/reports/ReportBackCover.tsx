import React from 'react';
import { ReportDocumentModel } from '../../../server/reports/reportDocumentModel';

interface ReportBackCoverProps {
  model: ReportDocumentModel;
}

export const ReportBackCover: React.FC<ReportBackCoverProps> = ({ model }) => {
  const event = model.eventContext;

  return (
    <div className="w-full min-h-[500px] p-12 sm:p-20 bg-[#FAF9F5] text-stone-900 border border-stone-200/90 rounded-xl flex flex-col justify-between items-center text-center space-y-12 print:shadow-none print:rounded-none">
      <div className="w-12 h-0.5 bg-[#C59B27] mx-auto"></div>

      <div className="space-y-4 max-w-md">
        <span className="text-xs font-sans font-semibold tracking-[0.25em] uppercase text-stone-500 block">
          KOINONIA CHILDREN &amp; TEENS
        </span>
        <h4 className="text-2xl sm:text-3xl font-serif font-medium text-stone-900">
          {event.eventTitle || 'The General Assembly'}
        </h4>
        <div className="pt-4 space-y-1">
          <p className="font-serif italic text-lg sm:text-xl text-[#8C6D23]">
            "Children are precious. Care is intentional."
          </p>
        </div>
      </div>

      <div className="pt-8 border-t border-stone-200 w-full max-w-xs space-y-2 text-[11px] font-sans text-stone-500">
        <p className="font-medium text-stone-700">Official Ministry Archive</p>
        <p>This publication constitutes the official event record for administrative and pastoral review.</p>
      </div>
    </div>
  );
};
