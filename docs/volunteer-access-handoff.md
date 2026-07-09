# Volunteer Access & Secure Media Upload Handoff Document

This document summarizes the changes, architecture, and flows implemented to secure the Volunteer Access registration flow and fix PostgreSQL database insertion issues caused by temporary blob/data URLs.

## 1. Problem & Root Cause Analysis
During standalone (signed-out) volunteer registration, the earlier implementation used a two-step flow:
1. The client first uploaded the photo via a public-upload endpoint to generate a backend media file reference.
2. The user filled the rest of the form and submitted a JSON payload containing the file reference ID.

This approach was fragile and suffered from critical issues:
- **UX Frustration**: When a user selected a photo, the UI immediately displayed "Photo added" based on the local browser preview, even though the backend upload was still in progress or had failed. This led to submit failures where users were told "The photo has not finished saving. Please try saving the photo again, then continue." despite the UI stating the photo was ready.
- **Complexity**: Background network timeouts or premature form submission attempts caused registration to fail because the photo ID did not exist in the database yet.
- **React 19 Warning Noise**: In some components, properties like `loading` were accidentally passed down to native DOM elements, triggering React 19 console warning noise.

---

## 2. Architecture & Solution Implemented

We have refactored the volunteer signup to work like a standard account creation form using **single-request multipart/form-data submission**:

### A. Client-Side Image Preview & State Separation
- **`PhotoUploadBox` (in `previewOnly` mode)**:
  - When `previewOnly` is set to `true`, the component avoids initiating any background network request to `/api/media/public-upload`.
  - It generates a local object URL to display the image preview instantly to the user and displays "Photo selected".
  - It triggers a new `onFileSelected` callback to deliver the raw `File` object to the parent form (`VolunteerCreateAccountView.tsx`).

### B. Single-Request Multipart Submission
- **Form State (`VolunteerCreateAccountView.tsx`)**:
  - Validations are streamlined. The profile photo is considered ready as soon as `photoRef` is set and the raw `selectedPhotoFile` is held in local state.
  - On clicking "Submit", a `FormData` object is constructed and appended with all form fields (`fullName`, `email`, `phone`, etc.) along with the actual photo file under the key `photo`.
  - It issues a single, unified call to `api.volunteer.createAccountWithPhoto(formData)`.

### C. Backend Multer Processing & Transactional Creation
- **Endpoint (`POST /api/volunteer/create-account` in `src/server/routes/volunteer.ts`)**:
  - Protected with `upload.single('photo')` middleware (multer).
  - Handles parsing of both multipart text fields and the binary file.
  - If a file is uploaded, it is sent to Cloudinary using our existing `uploadMedia` helper.
  - The returned Cloudinary metadata is saved directly to `media_files`.
  - Inside a secure database **transaction**, it creates:
    1. The `users` record.
    2. The `volunteer_profiles` record, referencing the newly created media file ID.
    3. The `media_files.owner_user_id` update linking the media file back to the newly created user.

---

## 3. Brand Naming Uniformity
To maintain a high-quality product vibe, brand terms have been standardized:
- **"Volunteer Portal"** -> **"Volunteer Access"**
- **"Parent Portal"** -> **"Parent Access"**

---

## 4. React 19 DOM Attribute Warnings Fix

### A. Problem Description
Upon visiting or submitting pages on React 19, the browser console would report DOM validation warnings:
`Received %s for a non-boolean attribute %s. If you want to write it to the DOM, pass a string instead... loading`

### B. Root Cause
Custom wrapper components (like `<Button isLoading={loading}>` or `<Input loading={loading}>`) passed extra properties via Rest/Spread parameters (`...props`) directly onto the underlying DOM elements (e.g. `<button {...props}>` or `<input {...props}>`), which are not valid standard DOM attributes.

### C. Resolution Implemented
We hardened the core common components (`Button.tsx`, `Input.tsx`, and `AuthFormField.tsx`) by explicitly destructuring the `loading` property:
1. **`src/components/common/Button.tsx`**: Destructured `loading = false` along with `isLoading`. Updated disabling logic: `const isButtonDisabled = disabled || isLoading || loading;`
2. **`src/components/common/Input.tsx`**: Destructured `loading` to capture and swallow it before spreading props on the `<input>` element.
3. **`src/components/common/AuthFormField.tsx`**: Destructured `loading` in the arguments list to isolate it from the rest of the native input attributes.

This ensures perfect React 19 compliance across all views and completely eliminates DOM attribute warning noise.

---

## 5. Local Testing & Verification Instructions

### Step 1: Start the Local Environment
1. Run `npm run dev` to boot both the Vite development server and the backend Express API.
2. Verify that the server binds to `http://localhost:3000`.

### Step 2: Access Standalone Volunteer Signup
1. Navigate to `http://localhost:3000/#/volunteer/create-account`.
2. Select a profile photo (`.jpg`, `.png`, or `.webp`).
3. Verify that the preview appears instantly and the label reads **Photo selected**. No network requests are fired yet.

### Step 3: Verify Single-Request Submission
1. Complete all required fields. Ensure that the submit button stays disabled until all fields are complete and a photo is selected.
2. Click **Submit for Review**.
3. Confirm from the Network tab that a single `POST /api/volunteer/create-account` request is dispatched containing the form parameters and the photo file in a multipart/form-data payload.
4. Verify that the user is successfully created, the photo is uploaded, and the database transaction assigns ownership cleanly.

---

## 6. Email Verification & Resend Architecture (Phase 2 & 3)

To resolve the issue where volunteers did not receive their verification email and parent endpoints were being called incorrectly, we have upgraded the architecture with a volunteer-specific isolated email service and dedicated routes:

### A. Dedicated Email Helper (`src/server/services/email.ts`)
- Implemented `sendVolunteerVerificationEmail(params)` which reuses the existing `sendEmail` transport (Resend/SMTP), but configures:
  - **Volunteer-Specific Subject**: `Confirm your email for Volunteer Access`
  - **Volunteer-Specific Body & CTA Copy**: Formatted with brand-approved, high-trust wording focused on serving the Children and Teens event team. Avoids any system-internal terms like `portal`, `registration`, `system`, or `token`.
  - **Volunteer-Specific Footer**: `Koinonia Children and Teens • Volunteer Access`

