/**
 * KOINONIA GENERAL ASSEMBLY - ASSET MAPPING & INSPECTION REPORT
 * 
 * TASK 1: ASSET INSPECTION
 * Inspection of `public/`, `assets/`, `src/assets/`, and the repository workspace confirmed that
 * no custom uploaded image or video files (.jpg, .png, .mp4, .mov, .webp) currently exist in the project.
 * 
 * STRICT COMPLIANCE RULES:
 * 1. Do NOT invent fake filenames (e.g. `/images/koinonia-hero-main.jpg`, `/hero-video.mp4`).
 * 2. Do NOT use remote stock image URLs (Unsplash, Mixkit, Pexels).
 * 3. Do NOT use generated placeholders or demo stock assets.
 * 4. If a video or image cannot be found, leave the path empty (`""`) and show clean visual fallbacks
 *    without pretending the file was added.
 * 
 * Once real assets are uploaded into the `public/` directory, map their exact filenames below.
 */

export const REAL_ASSETS = {
  // Hero Section Images (Awaiting real uploaded assets)
  heroMain: '',      // Main curved hero image
  heroUpper: '',     // Back/upper layer image
  heroRight: '',     // Front/right layer image
  heroVideo: '',     // NOTE: No background video found in project assets. Do not assume /hero-video.mp4 exists unless uploaded.

  // Child Pass & Worker Avatars
  passAvatar: '',    // Child pass avatar / headshot
  workerAvatar: '',  // Care team worker avatar

  // Safety & Check-in Desk Image
  safetySection: '', // Event care check-in station image

  // Past Moments Gallery Images
  gallery: {
    arrival: '',
    checkIn: '',
    activities: '',
    teaching: '',
    careTeam: '',
    pickup: '',
    parentUpdates: '',
    eventMoments: '',
    eventVideo: '',  // Optional highlight video clip
  }
};
