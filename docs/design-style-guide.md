# Design & Style Guide

## Product Identity
This is the official Koinonia Children and Teens event access product. It must feel premium, calm, official, warm, excellent, and parent-friendly.

## Design Principles
- Mobile-first for parent and staff screens
- Desktop-first for admin screens
- Parent screens must feel like a real mobile app
- Admin screens must feel like a serious event command centre
- Do not use generic SaaS layouts
- Do not use AI-looking visuals
- Do not use childish graphics

## Colour Rules
- Warm off-white for main parent screens
- Deep Koinonia charcoal for official dark sections, event cards, admin sidebar, and safety sections
- Charcoal for primary text
- Soft grey for supporting text
- Antique gold and deep gold for buttons, active states, borders, and accents
- Controlled orange only for attention states
- Controlled green only for completed or success states
- Controlled red only for serious warnings

## Typography
- Use clean readable typography
- Headings can have a refined editorial feel
- Admin dashboard typography should use elegant serif headings with medium or semibold weight. Avoid heavy bold, extrabold, or black heading weights. Hierarchy should come from spacing, scale, and calm contrast rather than excessive font weight.
- Body text must remain simple and legible
- No overly decorative fonts
- No generic AI-looking type treatment

## Parent-Facing Wording Rules

### Do Not Use
- registration
- registry
- portal
- workflow
- dashboard
- system
- token
- validation
- authentication
- audit log
- submit application
- application approved
- seamless
- all-in-one
- smart system

### Use
- Parent Access
- Begin Parent Access
- Home
- Children
- Status
- Passes
- Profile
- Add a child
- Add each child
- Send details for review
- Details sent
- Under review
- Selected
- Not selected
- Waiting list
- Pass ready
- Event pass
- Entry
- Pickup
- Child photo check
- Parent profile
- Approved pickup person
- Pickup record

## Image Rules
- Use real uploaded Koinonia event images only
- Do not use stock, generated, placeholder, or unrelated office/coding images
- Use object-fit cover
- Avoid awkward face cropping
- Use fallback initials where profile images are unavailable
- Do not show broken images or alt text inside image boxes
- **Dynamic Hero Covers**: Above-the-fold hero cards on parent and volunteer portals must load with `loading="eager"` and use CORS-safe base prefixes to avoid broken layout shifting.
- **SafeImage One-Time Fallbacks**: If a custom/uploaded background image fails to load (returning a non-image content-type or 404), components must utilize `SafeImage` with `fallbackSrc` to gracefully switch to the default Koinonia illustrations precisely once. Infinite loading and blank states are strictly forbidden.

## Motion Rules
- Motion must be premium and calm
- Allowed: fade-up, gentle slide, subtle hover lift, soft image scale, smooth carousel drag
- Not allowed: blinking, bouncing, flashing, pulsing dots, noisy spinning, childish animation
- Respect reduced motion settings

## Component Rules
- Forms use one vertical aligned column
- Labels sit above inputs
- Helper/error text sits below input
- Cards use warm backgrounds, thin borders, soft shadows
- Buttons must be clear and consistent
- Bottom navigation is fixed on parent/staff mobile screens and must not cover content
- Admin tables must be readable and not raw spreadsheet-like

### Brand Logo Rules
- **Shared Component**: Always render the Koinonia Children & Teens logo via the unified `<BrandLogo />` component. Do not hardcode image paths or combine raw "K" icons with separate typed "KOINONIA" text blocks.
- **Contextual Sizing Guidelines**:
  - `landing`: Spacious top-level landing header (height 44px–48px, max-width 260px).
  - `admin`: Sidebar navigation brand area (height 48px, max-width 220px).
  - `parent`: Header layout (height 40px, max-width 160px).
  - `volunteer`: Volunteer checking and event screens (height 36px, max-width 150px).
  - `auth`: Centered authentication layouts (height 64px, max-width 240px).
  - `compact`: App footers, mobile app headers, or utility navigation bars (height 32px, max-width 120px).