### B. Volunteer Account Creation Flow Upgrade
- **Route**: `POST /api/volunteer/create-account`
  - Leverages the new `sendVolunteerVerificationEmail` to deliver confirmation links pointing specifically to `#/volunteer/verify-email?token=<token>`.
  - Upgraded error-handling: Instead of silently swallowing mail service exceptions or failures, the endpoint returns explicit `emailSent: true` or `emailSent: false, emailMessage: <msg>` to the frontend client. This ensures the client knows immediately if they need to suggest manual resending.

### C. Isolated Resend Endpoint
- **Route**: `POST /api/volunteer/resend-verification`
  - Dedicated public endpoint for volunteers.
  - Generates secure volunteer-specific links pointing specifically to `#/volunteer/verify-email?token=<token>`.
  - Validates and normalizes email syntax.
  - Automatically expires any older, unused verification tokens for that user.
  - **Delivery Guarantee**: Returns `emailSent: true` **only** if the email provider successfully confirms dispatch and returns a valid `providerId` (e.g., Resend `data.id` or Nodemailer `messageId`).
  - **Error Handling**: On provider failure, returns an explicit `502 Bad Gateway` error (`EMAIL_SEND_FAILED`) instead of falsely reporting success.
  - **Privacy Safeguard (Generic Success)**: If the email address is unknown or doesn't have a volunteer profile, it returns `{ success: true, generic: true, emailSent: false }` to prevent user enumeration.
  - **Masked Logging**: Email addresses are masked (e.g., `te***t@example.com`) when logging to protect user privacy. Raw, normalized email addresses are used exclusively for sending and are **never** passed masked to the provider.
  - **Parent Flow Preserved**: The parent resend flow in `/api/auth/resend-verification` is completely untouched and preserved.

### D. Upgraded Frontend Verification View (`src/views/VolunteerVerifyEmailView.tsx`)
- **No-Token "Check Your Email" State**: If a user is redirected immediately after sign-up (or unverified login) without a token, the view presents an elegant, calm **"Check your email"** state prompting them to check their inbox. It avoids triggering scary, misleading "Missing Verification Link" errors.
- **Dedicated Resend Integration**: The resend button is re-wired to call `api.volunteer.resendVerification` rather than incorrectly calling the parent-specific `api.auth.resendVerification` endpoint.
- **Prepopulated Email UX**: If the email is passed from the sign-up or sign-in screens via the search query parameters (`?email=<email>`), it is shown prominently to the user and used automatically during resend requests.
- **Strict Response Mapping**:
  - Displays a green success banner *"A fresh confirmation link has been sent..."* **only** when `response.emailSent === true`.
  - Displays a neutral notice *"If this email is connected to Volunteer Access..."* for `response.generic === true`.
  - Displays a green notice *"This email is already confirmed..."* for `response.alreadyVerified === true`.
  - Displays a dedicated error banner on `EMAIL_SEND_FAILED` or other error statuses.

---

## 7. Email Deliverability & Debugging Guideline
If the frontend UI confirms success (`emailSent: true`) but no email arrives:
1. **Check the Log**: Retrieve the `providerId` from the backend success trace log.
2. **Consult Provider Logs**: Search for the corresponding `providerId` in your Resend or SMTP provider dashboard.
3. **Verify Status**: Confirm whether the email status is *Sent*, *Delivered*, or *Bounced*.
4. **Deliverability vs Code Success**: Code-level success guarantees that the email was successfully accepted by the provider's API. Actual mailbox delivery is subject to domain reputation, DNS records (SPF, DKIM, DMARC), and client-side spam filters. Always advise the user to check their Spam folder.

---

## 7. Updated Local Verification Steps

### Step 4: Verify Email Send Status after Registration
1. Complete a registration form.
2. Observe if the API returns `{ emailSent: true }` or a warning if the email dispatch failed.
3. Verify that the URL updates to include `#/volunteer/verify-email?email=<user-email>`.

### Step 5: Verify Resend Functionality
1. On the check email screen, click **Resend confirmation email**.
2. Confirm that a POST request is issued to `/api/volunteer/resend-verification`.
3. Confirm that old tokens are expired and a new email is dispatched using the volunteer access template.

---

## 8. Already Verified Resend Safeguards
To optimize system operations and avoid sending redundant confirmation tokens:
- **Safeguard Route**: If `api.volunteer.resendVerification` is called for an email address that is already confirmed and verified, the backend returns `{ success: true, alreadyVerified: true }` immediately. No new token is written to the database, and no duplicate emails are queued.
- **Frontend Response Handling**:
  - `src/views/VolunteerVerifyEmailView.tsx` and `src/views/VerifyEmailView.tsx` both handle the `alreadyVerified` response code by displaying a styled green alert box.
  - A prominent call-to-action button, "Proceed to Sign In", is rendered to redirect verified users directly to the authentication page.

---

## 9. Advanced Onboarding Review Panel (`VolunteerPendingReviewView.tsx`)
Rather than showing a generic "Under Review" state, the pending review view has been upgraded into a premium onboarding command screen:
- **Submitted Details Grid**: Displays all raw form data submitted by the applicant (full name, phone, WhatsApp number, worker status, department, and child-care experience) so they can verify accuracy.
- **Secure Image Retrieval**: Renders the applicant's submitted headshot safely via `/api/media/files/:fileId` without exposing full Cloudinary credentials.
- **Onboarding Status Steps**: Highlights a visual timeline of the onboarding funnel:
  1. *Account Registered* (Complete)
  2. *Email Verified* (Complete)
  3. *Admin Approval* (Pending - Animated loading spinner)
- **Role Switching**: If the volunteer has a primary Parent profile, a premium "Go back to Parent Home" option is provided.

---

