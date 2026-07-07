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

