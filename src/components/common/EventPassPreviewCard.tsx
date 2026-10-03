import React, { useState } from 'react';
import { QrCode, Calendar } from 'lucide-react';
import { StatusType } from './StatusBadge';

export interface EventPassPreviewCardProps {
  childName: string;
  ageGroup: string;
  status?: StatusType;
  photoUrl?: string;
  eventTitle?: string;
  eventDate?: string;
  passReference?: string;
}

export const EventPassPreviewCard: React.FC<EventPassPreviewCardProps> = ({
  childName,
  ageGroup,
  photoUrl,
  eventTitle = 'The General Assembly',
  eventDate = '18th to 22nd November 2026',
  passReference
}) => {
  const [imgError, setImgError] = useState(false);

  const getInitials = (name: string) => {
    if (!name || !name.trim()) return 'DO';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const formattedSection = ageGroup.toLowerCase().includes('section')
    ? ageGroup
    : `${ageGroup} Section`;

  return (
    <div className="w-full bg-[#FAF8F5] text-zinc-900 rounded-xl p-4 border border-[#E5D5AE] shadow-none relative select-none keep-ivory">
      {/* Top pass identification bar */}
      <div className="flex items-center justify-between border-b border-[#EAE8E1] pb-2.5 mb-3">
        <div className="flex items-center space-x-1.5 min-w-0 pr-2">
          <span className="text-[10.5px] font-semibold uppercase tracking-wider text-[#8C6D23] shrink-0">
            Event Pass
          </span>
          {passReference && (
            <>
              <span className="text-zinc-300 text-xs shrink-0">•</span>
              <span className="text-[11px] text-zinc-400 font-normal truncate">
                {passReference}
              </span>
            </>
          )}
        </div>
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10.5px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60 shrink-0">
          Pass ready
        </span>
      </div>

      {/* Child identity info */}
      <div className="flex items-center space-x-3.5">
        <div className="w-12 h-12 rounded-xl overflow-hidden border border-[#E5D5AE] shrink-0 bg-[#FAF6EB] flex items-center justify-center font-serif-koinonia text-base font-bold text-[#8C6D23]">
          {photoUrl && photoUrl.trim() !== '' && !imgError ? (
            <img
              src={photoUrl}
              alt=""
              className="w-full h-full object-cover"
              onError={() => setImgError(true)}
              loading="lazy"
            />
          ) : (
            <span>{getInitials(childName)}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-zinc-900 tracking-tight truncate">
            {childName}
          </h4>
          <p className="text-xs text-zinc-500 mt-0.5 truncate">
            {formattedSection}
          </p>
        </div>
      </div>

      {/* Footer: Event schedule and QR reference */}
      <div className="mt-3.5 pt-3 border-t border-[#EAE8E1] flex items-center justify-between">
        <div className="text-xs text-zinc-600 flex flex-col min-w-0 pr-2">
          <span className="font-semibold text-zinc-800 truncate">{eventTitle}</span>
          <span className="text-[11px] text-zinc-500 flex items-center mt-0.5 truncate">
            <Calendar className="w-3 h-3 mr-1.5 inline shrink-0 text-zinc-400" /> {eventDate}
          </span>
        </div>
        <div className="shrink-0">
          <div className="bg-white border border-[#EAE8E1] p-1 rounded-lg w-10 h-10 flex items-center justify-center overflow-hidden">
            {passReference ? (
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(passReference)}`}
                alt="QR Code"
                className="w-full h-full object-cover"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            ) : (
              <QrCode className="w-6 h-6 text-zinc-700" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
