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
- `selected` — Approved for capacity allocation.
- `waiting_list` — Placed on queue due to capacity constraints.
- `not_selected` — Unable to accommodate for current event.
- `pass_ready` — Cryptographic QR pass generated and available to parent.
- `checked_in` — Child physically scanned and inside event gate.
- `picked_up` — Child safely released to verified pickup person.

## 7. Multi-Event Capabilities
- The platform supports multiple concurrent or sequential events (`events`).
- Each event maintains distinct dates, themes, venues, capacity rules, review workflows, passes, and attendance logs.
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
The Koinonia Children and Teens landing page serves two distinct audiences:
1. **Parents/guardians:** This remains the primary, highly-visible call-to-action (CTA) to encourage smooth and secure child check-in registration.
2. **Volunteers/event team:** Secondary but clearly visible access, styled to avoid visually competing with the main parent CTA.
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







