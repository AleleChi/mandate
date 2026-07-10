# Functional & Behaviour Guide

All implementation must strictly align with `/docs/backend-architecture.md`, `/docs/design-style-guide.md`, and the specifications below.

## 1. Product Roles
The application strictly enforces Role-Based Access Control (RBAC) across:
- **Parent or guardian:** Can manage own household, children, pickup persons, and event submissions.
- **Volunteers / Event Team:** Can sign up, request access to teams, manage event day operations, check in children, verify pickups, and view statistics. Also referred to as Volunteer Access.
- **Review Team:** Can review submitted entries, update review statuses, and add review notes.
- **Check-in Team / Event Staff:** Can scan entry passes, view child care notes, and execute gate check-ins.
- **Pickup Team / Event Staff:** Can scan exit passes, verify pickup person photos against child records, and release children.
- **Admin:** Can manage multi-event lifecycles, staff assignments, review queues, messages, and reporting suites.
- **Super Admin:** Full platform governance, system configuration, and integration management.

## 2. Parent Flow
1. **Begin Parent Access:** Enter email to initiate secure registration.
2. **Create parent account:** Set secure password (min 8 chars) and verify contact details.
3. **Check email:** Confirm email address before entering onboarding.
4. **Set up parent profile:** Fill required personal details, upload face photo, and state Koinonia worker involvement.
5. **Add one or more children:** Input core biometric details (DOB, gender, relationship, school class).
6. **Assign care details & pickup person:** Specify medical notes, extra support requirements, and authorized pickup individuals with verified photos.
7. **Send details for review:** Submit child application (`child_event_entry`) for specific event dates.
8. **Follow child status:** Track live progression through review stages.
9. **View event pass:** Access secure QR pass once status reaches *Pass ready*.
10. **Show pass at entry:** Present pass code/QR at physical gates for rapid check-in.
11. **Verify pickup:** Authorize child release only after staff photo identity verification.

## 3. Parent Profile Requirements
- **Full name:** Required (min 2 words).
- **Email:** Required, valid format, unique across users.
- **Phone number:** Required (min 10 digits).
- **WhatsApp number:** Required (can duplicate phone).
- **Home address:** Required (min 5 chars).
- **Preferred contact:** Radio selection ('Email', 'WhatsApp', 'Both').
- **Parent photo:** Clear face photo required; uploaded directly to Object Storage via pre-signed URL.
- **Koinonia worker status:** Segmented boolean selection ('Yes', 'No').
- **Department:** Required if worker status is 'Yes'.

## 4. Child Requirements
- **Full name:** Required.
- **Gender:** Required ('Male', 'Female').
- **Date of birth:** Required; cannot be in the future.
- **Age calculation:** Automatically derived from DOB at runtime.
- **Age group suggestion:** Automatically mapped from calculated age (e.g., Creche / Infants, Toddlers, Primary, Pre-Teens).
- **Child photo:** Required face photo; stored in Object Storage with CDN delivery.
- **Relationship to parent:** Required (e.g., Mother, Father, Guardian).
- **School/class:** Required educational level.
- **Care notes:** Optional medical, dietary, or allergy details.
- **Extra support:** Boolean flag indicating specialized care or attention requirements.
- **Pickup person:** At least one authorized pickup person assigned per event entry.

## 5. Pickup Rules & Identity Verification
- Parents may designate themselves or authorized relatives/guardians as pickup persons.
- Every non-self pickup person record requires: full name, relationship, contact phone, and a clear face photo.
- During exit scanning, staff screens display side-by-side verification photos (Child Photo vs. Pickup Person Photo). Release cannot be marked without photo confirmation.

## 6. Review Status Lifecycle
Every `child_event_entry` transitions through these deterministic review states:
- `draft` — Application started by parent but incomplete.
- `details_sent` — Submitted by parent; pending review team assignment.
- `under_review` — Being evaluated by Review Team.
- `selected` — Approved for capacity allocation, but secure pass is pending (e.g. if the required child photo has not been uploaded or is pending approval). The parent portal displays "Selected (Pass Pending)", and the pass step is not yet marked complete.
- `waiting_list` — Placed on queue due to capacity constraints.
- `not_selected` — Unable to accommodate for current event.
- `pass_ready` — Approved, required pass details are present, and the cryptographic QR pass has been successfully generated and made available to the parent.
- `checked_in` — Child physically scanned and inside event gate.
- `picked_up` — Child safely released to verified pickup person.

## 7. Multi-Event Capabilities
- The platform supports multiple concurrent or sequential events (`events`) with comprehensive administrative control.
- Each event maintains distinct dates, themes, venues, capacity rules, review workflows, passes, and attendance logs.
- **Administrative Events Dashboard:**
  - **Gatherings View:** Allows administrative list filtering of current, upcoming, draft, and past events with live application counts, total capacity, and confirmed seat tallies.
  - **Active Control:** Administrators can promote any upcoming event to become the singular active `current` event at the press of a button (automatically demoting other events).
  - **Archiving:** Events can be securely archived to stop new submissions.
- **Gathering Details Setup & Validation:**
  - **Event Name:** Required field, maximum 120 characters.
  - **Event Group:** Dropdown option determining target audience (e.g., *Children and Teens*, *Young Adults*, *Families*, *Volunteers & Workers*).
  - **Venue:** Required field, maximum 120 characters.
  - **Event Date:** Required field, calendar selection.
  - **Start & End Time:** Required fields; end time must be strictly after start time.
  - **Description:** Optional details, maximum 1000 characters.
- **Parent Access Configuration:**
  - **Access Window:** Start and end datetime stamps controlling parent registration portals. Close stamp must be after start.
  - **Permissions Toggles:** Toggle control for "Parents can create account", "Add more than one child", "Save and finish later", and "Edit details after sending for review".
- **Age Groups & Capacity Limits:**
  - Multiple distinct age groups/brackets can be added per gathering.
  - Individual age groups require a label, min age, max age (min must not exceed max), total head count capacity, and a toggle for "Manual Review" status.
  - Total gathering capacity is computed dynamically as the sum of age group capacities.

- **Current Active Event:**
  - **Name:** The General Assembly
  - **Audience:** Children and Teens
  - **Dates:** 18th to 22nd November 2026
  - **Theme:** More Than Conquerors
  - **Scripture:** Romans 8:37
  - **Time:** 9:00 AM to 7:00 PM

## 8. Frontend & Backend Validation Rules
- **Frontend Validation:** Provides immediate UX feedback before route transitions. Errors render inline directly below inputs with warm warning borders. Browser `alert()` boxes are strictly prohibited.
- **Backend Validation:** Server-side schema enforcement (e.g., Zod) re-validates all payloads before database write operations.

## 9. Staff Scanning & Offline Reliability
- **Gate Operations:** Staff scan opaque SHA-256 pass tokens. System executes serializable database transactions to prevent race conditions.
- **Pre-Event Preloading:** Staff devices download encrypted offline manifests containing active passes for assigned zones prior to gate opening.
- **Offline Mode:** If Wi-Fi/cellular drops, scans log to local IndexedDB with client-generated idempotency keys.
- **Re-synchronization:** Upon connectivity restoration, queued transactions upload to `/api/staff/sync`, processing sequentially and logging conflicts to `offline_sync_records`.

## 10. Strict No Demo Data Rule
- The production build must **never** contain hardcoded sample children, mock parent profiles, or fake demo passes.
- If sample data is required during engineering development, it must reside inside isolated seed scripts (`/src/db/seeds/`) gated by explicit environment checks (`NODE_ENV=development`).
- When a user views an empty collection, the UI must render an intentional, polished empty state guiding next steps.

## 11. Architectural Implementation Rule
Every new screen built must consume data shapes conforming strictly to `/docs/backend-architecture.md`. Frontend modules must not invent isolated data structures that cannot cleanly map to relational database schemas and REST APIs.

## 12. Dual-Audience Landing Page Setup
The Koinonia Children and Teens landing page serves two distinct audiences with a fully responsive layout and streamlined CTAs:
1. **Parents/guardians:** This remains the primary, highly-visible call-to-action (CTA) to encourage smooth and secure child check-in registration.
2. **Volunteers/event team:** Secondary but clearly visible access, styled to avoid visually competing with the main parent CTA.
- **Responsive Header (v2)**: The landing header is responsive across all viewports. Desktop viewports show standard inline navigation and action buttons. On narrower breakpoints (mobile and tablet), the header collapses cleanly into a hamburger menu button on the right of the logo, keeping the header uncluttered and eliminating horizontal overflow.
- **Interactive Hamburger Dropdown Menu**: Clicking the hamburger button displays a vertical drop-down panel with a clean ivory background and golden styling containing:
  1. **Parent Access** (routes to Parent Signup/Home)
  2. **Parent Sign In**
  3. **Volunteer Access** (routes to Volunteer Signup)
  4. **Volunteer Sign In**
