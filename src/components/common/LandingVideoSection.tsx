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
  const bgVideoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [hasVideoError, setHasVideoError] = useState(false);
  const [activeVideoSrc, setActiveVideoSrc] = useState<string | null>(videoUrl?.trim() || null);
  const [isHovered, setIsHovered] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [orientation, setOrientation] = useState<'portrait' | 'landscape' | 'square' | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (videoUrl && videoUrl.trim()) {
      setActiveVideoSrc(videoUrl.trim());
      setHasVideoError(false);
    } else {
      setActiveVideoSrc(null);
    }
  }, [videoUrl]);

  const handleVideoError = () => {
    // If transformed Cloudinary video URL failed, try the clean untransformed canonical URL before falling back
    if (activeVideoSrc && activeVideoSrc.includes('/video/upload/') && (activeVideoSrc.includes('/c_') || activeVideoSrc.includes('/vc_') || activeVideoSrc.includes('fl_faststart'))) {
      const rawUrl = activeVideoSrc.replace(/\/video\/upload\/[^/]+\//, '/video/upload/');
      if (rawUrl !== activeVideoSrc) {
        setActiveVideoSrc(rawUrl);
        return;
      }
    }
    setHasVideoError(true);
  };

  const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const v = e.currentTarget;
    if (v.videoWidth && v.videoHeight) {
      if (v.videoHeight > v.videoWidth * 1.05) {
        setOrientation('portrait');
      } else if (v.videoWidth > v.videoHeight * 1.05) {
        setOrientation('landscape');
      } else {
        setOrientation('square');
      }
    }
  };

  const cleanVideoUrl = (activeVideoSrc && !hasVideoError) ? activeVideoSrc : null;
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
      videoRef.current.play().then(() => {
        setIsPlaying(true);
        if (bgVideoRef.current && bgVideoRef.current.paused) {
          bgVideoRef.current.play().catch(() => {});
        }
      }).catch(() => {});
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
      if (bgVideoRef.current && !bgVideoRef.current.paused) {
        bgVideoRef.current.pause();
      }
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

  const isPortraitOrSquare = orientation === 'portrait' || orientation === 'square';

  return (
    <section
      id="gathering-video"
      aria-label="Gathering video"
      className={`py-8 sm:py-14 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full ${className}`}
    >
      <div
        className={`relative overflow-hidden rounded-[26px] sm:rounded-[36px] lg:rounded-[44px] bg-[#18181B] w-full transition-all duration-300 ${
          orientation === 'portrait'
            ? 'aspect-[4/5] sm:aspect-[16/10] lg:aspect-[21/9] max-h-[82vh] sm:max-h-none min-h-[380px] sm:min-h-[440px] lg:min-h-[480px]'
            : orientation === 'square'
            ? 'aspect-square sm:aspect-[16/10] lg:aspect-[21/9] max-h-[82vh] sm:max-h-none min-h-[340px] sm:min-h-[420px] lg:min-h-[480px]'
            : 'aspect-[16/10] sm:aspect-[16/9] lg:aspect-[21/9] min-h-[300px] sm:min-h-[420px] lg:min-h-[480px]'
        }`}
        style={{ boxShadow: '0 24px 60px -12px rgba(18,18,20,0.22), 0 4px 16px -4px rgba(18,18,20,0.12)' }}
        onMouseMove={showVideo ? handleInteraction : undefined}
        onTouchStart={showVideo ? handleInteraction : undefined}
      >
        {/* Media layer */}
        {showVideo ? (
          <>
            {/* BACKGROUND LAYER:
                For portrait or square video: soft blurred background layer of same video/poster fills the frame,
                removing empty/flat beige or grey sidebars while preserving original aspect ratio. */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none z-0" aria-hidden="true">
              {isPortraitOrSquare ? (
                <>
                  <video
                    ref={bgVideoRef}
                    src={cleanVideoUrl!}
                    poster={cleanPosterUrl}
                    muted
                    loop
                    autoPlay
                    playsInline
                    preload="metadata"
                    aria-hidden="true"
                    className="w-full h-full object-cover scale-110 blur-2xl opacity-40 brightness-60"
                  />
                  <div className="absolute inset-0 bg-black/30" />
                </>
              ) : (
                <img
                  src={cleanPosterUrl}
                  alt=""
                  className="w-full h-full object-cover scale-125 blur-3xl opacity-30 brightness-75"
                />
              )}
            </div>

            {/* FOREGROUND VIDEO:
                Portrait: centered with object-contain to preserve complete composition without distortion or stretching.
                Landscape: object-cover fills the frame. */}
            <video
              ref={videoRef}
              src={cleanVideoUrl!}
              poster={cleanPosterUrl}
              muted={isMuted}
              loop
              autoPlay
              playsInline
              preload="metadata"
              onLoadedMetadata={handleLoadedMetadata}
              onError={handleVideoError}
              onPlay={() => {
                setIsPlaying(true);
                if (bgVideoRef.current && bgVideoRef.current.paused) {
                  bgVideoRef.current.play().catch(() => {});
                }
              }}
              onPause={() => {
                setIsPlaying(false);
                if (bgVideoRef.current && !bgVideoRef.current.paused) {
                  bgVideoRef.current.pause();
                }
              }}
              className={`absolute inset-0 w-full h-full z-10 ${
                isPortraitOrSquare ? 'object-contain object-center' : 'object-cover object-center'
              }`}
            />
          </>
        ) : (
          <>
            <div className="absolute inset-0 overflow-hidden pointer-events-none z-0" aria-hidden="true">
              <img
                src={cleanPosterUrl}
                alt=""
                className="w-full h-full object-cover scale-125 blur-2xl opacity-35 brightness-60"
              />
              <div className="absolute inset-0 bg-black/25" />
            </div>
            <img
              src={cleanPosterUrl}
              alt="Koinonia gathering"
              className={`absolute inset-0 w-full h-full z-10 ${
                isPortraitOrSquare ? 'object-contain object-center' : 'object-cover object-center'
              }`}
              loading="lazy"
            />
          </>
        )}

        {/* Gradient — bottom-heavy, upper frame stays clear */}
        <div
          className="absolute inset-0 z-20 pointer-events-none"
          style={{
            background: 'linear-gradient(to top, rgba(18,18,20,0.85) 0%, rgba(18,18,20,0.25) 42%, transparent 68%)'
          }}
        />

        {/* Text — bottom left (proportional on mobile, generous padding) */}
        <div className="absolute bottom-0 left-0 z-30 p-5 sm:p-8 lg:p-12 max-w-xl">
          <h3 className="text-lg sm:text-2xl lg:text-[1.75rem] font-serif-koinonia font-bold text-white tracking-tight leading-snug mb-1.5 sm:mb-2 max-w-xs sm:max-w-none">
            {title}
          </h3>
          <p className="text-xs sm:text-sm text-white/70 leading-relaxed max-w-md line-clamp-2 sm:line-clamp-none">
            {subtitle}
          </p>
        </div>

        {/* Controls — bottom right, always subtly visible when video is active */}
        {showVideo && (
          <div
            className="absolute bottom-4 right-4 sm:bottom-8 sm:right-8 lg:bottom-12 lg:right-12 z-40 flex items-center gap-1.5"
            style={{
              opacity: isHovered ? 0.95 : (isPlaying ? 0.35 : 0.75),
              transition: 'opacity 0.3s ease'
            }}
          >
            <button
              type="button"
              onClick={togglePlayPause}
              aria-label={isPlaying ? 'Pause video' : 'Play video'}
              className={`w-7 h-7 rounded-full backdrop-blur-sm text-white flex items-center justify-center transition-colors cursor-pointer ${
                isPlaying ? 'bg-white/15 hover:bg-white/25' : 'bg-white/30 hover:bg-white/40'
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
              className="w-7 h-7 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur-sm text-white flex items-center justify-center transition-colors cursor-pointer"
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
