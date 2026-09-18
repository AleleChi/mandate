import React, { useRef, useState, useEffect } from 'react';
import { Volume2, VolumeX, Play, Pause, Sparkles } from 'lucide-react';
import { REAL_ASSETS } from '../../config/assets';

export interface LandingVideoSectionProps {
  videoUrl?: string | null;
  posterUrl?: string | null;
  title?: string;
  subtitle?: string;
  badgeLabel?: string;
  className?: string;
}

export const LandingVideoSection: React.FC<LandingVideoSectionProps> = ({
  videoUrl,
  posterUrl,
  title = 'Where faith, fellowship, and joy come together.',
  subtitle = 'Dedicated spaces, active learning, and attentive care designed for children and teens at Koinonia.',
  badgeLabel = 'GATHERING ATMOSPHERE',
  className = ''
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [hasVideoError, setHasVideoError] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  const cleanVideoUrl = (videoUrl && videoUrl.trim() !== '' && !hasVideoError) ? videoUrl.trim() : null;
  const cleanPosterUrl = posterUrl && posterUrl.trim() !== '' ? posterUrl.trim() : (REAL_ASSETS.heroMain || '/social_share.jpg');

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
    const listener = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }, []);

  const togglePlayPause = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  return (
    <section
      id="gathering-video"
      aria-label="Gathering Atmosphere Video"
      className={`py-8 sm:py-14 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full ${className}`}
    >
      <div 
        className="relative overflow-hidden rounded-[26px] sm:rounded-[36px] lg:rounded-[44px] border border-[#E5D5AE]/80 shadow-[0_20px_50px_-15px_rgba(24,24,27,0.18)] bg-[#18181B] aspect-[4/3] sm:aspect-[16/9] lg:aspect-[21/9] min-h-[300px] sm:min-h-[420px] lg:min-h-[480px] flex items-end"
      >
        {cleanVideoUrl && !prefersReducedMotion ? (
          <>
            {/* Layer 1: Intelligent Blurred Backdrop Treatment */}
            {/* Gracefully absorbs videos of non-standard aspect ratio or smaller resolution, preventing black letterboxing */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
              <img
                src={cleanPosterUrl}
                alt=""
                className="w-full h-full object-cover scale-125 blur-3xl opacity-40 brightness-75"
              />
            </div>

            {/* Layer 2: Primary Crisp Foreground Video (Cover Behavior, Center-Focused) */}
            <video
              ref={videoRef}
              src={cleanVideoUrl}
              poster={cleanPosterUrl}
              muted={isMuted}
              loop
              autoPlay
              playsInline
              preload="metadata"
              onError={() => setHasVideoError(true)}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              className="absolute inset-0 w-full h-full object-cover object-center z-10"
            />
          </>
        ) : (
          <>
            {/* Fallback Poster State with identical curved, layered aesthetic */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
              <img
                src={cleanPosterUrl}
                alt=""
                className="w-full h-full object-cover scale-125 blur-2xl opacity-35 brightness-75"
              />
            </div>
            <img
              src={cleanPosterUrl}
              alt="Koinonia Gathering Highlights"
              className="absolute inset-0 w-full h-full object-cover object-center z-10"
              loading="lazy"
            />
          </>
        )}

        {/* Layer 3: Tasteful Editorial Contrast Gradient Overlay */}
        <div 
          className="absolute inset-0 z-20 bg-gradient-to-t from-[#18181B]/90 via-[#18181B]/35 to-transparent pointer-events-none" 
        />
        <div 
          className="absolute inset-0 z-20 bg-radial-[at_top_left]_from-[#18181B]/30_via-transparent_to-transparent pointer-events-none" 
        />

        {/* Layer 4: Minimal, Human-Designed Overlay Content */}
        <div className="relative z-30 w-full p-6 sm:p-8 lg:p-12 flex flex-col sm:flex-row sm:items-end justify-between gap-5">
          <div className="space-y-2 max-w-xl text-left">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/45 backdrop-blur-md border border-[#E5D5AE]/40 text-[#E5D5AE] text-[10px] sm:text-[11px] font-semibold tracking-widest uppercase font-sans shadow-2xs">
              <Sparkles className="w-3 h-3 text-[#C59B27]" />
              <span>{badgeLabel}</span>
            </div>

            <h3 className="text-xl sm:text-2xl lg:text-3xl font-serif-koinonia font-bold text-white tracking-tight leading-snug">
              {title}
            </h3>

            <p className="text-xs sm:text-sm text-[#D4D4D8] leading-relaxed max-w-lg hidden sm:block">
              {subtitle}
            </p>
          </div>

          {/* Discreet Interactive Video Controls */}
          {cleanVideoUrl && !prefersReducedMotion && (
            <div className="flex items-center gap-2 self-end sm:self-auto bg-black/45 backdrop-blur-md border border-white/20 p-1.5 rounded-2xl shadow-lg">
              <button
                type="button"
                onClick={togglePlayPause}
                aria-label={isPlaying ? "Pause video" : "Play video"}
                className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/25 active:bg-white/30 text-white flex items-center justify-center transition-all cursor-pointer"
                title={isPlaying ? "Pause video" : "Play video"}
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
              </button>
              <button
                type="button"
                onClick={toggleMute}
                aria-label={isMuted ? "Unmute audio" : "Mute audio"}
                className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/25 active:bg-white/30 text-white flex items-center justify-center transition-all cursor-pointer"
                title={isMuted ? "Unmute audio" : "Mute audio"}
              >
                {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