- **Clutter-free Hero Section**: Redundant sign-in text links beneath the main action buttons are removed to elevate visual quality, creating a more professional, balanced, and elegant introduction above the fold.
- **Unified Account Logic**: Parent accounts and volunteer accounts are bridged seamlessly. Parents can apply to be volunteers and log in to Volunteer Access under the same account once approved.

## 13. Volunteer Signup & Verification Requirements
- **Public Profile Photo Upload**: Since standalone volunteer signup occurs when signed out, a public, unauthenticated pre-account upload endpoint (`/api/media/public-upload`) is used to handle profile photo storage securely.
- **Verification of Assets**: The server enforces that only real uploaded media IDs mapped to `media_files` are recorded on new volunteer profiles, rejecting temporary browser blob/data URLs to avoid database failures.
- **Pending Review State**: All new volunteer registrations enter a `pending_review` state, restricting them to onboarding updates until approved by an administrator.

## 14. Volunteer Sign-In & Verification Resend Policies
- **Strict Endpoint Verification**: The system verifies credentials, profiles, email confirmation status, and role configurations in sequence to prevent unverified logins or credential leakage.
- **Redirection Logic**: Upon successful sign-in, the endpoint returns a deterministic `nextRoute` matching the volunteer profile status (e.g., `/volunteer/pending-review` for `pending_review`, `rejected`, and `suspended` statuses, and `/volunteer/event` for `active`).
- **Strict Email Verification Resend**:
  - Verification resend requests are rate-limited with a 60-second cooldown period.
  - The email dispatch returns success only if the active email provider returns a valid unique ID.
  - Generates diagnostic logs tracking the process end-to-end to ensure transparency and auditability.

## 15. Volunteer Password Reset Journey
- **Initiation**: A volunteer can request a password reset via the "Forgot password?" link on the Volunteer Sign In page.
- **Privacy & Safety Constraints**: To prevent account enumeration, both success and unknown email lookups return a generic, friendly response: *"If this email is connected to Volunteer Access, a reset link has been sent. Please check your inbox and spam folder."*
- **Rate Limiting**: Password reset requests are restricted to a 60-second cooldown period per email. If requested too quickly, the system returns a `RESEND_COOLDOWN` error containing the remaining cooldown time.
- **Secure Tokens**: Tokens are generated cryptographically (SHA-256 hash), expire after 60 minutes, and are marked as one-time use (`used_at` set upon success).
- **Complexity Enforcement**: The new password must contain at least 8 characters, with a minimum of one letter and one number.
- **Security Posture**: No automatic sign-ins are permitted upon password reset. The user must proceed to the sign-in page to enter their new credentials explicitly.

## 16. Volunteer Status Notification Emails
- **Under Review Email Notice**: Triggered automatically after a volunteer successfully verifies their email address via the `/verify-email` endpoint. Employs the `sendVolunteerUnderReviewEmail` helper, notifying them that their application is undergoing administrator review.
- **Approval & Active Access Email Notice**: Triggered immediately when an administrator approves a volunteer profile via `/api/volunteer/admin/volunteers/:volunteerId/approve`. Employs the `sendVolunteerApprovedEmail` helper, including their designated team and a direct sign-in link to access event operations.

## 16a. Hardened Landing Page & App Media Manager & Upload Safety
- **Strict Processing Guarantee**: If an image upload fails to process (e.g. sharp processing error, invalid image headers), the upload request must fail immediately with a `422 Unprocessable Entity` status.
- **No Unprocessed Fallbacks**: Under no circumstances will raw, unprocessed buffers be written to disk, published, or stored inside the public-facing configuration.
- **Administrative Error Isolation**: If processing fails, the Admin Landing Page Manager displays a friendly, clear message: *"We could not process this image. Please try another JPG, PNG, or WebP file."* Raw system stack traces or internal server error logs are strictly hidden from the administrator.
- **Configuration Persistence Safety**: No database updates or file records are stored for failed uploads. The active configuration must preserve the previous or default fallback state.
- **Production Ephemeral Storage Boundary**:
  - Silently falling back to ephemeral disk storage in production environments when Cloudinary fails or is missing is strictly forbidden.
  - In production, if Cloudinary credentials are unconfigured or fail to respond, the upload fails immediately with a descriptive, actionable message: *"Media storage is not fully configured. Please connect Cloudinary or persistent storage before uploading images."*
  - Fallbacks to local disk are allowed only in development/staging, or if persistent local disk storage is explicitly declared via env `LOCAL_MEDIA_PERSISTENT=true`.
- **Dashboard & Event Hero Performance Optimization**:
  - The three central dashboard and event coverage hero images (`parent_dashboard_hero`, `volunteer_dashboard_hero`, `default_event_hero`) are resized to a maximum width of 1600px with a high-fidelity WebP format to reduce bandwidth consumption.
  - To prevent Layout Shift (CLS) on the home screens, above-the-fold hero images inside `ParentHomeView` and `VolunteerEventDashboardView` are configured with `loading="eager"`, `decoding="async"`, and `fetchPriority="high"` properties.
  - **Prioritized Dynamic Cover Resolutions**:
    - **Parent Dashboard**: Resolves hero media in the following order of priority:
      1. Configured custom `parent_dashboard_hero` slot url.
      2. Configured custom `default_event_hero` slot url.
      3. Committed production-safe fallback asset image (`parentHeroImg`).
    - **Volunteer Dashboard**: Resolves hero media in the following order of priority:
      1. Configured custom `volunteer_dashboard_hero` slot url.
      2. Configured custom `default_event_hero` slot url.
      3. Committed production-safe fallback asset image (`volunteerHeroImg`).
  - **Robust One-Time Fallback System (SafeImage)**:
    - Custom resolved URLs are processed by `SafeImage` which attempts to resolve and load the image using CORS-safe, backend-prefixed origins (to avoid falling back on CDN/Netlify origins) via the `resolveMediaUrl` helper.
    - Utilizes standard browser `onLoad` and `onError` image events directly on the native `<img>` element instead of detached `Image()` constructor states to guarantee thread-safe rendering cycles in React.
    - If the dynamic/custom image fails to load or resolves with a non-image content-type, `SafeImage` dynamically switches the `currentSrc` to the designated secondary fallback image (`fallbackSrc`) exactly once. This avoids endless rendering loops, prevents layout shifts or flashes of unstyled content, and guarantees that role dashboards never display blank spaces or broken image placeholders.