## 10. Automatic Journey Routing & Guards (`src/App.tsx`)
We hardened the `VolunteerProtectedRoute` inside the main application router:
- **Active / Approved Redirect**: Active or approved event team members are automatically routed to the active dashboard (`/volunteer/event`). If they attempt to access `/volunteer/pending-review`, they are seamlessly intercepted and directed to their dashboard.
- **Pending Protection**: Pending review applicants are strictly guarded and cannot bypass `/volunteer/pending-review` to access active event tools.
- **Fallback Guarding**: Non-volunteer authenticated accounts (such as parents who haven't registered as volunteers) are gracefully routed back to `/parent/home` if they attempt to force-visit `/volunteer/*` routes.

---

## 11. Debounced Local Draft Saving (`VolunteerCreateAccountView.tsx`)
To prevent data loss from accidental browser reloads or mobile network drops:
- **Form Persistence Hook**: Inside `VolunteerCreateAccountView.tsx`, a reactive hook monitors form inputs (`fullName`, `email`, `phone`, `whatsapp`, `preferredTeam`, etc.).
- **500ms Debounce**: Debounces inputs by 500 milliseconds before writing the serialized JSON payload into `localStorage`.
- **7-Day Expiry Check**: On mount, if a draft is located, it evaluates `timestamp` against a 7-day threshold. If it has expired, it is automatically discarded; otherwise, it restores all input fields.
- **Clean Submission**: Once account creation is successfully completed, the local storage draft is purged from the user's browser.

---

## 12. Surgical Sign-In & Verification Resend Debugging (July 2026)
We completed a surgical update to address sign-in routing issues, strict delivery truth enforcement, brand-safe copy alignment, and comprehensive diagnostic logging:
1. **Surgical Verification Log Tracking**:
   - Added production-safe logging to `POST /api/volunteer/sign-in` and `POST /api/volunteer/resend-verification` tracking masked email, user lookup status, profile lookup status, password comparison result, token creation state, email sending status, and outcome codes.
   - Strictly avoided logging sensitive credentials, raw passwords, or full raw email strings.
2. **Strict Resend Delivery Enforcements**:
   - Upgraded the resend verification logic to require a valid unique dispatch identifier returned by the transactional mail provider (such as Resend or SMTP).
   - If the provider ID is missing or if the API returns an error, the backend correctly fails with code `EMAIL_SEND_FAILED` and `502 Bad Gateway` status instead of falsifying success.
3. **Rigorous Sign-In Routing & Next-Route API Payload**:
   - Rewrote `/api/volunteer/sign-in` to check verification and approval status sequentially.
   - Always returns a structured `nextRoute` field directing the frontend directly to `/volunteer/pending-review` (for pending review, rejected, or suspended accounts) or `/volunteer/event` (for active approved accounts).
4. **Brand-Safe Display Subtitle**:
   - Subtitle copy on `VolunteerSignInView` was updated to: *"Sign in to support Children and Teens check-in, pickup, and care during the event."*, removing unapproved database lookup copy.

---

## 13. Volunteer Password Reset Flow (July 2026)

*Note: This flow has been enhanced with hash-routing query parameter stripping (preserving token delivery), premium rounded pill visual styling for the success card, and template segregation using wrapVolunteerHtmlTemplate for correct volunteer footer branding.*

To provide a complete password recovery experience for volunteers, we designed and implemented a secure, isolated, and brand-aligned Volunteer Password Reset flow:

### A. Core Backend Service Endpoints
1. **`POST /api/volunteer/forgot-password`**:
   - **Privacy Safeguard (Generic Success)**: To prevent malicious actor address enumeration, the server responds with a friendly success block even if the email does not exist in the database or does not belong to a volunteer, returning `"emailSent": false` and `"generic": true`.
   - **Strict Cooldown Enforcement**: Enforces a 60-second cooldown per email using password reset active token states in the `auth_tokens` table. Returns `429 Too Many Requests` status and code `"RESET_COOLDOWN"` when requested prematurely.
   - **Strict Delivery Verification**: If the account is a known volunteer, the server contacts Resend to dispatch a transactional email containing a secure URL link targeting `#/volunteer/reset-password?token=<token>`. It verifies that a valid `providerId` is returned by Resend and includes it as `"providerId"` in the response. If the mail dispatch fails, it returns `502 Bad Gateway` and `"EMAIL_SEND_FAILED"`.
   - **Secure Masked Logging**: Implements comprehensive backend tracing logs tracking request parameters, account states, token creations, and delivery statuses using only masked emails (`m***d@e****e.com`).
2. **`POST /api/volunteer/reset-password`**:
   - Retrieves active token from database, verifies hash, and checks 60-minute expiration.
   - Requires password length >= 8 characters containing both alphabetical letters and numeric digits.
   - Atomically updates password on `users` table, and transitions token to used status (`used_at` set to current time).

### B. Upgraded Frontend Views
1. **`src/views/VolunteerSignInView.tsx`**:
   - Added a visible "Forgot password?" link next to the Password field label, routing users smoothly to `#/volunteer/forgot-password`.
2. **`src/views/VolunteerForgotPasswordView.tsx`**:
   - Standard volunteer-theme card styled with clean typography and brand-approved copy: *"Enter the email connected to your Volunteer Access. If it matches our records, we’ll send a secure reset link."*
   - Handles email syntax validation and applies live domain-suffix suggestions (e.g. `gmail.com`).
   - **Truthful Success Mappings**:
     - *Real success (known volunteer + provider success)*: Renders a green emerald success checkmark and says: *"A reset link has been sent. Please check your inbox and spam folder."*
     - *Neutral success (privacy-safe/profile-less)*: Renders a neutral grey card with a mail icon and says: *"If this email is connected to Volunteer Access, a reset link will be sent."*
   - Supports live cooldown countdown timer when returning `RESET_COOLDOWN` rate limits, disabling the submit button.
3. **`src/views/VolunteerResetPasswordView.tsx`**:
   - Standard volunteer-theme password reset form requesting new password and confirm password inputs.
   - Enforces password strength (letter & number, minimum 8 characters) in real-time, displaying informative helper copy.
   - Features individual show/hide password buttons to prevent typing errors.
   - Gracefully handles missing reset tokens or invalid/expired links by directing volunteers to request a new recovery link.
   - **No Auto-Sign-in**: To maintain strong security, users must proceed back to sign in with their new credentials.

---

## 14. Stitch / Parent Visual Style Alignment & Caching Resolution (July 2026)

We have completed comprehensive visual style and asset caching audits to enforce brand-uniform mobile-first layouts across all Volunteer Auth routes, matching the premium parent Stitch layout:

1. **Service Worker Asset Caching Resolution (`public/sw.js`)**:
   - **Stale Build Bypass**: Upgraded asset fetch strategies for script, style, and font resources from **Cache-First** to **Network-First**, falling back to local cache storage exclusively when offline.
   - **Cache Pruning**: Configured automatic deletion of outdated `koinonia-` caches on service worker registration and activation to instantly clear stale browser-cached files.
   - **Cache Versioning**: Bumped the primary service worker shell identifier to `koinonia-app-shell-v4`.

2. **Mobile-First Shell & Spacing Alignments**:
   - Modified `VolunteerForgotPasswordView.tsx` and `VolunteerResetPasswordView.tsx` to fully align with parent/Stitch auth styles. Standardized the screen structure with a top header containing a centered KOINONIA wordmark and left-aligned navigation arrow, removing any legacy card boundaries from standard mobile viewports.
   - Integrated `AuthFormField` across reset, forgot password, sign-in, and sign-up screens to enforce high-contrast borders, exact spacing, and clean error states.

3. **Render Verification & Proof Markers**:
   - Embedded silent, non-visible identification data attributes to prove rendered UI compilation:
     - `VolunteerForgotPasswordView` root: `data-view-version="volunteer-forgot-password-stitch-v1"`
     - `VolunteerResetPasswordView` root: `data-view-version="volunteer-reset-password-stitch-v1"`
     - `VolunteerCreateAccountView` root: `data-view-version="volunteer-create-account-parent-style-v1"`
     - `VolunteerSignInView` root: `data-view-version="volunteer-sign-in-brand-v1"`

---

## 15. Volunteer Child Pickup Success Screen Flow (July 2026)

To complete the secure, real-time release pipeline for Koinonia Children and Teens, we have implemented a high-fidelity "Picked Up" success screen. This flow is strictly backend-backed, fully responsive, and complies with all custom brand guidelines:

### A. Core Database & API Schema Contracts
1. **`POST /api/volunteer/pickup/mark`**:
   - Registers a secure release update inside a transactional query block, updating `child_event_entries` with state `'picked_up'`, active volunteer ID, and release timestamp.
   - **JSON Response Payload**: Returns a structured contract containing real database metrics (no placeholder/dummy fields):
     - `success`: `true`
     - `message`: `"Child picked up."`
     - `child`: `{ id, fullName, firstName, age, classGroup, photoUrl, passImageUrl, pickupStatus, pickedUpAt }`
     - `pickup`: `{ pickedUpAt, pickedUpBy: { id, fullName, relationship, phone, photoUrl }, confirmedBy: { id, fullName }, point }`
     - `stats`: `{ inside, pickedUp, attention }`
2. **`api.volunteer.markChildPickedUp(payload)`**:
   - Added as an alias/wrapper client service inside `src/services/api.ts` to execute and return the identical structure expected by Phase 4 & 5.

### B. Visual & UX Execution Details
1. **Branded Headers**:
   - Renders a clean serif display title: **Picked up**, with a dynamic, warm helper greeting: *"{firstName} has been released to the approved pickup person."*
   - Strictly removes legacy words like "Online", "Portal", or "Dashboard" from active UI screens. No green/blinking indicators are present.
2. **"Checked Before Release" Verification Card**:
   - Features a 2-column square grid showcasing the Child and Pickup Person photos.
   - Overlay labels (`Child` and `Pickup Person`) are styled on a semi-transparent dark backdrop.
   - Embeds visual checks: `✓ Child photo matched` and `✓ Pickup person confirmed` with emerald styling.
3. **Action Triggers & State Resets**:
   - **Scan another pass**: Resets the lookup state and prepares the scanner for the next pass code instantly.
   - **View child record**: Populates search query state with the child's full name and seamlessly transitions the volunteer to the Children list view.
   - **Back to Event Home**: Resets the pickup state and navigates back to Event tools page.
4. **Bottom Event Statistics**:
   - Integrates a real-time event stats bento card outlining the three core metrics: *Children inside*, *Picked up*, and *Needs attention* (highlighted in antique gold).
5. **Standardized Bottom Tab Navigation**:
   - Completely restructured the bottom bar into the 5 mobile-first tabs from Screenshot C: **Event** (`Home`), **Scan** (`QrCode`), **Children** (`Search`), **Reports** (`BarChart3`), and **Profile** (`User`).
   - Created beautiful, fully active routing stubs for `/volunteer/reports` and `/volunteer/profile` to prevent empty page states.

### C. Proof Compilation Attribute
- **Verification Marker**: The parent container of the Success Screen is embedded with the proof attribute: `data-view-version="volunteer-pickup-success-stitch-v1"`.

---

## 16. Stitch Volunteer Event Dashboard Layout Implementation (July 2026)

To completely align the volunteer interface with the high-fidelity Stitch design structure, we executed a complete replacement of the core Volunteer Event Dashboard UI (`/volunteer/event` inside `src/views/VolunteerEventDashboardView.tsx`):

### A. Layout Component Structural Alignment
1. **Top Header**: Custom-styled header (`data-component-version="volunteer-event-header-v2-stitch"`) displaying:
   - Left-aligned circular volunteer image (or name initials fallback).
   - "Event Dashboard" title in elegant serif typography.
   - Dynamic event subtitle ("The General Assembly") in tracking-wider capitals.
   - Right-aligned simple connection status label ("Ready to scan" with a Wi-Fi icon). No "Online" or flashing green indicators.
2. **Hero Greeting**: Refined "Welcome, [First Name]" heading in large serif typography, paired with their assigned role/team subtitle (e.g. "Check-in Team").
3. **Stitch Search Field**: Full-width persistent input (`data-component-version="volunteer-event-search-v2-stitch"`) with a magnifying glass icon, placeholder "Find child by name or parent phone", and auto-redirect search submission routing to the Children directory list.
4. **Primary Action Cards**: Two compact cards (`data-component-version="volunteer-event-actions-v2-stitch"`) with thin borders and warm off-white surfaces:
   - **Check-in Card**: Action-oriented with a primary gold button ("Start check-in").
   - **Pickup Card**: Informational with a secondary outlined button ("Start pickup").
5. **Stitch Metrics**: A highly-visible 2x2 grid (`data-component-version="volunteer-event-metrics-v2-stitch"`) bound directly to the database:
   - Expected, Checked In, Picked Up, and Attention (highlighted with an elegant gold square badge). No hardcoded numbers or static design values are shown.
6. **Needs Attention List**: A clean, numbered list card (`data-component-version="volunteer-event-attention-v2-stitch"`) featuring outline triangle warnings, real-time issue types, child names/IDs, and upper-case text action triggers ("Resolve", "Review", "Verify").

### B. Validation & Compliance Proofs
The implemented structure contains the following proof attributes for automatic test validation:
- Main dashboard container: `data-view-version="volunteer-event-dashboard-v2-stitch"`
- Header bar: `data-component-version="volunteer-event-header-v2-stitch"`
- Action cards: `data-component-version="volunteer-event-actions-v2-stitch"`
- Metrics grid: `data-component-version="volunteer-event-metrics-v2-stitch"`
- Needs attention block: `data-component-version="volunteer-event-attention-v2-stitch"`
- Persistent bottom nav: `data-component-version="volunteer-bottom-nav-v2-stitch"`
- Search field: `data-component-version="volunteer-event-search-v2-stitch"`

---

## 17. Volunteer Approval Status & Routing Resolution (July 2026)

To fix the volunteer approval routing issue where approved volunteers were incorrectly trapped on the onboarding pending screen, we have completed a comprehensive end-to-end upgrade of the backend authentication endpoints, routing guards, and status polling interfaces:

### A. Core Database & Endpoint Upgrades
1. **Unified Approved/Active Route Handling (`POST /api/volunteer/sign-in`)**:
   - Both `active` and `approved` volunteer statuses are recognized as fully authorized, and the backend returns `nextRoute: '/volunteer/event'`.
   - The response includes both `profile` and `volunteerProfile` keys to ensure client compatibility.
2. **Robust Access Middleware (`GET /api/volunteer/me`)**:
   - Updated the endpoint to support both `active` and `approved` volunteer statuses.
   - Refactored the route to not throw a `403` error for pending/unapproved volunteers, instead gracefully returning a standard user block with their corresponding profile details so the client-side pending-review view can securely load and display details.
3. **Dedicated Live Status Fetcher (`GET /api/volunteer/me/status`)**:
   - Implements an un-cached, live query to the `volunteer_profiles` database table.
   - Accurately checks email verification and approval status on every execution.
   - Returns `{ success: true, profile, nextRoute }` to direct routing flow dynamically.

### B. Frontend Robust Onboarding Status Checks
1. **Dynamic Polling & Verification (`VolunteerPendingReviewView.tsx`)**:
   - Replaced old `window.location.reload()` page refresh behaviour with an elegant `api.volunteer.getStatus()` fetch loop.
   - Automatically checks approval status when the view mounts and when the "Check My Approval Status" button is clicked.
   - Seamlessly triggers access updates and navigates approved users directly to `/volunteer/event`.
   - Displays clear, contextual status and error messages if the profile was rejected or requires changes.
2. **Race-Condition-Resistant Protect Guard (`VolunteerProtectedRoute` in `src/App.tsx`)**:
   - Avoids trapping approved volunteers when their profile state is temporarily null (e.g. during slow initial network loads).
   - Shows a clean, polished loading state while fetching or verifying the active volunteer profile.
   - Authorizes route access for both `approved` and `active` statuses.

### C. Developer & Preview Database Coordination Note
- **AI Studio Database Mismatch**: Google AI Studio's preview container operates in its own isolated development database environment. If an administrator approves a volunteer profile in the production Netlify deployment dashboard, that approval does not automatically carry over to the preview database unless the container's environment `DATABASE_URL` is configured to target the shared database.
- **Local Testing Workaround**: To approve a volunteer profile in the preview database during local testing:
  - Access the admin panel in the preview environment at `#/admin/sign-in` (using admin credentials).
  - Navigate to the **Volunteers** section.
  - Find the newly registered volunteer account and click **Approve** or **Set Active**.
  - Return to the volunteer view, and the status check will immediately authorize access and transition to the Event Dashboard!

---

## 11. Refined Stitch Volunteer Check-in Interface (`#/volunteer/scan`)

The Volunteer Check-in screen has been completely redesigned to implement a high-fidelity "Stitch" UI (inspired by Screenshot A). The layout features enhanced security protocols and removes outdated admin elements:

1. **Aesthetic Enhancements**:
   - **Unified Context Header**: Replaced the default Event Dashboard header with a custom, mobile-first, sticky header (`data-component-version="volunteer-check-in-header-v2-stitch"`). Features an event-specific sub-label, a large "Check-in" title, a back-arrow button to navigate to `/volunteer/event`, and a static antique gold "Ready to scan" badge (no green dots or blinking indicators).
   - **Tall Portrait Viewfinder Card**: Replaced the aspect-video viewer with a pristine, tall portrait aspect ratio (`3/4`) styled with antique gold photo-corners inside a white cards layout. If the camera is inactive, a blurred warm background with a centered "Scan child pass" button is shown.
   - **Manual Code entry Trigger**: Tapping the "Enter pass code manually" button toggles a clean input drawer. All underlying code processing and validations are preserved.
   - **Mag-Glass Search Bar**: Displays a full-width input field with a search icon to query children in real-time.
   - **Interactive Last Checked-In Card**: Instantly computes and displays the last successfully verified child and relative timestamp using live `recentScans` data.
   - **Double-Matching Metrics Trio**: Details "Expected", "Checked in", and "Waiting" statistics styled in high-contrast, polished serif typography.

2. **Mobile-First Constraints**:
   - The entire screen is wrapped in a `max-w-md mx-auto w-full` container to enforce a compact, native-app-like mobile view on desktop and tablet, avoiding stretched elements and awkward empty spaces.
   - All interactive touch targets (buttons, search, select options) have a minimum height of 44px for fast, accurate touch interactions.

3. **Attributes and Verifications**:
   - `data-view-version="volunteer-check-in-v2-stitch"`
   - `data-component-version="volunteer-check-in-header-v2-stitch"`
   - `data-component-version="volunteer-check-in-scan-card-v2-stitch"`
   - `data-component-version="volunteer-check-in-manual-pass-v2-stitch"`
   - `data-component-version="volunteer-check-in-search-v2-stitch"`
   - `data-component-version="volunteer-check-in-last-v2-stitch"`
   - `data-component-version="volunteer-check-in-metrics-v2-stitch"`

## 12. Refined Stitch Child Found Interface (`#/volunteer/scan` child state)

The child-found review/lookup screen has been completely redesigned following Screenshot A and Screenshot B to replace the old placeholder review screen:

1. **Aesthetic Enhancements**:
   - **Child Found Header**: A custom sticky header (`data-component-version="volunteer-child-found-header-v1-stitch"`) with a back-arrow button to exit child state, "Check-in Portal" title, and a warm gold "Ready to scan" badge (no green dots or blinking indicators).
   - **Scan Successful Banner**: Displays a gold checkmark icon, tracking-wider "Scan successful" label, and a serif "Child found" heading (`data-component-version="volunteer-child-found-title-v1-stitch"`).
   - **Child Identity Card**: Showcases a large photo of the child in a 4:3 aspect-ratio block, full name, a stylish "Pass Ready" status badge, calculated age in years (calculated dynamically using the `calculateAge` helper from date of birth), age group class, and gender (`data-component-version="volunteer-child-identity-card-v1-stitch"`).
   - **Care Notes Card**: Divided into Medical, Allergies, and Extra support rows, each displaying a safety icon, clean sub-heading, and human-friendly fallback state descriptions like "No medical note added.", "No allergy added.", and "None required." (`data-component-version="volunteer-child-care-notes-v1-stitch"`).
   - **Entry Status Card**: Displays a calendar-clock icon, the attendance status ("Not checked in yet" or "Already checked in"), a primary gold "Mark checked in" CTA, a secondary "Scan another pass" button, and a safety message reminder to confirm the child photo (`data-component-version="volunteer-child-entry-status-v1-stitch"`).
   - **Authorized Pickup Card**: Displays authorized pickup person photo, name, relationship status, and phone number (`data-component-version="volunteer-child-authorized-pickup-v1-stitch"`).

2. **Attributes and Verifications**:
   - `data-view-version="volunteer-child-found-v1-stitch"`
   - `data-component-version="volunteer-child-found-header-v1-stitch"`
   - `data-component-version="volunteer-child-found-title-v1-stitch"`
   - `data-component-version="volunteer-child-identity-card-v1-stitch"`
   - `data-component-version="volunteer-child-care-notes-v1-stitch"`
   - `data-component-version="volunteer-child-entry-status-v1-stitch"`
   - `data-component-version="volunteer-child-authorized-pickup-v1-stitch"`

## 13. Refined Stitch Volunteer Pickup Screen Interface (`#/volunteer/pickup`)

The Volunteer Pickup screen has been completely redesigned following the high-fidelity Stitch design (Screenshot A) to provide a premium, mobile-app feel:

1. **Aesthetic Enhancements**:
   - **Top Header**: A custom sticky header (`data-component-version="volunteer-pickup-header-v1-stitch"`) featuring a back arrow routing to the dashboard, "Pickup" title in serif, event sub-label, and a warm gold "Ready to scan" badge with no green dot or ONLINE labels.
   - **Scan Viewfinder Card**: A tall 3:4 aspect ratio scanning viewport (`data-component-version="volunteer-pickup-scan-card-v1-stitch"`) displaying custom gold framing corners. Contains a centered serif "Scan child pass" pill button when inactive, and streams live camera scans with an active sweep line when clicked.
   - **Manual Entry Input**: A collapsible drawer card (`data-component-version="volunteer-pickup-manual-pass-v1-stitch"`) facilitating alphanumeric lookup queries for 6-character passes.
   - **OR Divider**: Minimalist divider (`data-component-version="volunteer-pickup-divider-v1-stitch"`) centering a clean "OR" label.
   - **Search Field**: Full-width persistent search bar (`data-component-version="volunteer-pickup-search-v1-stitch"`) with a magnifying glass icon, routing to the Children directory on enter.
   - **Confirm Before Release Alert**: A warning notice (`data-component-version="volunteer-pickup-warning-v1-stitch"`) reminding workers to verify photos of children and guardians before release.
   - **Stitch Metrics**: A highly readable 3-column stats panel (`data-component-version="volunteer-pickup-metrics-v1-stitch"`) showcasing Inside, Picked up, and Attention counts.
   - **Last Picked Up Card**: Dedicated recent activity logger (`data-component-version="volunteer-pickup-last-v1-stitch"`) tracking released children with photos, age, release time, and a green check mark.

2. **Attributes and Verifications**:
   - `data-view-version="volunteer-pickup-v1-stitch"`
   - `data-component-version="volunteer-pickup-header-v1-stitch"`
   - `data-component-version="volunteer-pickup-scan-card-v1-stitch"`
   - `data-component-version="volunteer-pickup-manual-pass-v1-stitch"`
   - `data-component-version="volunteer-pickup-divider-v1-stitch"`
   - `data-component-version="volunteer-pickup-search-v1-stitch"`
   - `data-component-version="volunteer-pickup-warning-v1-stitch"`
   - `data-component-version="volunteer-pickup-metrics-v1-stitch"`
   - `data-component-version="volunteer-pickup-last-v1-stitch"`

## 14. Refined Stitch Volunteer Pickup Success Screen Interface (`#/volunteer/pickup` on success)

The Volunteer Pickup Success screen replaces any previous success state with a premium mobile layout based strictly on the Stitch design system (Screenshot A & B):

1. **Aesthetic and Functional Enhancements**:
   - **Sticky Top Header**: Custom header with back button, "Pickup" serif title, event sub-label, and "Ready to scan" gold badge with no ONLINE or green dot indicators (`data-component-version="volunteer-pickup-success-header-v1-stitch"`).
   - **Success Icon and Message**: Centered green check icon block in a rounded container with the "Picked up" serif heading, and the confirmation message with the child's dynamic first name or fallback (`data-component-version="volunteer-pickup-success-title-v1-stitch"`).
   - **Child Summary Card**: Compact card showing child photo, full name, age label, and class group badge (`data-component-version="volunteer-pickup-success-child-card-v1-stitch"`).
   - **Pickup Details Card**: Shows a grid with Picked up at, Picked up by, Relationship, Confirmed by, and Pickup point, dynamically populated from the API response with optional chaining and smart fallbacks (`data-component-version="volunteer-pickup-success-details-v1-stitch"`).
   - **Checked Before Release Card**: Features side-by-side compact image panels for the Child and Pickup Person, each overlayed with high-contrast text labels. Includes verification checkmarks for "Child photo matched" and "Pickup person confirmed" (`data-component-version="volunteer-pickup-success-verification-v1-stitch"`).
   - **Action Buttons**: Custom gold-styled "Scan another pass" button, white bordered "View child record" button, and elegant serif link "Back to Event Home" (`data-component-version="volunteer-pickup-success-actions-v1-stitch"`).
   - **Stitch Metrics Card**: A 3-column stats panel featuring dynamic event metrics for Children inside, Picked up, and Needs attention (`data-component-version="volunteer-pickup-success-metrics-v1-stitch"`).

2. **Attributes and Verifications**:
   - `data-view-version="volunteer-pickup-success-v1-stitch"`
   - `data-component-version="volunteer-pickup-success-header-v1-stitch"`
   - `data-component-version="volunteer-pickup-success-title-v1-stitch"`
   - `data-component-version="volunteer-pickup-success-child-card-v1-stitch"`
   - `data-component-version="volunteer-pickup-success-details-v1-stitch"`
   - `data-component-version="volunteer-pickup-success-verification-v1-stitch"`
   - `data-component-version="volunteer-pickup-success-actions-v1-stitch"`
   - `data-component-version="volunteer-pickup-success-metrics-v1-stitch"`

## 15. Refined Stitch Volunteer Children Screen Interface (`#/volunteer/children`)

The Volunteer Children screen has been completely redesigned following the high-fidelity Stitch design (Screenshot A) to provide a premium, mobile-first, and highly intuitive experience:

1. **Aesthetic and Functional Enhancements**:
   - **Sticky Top Header**: A custom sticky header (`data-component-version="volunteer-children-header-v1-stitch"`) featuring a back arrow routing to the event home, "Children" title in elegant serif font, current class group sub-label, and a warm gold "Ready to search" status badge with no ONLINE or blinking green dot indicators.
   - **Search Field**: Full-width persistent search bar (`data-component-version="volunteer-children-search-v1-stitch"`) with a magnifying glass icon, allowing instantaneous find query by child name or parent phone number. Clearing search returns immediately to the active list.
   - **Filter Chips**: Horizontal pill filters (`data-component-version="volunteer-children-filters-v1-stitch"`) for All, Inside, Not arrived, and Picked up. Clicking filters triggers live database query refreshing instantly.
   - **Metrics Strip**: A 4-column balanced stats panel (`data-component-version="volunteer-children-metrics-v1-stitch"`) displaying Expected, Inside, Picked Up, and Attention registration counts based on current event metrics.
   - **Child List Cards**: Highly responsive list cards (`data-component-version="volunteer-children-list-v1-stitch"`) with right-side status vertical color stripes (Emerald for Inside, Slate for Picked Up, Grey for Not Arrived, Orange for Attention). Includes child's image thumbnail or fallback, name, status badge, age detail, class group, and contact parent/guardian details.
   - **Helper Note**: Minimalist note at the bottom (`data-component-version="volunteer-children-helper-v1-stitch"`) advising "Use search if a parent cannot open the pass."

2. **Attributes and Verifications**:
   - `data-view-version="volunteer-children-v1-stitch"`
   - `data-component-version="volunteer-children-header-v1-stitch"`
   - `data-component-version="volunteer-children-search-v1-stitch"`
   - `data-component-version="volunteer-children-filters-v1-stitch"`
   - `data-component-version="volunteer-children-metrics-v1-stitch"`
   - `data-component-version="volunteer-children-list-v1-stitch"`
   - `data-component-version="volunteer-children-helper-v1-stitch"`

## 16. Refined Stitch Volunteer Child Profile Screen Interface (`#/volunteer/children` with selected child)

The Volunteer Child Profile screen has been completely redesigned following the high-fidelity Stitch design (Screenshot A & B) to provide an immersive, mobile-app feel:

1. **Aesthetic and Functional Enhancements**:
   - **Sticky Top Header**: A custom sticky header (`data-component-version="volunteer-child-profile-header-v1-stitch"`) featuring a back arrow navigating to `/volunteer/children`, bold "Child profile" title, and section sub-label ("The General Assembly") (no ONLINE/Online/green dot indicators).
   - **Child Identity Card**: Centered card (`data-component-version="volunteer-child-profile-identity-v1-stitch"`) showing child's photo (using real `child.photoUrl` if available or branded fallback), overlapping child status badge ("Inside", "Not arrived", "Picked up"), full name in refined serif typography, age label, and class/age group badge.
   - **Quick Facts Row**: 3-column row (`data-component-version="volunteer-child-profile-facts-v1-stitch"`) displaying Gender, Parent name, and Contact number, mapping to real values or "Not provided".
   - **Primary Action Buttons**: Displays "Start pickup" button (triggers checkout release flow) and "Scan another pass" button (routes to `/volunteer/scan`) (`data-component-version="volunteer-child-profile-actions-v1-stitch"`).
   - **Today Status Card**: Grid row (`data-component-version="volunteer-child-profile-today-v1-stitch"`) detailing Checked in at {time} / Not checked in yet, and Picked up at {time} / Not picked up yet.
   - **Care Notes Card**: Sections for Medical note, Allergy, and Extra support (`data-component-version="volunteer-child-profile-care-notes-v1-stitch"`) with honest empty fallback text ("No medical note added", "No allergy added", "No extra support added").
   - **Parent Card**: Displays primary parent photo (`data-component-version="volunteer-child-profile-parent-v1-stitch"`), name, relationship, contact phone number, and click-to-call or click-to-WhatsApp actions.
   - **Pickup Person Card**: Displays authorized pickup person details (`data-component-version="volunteer-child-profile-pickup-person-v1-stitch"`), photo, name, relationship, phone number, and phone action link.
   - **Event Details Card**: Highlights Session, Event, Date, and Time details (`data-component-version="volunteer-child-profile-event-details-v1-stitch"`) safely mapped from dynamic event data.
   - **Today’s Activity Card**: Live timeline checking entry check-in status (Checked in at {time} by {volunteer name}) and pickup status (Picked up at {time} by {volunteer name} or Pickup waiting) (`data-component-version="volunteer-child-profile-activity-v1-stitch"`).

2. **Attributes and Verifications**:
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

## 17. Refined Stitch Volunteer Reports Screen Interface (`#/volunteer/reports`)

The Volunteer Reports screen has been completely redesigned following the high-fidelity Stitch design to provide an immersive, mobile-app feel:

1. **Aesthetic and Functional Enhancements**:
   - **Sticky Top Header**: A custom sticky header (`data-component-version="volunteer-reports-header-v1-stitch"`) featuring a back arrow navigating to `/volunteer/event`, "Children's Ministry" header title, large bold serif "Reports" title, and event subtitle (no ONLINE or green dot indicators).
   - **Today Summary Cards Grid**: Four columns (`data-component-version="volunteer-reports-summary-v1-stitch"`) displaying "Expected", "Checked in", "Picked up", and a warm-accented "Inside" stats count mapped from dynamic backend fields.
   - **Needs Attention Widget**: A list (`data-component-version="volunteer-reports-activity-v1-stitch"`) showcasing counts of "Medical note pending", "Missing pickup photo", and "Manual review required", plus an interactive button opening a rich detail modal.
   - **Age Groups section**: Cards listing Age Groups with columns for Boys, Girls, and dynamic Inside counts.
   - **Action Buttons**: Highlights "View children inside" (pre-filters directory to 'inside' status) and "View needs attention" (triggers attention list modal).
   - **Final Event Report Card**: Rich textarea (`data-component-version="volunteer-reports-notes-v1-stitch"`) for submitting audit observations/reviews, with last submitted report notes displayed below if active.

2. **Attributes and Verifications**:
   - `data-view-version="volunteer-reports-v1-stitch"`
   - `data-component-version="volunteer-reports-header-v1-stitch"`
   - `data-component-version="volunteer-reports-summary-v1-stitch"`
   - `data-component-version="volunteer-reports-activity-v1-stitch"`
   - `data-component-version="volunteer-reports-notes-v1-stitch"`
   - `data-component-version="volunteer-bottom-nav-v2-stitch"`

---

## 18. Self-Service Onboarding Profile Updates & Aesthetic Rectangular Photo
To allow volunteers to securely update their own onboarding/registration details directly from the Profile screen and implement the Stitch-approved portrait frame style, the following capabilities have been added:

### A. Aesthetic Rectangular Portrait Photo Frame
- **Visual Enhancement**: Replaced the previous circular photo with a high-fidelity rectangular portrait frame with rounded corners (`rounded-2xl`) and a warm gold border (`border-[#C59B27]`) to strictly conform to approved Stitch designs.
- **Attributes**: Identified via `data-component-version="volunteer-profile-photo-rect-v1"`.

### B. High-Fidelity Parent-Style Edit Profile Interface (Redesigned)
- **Visual Overhaul**: Redesigned the "Edit Onboarding Details" dialog to match the parent form and onboarding standards used in the parent setup screens (`ProfileSetupView.tsx`). Uses a gorgeous warm ivory background (`#FAF9F5`), consistent labels, elegant spacing, and removes all legacy outdated labels (e.g., "UPDATE SUBMITTED REGISTRATION INFO").
- **Header Structure**: Custom title "Edit profile" with subtitle "Update your submitted details" and integrated back/close controls.
- **Service & Experience Sections**: Leverages parent-style segmented controls (Yes/No buttons) for "Koinonia worker" and "Serving experience" state choices. Stacks phone, WhatsApp, and department input fields cleanly with custom focus colors to prevent cramped multi-column forms on mobile screens.
- **Proof Attributes Implemented**:
  - Root container: `data-view-version="volunteer-edit-profile-v2-parent-style"`
  - Header block: `data-component-version="volunteer-edit-profile-header-v2-parent-style"`
  - Portrait photo block: `data-component-version="volunteer-edit-profile-photo-v2-parent-style"`
  - Personal details section: `data-component-version="volunteer-edit-profile-personal-v2-parent-style"`
  - Service details section: `data-component-version="volunteer-edit-profile-service-v2-parent-style"`
  - Experience and notes section: `data-component-version="volunteer-edit-profile-notes-v2-parent-style"`
  - Actions footer: `data-component-version="volunteer-edit-profile-actions-v2-parent-style"`
  - Event assignment card: `data-component-version="volunteer-edit-assignment-card-v2-parent-style"`

### C. Redesigned Event Assignment Read-Only Card
- **Aesthetic Uplift**: The technical-feeling "Official Assignment (Read-only)" card has been replaced with a user-friendly, high-fidelity card titled "Event assignment" and subtitled "Set by the admin team."
- **Visual styling**: Styled with an ivory background card, thin gold border accents (`border-[#E5D5AE]/60` / `border-b-[#D9D6CE]`), and a clean, subtle lock badge labeled "Admin managed" paired with a lock icon.
- **Copy Formatting**: Rigid labels are replaced with clean, human-centric text ("Approval", "Team", "Area", "Access"). Missing values fallback gently to "Not assigned", and active states are cleanly formatted (e.g. replacing technical strings like `pending_review` with "Pending review").
- **Proof Attributes Implemented**: Verified via `data-component-version="volunteer-edit-assignment-card-v2-parent-style"`.

### D. Secure Backend Endpoint & State Protection
- **Route**: `PATCH /api/volunteer/me/profile`
- **Security Rule**: The endpoint parses form variables, updates the user's `fullName` and the volunteer's onboarding attributes inside a secure database transaction, and strictly ignores or rejects any admin-controlled status fields (such as `status`, `assignedTeam`, `assignedArea`, `accessScope`, `permissions`, `adminNotes`, etc.) to prevent volunteer privilege escalation.
- **Validation**: Enforces strict text constraints and phone number format normalization.