- **Fallback Integrity**: In the absence of a configured `site_logo` in landing media settings, the component gracefully renders a premium gold-gradient letter "K" badge alongside refined brand typography.
- **Presentation Controls**: All logo images must use `object-contain` to preserve their native aspect ratios without any vertical stretching or clipping.
- **Preloader Logo Resolution & Flash Prevention**:
  - The application preloader MUST use the exact same official main Koinonia logo that is used on the landing page and role-based screens.
  - Traditional "K" icon fallback or old wordmark fallback is forbidden during preloader entrance if a custom logo has been uploaded.
  - To completely prevent the fallback logo flashing/switching visibly before the custom logo is loaded, the preloader must fetch the landing page settings and preload the custom logo image into the browser cache *before* initiating the logo stage animation.
  - If the custom logo fetch fails or no logo is configured, the preloader must immediately and seamlessly render the official bundled main logo fallback (the gold-gradient "K" badge with refined KOINONIA typography) with no delay, broken icons, or blank spaces.

### Brand Notification & Information Sheets Specifications
To ensure notifications and info drawers meet the Koinonia premium brand standards, all parent notifications, drawers, and modal sheets (such as Help and Safety screens) must adhere to the following design rules:
- **Background Palette**: Soft Ivory (`#FAF8F3` or `#FAF9F6`) only. Do not use generic cold white, plain gray, or black panels for content.
- **Accents & Borders**: Warm, elegant gold accents (`#C59B27`, `#8C6D23`) and soft gold borders (`rgba(197, 155, 39, 0.25)`) to frame content cards.
- **Visual Cards**: Individual sections/FAQs are housed in soft, rounded cards (`rounded-2xl` or `rounded-3xl`) with generous padding and subtle, elegant drop shadows.
- **Typography & Voice**: Headers must use serif display typography with clean contrast, while messages are written in a warm, welcoming, and administrative-professional tone. Avoid technical, robotic, or developer jargon (such as "portal", "system token", "status code", etc.).

### Soft Content Surface Pattern
To ensure a warm, premium, branded experience (avoiding generic SaaS layouts or raw, un-framed inputs sitting directly on the background), all Parent and Volunteer auth/account setup views must be contained within `AuthScreenShell`.
- **Dimensions**: Centered, max-width `640px` (or `maxWidth="md"` wrapper).
- **Background**: Soft ivory / warm off-white, providing an elegant, readable contrast.
- **Borders & Shadows**: Encased in a subtle gold-tinted border (`border: 1px solid rgba(210, 190, 150, 0.35)`), rounded corners (`border-radius: 28px` or `32px` on desktop), and styled with a lightweight, premium depth shadow (`box-shadow: 0 18px 45px rgba(15, 23, 42, 0.05)`).
- **Header Elements**: A sticky, lightweight top bar displaying a clear back button (if navigated from previous screen) paired with the Koinonia serif wordmark to establish brand trust instantly.

## Architectural & No Demo Data UI Rules
- **No Hardcoded Demo Records:** Production UI components must never display mock sample children, dummy parent profiles, or fake QR codes in production.
- **Intentional Empty States:** When a data collection is empty (e.g., no children added yet, no active event passes), the UI must display a clean, reassuring empty card with clear typography and a direct call-to-action button.
- **Media Upload UI & Fallbacks:** Photo upload containers must maintain aspect ratios and show clean loading spinners or progress indicators during upload. If a photo fails to load or is unassigned, render an elegant circular or square badge displaying the user's initials on a warm background (`#EFECE4` with `#715D3A` text). Never display broken image browser icons.

## SEO, Metadata & Social Sharing Guidelines
- **Premium Metadata Copy**: Metadata (such as `<title>` and descriptions) must always align with Koinonia's elegant, welcoming, and high-fidelity tone. Avoid technical, jargon-heavy keywords, spammy keyword stuffing, or robotic titles.
- **Social Media (OG) Banner Design**: The default fallback social preview image (`/social_share.jpg`) must feature an elegant, warm off-white canvas with soft gold border details and subtle family silhouettes. Do not use generic, cold stock photos or empty placeholder patterns.
- **Dynamic Title Standard**:
  - Public pages use literal, inviting, brand-aligned titles (e.g., `'Koinonia Children and Teens Event Registration'`).
  - Private dashboards must never expose individual database IDs, child names, or parent biometrics in page titles or descriptions. They use generic, safe placeholders such as `'Parent Access | Koinonia Children and Teens'` or `'Volunteer Operations | Koinonia Children and Teens'`.
- **Search Engine Isolation**: Ensure all role-based dashboards, authentication paths, and password resets are strictly sealed from indexation via `"noindex, nofollow"` tags to guarantee total user privacy and compliance.

