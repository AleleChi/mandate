import React, { useRef, useState, useEffect } from 'react';
import { Volume2, VolumeX, Play, Pause } from 'lucide-react';
import { REAL_ASSETS } from '../../config/assets';

export interface LandingVideoSectionProps {
  videoUrl?: string | null;
  posterUrl?: string | null;
  title?: string;
  subtitle?: string;
  className?: string;
}

export const LandingVideoSection: React.FC<LandingVideoSectionProps> = ({
  videoUrl,
  posterUrl,
  title = 'Where faith, fellowship, and joy come together.',
  subtitle = 'Dedicated spaces, active learning, and attentive care designed for children and teens at Koinonia.',
  className = ''
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [hasVideoError, setHasVideoError] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanVideoUrl = (videoUrl && videoUrl.trim() !== '' && !hasVideoError) ? videoUrl.trim() : null;
  const cleanPosterUrl = posterUrl && posterUrl.trim() !== '' ? posterUrl.trim() : (REAL_ASSETS.heroMain || '/social_share.jpg');
  const showVideo = Boolean(cleanVideoUrl && !prefersReducedMotion);

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
    setIsMuted(prev => !prev);
  };

  const handleInteraction = () => {
    setIsHovered(true);
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setIsHovered(false), 2400);
  };

  useEffect(() => () => { if (hoverTimer.current) clearTimeout(hoverTimer.current); }, []);

  return (
    <section
      id="gathering-video"
      aria-label="Gathering video"
      className={`py-8 sm:py-14 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full ${className}`}
    >
      <div
        className="relative overflow-hidden rounded-[26px] sm:rounded-[36px] lg:rounded-[44px] bg-[#18181B] aspect-[4/3] sm:aspect-[16/9] lg:aspect-[21/9] min-h-[300px] sm:min-h-[420px] lg:min-h-[480px]"
        style={{ boxShadow: '0 24px 60px -12px rgba(18,18,20,0.22), 0 4px 16px -4px rgba(18,18,20,0.12)' }}
        onMouseMove={showVideo ? handleInteraction : undefined}
        onTouchStart={showVideo ? handleInteraction : undefined}
      >
        {/* Media layer */}
        {showVideo ? (
          <>
            {/* Blurred backdrop — absorbs non-matching aspect ratios without letterboxing */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
              <img
                src={cleanPosterUrl}
                alt=""
                className="w-full h-full object-cover scale-125 blur-3xl opacity-30 brightness-75"
              />
            </div>
            <video
              ref={videoRef}
              src={cleanVideoUrl!}
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
            <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
              <img
                src={cleanPosterUrl}
                alt=""
                className="w-full h-full object-cover scale-125 blur-2xl opacity-30 brightness-75"
              />
            </div>
            <img
              src={cleanPosterUrl}
              alt="Koinonia gathering"
              className="absolute inset-0 w-full h-full object-cover object-center z-10"
              loading="lazy"
            />
          </>
        )}

        {/* Gradient — bottom-heavy, upper frame stays bright */}
        <div
          className="absolute inset-0 z-20 pointer-events-none"
          style={{
            background: 'linear-gradient(to top, rgba(18,18,20,0.78) 0%, rgba(18,18,20,0.18) 38%, transparent 62%)'
          }}
        />

        {/* Text — bottom left */}
        <div className="absolute bottom-0 left-0 z-30 p-6 sm:p-8 lg:p-12 max-w-xl">
          <h3 className="text-xl sm:text-2xl lg:text-[1.75rem] font-serif-koinonia font-bold text-white tracking-tight leading-snug mb-2">
            {title}
          </h3>
          <p className="text-xs sm:text-sm text-white/55 leading-relaxed hidden sm:block">
            {subtitle}
          </p>
        </div>

        {/* Controls — bottom right, always subtly visible when video is active */}
        {showVideo && (
          <div
            className="absolute bottom-6 right-6 sm:bottom-8 sm:right-8 lg:bottom-12 lg:right-12 z-40 flex items-center gap-1.5"
            style={{
              opacity: isHovered ? 0.92 : (isPlaying ? 0.28 : 0.72),
              transition: 'opacity 0.4s ease'
            }}
          >
            <button
              type="button"
              onClick={togglePlayPause}
              aria-label={isPlaying ? 'Pause video' : 'Play video'}
              className={`w-7 h-7 rounded-full backdrop-blur-sm text-white flex items-center justify-center transition-colors cursor-pointer ${
                isPlaying ? 'bg-white/10 hover:bg-white/20' : 'bg-white/25 hover:bg-white/35'
              }`}
            >
              {isPlaying
                ? <Pause className="w-3 h-3" />
                : <Play className="w-3 h-3 ml-px" />}
            </button>
            <button
              type="button"
              onClick={toggleMute}
              aria-label={isMuted ? 'Unmute' : 'Mute'}
              className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              {isMuted
                ? <VolumeX className="w-3 h-3" />
                : <Volume2 className="w-3 h-3" />}
            </button>
          </div>
        )}
      </div>
    </section>
  );
};