- **Secure File System Upload Serving (/uploads/:filename)**:
  - Local uploaded settings media are securely served from `data/media` through the unauthenticated GET `/uploads/:filename` route.
  - Strictly prevents directory traversal (rejections of `..`, `%2e%2e`, `/`, `\`), blocks unauthorized file extensions (accepting only `.jpg`, `.jpeg`, `.png`, `.webp`), hides local absolute paths, and sends precise MIME types with secure Cache-Control headers (`public, max-age=31536000, immutable`).
- **Rigid Slot Type Validation**: Slots are heavily partitioned by expected media type. Attempting to upload a video format (MP4/WebM/MOV) into an image slot, or an image format (JPG/PNG/WebP) into a video slot, is rejected immediately on the frontend and blocked on the backend.
- **File Integrity and Size Bounds**:
  - Maximum image file size is capped strictly at 5MB for admin media settings.
  - The backend performs dual validation checking both the mime-type header AND the actual file extension matching (`.jpg`, `.jpeg`, `.png`, `.webp`), preventing renaming exploits.
- **Visual Identity Preservation**:
  - The header logo uses `object-contain`, ensuring the aspect ratio remains perfectly unaltered without stretching, cropping, or overflowing.
  - When a custom logo is active, the logo image is rendered exclusively. The separate typed word "KOINONIA" is hidden beside it to elevate visual polish.
  - Double-click (desktop) and double-tap (mobile) shortcuts on the logo are preserved at all times for easy administrator portal navigation.
  - **Preloader Logo Flash Prevention**:
    - The startup preloader is structurally decoupled from raw initial mounts to prevent logo flickering or fallback flashes.
    - Before animating the logo stage, the preloader fetches public landing page configuration settings and preloads the resolved custom `site_logo` URL.
    - The logo entrance animation only begins once the logo image is fully cached, ensuring immediate, smooth rendering of the correct custom asset.
    - If no custom logo exists or the image failed to load, the preloader instantly resolves to render the new official main logo fallback (the gold-gradient "K" badge with refined KOINONIA typography) with no broken image states.
    - Showing a raw "K" icon or fallback wordmark before replacing it with the custom uploaded logo is strictly forbidden.

## 17. Two-Step Child Check-In Flow (Lookup & Finalize)
To prevent accidental and duplicate entries at the event gates, checking in or checking out a child requires a secure, two-step lookup and confirmation process:
1. **Pass/Child Lookup (Step 1)**: Scanning an entry QR pass, entering a manual pass code, or tapping a child in the directory does **not** trigger an immediate check-in. It executes a look-up request (`POST /api/volunteer/pass/lookup`) to retrieve the registered child and parent details.
2. **Visual Matching Review (Step 2)**: The volunteer is presented with a detailed "Child found" screen containing:
   - **Child Identity Details**: Large photo, age group, class room assignment, and primary parent profile contact details.
   - **Care Notes Block**: Distinctive yellow/red warning containers highlighting allergies, medical alerts, or extra support instructions.
   - **Authorized Pickup Section**: Dedicated card showing the photo, relationship, and contact action triggers for the designated collection person to ensure safe check-outs.
3. **Manual Finalization**: The volunteer must manually tap the prominent action button (**MARK CHECKED IN** or **CONFIRM RELEASE**) to write the attendance record transaction to the backend database.
4. **Scan Reset**: Tapping **SCAN ANOTHER PASS** clears the current child review details and resumes camera/manual scanning mode immediately.

## 18. Volunteer Reports & Audit Ledger
- **Access Control**: Only active and approved volunteers (`status = 'active'`) can access the Reports interface.
- **Aggregated Live Metrics**: Real-time event statistics (Expected, Inside, Picked Up, Attention) are aggregated from active event registries.
- **Distribution Analysis**: Children distribution is broken down across standard age groups (Creche, Preschool, Ages 4-6, Ages 7-9, Teens) to monitor zone capacities.
- **Chronological Logs**: Shows the last 10 entries (check-ins) and last 10 pickups (releases) in real-time, including verifying staff details and authorized pickup persons.
- **Final Session Report**: Volunteers can enter observations, notes, or incident reviews. Submitting logs the report securely to the audit table (`volunteer_event_reports`) and displays the last submitted author and timestamp for transparent tracking.

## 18a. Volunteer Event Dashboard (v9 Handover)
To match the approved high-fidelity mobile experience, the Volunteer Event Dashboard (`/volunteer/event`) employs a premium, highly focused, single-view mobile layout optimized for event-day performance:
- **Top Header Bar**: Custom-styled mobile header (`data-component-version="volunteer-mobile-app-header-v2-handover"`) containing the compact Brand Logo on the left, a concise page title (`KOINONIA`) in the center, and the Volunteer Profile Avatar on the right (`data-component-version="volunteer-header-avatar-v3-handover-photo"`). The avatar resolves the user's photo using the following priority order: `volunteerProfile.photoUrl`, `profile.photoUrl`, `user.photoUrl`, `profilePhotoUrl`, and falls back to letter initials inside `SafeImage` only if no valid photo exists. There are no unrequested telemetry elements, ready-to-scan pills, sign-out buttons, or network statuses.
- **Hero Image Card**: Styled on a warm ivory canvas (`data-component-version="volunteer-dashboard-hero-v9-handover-mobile-app"`) with an upper image container hosting the SafeImage element (`data-component-version="volunteer-dashboard-hero-image-v5-handover-stable"`). It uses CORS-safe asset caching to completely prevent image flickering or disappearing.
- **Real Name Greeting**: A greeting header (`data-component-version="volunteer-dashboard-greeting-v6-handover-real-name"`) reading "Good morning / Good afternoon / Good evening, [First Name]". If no real first name is available or if it equals "Volunteer", the greeting gracefully falls back to "Good morning / Good afternoon / Good evening" without trailing commas, trailing spaces, or raw placeholders.
- **Primary Actions**: Side-by-side action buttons on the hero content card to instantly launch checking tools: "Start check-in" (opens camera and starts scanning entry passes) and "Open pickup" (directs to checked-out verification).
- **Core Metrics Grid**: A 2x2 soft-bordered bento grid displaying live stats (Expected, Checked In, Picked Up, and Attention Items) synchronized directly from the database event endpoints.
- **Needs Attention List**: Displays live event-day issues requiring immediate attention (e.g. medical alerts, missing photos) with prominent action buttons to resolve or review.
- **Strict Terminology Enforcement**: Private volunteer dashboards strictly avoid technical jargon (such as "portal", "system", "database", "logs", etc.) and focus entirely on human-centered language.
- **Proof Attributes**: Enforces `data-view-version="volunteer-dashboard-v9-handover-mobile-app"` on the root of the active dashboard view.

## 18b. Volunteer Attention details modal (v3 Premium)
To match Koinonia's premium brand experience, the Volunteer Attention Details modal has been completely overhauled:
- **Calm, Human Wording**: All rigid, technical language has been replaced. Words like "database", "system", "workflow", "logs", "registry", "directory", "Event-Day Access Control", and "local verification checkmarks" are strictly banned. Instead, natural, human guidance is used.
- **Child Summary Card**: Formatted cleanly using `formatChildNameAndRef` to strip numeric/timestamp suffixes from generated names, displaying them beautifully (`data-component-version="volunteer-attention-safe-child-display-v2"`). It separates reference numbers into a clean badge (`data-component-version="volunteer-attention-child-reference-v2"`) and renders photos safely via `SafeImage` (`data-component-version="volunteer-attention-child-summary-v3"`).
- **Attention Reason Card**: Displays clear, calm icons and descriptive texts for specific attention types, such as Missing Pickup Photos, Age Reviews, or Medical Notes (`data-component-version="volunteer-attention-reason-card-v3"`).
- **Guidance Card**: Instructs volunteers on clear, event-day duties and operational boundaries without technical terms (`data-component-version="volunteer-attention-guidance-card-v3"`).
- **Interactive Forms & Footer Actions**: Features a note input with length indicators and a clear button hierarchy (Cancel, Escalate, and Mark reviewed/Resolve/Verify) (`data-component-version="volunteer-attention-detail-footer-v3"`).
- **Durable Endpoints**: Preserves full connectivity to live endpoints, ensuring counts and statuses update correctly for both volunteers and administrators.
- **Safe Error Display**: Catches and maps raw technical errors or permission failures into user-facing, elegant banners (`data-component-version="volunteer-attention-safe-error-v2"`).

## 18c. Volunteer Navigation & Session Safety
To protect active sessions and prevent event-day disruptions:
- **Volunteer Dashboard/Home Icons**: Home and Brand Logo icons in the header must strictly navigate back to the main volunteer dashboard `/volunteer/event`. They must never trigger logout/signOut actions or redirect to public landing pages.
- **Volunteer Navigation Map**:
  - Events Tab: `/volunteer/event`
  - Scan Tab: `/volunteer/scan`
  - Children Tab: `/volunteer/children`
  - Reports Tab: `/volunteer/reports`
  - Desk Tab: `/volunteer/team-alerts`
  - Profile Tab: `/volunteer/profile`
- **Logout Isolation**: Sign out / logout actions must be isolated exclusively to the designated "Sign out" button on the Volunteer Profile page. Clicking any navigation tabs, icons, or headers must never clear authentication tokens, modify session states, or clear localStorage/sessionStorage.

## 19. Admin Access & Event Command Centre
- **Shortcut Entry**: Double-clicking (desktop) or double-tapping (mobile) the Koinonia logo on the Landing Page routes users directly to `/admin/sign-in`. This is an exclusive navigation shortcut and does not bypass authentication.
- **Admin Password Reset**: Admins can request reset links via a dedicated admin recovery route `/admin/forgot-password`. Tokens expire in 1 hour and are single-use.
- **Role Enforcement**: Access is protected using the `AdminProtectedRoute` block. Admin routes are strictly guarded; the server-side middleware also validates JWT claims and filters by `admin`, `super_admin`, or `team` roles.
- **Live Command Overview**:
  - **Bento Stats Grid**: Presents dynamic counts of Registered Children, Under-Review Registrations, Approved Passes, and On-Site Checked-In children.
  - **Triage Alerts**: Alerts are automatically displayed to the administrator when volunteer profiles are awaiting security review.
  - **Demographic Split**: Aggregates live count distribution of infants, juniors, and pre-teens across designated rooms or zones.
  - **Recent submissions**: Lists real-time registrations and statuses fetched directly from database.

## 20. Admin Account Management & Team Onboarding
- **Self-Service Password Reset (Profile Security)**:
  - Accessible via **System Settings** in the Command Centre sidebar.
  - Enforces current password validation before writing updates.
  - New passwords must be at least 8 characters, contain at least one letter and one number, and must not duplicate the current password.
- **Super Admin Invitations**:
  - Exclusive capability of the `super_admin` role.
  - Direct email input generates a secure cryptographic token stored with a 48-hour expiration period.
  - Dispatches an onboarding email containing a secure link to the `#/admin/accept-invite?token=<token>` route.
- **Secure Activation (`AdminAcceptInviteView`)**:
  - Verifies the validity of the invitation token.
  - Guides the invited user to set a strong password.
  - Promotes the user record status from `invited` to `active`, authorizing instant sign-in.
- **Administrative Directory**:
  - Lists active and invited team accounts with corresponding role levels (`super_admin`, `admin`, `team`) and real-time status tracking.

## 21. Mobile Command Experience
- **Collapsible Drawer Sidebar**:
  - Mobile layouts collapse the full antique dark navigation sidebar behind a tactile hamburger button.
  - Slide-over overlay with backdrop blur ensures a seamless native application experience.
  - Elements adhere to minimum 44px touch targets on mobile viewports.
- **Adaptive Layout Structures**:
  - Metric bento cards cascade cleanly into single-column layouts on mobile screens.
  - Demographics tables support smooth horizontal swiping via isolated scroll containers.

## 22. Admin Review Board Refinement
The Review Board contains highly refined companion insight cards:
- **Active Selection**: Displayed in the right-side insight panel. Shows details of the currently selected application from the review queue with a larger `w-16 h-20` image-led layout. Includes parent, class, school, phone, and optional parent notes, and a gold-accented "Open full review" action button. If no child is selected, a calm humanized empty state is rendered.
- **Room Seating Capacities**: Displays the dynamic, computed age group capacities from the event database. Features soft, elegant progress bars that fill with a warm gold color for normal capacities and shift to orange/red as limits are reached or exceeded. If capacity data is not set, a clean fallback is displayed.
- **Data Attributes**: Verified via hidden data-attributes (`data-view-version="admin-review-board-v2-card-refined"`, `data-component-version="admin-review-active-selection-v2-refined"`, and `data-component-version="admin-review-capacity-card-v2-refined"`).

## 23. Children Records Module
The children records module provides a real-time, comprehensive directory of all registered kids:
- **Metrics Summary**: Real-time stats counting Total children, Selected, Checked in, Inside, and Picked up.
- **Search & Filters**: Debounced text search (by child name, parent name, or parent phone number) paired with status quick-filters (Inside, Not arrived, Picked up, Medical note, Missing pickup photo, Below event age, Special support).
- **Desktop Grid**: Displays child avatar, full details, age, group badge, parent name, pickup person info, review status, entry status, and pickup status. Clicking on any record transitions cleanly to the full detail child review view.
- **Mobile Cards Layout**: Completely adaptive mobile-responsive bento cards with touch targets conforming to minimum 44px bounds, optimized layouts, and collapsible views.
- **No Mock Wording**: Uses precise, approved brand terminology and is securely locked down behind admin-only auth layers. Verified with dedicated data-attributes (`data-view-version="admin-children-records-v1"`, etc.).

## 24. Attendance Registry Module (V2 - Stitch Complete)
The attendance registry module offers real-time, high-fidelity metrics and tracking of children event check-ins, inside status, and parental pickups:
- **Route Authorization**: Bound to `#/admin/attendance` or initial tab state `attendance` inside `AdminOverviewView`. Standard routes are protected by the `AdminProtectedRoute` to enforce only admin, super-admin, or team access.
- **Metrics Dashboard**: Computes six key real-time event counts: Expected, Checked In, Inside, Picked Up, Not Arrived, and Needs Attention. Features a left-accented colored band layout with golden highlights. Uses real database stats, showing 0 or empty arrays when no records are available.
- **Status Filter Tabs**: Allows quick toggling between All, Inside, Picked Up, Not Arrived, and Needs Attention. Each status filter filters rows dynamically on the frontend or backend.
- **Live Attendance Registers**: Displays key columns: Child Name, Age Group, Parent/Guardian, Status badge, Location label, Care Notes, and Last Activity timestamp. Clicking on rows opens the corresponding full review application in a new panel. Maintains the full table header grid even when rows are empty to prevent visual voids.
- **Attendance by Age Group**: Displays a dynamic matrix matching standard group splits. Dynamically aggregates Expected, Checked In, Inside, Picked Up, and Not Arrived counts per group, with a bottom-weighted aggregate Total row sum. Maintains the structure with an empty state if no age-group data is loaded.
- **Quick Actions & Activity Logs**:
  - *Quick Actions*: Instant shortcuts to pre-filter specific inside, not arrived, or needs attention sub-groups reactively.
  - *Recent Scans*: Shows the 10 most recent check-in/pickup scan events, alerting workers if a care flag is active. Uses real database scan activity.
  - *Team Activity*: Displays an audit log tracking which volunteer or team member checked in or picked up a child, including name and relative event timestamp.
- **Mobile Responsive Layout**: Standardized table layout is hidden on mobile viewports, converting rows into beautiful, easily scannable mobile cards with clear labels, care alerts, larger action target bounds, and zero horizontal scroll overflow.
- **Data Integrity & Exporting**: Uses real-time database queries without preloaded dummy names or placeholders. Supports full on-the-fly CSV generation and downloads for reporting. Identified via dedicated data-attributes (`data-view-version="admin-attendance-v2-stitch-complete"`, `data-component-version="admin-attendance-stats-v2"`, `data-component-version="admin-attendance-tabs-v2"`, etc.).

## 22. Admin Reports & Performance Metrics (`#/admin/reports`)
- **Access Control & Routing**: Route `/admin/reports` is guarded using the central `AdminProtectedRoute` block. API endpoints (`/api/admin/reports/*`) are secured via server-side role validation checking for `admin`, `super_admin`, or `team` privileges.
- **Report Segments (Tabs)**:
  - *Pre-event Report*: Generates registration metrics, expected capacity counts, and care log parameters prior to event start.
  - *Live event Report*: Displays active operational counts of present children, checked-in ratios, and missing pick-up photo counts.
  - *End-of-event Report*: Compiles total attendance ratios, picked-up percentages, final segment notes, and completed records.
- **Dynamic Grid & Metrics**: Loads real database values. Standard metrics include Registered Children, Selected Admitted list, Checked In count, and Needs Attention items.
- **Care & Attention Panel**: Lists detailed counts of active flags: Medical notes, Extra support, Missing pickup photo, and Manual reviews.
- **Interactive Outcomes & Visualizers**: Displays attendance outcome percentages through horizontal gold progress indicators that reflect live statistics.
- **Export Registry**: Support direct physical file downloads of CSV documents representing:
  - Event Outcome Summary
  - Event Attendance Sheet
  - Absent Children Log
  - Medical & Support Log
  - Authorized Pick-up Register
  - Admitted Children Roster
  Any other format (PDF/Excel) is deferred and triggers an elegant notification to user that the file is being prepared.
- **Director Segment Notes**: Backed by a relational database table (`admin_report_notes`), directors can write observations and record notes for each specific segment, persisting updates instantly with a loading and success feedback loop.
- **Responsive Architecture**: Fully responsive grid layout utilizing staggered entry transitions, safe padding, and touch-optimized bounds.

## 23. Admin Messages & Delivery Center (`#/admin/messages`)
- **Access Control & Routing**: Secure route restricted to administrators and super_admins. Direct route and API calls (`/api/admin/messages/*`) are protected with server-side validation.
- **Wording and UI Standards**: Centered strictly on clear, literal human labels to avoid technical, SaaS-style over-engineering or AI-slop:
  - Page Title: **Messages**
  - Page Subtitle: **Send clear updates to parents by Email, WhatsApp, or both.**
  - Composer Title: **Send message**
  - Preview Title: **Preview**
  - Recent Activity Title: **Recent activity**
  - Sender Settings Title: **Sender settings**
  - Token Helper Title: **Insert details**
- **Top Metric Cards**: Clean, compact, serif-styled cards summarizing:
  - **Messages sent**
  - **WhatsApp sent**
  - **Email sent**
  - **Failed** (with soft red accent styling)
  - **Pending** (with warm amber accent styling)
- **Recipient Group Chips**: Horizontally scrollable navigation pills allowing administrators to click and filter/target:
  - All parents, Selected children, Under review, Waiting list, Not selected, and Pass ready.
- **Dynamic Content Composer**:
  - Drops down standard approved templates (Pass ready, Review update, Waiting list update, Dismissal pickup reminder, General announcement).
  - Integrates simple "Insert details" tokens ({Parent name}, {Child name}, {Event name}, {Pass link}, {Review link}, {Pickup time}, {Support contact}) that can be placed directly at the cursor location.
- **Provider Status & Integrity Checks**:
  - Dynamically returns providerStatus with emailEnabled, whatsappEnabled, senderName, fromEmail, and replyToEmail.
  - Channels are disabled honestly when corresponding keys (Resend/SMTP or Twilio) are missing.
  - No mock/fake success reports are logged; counts and activity represent true provider statuses.
- **Sender Settings Security**:
  - SMTP password details are never returned or shown.
  - Since encryption-at-rest is not present, credential saving is not exposed on the front-end, prompting with: "SMTP settings must be configured securely on the server."
- **Two-Step Dispatch Validation**:
  - Prompts with a secure confirmation dialog: "Send this message?" specifying the exact recipient group, target channel, recipient count, subject, and sender email.
  - Transmission is blocked if target recipient count is 0 or chosen provider is unconfigured.
- **Mobile Responsive Design**: Fits seamlessly into compact screens without horizontal overflow, utilizing scrollable chips and collapsible preview panels.

## 24. Admin Settings & System Configuration (`#/admin/settings`)
- **Route & Access Protection**: Protected under the `AdminProtectedRoute` block. Full access control restricted to `admin` and `super_admin` roles.
- **Aesthetics & Styling Guidelines**: Follows the Koinonia brand style guide with serif headings, an ivory/white card layout, thin borders, soft cards, warm gold accents, and a calm, clean typographic hierarchy. Avoids technical SaaS jargon and uses clear, literal labels.
- **Sub-Tab Navigation**:
  - **Parent Access & Registration Controls**: Configures toggling of parent login registration states, specifying optional medical/support care consents, and displaying mandatory safety requirements (home address, WhatsApp number).
  - **Team Access & Event Staff Roles**: Displays a directory of authorized event staff and coordinators with full role levels (`super_admin`, `admin`, `team`, `volunteer`). Includes an interactive invite form (Super Admin exclusive) to send onboarding tokens via email. Allows updating active roles and auditing permissions.
  - **Message Channels Integration Status**: Displays current status for Email (SMTP/Resend) and WhatsApp (Twilio) channel configurations. Configures global sender name signatures and reply-to email addresses.
  - **Profile Security**: Admin-specific form to update password with current password verification and 8-character complexity rules. Included securely as a calm, right-side companion card for contextual workflows.
- **Data Attributes**: Verified via:
  - `data-view-version="admin-settings-v2-ui-refined"`
  - `data-component-version="admin-settings-parent-access-v2-refined"`
  - `data-component-version="admin-settings-event-team-v1"`
  - `data-component-version="admin-settings-message-channels-v1"`
  - `data-component-version="admin-settings-profile-security-v2-refined"`

## 25. Stitch Volunteer Check-in Screen layout (`#/volunteer/scan`)
- **Stitch Design Implementation**: Centered mobile-first container (`max-w-md mx-auto`) offering a premium check-in dashboard matching Screenshot A aesthetics:
  - **Dynamic Context Header**: Features a back arrow navigating to `/volunteer/event`, bold "Check-in" title, event sub-label ("The General Assembly Children and Teens"), and an amber "Ready to scan" pill indicator.
  - **Tall Portrait Viewfinder Card**: Features an aspect ratio of `3/4` inside an ivory-bordered white card container. Displays a live camera feed with an antique gold corner overlay and bouncing laser horizontal sweep, or a blur-filtered warm background overlay with a "Scan child pass" trigger button. Shows device manual fallback notices if no cameras are available.
  - **Manual Entry Trigger**: Compact secondary block toggling the manual code entry form (`data-component-version="volunteer-check-in-manual-pass-v2-stitch"`) to verify cards directly via alphanumeric inputs.
  - **Integrated Child Directory Search**: Flat search form styled with a clean magnifying glass prefix to locate children in real time.
  - **Historic Last Checked-In Card**: Interactive card showing the last successfully verified child and precise relative timestamp derived from `recentScans` data.
  - **Serif Metrics Trio**: Features a horizontal grid detailing "Expected", "Checked in", and "Waiting" statistics styled in high-contrast serif typography.
- **Attributes**: Verified via:
  - `data-view-version="volunteer-check-in-v2-stitch"`
  - `data-component-version="volunteer-check-in-header-v2-stitch"`
  - `data-component-version="volunteer-check-in-scan-card-v2-stitch"`
  - `data-component-version="volunteer-check-in-manual-pass-v2-stitch"`
  - `data-component-version="volunteer-check-in-search-v2-stitch"`
  - `data-component-version="volunteer-check-in-last-v2-stitch"`
  - `data-component-version="volunteer-check-in-metrics-v2-stitch"`

## 26. Stitch Volunteer Child Found Screen layout (`#/volunteer/scan` with child)
- **Stitch Design Implementation**: Mobile-first container (`max-w-md mx-auto`) showing the child verification screen after lookup or scanning:
  - **Dynamic Context Header**: Custom sticky header (`data-component-version="volunteer-child-found-header-v1-stitch"`) displaying back-arrow button to exit lookup state, "Check-in Portal" title, event sub-label, and gold "Ready to scan" pill indicator (fully removing Online/ONLINE and green dots).
  - **Scan Successful Banner**: Mini banner displaying a checkmark and uppercase "Scan successful" label, and a serif "Child found" heading (`data-component-version="volunteer-child-found-title-v1-stitch"`).
  - **Child Identity Card**: Displays the child photo filling the `4/3` aspect-ratio container, full name, "Pass Ready" status badge, calculated age in years, age group class, and gender (`data-component-version="volunteer-child-identity-card-v1-stitch"`).
  - **Care Notes Card**: Sections for Medical note (colored light-peach if present, default gray if not), Allergies, and Extra support with human empty fallback text ("No allergy added", "None required") (`data-component-version="volunteer-child-care-notes-v1-stitch"`).
  - **Entry Status Card**: Displays attendance status ("Not checked in yet" or "Already checked in"), helper text, a gold primary "Mark checked in" action calling the live `/check-in` endpoint, a secondary "Scan another pass" button, and a photo confirmation warning (`data-component-version="volunteer-child-entry-status-v1-stitch"`).
  - **Authorized Pickup Card**: Showcases authorized pickup photo, name, relationship, and contact number (`data-component-version="volunteer-child-authorized-pickup-v1-stitch"`).
- **Attributes**: Verified via:
  - `data-view-version="volunteer-child-found-v1-stitch"`
  - `data-component-version="volunteer-child-found-header-v1-stitch"`
  - `data-component-version="volunteer-child-found-title-v1-stitch"`
  - `data-component-version="volunteer-child-identity-card-v1-stitch"`
  - `data-component-version="volunteer-child-care-notes-v1-stitch"`
  - `data-component-version="volunteer-child-entry-status-v1-stitch"`
  - `data-component-version="volunteer-child-authorized-pickup-v1-stitch"`

## 27. Stitch Volunteer Checked-In Success Screen layout (`#/volunteer/scan` after success)
- **Stitch Design Implementation**: Mobile-first container (`max-w-md mx-auto`) showing the success state after checking in:
  - **Dynamic Context Header**: Sticky header (`data-component-version="volunteer-checked-in-header-v1-stitch"`) with back-arrow button to dismiss success state, "Check-In Portal" title, and settings button.
  - **Title Block**: Displays a centered checkmark in gold (`#8F7020`), a serif "Checked in" heading, and descriptive sub-label.
  - **Child Summary Card**: Horizontal card showing child photo/icon, name, age, and class/age group tag.
  - **Entry Details Card**: Shows UTC check-in time, volunteer name, and entrance gate / check-in point.
  - **Care Notes Card**: Highlights Medical, Allergies, and Extra support notes if present with beautiful custom icons.
  - **Metrics Card**: Interactive card showing current inside child count and remaining expected counts.
  - **Action Controls**: Gold "SCAN ANOTHER PASS" button, "VIEW CHILD PROFILE" secondary button, and a text button to navigate back to the event home.
- **Attributes**: Verified via:
  - `data-view-version="volunteer-checked-in-success-v1-stitch"`
  - `data-component-version="volunteer-checked-in-header-v1-stitch"`
  - `data-component-version="volunteer-checked-in-title-v1-stitch"`
  - `data-component-version="volunteer-checked-in-child-card-v1-stitch"`
  - `data-component-version="volunteer-checked-in-entry-details-v1-stitch"`
  - `data-component-version="volunteer-checked-in-care-notes-v1-stitch"`
  - `data-component-version="volunteer-checked-in-metrics-v1-stitch"`
  - `data-component-version="volunteer-checked-in-actions-v1-stitch"`

## 28. Stitch Volunteer Pickup Screen layout (`#/volunteer/pickup` home)
- **Stitch Design Implementation**: Mobile-first container (`max-w-md mx-auto`) offering a premium pickup dashboard matching Screenshot A aesthetics:
  - **Top Header**: Custom-styled header (`data-component-version="volunteer-pickup-header-v1-stitch"`) with back arrow navigating to the dashboard, "Pickup" title, event sub-label, and gold "Ready to scan" pill indicator (no ONLINE/Online/green dot).
  - **Scan Viewfinder**: A 3:4 aspect-ratio scanning viewport card (`data-component-version="volunteer-pickup-scan-card-v1-stitch"`) showcasing gold accent framing corners. Contains a centered "Scan child pass" pill button when camera is inactive, and streams live camera feeds with a scanning sweep line when activated.
  - **Manual Entry Trigger**: Compact toggle button and collapsible input sheet (`data-component-version="volunteer-pickup-manual-pass-v1-stitch"`) for typing 6-character alphanumeric pass reference codes.
  - **OR Divider**: Standard aesthetic spacing divider (`data-component-version="volunteer-pickup-divider-v1-stitch"`) centering a clean "OR" text label.
  - **Search Field**: Full-width input bar (`data-component-version="volunteer-pickup-search-v1-stitch"`) for looking up children by name or parent phone number, routing smoothly to the Directory on submission.
  - **Confirm Before Release Alert**: High-visibility attention card (`data-component-version="volunteer-pickup-warning-v1-stitch"`) warning workers to check the child photo and pickup person before marking release.
  - **Stitch Metrics**: A highly readable 3-column stats panel (`data-component-version="volunteer-pickup-metrics-v1-stitch"`) displaying live counts for INSIDE, PICKED UP, and ATTENTION, bound directly to the database.
  - **Last Picked Up**: Dedicated log card (`data-component-version="volunteer-pickup-last-v1-stitch"`) displaying details of the most recently released child with photo, name, age, release time, and a green check mark.
- **Attributes**: Verified via:
  - `data-view-version="volunteer-pickup-v1-stitch"`
  - `data-component-version="volunteer-pickup-header-v1-stitch"`
  - `data-component-version="volunteer-pickup-scan-card-v1-stitch"`
  - `data-component-version="volunteer-pickup-manual-pass-v1-stitch"`
  - `data-component-version="volunteer-pickup-divider-v1-stitch"`
  - `data-component-version="volunteer-pickup-search-v1-stitch"`
  - `data-component-version="volunteer-pickup-warning-v1-stitch"`
  - `data-component-version="volunteer-pickup-metrics-v1-stitch"`
  - `data-component-version="volunteer-pickup-last-v1-stitch"`

## 29. Stitch Volunteer Pickup Success Screen layout (`#/volunteer/pickup` on success)
- **Stitch Design Implementation**: Centered mobile-first container (`max-w-md mx-auto`) showing the success state after confirming pickup release:
  - **Sticky Top Header**: Features a back button, "Pickup" serif title, event sub-label, and gold "Ready to scan" badge (no ONLINE or green dot).
  - **Centered Success Block**: Displays a green check icon block inside a rounded container with the serif title "Picked up" and a descriptive, dynamic release confirmation message.
  - **Child Summary Card**: Compact card detailing the child's photo, full name, age label, and class/age group badge.
  - **Pickup Details Card**: Shows Picked up at, Picked up by, Relationship, Confirmed by, and Pickup point, dynamically populated from the API response with safe fallbacks.
  - **Checked Before Release Card**: Features side-by-side photo comparison of Child and Pickup Person, overlaid with labels, and checkmarks verifying identity matches.
  - **Action Buttons**: Custom gold-styled "Scan another pass", a secondary white "View child record", and "Back to Event Home" link.
  - **Stitch Metrics Card**: A 3-column stats panel displaying updated counts for Children inside, Picked up, and Needs attention.
- **Attributes**: Verified via:
  - `data-view-version="volunteer-pickup-success-v1-stitch"`
  - `data-component-version="volunteer-pickup-success-header-v1-stitch"`
  - `data-component-version="volunteer-pickup-success-title-v1-stitch"`
  - `data-component-version="volunteer-pickup-success-child-card-v1-stitch"`
  - `data-component-version="volunteer-pickup-success-details-v1-stitch"`
  - `data-component-version="volunteer-pickup-success-verification-v1-stitch"`
  - `data-component-version="volunteer-pickup-success-actions-v1-stitch"`
  - `data-component-version="volunteer-pickup-success-metrics-v1-stitch"`

## 30. Stitch Volunteer Child Profile Screen layout (`#/volunteer/children` with child)
- **Stitch Design Implementation**: Centered mobile-first container (`max-w-md mx-auto`) showing the detailed child profile matching Screenshot A & B aesthetics:
  - **Dynamic Context Header**: Sticky header (`data-component-version="volunteer-child-profile-header-v1-stitch"`) with a back arrow navigating to `/volunteer/children`, bold "Child profile" title, and section sub-label ("The General Assembly") (no ONLINE/Online/green dot indicators).
  - **Child Identity Card**: Centered card showing child's photo (using real `child.photoUrl` if available or branded fallback), overlapping child status badge ("Inside", "Not arrived", "Picked up"), full name in refined serif typography, age label, and class/age group badge (`data-component-version="volunteer-child-profile-identity-v1-stitch"`).
  - **Quick Facts Row**: 3-column row displaying Gender, Parent name, and Contact number, mapping to real values or "Not provided" (`data-component-version="volunteer-child-profile-facts-v1-stitch"`).
  - **Primary Action Buttons**: Displays "Start pickup" button (triggers checkout release flow) and "Scan another pass" button (routes to `/volunteer/scan`) (`data-component-version="volunteer-child-profile-actions-v1-stitch"`).
  - **Today Status Card**: Grid row detailing Checked in at {time} / Not checked in yet, and Picked up at {time} / Not picked up yet (`data-component-version="volunteer-child-profile-today-v1-stitch"`).
  - **Care Notes Card**: Sections for Medical note, Allergy, and Extra support with honest empty fallback text ("No medical note added", "No allergy added", "No extra support added") (`data-component-version="volunteer-child-profile-care-notes-v1-stitch"`).
  - **Parent Card**: Displays primary parent photo (or branded initials fallback), name, relationship, contact phone number, and click-to-call or click-to-WhatsApp actions (`data-component-version="volunteer-child-profile-parent-v1-stitch"`).
  - **Pickup Person Card**: Displays authorized pickup person details, photo, name, relationship, phone number, and phone action link (`data-component-version="volunteer-child-profile-pickup-person-v1-stitch"`).
  - **Event Details Card**: Highlights Session, Event, Date, and Time details safely mapped from dynamic event data (`data-component-version="volunteer-child-profile-event-details-v1-stitch"`).
  - **Today’s Activity Card**: Live timeline checking entry check-in status (Checked in at {time} by {volunteer name}) and pickup status (Picked up at {time} by {volunteer name} or Pickup waiting) (`data-component-version="volunteer-child-profile-activity-v1-stitch"`).
- **Attributes**: Verified via:
  - `data-view-version="volunteer-child-profile-v1-stitch"`
  - `data-component-version="volunteer-child-profile-header-v1-stitch"`
  - `data-component-version="volunteer-child-profile-identity-v1-stitch"`
  - `data-component-version="volunteer-child-profile-facts-v1-stitch"`
  - `data-component-version="volunteer-child-profile-actions-v1-stitch"`
  - `data-component-version="volunteer-child-profile-today-v1-stitch"`
  - `data-component-version="volunteer-child-profile-care-notes-v1-stitch"`
  - `data-component-version="volunteer-child-profile-parent-v1-stitch"`
  - `data-component-version="volunteer-child-profile-pickup-person-v1-stitch"`
  - `data-component-version="volunteer-child-profile-event-details-v1-stitch"`
  - `data-component-version="volunteer-child-profile-activity-v1-stitch"`

## 31. Stitch Volunteer Reports Screen layout (`#/volunteer/reports`)
- **Stitch Design Implementation**: Mobile-first container showing the premium event reports dashboard matching the Stitch Reports design:
  - **Header Block**: Custom sticky header (`data-component-version="volunteer-reports-header-v1-stitch"`) with a back arrow navigating to `/volunteer/event`, "Children's Ministry" header title, large bold serif "Reports" title, and subtitle "The General Assembly Children and Teens" (no status indicator / no ONLINE status).
  - **Today Summary Cards Grid**: Four-column grid (`data-component-version="volunteer-reports-summary-v1-stitch"`) displaying "Expected", "Checked in", "Picked up", and a highlighted warm-accented "Inside" stats count mapped from dynamic backend fields.
  - **Needs Attention Widget**: Centered container with real-time counters for "Medical note pending", "Missing pickup photo", and "Manual review required" styled beautifully inside a custom border container (`data-component-version="volunteer-reports-activity-v1-stitch"`). Includes an interactive toggle button opening a rich Needs Attention List detail view.
  - **Age Groups section**: Cards listing Age Groups ("Ages 1-3", "Ages 4-6", "Ages 7-9", "Ages 10-12") with columns for Boys, Girls, and dynamic Inside counts.
  - **Entry & Pickup summary blocks**: Clean card rows displaying "Checked in" vs "Not arrived" and "Picked up" vs "Still inside".
  - **Action Button Row**: Highlights "View children inside" (deep gold button routing to `/volunteer/children` with inside filter pre-active) and "View needs attention" (expanding active modal review).
  - **Final Event Report Card**: Rich textarea (`data-component-version="volunteer-reports-notes-v1-stitch"`) for submitting audit observations/reviews, with last submitted report notes displayed below if active.
- **Attributes**: Verified via:
  - `data-view-version="volunteer-reports-v1-stitch"`
  - `data-component-version="volunteer-reports-header-v1-stitch"`
  - `data-component-version="volunteer-reports-summary-v1-stitch"`
  - `data-component-version="volunteer-reports-activity-v1-stitch"`
  - `data-component-version="volunteer-reports-notes-v1-stitch"`
  - `data-component-version="volunteer-bottom-nav-v2-stitch"`

## 32. Stitch Volunteer Profile Screen layout (`#/volunteer/profile`)
- **Stitch Design Implementation**: A mobile-first, high-fidelity profile container designed to match the Stitch design:
  - **Aesthetic Rectangular Photo**: The profile photo uses a rectangular portrait frame with rounded corners (`rounded-2xl`) and a warm gold border (`border-[#C59B27]`), rather than a circle.
  - **Self-Service Edit Trigger**: The identity card includes a prominent "Edit profile" action button allowing volunteers to adjust their own submitted onboarding details on demand.
  - **Redesigned Parent-Style Onboarding Edit Form**: A stunning mobile-first form designed to match the clean ivory standards of the parent setup flow. Includes segmented option buttons for "Koinonia worker" and "Serving experience" status, styled input containers with thick bottom accent borders, proper stacking layout for responsive mobile views, and the complete elimination of legacy outdated titles.
  - **Secure Boundary**: The edit endpoint and form explicitly reject or make read-only all admin-controlled volunteer status attributes (Approval Status, Assigned Team, Assigned Area, Access Scope, and Admin Notes) to preserve platform integrity.
  - **Immediate Local Synchronization**: On successful form submission, the UI displays a clean toast and triggers an immediate background data refresh, synchronizing the profile view instantaneously.
- **Attributes**: Verified via:
  - Profile View Root: `data-view-version="volunteer-profile-v2-stitch-handover"`
  - Portrait photo block: `data-component-version="volunteer-profile-photo-rect-v1"`
  - Edit trigger: `data-component-version="volunteer-profile-edit-entry-v1"`
  - Edit Modal container: `data-view-version="volunteer-edit-profile-v2-parent-style"`
  - Edit Header block: `data-component-version="volunteer-edit-profile-header-v2-parent-style"`
  - Edit Portrait photo block: `data-component-version="volunteer-edit-profile-photo-v2-parent-style"`
  - Edit Personal details: `data-component-version="volunteer-edit-profile-personal-v2-parent-style"`
  - Edit Service details: `data-component-version="volunteer-edit-profile-service-v2-parent-style"`
  - Edit Experience/Notes: `data-component-version="volunteer-edit-profile-notes-v2-parent-style"`
  - Edit Actions footer: `data-component-version="volunteer-edit-profile-actions-v2-parent-style"`
  - Event assignment card: `data-component-version="volunteer-edit-assignment-card-v2-parent-style"`

## 33. High-Fidelity Event Assignment Read-Only Card
- **Branded Design Overhaul**: Replaced the previous technical-looking, harsh dark-bordered "Official Assignment (Read-only)" card inside the Volunteer Edit Profile form with a premium, user-facing card:
  - **Visual Styling**: Rendered with a soft ivory background (`bg-[#FAF8F4]`), a thin warm gold border (`border-[#E5D5AE]/60`), rounded corners (`rounded-2xl`), and a subtle locked badge labeled "Admin managed" paired with a calm lock icon.
  - **Human-centric Copy**: Uses polished labels ("Approval", "Team", "Area", "Access") instead of rigid database/technical terms, with user-friendly formatting for status, team, area, and scope (e.g. replacing underscores and formatting as "Pending review", "Check-in only", etc.).
  - **Secure read-only architecture**: Entirely display-only and secure; fields remain unmodifiable on both frontend and backend.
- **Attributes**: Verified via:
  - `data-component-version="volunteer-edit-assignment-card-v2-parent-style"`

## 34. Administrative Profile Soft-Delete & Restoration Flow
- **Strict Archival Rule (No Hard-Delete)**: To maintain audit integrity and keep historical logs, attendance records, pickup logs, and event submissions safe, administrators are strictly prohibited from hard-deleting parent or volunteer profiles from the primary database. Instead, they must perform a **Soft-Delete/Archive** action.
- **Parent Archiving & Restoration**:
  - **Tabs View**: The Parents module under Admin settings splits profiles into "Active Parents" and "Removed Parents" sections.
  - **Archive Action**: An administrator can archive an active parent profile by clicking "Remove parent" and entering a required reason. This triggers `POST /api/admin/parents/:id/remove`, updating `is_deleted = 1` and recording deletion metadata (`deleted_at`, `deleted_by`, `delete_reason`).
  - **Restoration Action**: An administrator can restore an archived parent profile via the "Removed Parents" tab by clicking "Restore parent". This triggers `POST /api/admin/parents/:id/restore`, reverting `is_deleted = 0` and recording restoration metadata.
- **Volunteer Archiving & Restoration**:
  - **Tabs View**: The Volunteers registry splits profiles into "Active Volunteers" and "Removed Volunteers" tabs.
  - **Archive Action**: Active volunteer applications and approved profiles can be archived by clicking "Remove volunteer" and entering a required reason. This triggers `POST /api/admin/volunteers/:id/remove`, setting `is_deleted = 1` and storing metadata.
  - **Restoration Action**: Archived volunteer profiles can be restored via the "Removed Volunteers" tab or directly from the details modal, triggering `POST /api/admin/volunteers/:id/restore` and reverting `is_deleted = 0`.
- **Details Modal Synchronization**:
  - Opening the details modal of an archived volunteer display a clear red "Archived Profile Warning" detailing who archived the record, when, and the stated reason. All assignment dropdowns and review notes are disabled to prevent edits on archived records.
  - Action buttons inside the modal transition to "Restore Volunteer" for archived records, and offer a "Remove volunteer" action for active records.
- **Wording & Styling Compliance**:
  - The word **Remove** (e.g. "Remove parent", "Remove volunteer") is used exclusively in the UI instead of "Delete" to emphasize that this is a non-destructive archive action.
  - Standard ivory layouts, backdrop blur confirmations, and warm gold/emerald cues are maintained across all action modals.

## 35. Parent Profile Help and Safety Guides
- **Parent Profile Actions**: Inside the Parent Profile view (`#renderProfileTab`), there are dedicated action rows for "Help and questions" and "Safety information". Clicking these rows opens dedicated, parent-facing mobile-friendly sheets.
- **Help Row**: Styled with `data-component-version="parent-profile-help-row-v1"`.
- **Safety Row**: Styled with `data-component-version="parent-profile-safety-row-v1"`.
- **Interactive Sheets**:
  - **Help and questions**: Opens a bottom sheet displaying common FAQs. Styled with `data-view-version="parent-help-v1-brand"`.
  - **Safety information**: Opens a bottom sheet displaying event safety guidelines. Styled with `data-view-version="parent-safety-v1-brand"`.
- **Aesthetic Mobile Panels**: Both sheets are designed as fully responsive, scrollable bottom-sheets with ivory background cards, warm gold accents, and elegant serif headings. Each sheet utilizes `data-component-version="parent-profile-info-sheet-v1"` on the sheet panel.

## 36. Safe SEO & Privacy Architecture
- **Dual-Visibility Guardrails**: The application enforces a strict SEO visibility separation between public and private/role-based areas:
  - **Public Landing Page (Indexable)**: The root public page (`/`) is fully indexable, optimized, and discoverable. It features high-quality meta tags, a clean canonical link, OpenGraph social properties, a responsive viewport, and JSON-LD structured data (Organization schema, Event schema, and Website schema).
  - **Private Dashboards and Auth Screens (Strictly Non-Indexable)**: Parent, volunteer, check-in, review, and administrator dashboards—along with all registration, sign-in, check-email, verify-email, reset-password, and new-password views—must **never** be indexed by search engines. These pages are strictly configured with a robots directive of `"noindex, nofollow"`.
- **Centralized SEO Controller**: All dynamic head state (title, meta tags, script tags) is governed on the client-side by a reusable, high-fidelity `<Seo />` component built with custom state-restoration logic. This component automatically sanitizes and removes stale meta tags upon route changes, preventing leaks or cross-route pollution.
- **Privacy Enforcement**:
  - No private data (such as child biometrics, medical notes, check-in statuses, or parent full names/addresses) is ever rendered or leaked inside HTML meta elements, headers, or client-side JSON-LD markup.
  - Opaque SHA-256 tokens are used instead of database auto-incrementing IDs to prevent ID harvesting or route scanning.
- **Robots and Sitemap Rules**:
  - **robots.txt**: Configured at the root to disallow access to hash-routed sub-routes (`/#/admin`, `/#/parent`, `/#/volunteer`) and physical path redirects (`/admin`, `/parent`, `/volunteer`), ensuring search engine crawlers do not traverse private areas.
  - **sitemap.xml**: Lists only the safe, public, and indexable landing page, preventing crawler indexing on private route variants.
- **Cache Control**: The static configuration on Netlify redirects all spa traffic via `/public/_redirects` and serves optimal CDN cache-control headers via `/public/_headers` (re-validating `index.html` immediately while storing static assets), preventing browser-side metadata stale-cache errors.


## 37. Unified Notifications & Secure Update Center
- **Scoping & Access Governance**: To ensure data privacy and prevent security leaks, parents can only see notifications linked explicitly to their parent profile ID or to children belonging to their household. Technical error terms (like "database", "system", "operational", "logs") are strictly prohibited.
- **Resilient Merging & Deduplication**: The Parent Home dashboard pulls a merged feed of generic announcements and individual-specific reminders. If duplicate alerts exist in both tables, the portal automatically filters out duplicates and displays the richer individual-specific copy.
- **Composite ID Schema**: The API serves composite IDs in the format `notifications:id` or `parent_notifications:id`. The read handlers parse these prefixes to execute targeted database updates atomically.
- **Polite & Calm Error Handling**: If a connection or API error occurs, technical errors (such as "Connection problem") are masked. Instead, a clean, human-friendly, polite error banner is displayed: `"We could not load your updates. Please try again."`
- **Atomic Read-All Action**: The "Mark all read" action dispatches a single atomic `POST /api/notifications/read-all` request to update all records in one fast database transaction, rather than looping individual requests.
- **Empty State Presentation**: When no notifications are active, the center displays the heading `"No updates yet"`.


## 38. Hardened Mobile Volunteer Scanner & Manual Fallback Flow
- **Deduplication Scan Guard**: Built a robust, real-time look-up deduplication engine utilizing `useRef` to govern scan cooldown states. It guarantees that subsequent rapid scans or duplicate frames do not trigger multiple redundant database calls.
- **Single-Screen Transition State**: Replaced stacking popups or toast notifications with a smooth, direct state transition to the single "Child Found" review screen. The camera is stopped immediately (`stopScanning()`) upon a successful match to guarantee that the scanner is not running in the background.
- **Smart Camera Fallback**: On load, if the camera is unavailable on the device, permissions are denied, or no media devices are found, the app completely hides the tall portrait scanning viewfinder card. Instead, it displays only the beautifully styled manual pass code verification card directly with no extra clicks required.
- **State Restoration**: Centralized scanner state cleanup via `handleResetScannerState` ensuring that all refs (`isLookupInFlightRef`, `hasSuccessfulScanRef`, `lastScannedCodeRef`, `lastScanAtRef`) and active stream instances are completely cleared before resuming scan mode, preventing permanent lockout or frozen screens.


## 39. Permanent Deletion & Anonymization Architecture
- **Two-Stage Deletion Guardrail**: To protect active rosters and prevent accidental data loss, active parents and active volunteers cannot be deleted directly. They must first be soft-removed (archived), which places them in the "Removed" tabs of their respective management sections.
- **Safety Pre-conditions**: A parent cannot be permanently deleted if they have active children registered on any rosters. The system will block the deletion and return a clear, polite notification.
- **Anonymization & Token Revocation**: Permanent deletion is executed via secure, one-way anonymization on the backend:
  - Account email address is replaced with a random, non-identifiable placeholder to prevent key collision.
  - Password hash and active authentication tokens are completely cleared, logging out any current sessions immediately.
  - Personal details, profile fields, address, and phone numbers are reset, and the role is changed to a restricted removed role (`removed_parent` or `removed_volunteer`).
- **Confirmation Modals**: The admin interface features a rigorous multi-step confirmation:
  - A modal detailing the permanent nature of the deletion.
  - A mandatory deletion reason text field.
  - A validation challenge where the administrator must type the exact word `"DELETE"` to proceed.


## 40. Admin Children & Care Management
- **Single-Screen Row Actions**: The main Children management view supports immediate actions from the list table via a responsive, vertically stacked dropdown menu:
  - **Decisions**: Administrators can change statuses directly to Select, Decline (Not Selected), or Waitlist.
  - **Reopen Review**: Returns the registration to under-review status for supplementary evaluation.
  - **Pass Management**: Generate and issue digital event passes or revoke active passes instantly.
  - **Removal & Restoration**: Soft-remove active children with a specified reason, or restore soft-removed children directly from the Archived filter.
- **Unified Profile Editor**: Inside the Child Review screen, clicking "Edit Details" opens a high-fidelity modal that allows editing the entire child packet, parent profile, and authorized pickup details inside a single, unified transaction:
  - **Child Packet**: Updates full name, gender, date of birth (automatically recalculating age and age group), school class, and school name.
  - **Care Sheets**: Toggles medical conditions / allergies, updates medical details, toggles special support requirements, and saves care notes.
  - **Parent Profile**: Updates full name, phone number, WhatsApp, and home address.
  - **Authorized Pickup**: Updates pickup person's name, relationship to child, and phone number.


## 41. Volunteer Attention Resolution and Escalation
- **Event-Day Attention Items**: To support safety-critical situations on event-days, active volunteers can view a list of attention-required items (such as missing pickup photos, medical updates, and age review flags).
- **Short Reference IDs**: To maintain a production-grade user experience and avoid cluttering the interface with raw database keys, full child UUIDs are hidden from volunteer-facing UI elements. Instead, the UI displays the child's name followed by a short, safe reference (e.g., `(Ref: 123456)` derived from the last 6 characters of their database ID).
- **Safety Boundaries**: Volunteers do not have full administrative capabilities to modify core child files. Instead, they can verify items locally on event-day by performing physical checks at the check-in or checkout gates.
- **Resolution Flow**:
  - When reviewing an attention-required item, volunteers must enter a detailed event note documenting what physical actions were taken.
  - Tapping 'Resolve' or 'Verify' updates the item status and records the note, the volunteer's identity, and the timestamp.
  - Tapping 'Escalate' raises the item status, automatically flagging it for coordinator oversight while keeping the child safe.


## 42. Parent Passes Overview & Multi-Child Pass Lifecycle
- **Unified Overview Panel**: Parents can access the multi-child overview page within the Passes tab. Instead of showing a single full pass immediately, the page summarizes the active state of all household children dynamically:
  - **Summary Badges**: Real-time status counters calculate totals for each distinct state ("Pass ready", "Waiting", "Draft") directly from the household child list.
  - **Status-Driven Actions**: Children are categorized and displayed under state-specific cards:
    - *Pass ready*: Displays child photo, name, event details, a small QR preview, and a prominent "View pass" button. Tapping the button opens the high-fidelity secure digital pass modal containing the large QR code, full parent and pickup details, and "Save/Share" triggers.
    - *Under review / Waiting*: Displays child name, age, and class, explaining that the pass will be prepared upon selection. Provides a "View status" button to navigate directly to the status page.
    - *Draft*: Displays child details with a "Continue details" button to finish the profile setup page.
- **Data Integrity**: All details are pulled dynamically from live backend endpoints. Empty states are rendered beautifully with clean illustrations and clear next-step guides if no children are registered.

## 43. Parent Review Details Screen and Validation Flow
- **Specific Missing-Details Panel**: If any required field is missing from any section of the child’s application or the parent’s profile, a prominent validation panel (`data-component-version="parent-child-review-validation-v2-specific"`) is shown at the top of the Review details screen.
- **Grouped Missing Items**: Missing fields are grouped cleanly by section. Each section displays the specific missing fields alongside an "Edit" action button (`data-component-version="parent-review-fix-action-v1"`) that takes the parent directly back to the correct step in the registration form.
- **Section-Level Badging**: Each section card (`data-component-version="parent-review-section-status-v1"`) shows its own real-time status:
  - *Completed*: All required fields are filled.
  - *Needs update*: Required fields in this section are missing, accompanied by an inline bulleted list of the exact items that need fixing.
  - *Optional details empty*: Shown alongside "Completed" if only optional fields (like school name or optional WhatsApp) are unassigned.
- **Draft Persistence (Save for Later)**: The "Save for later" action (`data-component-version="parent-review-save-later-v1"`) allows parents to save partial, incomplete child drafts at any time without triggering validation errors. All entered fields and uploaded photos are securely preserved in the database so the parent can return to complete the process later.
- **Send for Review Controls**: Tapping "Send for review" (`data-component-version="parent-review-submit-validation-v1"`) performs high-fidelity client-side validation that perfectly mirrors server-side validation (`validateChildDraftStep`). If validation fails, submission is blocked, a friendly error notification is displayed, and the page smooth-scrolls to the validation summary panel.