## Administrative Events & Switch Style Specifications
To ensure the administrative event management pages match Koinonia's premium brand:
- **Warm sliding switches:** Toggles must utilize a custom fluid pill shape with a white sliding knob. The active track must highlight in Koinonia's official warm gold color (`#C59B27`) instead of cold tech-blue or purple.
- **Two-Column Editorial Flow:** Complex form structures should be divided into a primary form area on the left and a secondary review/context panel on the right (containing live setup checkers, real parent-view rendering, and safety banners) to organize density beautifully.
- **Table density:** Tables listing age capacity buckets must feature soft borders (`#EAE8E1`) over light, warm backgrounds (`#FAF9F6`), with subtle input indicators and elegant delete triggers.
- **Checklist indicators:** Progress markers use gold-tinted solid check circles (`text-[#C59B27]`) upon completeness to reinforce a sense of warmth and accomplishment.


### Event-Day Attention Resolution Modal Design Guide (v3 Premium)
- **Visuals**: Displays in a spacious modal (`max-w-lg`) with rounded corners (`rounded-3xl`), styled with an ivory background (`#FAF9F6`), thin gold border accents (`#EAE8E1`), and soft drop shadows. Implements proof attribute `data-view-version="volunteer-attention-detail-v3-premium"`.
- **Header**: Compact titled "Attention item" with subtitle "Review the child’s event-day note before continuing" (`data-component-version="volunteer-attention-detail-header-v3"`).
- **Child Summary Layout**: Displays a rectangular portrait photo frame with SafeImage or letter fallback, bold serif headers for child names (`data-component-version="volunteer-attention-child-summary-v3"`). Suffix numbers are stripped securely to display clean human-readable names (`data-component-version="volunteer-attention-safe-child-display-v2"`) and references are separated gracefully into a compact badge (`data-component-version="volunteer-attention-child-reference-v2"`).
- **Attention Reason Card**: Replaced large warning blocks with a calm, descriptive card displaying icon, status pill, and human-friendly reason texts (`data-component-version="volunteer-attention-reason-card-v3"`).
- **Guidance Card**: Technical rules text replaced with human, brand-safe directives guiding volunteer operational boundaries (`data-component-version="volunteer-attention-guidance-card-v3"`).
- **Input Spacing & Form**: Generous text area for volunteer note with strict character limit tracking and calm descriptive guides (`data-component-version="volunteer-attention-resolution-form-v3"`).
- **Action Buttons**: Features clear hierarchical actions. Cancel is quiet, Escalate to admin is outline amber, and Resolve/Verify/Review are primary gold (`data-component-version="volunteer-attention-detail-footer-v3"`). Calls specific live endpoints securely.
- **Safe Error Display**: Inline error banners are displayed gracefully upon failure, avoiding technical error logs or raw stack traces (`data-component-version="volunteer-attention-safe-error-v2"`).


### Volunteer Mobile App Redesign Guidelines (v9 Handover)
- **Visual Principles**: A minimalist, clean, mobile-first experience designed specifically for hand-held performance during events.
- **No Clutter**: Eliminate unrequested widgets, telemetry lists, online status indicators, and system logs.
- **Concise Header**: Features the Koinonia logo on the left, a concise header (such as `KOINONIA` or `CHECK-IN`), and the volunteer profile avatar on the right.
- **Real Name Support**: Welcome greeting must support real-name greetings without hardcoded "Volunteer" fallback. If a name exists, display `Good morning, [Name]`. If not, fallback gracefully to `Good morning` or `Good afternoon` (without trailing commas or empty spaces).
- **SafeImage Stability**: Hero backgrounds and profile avatars use `SafeImage` to load CORS-safe assets and fail gracefully without flickering.
- **Terminology Enforcement**:
  - **Do NOT use**: database, system, workflow, logs, registry, directory, portal, Ministry Portal.
  - **DO use**: event, tools, children, check-in, pickup, attention items, event team.
- **Proof Attributes**:
  - Root active view: `data-view-version="volunteer-dashboard-v9-handover-mobile-app"`
  - Mobile app header: `data-component-version="volunteer-mobile-app-header-v2-handover"`
  - Header avatar: `data-component-version="volunteer-header-avatar-v3-handover-photo"`
  - Welcome greeting: `data-component-version="volunteer-dashboard-greeting-v6-handover-real-name"`
  - Hero card: `data-component-version="volunteer-dashboard-hero-v9-handover-mobile-app"`
  - Hero image SafeImage: `data-component-version="volunteer-dashboard-hero-image-v5-handover-stable"`


