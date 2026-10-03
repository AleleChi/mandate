import React, { useState, useEffect } from 'react';
import { fetchLogoUrl, getSafePublicAssetUrl } from './BrandLogo';

interface AppPreloaderProps {
  isAppReady: boolean;
  onComplete: () => void;
}

type PreloaderPhase = 'init' | 'logo-entrance' | 'logo-fadeout' | 'revealed' | 'glorified' | 'exiting';

export const AppPreloader: React.FC<AppPreloaderProps> = ({ isAppReady, onComplete }) => {
  const [phase, setPhase] = useState<PreloaderPhase>('init');
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [messageSubPhase, setMessageSubPhase] = useState<'fadein' | 'hold' | 'fadeout'>('fadein');
  const [preloaderLogoSrc, setPreloaderLogoSrc] = useState<string | null>(null);
  const [isLogoReady, setIsLogoReady] = useState<boolean>(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // Fetch the official logo and preload the image to prevent fallback flash/flicker
  useEffect(() => {
    let isMounted = true;

    const loadAndPreloadLogo = async () => {
      try {
        const url = await fetchLogoUrl();
        if (!isMounted) return;

        if (url) {
          const resolvedUrl = getSafePublicAssetUrl(url);
          if (resolvedUrl) {
            // Validate and handle standard URL/data formats
            if (
              resolvedUrl.startsWith('http://') || 
              resolvedUrl.startsWith('https://') || 
              resolvedUrl.startsWith('data:') || 
              resolvedUrl.includes('/api/media/') || 
              resolvedUrl.includes('/media/')
            ) {
              const img = new Image();
              img.src = resolvedUrl;
              img.onload = () => {
                if (isMounted) {
                  setPreloaderLogoSrc(resolvedUrl);
                  setIsLogoReady(true);
                }
              };
              img.onerror = () => {
                console.error('Failed to preload logo image, using official main logo fallback');
                if (isMounted) {
                  setPreloaderLogoSrc(null);
                  setIsLogoReady(true);
                }
              };
              return;
            }
          }
        }
      } catch (err) {
        console.error('Error preloading logo in AppPreloader:', err);
      }

      // No custom logo found or failed to load, mark ready and use official fallback
      if (isMounted) {
        setPreloaderLogoSrc(null);
        setIsLogoReady(true);
      }
    };

    loadAndPreloadLogo();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isLogoReady) return;

    // Stage 1: Init to Logo Entrance
    setPhase('logo-entrance');

    // Stage 2: Logo Entrance to Logo Fadeout
    const t1 = setTimeout(() => {
      setPhase('logo-fadeout');
    }, prefersReducedMotion ? 500 : 2200);

    // Stage 3: Logo Fadeout to Jesus Revealed
    const t2 = setTimeout(() => {
      setPhase('revealed');
      setMessageSubPhase('fadein');
    }, prefersReducedMotion ? 1000 : 2950);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [isLogoReady, prefersReducedMotion]);

  // Handle Revealed internal phase timings (Fade in -> Hold -> Fade out)
  useEffect(() => {
    if (phase === 'revealed') {
      const tFadeIn = setTimeout(() => {
        setMessageSubPhase('hold');
      }, prefersReducedMotion ? 100 : 600);

      const tHold = setTimeout(() => {
        setMessageSubPhase('fadeout');
      }, prefersReducedMotion ? 600 : 3400); // 600ms fadein + 2800ms hold

      const tTransition = setTimeout(() => {
        setPhase('glorified');
        setMessageSubPhase('fadein');
      }, prefersReducedMotion ? 800 : 4000); // 600ms fadein + 2800ms hold + 600ms fadeout

      return () => {
        clearTimeout(tFadeIn);
        clearTimeout(tHold);
        clearTimeout(tTransition);
      };
    }
  }, [phase, prefersReducedMotion]);

  // Handle Glorified internal phase timings
  useEffect(() => {
    if (phase === 'glorified') {
      const tFadeIn = setTimeout(() => {
        setMessageSubPhase('hold');
      }, prefersReducedMotion ? 100 : 600);

      return () => clearTimeout(tFadeIn);
    }
  }, [phase, prefersReducedMotion]);

  // Transition from Glorified to Exiting once app is ready and minimum hold has completed
  useEffect(() => {
    if (phase === 'glorified' && messageSubPhase === 'hold') {
      if (isAppReady) {
        const tHold = setTimeout(() => {
          setMessageSubPhase('fadeout');
          const tFadeOut = setTimeout(() => {
            setPhase('exiting');
          }, prefersReducedMotion ? 100 : 700);
          return () => clearTimeout(tFadeOut);
        }, prefersReducedMotion ? 100 : 2800); // hold for 2800ms before fading out

        return () => clearTimeout(tHold);
      }
    }
  }, [phase, messageSubPhase, isAppReady, prefersReducedMotion]);

  // Final complete transition
  useEffect(() => {
    if (phase === 'exiting') {
      const tExit = setTimeout(() => {
        onComplete();
      }, prefersReducedMotion ? 100 : 500);
      return () => clearTimeout(tExit);
    }
  }, [phase, onComplete, prefersReducedMotion]);

  // Styling transitions
  const transitionClass = prefersReducedMotion ? 'transition-none' : 'transition-all duration-700 ease-in-out';
  const containerFadeClass = phase === 'exiting' ? 'opacity-0 scale-98 pointer-events-none' : 'opacity-100';

  return (
    <div 
      className={`fixed inset-0 z-[9999] bg-[#FAF9F6] flex flex-col items-center justify-center p-6 select-none ${transitionClass} ${containerFadeClass}`}
      data-view-version="app-preloader-screen-v3-koinonia-handover"
    >
      <div 
        className="w-full max-w-sm flex flex-col items-center text-center space-y-12"
        data-component-version="app-preloader-v3-logo-message-sequence"
      >
        {/* Stage 1 & 2: Logo Stage */}
        <div 
          className={`transform transition-all ease-out ${prefersReducedMotion ? 'duration-100' : 'duration-1000'} ${
            phase === 'logo-entrance' 
              ? 'opacity-100 translate-y-0 scale-100' 
              : 'opacity-0 -translate-y-4 scale-95 pointer-events-none'
          }`}
          data-component-version="app-preloader-logo-stage-v3"
        >
          <div className="flex justify-center items-center">
            {preloaderLogoSrc ? (
              <div 
                className="inline-flex items-center select-none cursor-pointer scale-120 select-none pointer-events-none filter drop-shadow-sm transition-transform duration-700"
                data-component-version="app-preloader-official-logo-v1"
              >
                <img
                  src={preloaderLogoSrc}
                  alt="Koinonia"
                  className="h-16 w-auto max-w-[240px] object-contain"
                  referrerPolicy="no-referrer"
                />
              </div>
            ) : (
              <div 
                className="scale-120 select-none pointer-events-none filter drop-shadow-sm transition-transform duration-700"
                data-component-version="app-preloader-official-logo-v1"
              >
                <div className="flex items-center space-x-2.5">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#C59B27] to-[#A67C2E] flex items-center justify-center text-white font-serif font-black text-xl shadow-md transition-transform duration-300">
                    K
                  </div>
                  <div className="flex flex-col text-left">
                    <span className="font-serif font-black text-[#18181B] tracking-widest text-sm leading-none uppercase">
                      KOINONIA
                    </span>
                    <span className="text-[9px] text-[#C59B27] tracking-wider uppercase font-bold mt-1">
                      Children & Teens
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Stage 3 & 4: Message Stage */}
        <div 
          className={`relative h-24 w-full flex items-center justify-center overflow-hidden transition-opacity ${prefersReducedMotion ? 'duration-100' : 'duration-700'} ${
            phase === 'revealed' || phase === 'glorified' ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
          data-component-version="app-preloader-message-stage-v3"
        >
          {/* Jesus Revealed */}
          {phase === 'revealed' && (
            <div 
              className={`absolute inset-0 flex flex-col items-center justify-center transform transition-all ease-out ${
                prefersReducedMotion ? 'duration-100' : 
                messageSubPhase === 'fadein' ? 'duration-600' :
                messageSubPhase === 'fadeout' ? 'duration-600' : 'duration-1000'
              } ${
                messageSubPhase === 'fadein' ? 'opacity-0 translate-y-4 scale-95' :
                messageSubPhase === 'hold' ? 'opacity-100 translate-y-0 scale-100' :
                'opacity-0 -translate-y-4 scale-95 pointer-events-none'
              }`}
            >
              <span className="font-serif-koinonia text-3xl sm:text-4xl font-medium text-[#8C6D23] tracking-wider select-none pointer-events-none">
                Jesus Revealed
              </span>
              <span className="w-16 h-px bg-gradient-to-r from-transparent via-[#C59B27]/40 to-transparent mt-3" />
            </div>
          )}

          {/* Jesus Glorified */}
          {phase === 'glorified' && (
            <div 
              className={`absolute inset-0 flex flex-col items-center justify-center transform transition-all ease-out ${
                prefersReducedMotion ? 'duration-100' : 
                messageSubPhase === 'fadein' ? 'duration-600' :
                messageSubPhase === 'fadeout' ? 'duration-700' : 'duration-1000'
              } ${
                messageSubPhase === 'fadein' ? 'opacity-0 translate-y-4 scale-95' :
                messageSubPhase === 'hold' ? 'opacity-100 translate-y-0 scale-100' :
                'opacity-0 -translate-y-4 scale-95 pointer-events-none'
              }`}
            >
              <span className="font-serif-koinonia text-3xl sm:text-4xl font-medium text-[#C59B27] tracking-wider select-none pointer-events-none">
                Jesus Glorified
              </span>
              <span className="w-16 h-px bg-gradient-to-r from-transparent via-[#C59B27]/60 to-transparent mt-3" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
