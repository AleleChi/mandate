import React, { useState } from 'react';
import { QrCode, ShieldCheck, Calendar } from 'lucide-react';
import { StatusBadge, StatusType } from './StatusBadge';

interface EventPassPreviewCardProps {
  childName: string;
  ageGroup: string;
  status: StatusType;
  photoUrl: string;
  eventTitle?: string;
  eventDate?: string;
}

export const EventPassPreviewCard: React.FC<EventPassPreviewCardProps> = ({
  childName,
  ageGroup,
  status,
  photoUrl,
  eventTitle = 'The General Assembly',
  eventDate = '18th to 22nd November 2026'
}) => {
  const [imgError, setImgError] = useState(false);

  const getInitials = (name: string) => {
    if (!name || !name.trim()) return 'DO';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  return (
    <div className="w-full bg-gradient-to-br from-[#18181B] via-[#222228] to-[#141416] text-white rounded-3xl p-5 border border-[#C59B27]/40 shadow-xl relative overflow-hidden">
      {/* Decorative background gold glow */}
      <div className="absolute top-0 right-0 w-36 h-36 bg-[#C59B27]/10 rounded-full blur-2xl pointer-events-none -mr-10 -mt-10" />
      
      <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 rounded-full bg-[#C59B27]" />
          <span className="text-xs font-serif-koinonia tracking-widest uppercase text-[#D4AF37]">
            Official Event Pass
          </span>
        </div>
        <div className="flex items-center text-xs text-white/70">
          <ShieldCheck className="w-3.5 h-3.5 mr-1 text-[#C59B27]" />
          <span>Verified Access</span>
        </div>
      </div>

      <div className="flex items-center space-x-4">
        <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-[#C59B27] shrink-0 shadow-md bg-[#FAF6EB] flex items-center justify-center font-serif-koinonia text-lg font-bold text-[#9A7326]">
          {photoUrl && photoUrl.trim() !== '' && !imgError ? (
            <img
              src={photoUrl}
              alt=""
              className="w-full h-full object-cover"
              onError={() => setImgError(true)}
            />
          ) : (
            <span>{getInitials(childName)}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-lg font-bold tracking-tight text-white truncate">{childName}</h4>
          <p className="text-xs text-[#D4AF37] font-medium mb-1.5">{ageGroup} Section</p>
          <StatusBadge status={status} size="sm" />
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between bg-black/30 -mx-5 -mb-5 px-5 py-3.5 rounded-b-3xl">
        <div className="text-xs text-white/80 flex flex-col">
          <span className="font-semibold text-white/90">{eventTitle}</span>
          <span className="text-[11px] text-white/60 flex items-center mt-0.5">
            <Calendar className="w-3 h-3 mr-1 inline shrink-0" /> {eventDate}
          </span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="bg-white/95 p-1.5 rounded-xl text-black shadow-inner">
            <QrCode className="w-7 h-7 text-[#18181B]" />
          </div>
        </div>
      </div>
    </div>
  );
};
