import React, { useEffect, useState, useRef } from 'react';
import { X, Printer, QrCode, AlertCircle, Copy, Check, ShieldCheck, User } from 'lucide-react';
import * as QRCodeLib from 'qrcode';
import { api } from '../../../services/api';
import { buildApiUrl } from '../../../utils/urlHelper';

export interface PrintablePassData {
  childId: string;
  childEventEntryId: string;
  childName: string;
  entryStatus?: string;
  photoUrl?: string | null;
  age?: number | null;
  ageGroup?: string | null;
  parentName?: string | null;
  parentPhone?: string | null;
  pickupName?: string | null;
  pickupRelation?: string | null;
  event?: {
    id: string;
    title: string;
    startsAt?: string;
    endsAt?: string;
  } | null;
  pass?: {
    id: string;
    passReference: string;
    qrPayload: string;
    status: string;
    issuedAt?: string;
  } | null;
}

interface AdminPassModalProps {
  isOpen: boolean;
  onClose: () => void;
  // Either a single childId or an array of childIds (for batch)
  childId?: string;
  childIds?: string[];
  eventId?: string;
  // Optional preloaded pass data to avoid redundant network call
  initialPassData?: PrintablePassData;
}

export const AdminPassModal: React.FC<AdminPassModalProps> = ({
  isOpen,
  onClose,
  childId,
  childIds,
  eventId,
  initialPassData
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passes, setPasses] = useState<PrintablePassData[]>([]);
  const [qrCodeUrls, setQrCodeUrls] = useState<Record<string, string>>({});
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const isBatch = Boolean(childIds && childIds.length > 1);

  // Fetch pass data whenever modal opens
  useEffect(() => {
    if (!isOpen) {
      setPasses([]);
      setQrCodeUrls({});
      setFailedImages({});
      setError(null);
      return;
    }

    if (initialPassData) {
      setPasses([initialPassData]);
      return;
    }

    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        if (childIds && childIds.length > 0) {
          // Batch fetch
          const res = await api.admin.getPrintablePasses({ childIds, eventId });
          if (res && res.success && Array.isArray(res.passes)) {
            setPasses(res.passes);
          } else {
            setError(res?.error || 'Failed to retrieve selected event passes.');
          }
        } else if (childId) {
          // Single fetch
          const res = await api.admin.getChildPass(childId, { eventId });
          if (res && res.success) {
            setPasses([res]);
          } else {
            setError(res?.error || 'Child event registration not found.');
          }
        }
      } catch (err: any) {
        setError(err?.message || 'Error retrieving event pass data.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [isOpen, childId, childIds, eventId, initialPassData]);

  // Generate high-contrast, black-and-white QR data URLs in memory via QRCodeLib
  useEffect(() => {
    let isCancelled = false;

    const generateQrs = async () => {
      const urls: Record<string, string> = {};
      for (const item of passes) {
        const passRef = item.pass?.passReference;
        if (passRef && !qrCodeUrls[passRef]) {
          try {
            const dataUrl = await QRCodeLib.toDataURL(passRef, {
              width: 320,
              margin: 2,
              errorCorrectionLevel: 'M',
              color: {
                dark: '#000000', // Standard high-contrast black
                light: '#FFFFFF' // Standard pure white background
              }
            });
            urls[passRef] = dataUrl;
          } catch (e) {
            console.error('Failed to generate QR for pass:', passRef, e);
          }
        }
      }
      if (!isCancelled && Object.keys(urls).length > 0) {
        setQrCodeUrls(prev => ({ ...prev, ...urls }));
      }
    };

    if (passes.length > 0) {
      generateQrs();
    }

    return () => {
      isCancelled = true;
    };
  }, [passes]);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleCopyCode = (code: string) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    }
  };

  const activePasses = passes.filter(p => p.pass && p.pass.status === 'active');
  const missingOrRevokedCount = passes.length - activePasses.length;

  return (
    <>
      {/* Print-specific style overrides */}
      <style>{`
        @media print {
          /* Hide all application elements */
          body * {
            visibility: hidden !important;
          }
          /* Show ONLY the printable pass container */
          #admin-printable-pass-sheet,
          #admin-printable-pass-sheet * {
            visibility: visible !important;
          }
          #admin-printable-pass-sheet {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }
          .admin-pass-print-card {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            border: 1.5px dashed #999 !important;
            margin-bottom: 20px !important;
          }
          .admin-pass-page-break {
            page-break-after: always !important;
            break-after: page !important;
          }
        }
      `}</style>

      {/* Screen Modal Backdrop */}
      <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 print:hidden">
        <div className="relative bg-[#FFFDF9] dark:bg-[#1E1E1C] border border-[#EAE8E1] dark:border-[#302E29] rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden font-sans">
          
          {/* Modal Header */}
          <div className="px-5 py-4 border-b border-[#EAE8E1] dark:border-[#302E29] flex items-center justify-between bg-[#FBF9F4] dark:bg-[#252522]">
            <div className="flex items-center gap-2">
              <QrCode className="w-5 h-5 text-[#C59B27]" />
              <h3 className="text-base font-semibold text-zinc-900 dark:text-[#F0EBE3]">
                {isBatch
                  ? `Print Event Passes (${passes.length} selected)`
                  : 'Official Event Pass'}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              {activePasses.length > 0 && (
                <button
                  type="button"
                  onClick={handlePrint}
                  id="admin-btn-print-pass"
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#C59B27] hover:bg-[#b08a23] text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
                  title="Print official pass"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>{isBatch ? `Print ${activePasses.length} passes` : 'Print pass'}</span>
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Modal Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            {loading && (
              <div className="py-12 flex flex-col items-center justify-center text-center space-y-2">
                <div className="w-6 h-6 border-2 border-[#C59B27] border-t-transparent rounded-full animate-spin" />
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Retrieving canonical event pass...</p>
              </div>
            )}

            {error && (
              <div className="p-4 rounded-xl bg-rose-50 dark:bg-red-950/20 border border-rose-200 dark:border-red-900/40 text-rose-800 dark:text-rose-300 text-xs flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
                <div>
                  <p className="font-semibold">Unable to load pass</p>
                  <p className="mt-0.5">{error}</p>
                </div>
              </div>
            )}

            {!loading && !error && missingOrRevokedCount > 0 && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-xl text-amber-800 dark:text-amber-300 text-xs flex items-center justify-between">
                <span>
                  {missingOrRevokedCount} of {passes.length} selected {missingOrRevokedCount === 1 ? 'child has' : 'children have'} no active pass. Only active passes will be printed.
                </span>
              </div>
            )}

            {!loading && !error && passes.length === 0 && (
              <div className="py-8 text-center text-xs text-zinc-500 dark:text-zinc-400">
                No pass record found.
              </div>
            )}

            {/* Render Passes Preview */}
            {!loading && (
              <div className="space-y-6">
                {passes.map((item, idx) => {
                  const pass = item.pass;
                  const hasActivePass = pass && pass.status === 'active';
                  const qrUrl = pass?.passReference ? qrCodeUrls[pass.passReference] : null;

                  if (!hasActivePass) {
                    return (
                      <div
                        key={item.childId || idx}
                        className="p-4 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900/30 text-center space-y-1.5 text-xs text-zinc-500"
                      >
                        <p className="font-semibold text-zinc-700 dark:text-zinc-300">{item.childName}</p>
                        <p className="text-[11px] text-amber-700 dark:text-amber-400">
                          Pass not available ({item.entryStatus === 'revoked' ? 'Revoked' : item.entryStatus || 'Missing pass'})
                        </p>
                        <p className="text-[11px] text-zinc-400">
                          To print an event pass, the child must be selected and have an issued pass.
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={item.childId || idx}
                      className="bg-white dark:bg-[#18181B] border border-[#E8E0CA] dark:border-[#3A3835] rounded-2xl p-5 shadow-xs max-w-md mx-auto"
                    >
                      {/* Pass Header */}
                      <div className="text-center pb-3 border-b border-[#EAE8E1] dark:border-[#2A2926]">
                        <span className="text-[10px] font-bold tracking-[0.22em] text-[#9A7326] dark:text-[#C59B27] uppercase block">
                          KOINONIA
                        </span>
                        <h4 className="text-xs font-semibold tracking-wider text-zinc-800 dark:text-[#F0EBE3] uppercase mt-0.5">
                          CHILDREN'S MINISTRY · OFFICIAL PASS
                        </h4>
                        <p className="text-[11px] text-zinc-500 dark:text-[#8E8B82] mt-0.5">
                          {item.event?.title || 'The General Assembly 2026'}
                        </p>
                      </div>

                      {/* Child Profile Strip */}
                      {(() => {
                        const itemKey = item.childId || String(idx);
                        const resolvedPhotoUrl = item.photoUrl && !failedImages[itemKey] ? buildApiUrl(item.photoUrl) : '';
                        return (
                          <div className="py-3 flex items-center gap-3.5 border-b border-[#EAE8E1] dark:border-[#2A2926]">
                            <div className="w-14 h-14 rounded-xl overflow-hidden bg-[#FAF6EB] dark:bg-[#262520] border border-[#E5D5AE] dark:border-[#3A3835] flex items-center justify-center shrink-0 text-[#8C6D23] font-serif font-bold text-base">
                              {resolvedPhotoUrl ? (
                                <img
                                  src={resolvedPhotoUrl}
                                  alt=""
                                  className="w-full h-full object-cover"
                                  onError={() => setFailedImages(prev => ({ ...prev, [itemKey]: true }))}
                                />
                              ) : (
                                <span>{item.childName.slice(0, 2).toUpperCase()}</span>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <h5 className="text-sm font-bold text-zinc-900 dark:text-[#F0EBE3] truncate">
                                {item.childName}
                              </h5>
                              <p className="text-xs text-zinc-600 dark:text-[#B8B0A5] mt-0.5">
                                {item.age !== null && item.age !== undefined ? `${item.age} yrs · ` : ''}
                                {item.ageGroup || 'Section'}
                              </p>
                              {item.pickupName && (
                                <p className="text-[11px] text-zinc-500 dark:text-[#7A7570] truncate mt-0.5">
                                  Pickup: {item.pickupName} ({item.pickupRelation || 'Adult'})
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })()}

                      {/* High-Contrast QR Code Module */}
                      <div className="py-4 flex flex-col items-center justify-center space-y-2">
                        <div className="p-2.5 bg-white border border-zinc-200 rounded-xl shadow-xs inline-block">
                          {qrUrl ? (
                            <img
                              src={qrUrl}
                              alt={`Pass QR Code ${pass.passReference}`}
                              className="w-40 h-40 object-contain"
                            />
                          ) : (
                            <div className="w-40 h-40 flex items-center justify-center text-zinc-400">
                              <QrCode className="w-10 h-10 animate-pulse text-[#C59B27]" />
                            </div>
                          )}
                        </div>

                        {/* Monospace Pass Code */}
                        <div className="w-full text-center">
                          <span className="text-[8.5px] font-bold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400 block">
                            PASS CODE
                          </span>
                          <div className="inline-flex items-center gap-1.5 mt-0.5">
                            <span className="text-sm font-mono font-bold tracking-wider text-zinc-900 dark:text-[#F0EBE3]">
                              {pass.passReference}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopyCode(pass.passReference)}
                              className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 cursor-pointer rounded"
                              title="Copy pass code"
                            >
                              {copiedCode === pass.passReference ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                          <span className="text-[9px] text-zinc-400 dark:text-[#7A7570] block mt-0.5">
                            High-contrast scannable QR · Identical to Parent Mobile Pass
                          </span>
                        </div>
                      </div>

                      {/* Footer notice */}
                      <div className="pt-2 text-center border-t border-[#EAE8E1] dark:border-[#2A2926]">
                        <span className="text-[8px] font-bold tracking-[0.22em] text-[#C59B27] uppercase">
                          OFFICIAL EVENT CREDENTIAL
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Modal Footer */}
          <div className="px-5 py-3 border-t border-[#EAE8E1] dark:border-[#302E29] bg-[#FBF9F4] dark:bg-[#252522] flex items-center justify-between text-xs text-zinc-500">
            <span>
              {activePasses.length} {activePasses.length === 1 ? 'pass' : 'passes'} ready for print
            </span>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer font-medium"
            >
              Done
            </button>
          </div>
        </div>
      </div>

      {/* 
        ======================================================================
        PRINT-ONLY SHEET CONTAINER
        Rendered cleanly when window.print() is executed.
        Standard physical layout: 2 passes per page (A4), cut lines, 45mm QR.
        ======================================================================
      */}
      <div id="admin-printable-pass-sheet" className="hidden print:block">
        <div style={{ padding: '12mm 10mm', maxWidth: '210mm', margin: '0 auto', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
          {activePasses.map((item, idx) => {
            const pass = item.pass!;
            const qrUrl = qrCodeUrls[pass.passReference];
            const isEndOfPage = idx % 2 === 1 && idx !== activePasses.length - 1;

            return (
              <React.Fragment key={item.childId || idx}>
                <div
                  className="admin-pass-print-card"
                  style={{
                    width: '105mm',
                    minHeight: '135mm',
                    margin: '0 auto 10mm auto',
                    padding: '8mm 10mm',
                    boxSizing: 'border-box',
                    background: '#FFFFFF',
                    color: '#000000',
                    textAlign: 'center'
                  }}
                >
                  {/* Print Pass Header */}
                  <div style={{ borderBottom: '1px solid #CCC', paddingBottom: '3mm', marginBottom: '3mm' }}>
                    <div style={{ fontSize: '11pt', fontWeight: 'bold', letterSpacing: '2px', textTransform: 'uppercase' }}>
                      KOINONIA
                    </div>
                    <div style={{ fontSize: '7.5pt', fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase', color: '#555', marginTop: '1mm' }}>
                      CHILDREN'S MINISTRY · OFFICIAL PASS
                    </div>
                    <div style={{ fontSize: '8pt', color: '#333', marginTop: '1mm' }}>
                      {item.event?.title || 'The General Assembly 2026'}
                    </div>
                  </div>

                  {/* Child Identity Strip */}
                  {(() => {
                    const itemKey = item.childId || String(idx);
                    const resolvedPhotoUrl = item.photoUrl && !failedImages[itemKey] ? buildApiUrl(item.photoUrl) : '';
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4mm', margin: '3mm 0', textAlign: 'left' }}>
                        {resolvedPhotoUrl ? (
                          <img
                            src={resolvedPhotoUrl}
                            alt=""
                            style={{ width: '18mm', height: '18mm', objectFit: 'cover', borderRadius: '3mm', border: '1px solid #999' }}
                            onError={() => setFailedImages(prev => ({ ...prev, [itemKey]: true }))}
                          />
                        ) : (
                          <div style={{ width: '18mm', height: '18mm', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F0F0F0', border: '1px solid #999', borderRadius: '3mm', fontSize: '10pt', fontWeight: 'bold' }}>
                            {item.childName.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <div style={{ fontSize: '12pt', fontWeight: 'bold' }}>
                            {item.childName}
                          </div>
                          <div style={{ fontSize: '9pt', color: '#444' }}>
                            {item.age !== null && item.age !== undefined ? `${item.age} yrs · ` : ''}
                            {item.ageGroup || 'Section'}
                          </div>
                          {item.pickupName && (
                            <div style={{ fontSize: '7.5pt', color: '#666', marginTop: '1mm' }}>
                              Pickup: {item.pickupName} ({item.pickupRelation || 'Adult'})
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* High Contrast Black & White QR (45mm x 45mm) */}
                  <div style={{ margin: '4mm auto', textAlign: 'center' }}>
                    {qrUrl ? (
                      <img
                        src={qrUrl}
                        alt={pass.passReference}
                        style={{ width: '45mm', height: '45mm', display: 'block', margin: '0 auto' }}
                      />
                    ) : (
                      <div style={{ width: '45mm', height: '45mm', border: '1px solid #000', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8pt' }}>
                        QR Code
                      </div>
                    )}
                  </div>

                  {/* Monospace Pass Code */}
                  <div style={{ borderTop: '1px solid #EEE', paddingTop: '2mm' }}>
                    <div style={{ fontSize: '7pt', fontWeight: 'bold', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#666' }}>
                      PASS CODE
                    </div>
                    <div style={{ fontSize: '13pt', fontFamily: 'monospace', fontWeight: 'bold', letterSpacing: '1.5px', marginTop: '1mm' }}>
                      {pass.passReference}
                    </div>
                  </div>

                  <div style={{ marginTop: '3mm', fontSize: '6.5pt', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#888' }}>
                    OFFICIAL EVENT CREDENTIAL · CUT ALONG DASHED LINE
                  </div>
                </div>

                {/* Page break after every 2 passes for A4 printing */}
                {isEndOfPage && <div className="admin-pass-page-break" />}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </>
  );
};

