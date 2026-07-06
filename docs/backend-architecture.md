# Production Backend Architecture Guide

This document defines the production backend architecture, relational data schemas, scalability rules, event-day scanning reliability protocols, security controls, API interfaces, and engineering standards for the **Koinonia Children and Teens Event Access Platform**.

---

## 1. Product Roles & Access Control

The platform enforces strict Role-Based Access Control (RBAC) across five distinct user roles. Every API request must be authenticated and authorized against these role boundaries.

### 1.1 Parent
* **Description:** Parents or legal guardians registering their household and submitting children for event access.
* **Permissions (Can Do):**
  * Create and verify their user account (`users`).
  * Create, view, and update their own parent profile (`parent_profiles`).
  * Add, view, and update child profiles associated with their account (`children`).
  * Add or update approved pickup people for their children (`pickup_people`).
  * Submit children for specific events (`child_event_entries`).
  * View real-time review status, care guidelines, and entry/pickup statuses.
  * Access and display generated event passes (`event_passes`) once marked *Pass ready*.
* **Restrictions (Cannot Do):**
  * Cannot view or modify profiles, children, passes, or entries belonging to other parents.
  * Cannot review, approve, waitlist, or reject event entries.
  * Cannot perform check-in or pickup scanning actions.
  * Cannot access staff endpoints, admin reports, review notes, or broadcast messaging tools.

### 1.2 Review Team
* **Description:** Dedicated team members assigned to review child submissions, verify details, and allocate event capacity.
* **Permissions (Can Do):**
  * View all submitted `child_event_entries` along with associated `children`, `parent_profiles`, and `pickup_people`.
  * Update entry review statuses (*Under review*, *Selected*, *Waiting list*, *Not selected*, *Pass ready*).
  * Create and read internal review annotations (`review_notes`).
  * Trigger individual status notification messages via email or WhatsApp.
* **Restrictions (Cannot Do):**
  * Cannot modify parent profiles, child core biometric/birth data, or pickup person records directly.
  * Cannot perform event-day check-in or pickup scanning operations.
  * Cannot create or delete events, modify system capacity configurations, or manage staff user roles.

### 1.3 Event Staff (Check-in & Pickup Teams)
* **Description:** On-ground event personnel responsible for gate check-in, room assignment verification, and secure pickup release.
* **Permissions (Can Do):**
  * Scan QR codes or search child entries by unique alphanumeric pass codes.
  * Perform check-in transactions recording entry time and staff attribution (`attendance_records`).
  * Perform pickup transactions verifying parent/pickup person photo identity before release (`attendance_records`).
  * View child care notes, medical/support requirements, emergency contacts, and verified pickup person photos.
  * Download offline manifest bundles (`offline_sync_records`) prior to event gates opening.
  * Upload offline queue logs back to the server when network connectivity is restored.
* **Restrictions (Cannot Do):**
  * Cannot edit review statuses, delete child records, or override capacity thresholds.
  * Cannot access system-wide financial/administrative logs or global user settings.
  * Cannot access global admin reporting suites or modify other staff assignments.

### 1.4 Admin
* **Description:** Event directors and administrative coordinators overseeing multi-event lifecycle operations.
* **Permissions (Can Do):**
  * Create, configure, publish, and close events (`events`).
  * Assign and manage staff schedules and location assignments (`staff_assignments`).
  * Oversee review queues, batch update statuses, and generate passes.
  * Trigger broadcast notifications via email and WhatsApp (`messages`).
  * Access comprehensive analytical suites and export real-time event-day attendance/pickup reports.
  * Review activity audit logs and resolve offline sync discrepancies or needs-attention exceptions.
* **Restrictions (Cannot Do):**
  * Cannot delete global audit trails or purge production database records.
  * Cannot promote users to Super Admin or modify platform infrastructure credentials.

### 1.5 Super Admin
* **Description:** Platform system administrators with unrestricted access to system configuration and tenant governance.
* **Permissions (Can Do):**
  * Full CRUD operations across all entities and system configurations.
  * Manage administrative user credentials, assign roles, and audit security events.
  * Configure external integration credentials (SMS/WhatsApp gateways, Resend transactional email API, Object Storage buckets, Cloud CDN).
  * Oversee database schema migrations, rate limiting thresholds, and disaster recovery execution.

---

## 2. Core Data Model

The application models household hierarchies and multi-event participation through normalized relational entities.

### 2.1 `users`
* **Purpose:** Authenticated identities for all system roles.
* **Important Fields:** `id` (UUID, PK), `email` (VARCHAR, Unique), `password_hash` (VARCHAR), `role` (ENUM: 'parent', 'review_team', 'event_staff', 'admin', 'super_admin'), `email_verified_at` (TIMESTAMP), `is_active` (BOOLEAN), `created_at` (TIMESTAMP), `updated_at` (TIMESTAMP).
* **Relationships:** One-to-one with `parent_profiles` (if role='parent'); One-to-many with `staff_assignments`, `review_notes`, and `attendance_records` (as actioned_by).
* **Required Indexes:** Unique index on `email`; Index on `role`; Index on `created_at`.
* **Required Constraints:** `email` must be formatted validly; `password_hash` required for local auth.

### 2.2 `parent_profiles`
* **Purpose:** Primary contact, residential, and emergency details for parent accounts.
* **Important Fields:** `id` (UUID, PK), `user_id` (UUID, FK to `users`), `full_name` (VARCHAR), `phone` (VARCHAR), `whatsapp` (VARCHAR), `home_address` (TEXT), `preferred_contact` (ENUM: 'Email', 'WhatsApp', 'Both'), `photo_media_id` (UUID, FK to `media_files`, nullable), `is_worker` (BOOLEAN), `department` (VARCHAR, nullable), `created_at` (TIMESTAMP), `updated_at` (TIMESTAMP).
* **Relationships:** Belongs to `users`; One-to-many with `children`; One-to-many with `pickup_people`.
* **Required Indexes:** Index on `user_id`; Index on `phone`; Index on `whatsapp`.
* **Required Constraints:** Unique constraint on `user_id`; `department` required if `is_worker = true`.

### 2.3 `events`
* **Purpose:** Represents individual Koinonia children and teens gatherings over time.
* **Important Fields:** `id` (UUID, PK), `name` (VARCHAR), `slug` (VARCHAR, Unique), `theme` (VARCHAR), `scripture` (VARCHAR), `start_date` (DATE), `end_date` (DATE), `daily_start_time` (TIME), `daily_end_time` (TIME), `venue` (VARCHAR), `max_capacity` (INTEGER), `status` (ENUM: 'draft', 'open', 'reviewing', 'active', 'completed', 'cancelled'), `created_at` (TIMESTAMP), `updated_at` (TIMESTAMP).
* **Relationships:** One-to-many with `child_event_entries`, `staff_assignments`, `messages`, and `offline_sync_records`.
* **Required Indexes:** Unique index on `slug`; Index on `status`; Index on `start_date`, `end_date`.
* **Required Constraints:** `end_date >= start_date`; `max_capacity > 0`.

### 2.4 `children`
* **Purpose:** Persistent core profiles for children belonging to a parent household across multiple events.
* **Important Fields:** `id` (UUID, PK), `parent_id` (UUID, FK to `parent_profiles`), `full_name` (VARCHAR), `date_of_birth` (DATE), `gender` (ENUM: 'Male', 'Female'), `relationship_to_parent` (VARCHAR), `school_class` (VARCHAR), `care_notes` (TEXT, nullable), `extra_support_needed` (BOOLEAN), `photo_media_id` (UUID, FK to `media_files`, nullable), `created_at` (TIMESTAMP), `updated_at` (TIMESTAMP).
* **Relationships:** Belongs to `parent_profiles`; One-to-many with `child_event_entries`.
* **Required Indexes:** Index on `parent_id`; Index on `date_of_birth`; Index on `gender`.
* **Required Constraints:** `date_of_birth` cannot be in the future.

### 2.5 `child_event_entries`
* **Purpose:** A child's application and participation record for a specific event.
* **Important Fields:** `id` (UUID, PK), `child_id` (UUID, FK to `children`), `event_id` (UUID, FK to `events`), `assigned_age_group` (VARCHAR), `review_status` (ENUM: 'draft', 'details_sent', 'under_review', 'selected', 'waiting_list', 'not_selected', 'pass_ready', 'checked_in', 'picked_up'), `assigned_pickup_person_id` (UUID, FK to `pickup_people`, nullable), `needs_attention` (BOOLEAN, default false), `attention_reason` (TEXT, nullable), `created_at` (TIMESTAMP), `updated_at` (TIMESTAMP).
* **Relationships:** Belongs to `children`, `events`, and `pickup_people`; One-to-one with `event_passes`; One-to-many with `attendance_records` and `review_notes`.
* **Required Indexes:** Unique composite index on `(child_id, event_id)`; Index on `event_id`; Index on `review_status`; Index on `assigned_age_group`.
* **Required Constraints:** One entry per child per event.

### 2.6 `pickup_people`
* **Purpose:** Authorized individuals designated by parents to collect children at event close.
* **Important Fields:** `id` (UUID, PK), `parent_id` (UUID, FK to `parent_profiles`), `full_name` (VARCHAR), `relationship_to_child` (VARCHAR), `phone` (VARCHAR), `photo_media_id` (UUID, FK to `media_files`, nullable), `is_parent_self` (BOOLEAN, default false), `created_at` (TIMESTAMP), `updated_at` (TIMESTAMP).
* **Relationships:** Belongs to `parent_profiles`; One-to-many with `child_event_entries` (as assigned pickup person).
* **Required Indexes:** Index on `parent_id`; Index on `phone`.
* **Required Constraints:** Photo required for non-self pickup persons.

### 2.7 `event_passes`
* **Purpose:** Secure cryptographic entrance and exit credential generated once an entry is approved.
* **Important Fields:** `id` (UUID, PK), `child_event_entry_id` (UUID, FK to `child_event_entries`, Unique), `pass_code` (VARCHAR, Unique display identifier e.g., 'KOI-2026-X89J'), `pass_token_hash` (VARCHAR, Unique SHA-256 hash stored for verification), `issued_at` (TIMESTAMP), `revoked_at` (TIMESTAMP, nullable).
* **Relationships:** Belongs to `child_event_entries`.
* **Required Indexes:** Unique index on `child_event_entry_id`; Unique index on `pass_code`; Unique index on `pass_token_hash`.
* **Required Constraints:** Exactly one active pass per selected/pass_ready entry.

### 2.8 `attendance_records`
* **Purpose:** Immutable audit log of physical gate check-in and pickup transactions.
* **Important Fields:** `id` (UUID, PK), `child_event_entry_id` (UUID, FK to `child_event_entries`), `action_type` (ENUM: 'check_in', 'pickup'), `action_time` (TIMESTAMP), `staff_user_id` (UUID, FK to `users`), `verified_pickup_person_id` (UUID, FK to `pickup_people`, nullable for check-in), `gate_location` (VARCHAR), `sync_source` (ENUM: 'live', 'offline_sync'), `idempotency_key` (VARCHAR, Unique), `created_at` (TIMESTAMP).
* **Relationships:** Belongs to `child_event_entries`, `users` (staff), and `pickup_people`.
* **Required Indexes:** Index on `child_event_entry_id`; Index on `action_type`; Index on `action_time`; Unique index on `idempotency_key`.
* **Required Constraints:** `verified_pickup_person_id` must be populated when `action_type = 'pickup'`.

### 2.9 `review_notes`
* **Purpose:** Internal audit notes recorded by review team members during submission triage.
* **Important Fields:** `id` (UUID, PK), `child_event_entry_id` (UUID, FK to `child_event_entries`), `reviewer_user_id` (UUID, FK to `users`), `note_text` (TEXT), `created_at` (TIMESTAMP).
* **Relationships:** Belongs to `child_event_entries` and `users`.
* **Required Indexes:** Index on `child_event_entry_id`; Index on `created_at`.

### 2.10 `messages`
* **Purpose:** Record of outbound email and WhatsApp communications triggered by workflow changes or broadcasts.
* **Important Fields:** `id` (UUID, PK), `event_id` (UUID, FK to `events`, nullable), `recipient_parent_id` (UUID, FK to `parent_profiles`), `channel` (ENUM: 'email', 'whatsapp'), `message_type` (VARCHAR), `subject` (VARCHAR, nullable), `content` (TEXT), `status` (ENUM: 'queued', 'sent', 'failed', 'delivered'), `external_id` (VARCHAR, nullable), `error_log` (TEXT, nullable), `created_at` (TIMESTAMP), `sent_at` (TIMESTAMP, nullable).
* **Relationships:** Belongs to `events` and `parent_profiles`.
* **Required Indexes:** Index on `recipient_parent_id`; Index on `status`; Index on `created_at`.

### 2.11 `staff_assignments`
* **Purpose:** Maps staff members to specific event gates, age group zones, or administrative roles.
* **Important Fields:** `id` (UUID, PK), `event_id` (UUID, FK to `events`), `staff_user_id` (UUID, FK to `users`), `assigned_duty` (ENUM: 'check_in_gate', 'pickup_gate', 'info_desk', 'room_lead'), `assigned_zone` (VARCHAR, nullable), `created_at` (TIMESTAMP).
* **Relationships:** Belongs to `events` and `users`.
* **Required Indexes:** Unique composite index on `(event_id, staff_user_id, assigned_duty)`.

### 2.12 `offline_sync_records`
* **Purpose:** Tracks offline device sync manifests downloaded by staff and batches uploaded after connectivity restoration.
* **Important Fields:** `id` (UUID, PK), `event_id` (UUID, FK to `events`), `staff_user_id` (UUID, FK to `users`), `device_identifier` (VARCHAR), `sync_type` (ENUM: 'manifest_download', 'scan_batch_upload'), `record_count` (INTEGER), `payload_hash` (VARCHAR), `status` (ENUM: 'pending', 'processed', 'conflict_detected'), `error_summary` (TEXT, nullable), `created_at` (TIMESTAMP).
* **Relationships:** Belongs to `events` and `users`.
* **Required Indexes:** Index on `event_id`; Index on `status`; Index on `created_at`.

### 2.13 `media_files`
* **Purpose:** Central registry for metadata of uploaded parent, child, pickup person photos, landing images, event videos, and gallery media.
* **Important Fields:** `id` (UUID, PK), `owner_user_id` (UUID, FK to `users`), `provider` (VARCHAR default 'cloudinary'), `public_id` (VARCHAR, Unique), `secure_url` (VARCHAR), `resource_type` (VARCHAR), `mime_type` (VARCHAR), `file_size` (INTEGER), `width` (INTEGER), `height` (INTEGER), `duration` (FLOAT), `folder` (VARCHAR), `purpose` (VARCHAR), `created_at` (TIMESTAMP).
* **Relationships:** Belongs to `users`.
* **Required Indexes:** Unique index on `public_id`; Index on `owner_user_id`.

---

## 3. Database Rules & Constraints

The production database must run on PostgreSQL 15+ with strict enforcement of relational integrity, foreign keys, and indexes.

### 3.1 Mandatory Indexes
To ensure sub-10ms query execution during peak event ingress, the following B-Tree indexes must be deployed:
* **Users:** `idx_users_email` (Unique), `idx_users_role`
* **Parent Profiles:** `idx_parent_profiles_user_id` (Unique), `idx_parent_profiles_phone`, `idx_parent_profiles_whatsapp`
* **Children:** `idx_children_parent_id`, `idx_children_dob_gender`
* **Event Entries:** `idx_entries_child_event` (Unique on `child_id, event_id`), `idx_entries_event_status` (`event_id, review_status`), `idx_entries_age_group`
* **Event Passes:** `idx_passes_entry_id` (Unique), `idx_passes_code` (Unique), `idx_passes_hash` (Unique)
* **Attendance Records:** `idx_attendance_entry_type` (`child_event_entry_id, action_type`), `idx_attendance_time` (`action_time`), `idx_attendance_idempotency` (Unique)

### 3.2 Relational Integrity Constraints
1. **Parent-Child Hierarchy:** One parent profile can have zero or many children (`ON DELETE RESTRICT`). A child cannot exist without a parent.
2. **Multi-Event Participation:** One child can link to multiple events over time via `child_event_entries`. Duplicate entries for the same child in the same event are blocked by a unique constraint on `(child_id, event_id)`.
3. **One Pass Per Entry:** A pass is issued strictly 1:1 with a `child_event_entry`.
4. **Traceable Action Audit:** Every check-in and pickup attendance record must store the exact `staff_user_id` who performed the scan and the timestamp.
5. **Pickup Prerequisite Rules:** At the database transaction layer, an `attendance_record` with `action_type = 'pickup'` cannot be inserted unless an active `action_type = 'check_in'` record exists for that `child_event_entry_id` on the same event day.
6. **Idempotency Guarantee:** Scan requests include a client-generated UUID v4 `idempotency_key`. A unique constraint guarantees that duplicate network retries or double-scans do not generate duplicate attendance entries.

---

## 4. Scalability Rules (4,000+ Active Users)

To handle 4,000+ concurrent users during peak morning ingress (check-in rush between 8:15 AM and 9:15 AM), the architecture must follow these high-concurrency principles:

### 4.1 Stateless Backend Services
* Application servers run in containerized environments (Cloud Run / ECS) with zero local session affinity.
* Authentication uses short-lived JWTs (15-minute expiry) verified via stateless cryptographic signatures, paired with secure HTTP-only refresh tokens stored in Redis.

### 4.2 Database Connection Pooling
* Application containers connect to PostgreSQL exclusively via a dedicated connection pooler (PgBouncer in transaction pooling mode).
* Max connections per instance are capped; long-running queries (>2000ms) are automatically aborted via `statement_timeout`.

### 4.3 High-Traffic Query Optimization
* **Staff Gate Scanning API:** Performs indexed lookups strictly by `pass_token_hash`. Returns only the minimal required payload (child name, photo URL, age group, care notes, pickup person photo, and entry status).
* **Parent Status API:** Queries only indexed `parent_id` and caches non-sensitive status payloads for 30 seconds.

### 4.4 Pagination & Read-Heavy Isolation
* All admin review queues and analytical tables must enforce strict limit/offset or cursor-based pagination (default 25 records per page, max 100).
* Heavy analytical reporting queries (e.g., age-by-gender aggregation, final attendance exports) route to a PostgreSQL Read Replica to prevent locking the primary write database during live scanning.

### 4.5 Asynchronous Background Workers
* Email and WhatsApp dispatching **must never execute synchronously** during HTTP web request cycles.
* Outbound messages are written to `messages` with `status = 'queued'` and dispatched via an asynchronous job queue (e.g., BullMQ / Cloud Tasks).

### 4.6 Media & Static Asset Delivery
* All photos and static assets are served globally via a Content Delivery Network (CDN) backed by Object Storage (S3 / Cloud Storage).
* Application servers never serve binary image files directly.

### 4.7 Rate Limiting
* Enforced at the API Gateway / Nginx proxy layer:
  * Authentication endpoints (`/api/auth/*`): Max 10 requests per minute per IP.
  * Parent submission endpoints: Max 30 requests per minute per user.
  * Staff scanning endpoints (`/api/staff/scan`): Max 120 requests per minute per authenticated staff token.

---

## 5. Event-Day Scanning Reliability Protocol

Scanning accuracy and speed at the physical gates are mission-critical. The scanning engine operates under deterministic transactional rules.

### 5.1 Secure Cryptographic Passes
* QR codes must **never** encode sequential internal primary keys (e.g., `id = 412`).
* When marked *Pass ready*, the backend generates:
  * A readable pass code: e.g., `KOI-2026-A94K`.
  * A 256-bit cryptographically secure random token embedded in the QR payload: e.g., `koi_ps_8f92a4...`.
* The database stores only the SHA-256 hash (`pass_token_hash`) of the token. Scanners present the token; the server hashes it and performs an indexed lookup.

### 5.2 Transactional Scanning States
When staff scan a QR code or submit a manual pass code, the API executes a serializable database transaction returning one of these deterministic states:

| Status Code | Staff Screen Display State | Description & System Action |
| :--- | :--- | :--- |
| `SUCCESS_CHECKIN` | **Checked In (Success)** | Child successfully recorded inside gate. Shows child photo, room assignment, and care notes. |
| `SUCCESS_PICKUP` | **Picked Up (Success)** | Verified pickup person confirmed. Child released safely. |
| `ALREADY_CHECKED_IN` | **Already Checked In** | Warning: Child entered previously at `[Time]` at `[Gate Location]`. Prevents duplicate check-in. |
| `ALREADY_PICKED_UP` | **Already Released** | Alert: Child was already picked up at `[Time]` by `[Person Name]`. |
| `NOT_SELECTED` | **Pass Not Active** | Entry status is *Under review*, *Waiting list*, or *Not selected*. Direct parent to Info Desk. |
| `NEEDS_REVIEW` | **Manual Review Required** | Flagged with care exception or missing pickup photo. Route to Room Lead. |

### 5.3 Offline Scanning & Synchronization Protocol
To survive venue Wi-Fi or cellular dropouts:
1. **Manifest Preloading:** Before gate opening, staff devices download an encrypted offline manifest containing active passes for their assigned zone (pass hashes, child names, photo CDN URLs, pickup person photos).
2. **Local Scan Queue:** If network drops, scans are verified against the local manifest and recorded in local storage (`IndexedDB`) with timestamps and device-generated idempotency keys.
3. **Automatic Re-sync:** When connectivity resumes, devices batch-upload scans to `/api/staff/sync`. The backend processes records sequentially inside transactions, honoring timestamps and logging any state conflicts to `offline_sync_records` for admin audit.

---

## 6. Media Upload Rules

Photos and media are critical for gate safety verification and event operations. Strict upload governance applies:
* **Storage Location:** Uploads write directly to Cloudinary server-side via `/api/media/upload` configured with `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET`. `CLOUDINARY_API_SECRET` is never exposed to client bundles.
* **Folder Structure:** Organized automatically under `CLOUDINARY_UPLOAD_FOLDER` (default `koinonia-children-teens/` with subfolders `/parents`, `/children`, `/pickup-people`, `/events`, `/gallery`, `/videos`).
* **Metadata Separation:** Only sanitized metadata (`provider`, `public_id`, `secure_url`, `resource_type`, `mime_type`, dimensions, file size) is written to `media_files`. Base64 binary strings are never stored in databases.
* **Validation:** Accepted photo formats: JPEG, PNG, WebP (Max 5MB for profile photos; Max 10MB for landing/gallery). Accepted video formats: MP4, WebM (Max 50MB).
* **Fallback Guarantee:** If a network drop or missing URL causes an image load error, client views must catch the error cleanly or resolve via `/api/media/files/:fileId`. Broken image icons (`<img>` missing alt boxes) are strictly forbidden.

---

## 7. Security Controls

* **Password Security:** Passwords hashed using Argon2id or bcrypt (cost factor 12+).
* **Role Enforcement:** Server-side middleware verifies JWT role claims and checks active user status on every protected endpoint.
* **Validation Philosophy:** Frontend validation exists strictly for parent convenience and immediate UX feedback. Every payload is rigorously re-validated on the server using strict schema parsers (e.g., Zod) before database access.
* **Protected Routes:** Separate API route groups (`/api/parent/*`, `/api/staff/*`, `/api/admin/*`) enforce strict role filters.
* **Sensitive Data Protection:** QR payloads contain random opaque tokens only—no child names, dates of birth, phone numbers, or addresses.
* **Audit Trail:** Every status change, review note creation, check-in, pickup, and password modification generates an immutable activity log entry.

---

## 8. API Interface Specifications

### 8.1 Authentication Group (`/api/auth`)
* `POST /api/auth/register` — Create parent account with email and password.
* `POST /api/auth/login` — Authenticate credentials, return JWT access token and refresh token.
* `POST /api/auth/logout` — Invalidate refresh token session.
* `POST /api/auth/forgot-password` — Dispatch password reset link via email.
* `POST /api/auth/reset-password` — Verify reset token and update password hash.
* `GET /api/auth/me` — Retrieve authenticated user identity and role.

### 8.2 Parent Profile Group (`/api/parent/profile`)
* `GET /api/parent/profile` — Fetch current parent profile details.
* `PUT /api/parent/profile` — Update parent contact, address, worker status, and department.
* `POST /api/parent/profile/photo` — Request pre-signed upload URL for parent face photo.

### 8.3 Children Management Group (`/api/parent/children`)
* `GET /api/parent/children` — List all household children.
* `POST /api/parent/children` — Create a new child profile.
* `GET /api/parent/children/:id` — Retrieve specific child details.
* `PUT /api/parent/children/:id` — Update child medical notes, school class, or support needs.
* `POST /api/parent/children/:id/photo` — Request pre-signed upload URL for child photo.

### 8.4 Pickup People Group (`/api/parent/pickup-people`)
* `GET /api/parent/pickup-people` — List authorized pickup people for the parent household.
* `POST /api/parent/pickup-people` — Add a new approved pickup person with contact and photo.
* `PUT /api/parent/pickup-people/:id` — Update pickup person details.
* `DELETE /api/parent/pickup-people/:id` — Remove a pickup person (unless linked to active checked-in entry).

### 8.5 Event Entries & Passes Group (`/api/parent/entries`)
* `GET /api/parent/entries` — View all child entries across active/past events.
* `POST /api/parent/entries` — Submit child registration for an open event.
* `GET /api/parent/entries/:id/pass` — Retrieve active pass details, QR token, and gate instructions.

### 8.6 Staff Scanning Group (`/api/staff`)
* `POST /api/staff/scan` — Submit scanned pass token or manual pass code; perform transactional check-in or pickup.
* `GET /api/staff/manifest` — Download encrypted offline manifest for assigned event/zone.
* `POST /api/staff/sync` — Batch upload offline queued scans with idempotency verification.
* `GET /api/staff/lookup` — Search child entry by name or parent phone (requires Info Desk duty claim).

### 8.7 Admin Review & Operations Group (`/api/admin`)
* `GET /api/admin/entries` — Paginated query of child entries with filter by status, age group, and worker parent.
* `PUT /api/admin/entries/:id/status` — Update review status (*Selected*, *Waiting list*, *Pass ready*).
* `POST /api/admin/entries/:id/notes` — Append internal review annotation.
* `POST /api/admin/events/:id/generate-passes` — Batch generate cryptographic passes for selected entries.

### 8.8 Reporting & Analytics Group (`/api/reports`)
* `GET /api/reports/live-summary` — Real-time event-day dashboard metrics (checked-in, picked-up, inside gate).
* `GET /api/reports/demographics` — Breakdown by age group, gender, and infants under 2 years.
* `GET /api/reports/exceptions` — List attention-flagged entries and pickup override logs.
* `GET /api/reports/export/:event_id` — Download CSV/Excel final reconciliation export.

### 8.9 Messaging Group (`/api/messaging`)
* `POST /api/messaging/send` — Enqueue targeted email/WhatsApp status update to parent.
* `POST /api/messaging/broadcast` — Enqueue batch announcement to parents in specific status buckets.

> **Note on Email Provider (Resend Integration):**
> Resend is configured as the active transactional email provider over a verified sending subdomain (`EMAIL_PROVIDER=resend`), replacing legacy Gmail SMTP. Frontend bundles must never call Resend directly; all notifications are dispatched server-side via Express routes.

> **Note on Time-Based Greeting:**
> The parent dashboard greeting ("Good morning/afternoon/evening, [First Name]") is calculated dynamically based on the parent's local browser time (using the user's local system clock via JavaScript's `Date` object in the frontend), ensuring accuracy across different geographical time zones rather than relying on server-side time.

---

## 9. Admin Reporting Suite Requirements

The backend reporting engine must provide real-time aggregation across the following required reports:
1. **Total Children Added:** Count of all submitted child entries for the event.
2. **Total Selected / Pass Ready:** Approved participants assigned capacity.
3. **Total Not Selected / Waiting List:** Unselected entries awaiting capacity openings.
4. **Total Under Review:** Submissions pending review team triage.
5. **Total Checked In:** Children currently or previously checked in on event day.
6. **Total Picked Up:** Children safely released to verified pickup people.
7. **Total Still Inside:** (`Checked In` minus `Picked Up`) Live real-time muster count for venue safety.
8. **Age Group by Gender:** Crosstab distribution of infants, toddlers, children, and pre-teens by gender.
9. **Children Under 1 Year & Under 2 Years:** Critical nursery capacity counts requiring specialized creche ratios.
10. **Children Needing Attention:** Submissions flagged with medical notes, dietary allergies, or extra support flags.
11. **Pickup Exceptions:** Audit log of manual overrides, late pickups, or secondary guardian releases.
12. **Final Event Report:** Post-event reconciliation export combining full attendance timestamps, gate locations, and staff audit identifiers.

---

## 10. Testing Requirements

A comprehensive automated test suite must pass in CI/CD before any production deployment:
* **Unit Tests:** Verify age calculation formulas from date of birth, age-group assignment bounds, and input validation schemas.
* **API Integration Tests:** Verify full CRUD lifecycles for parent registration, child creation, pass generation, check-in transactions, and pickup release.
* **RBAC Security Tests:** Verify that Parent tokens cannot access staff/admin routes, and Staff tokens cannot access admin review functions.
* **Idempotency & Race Condition Tests:** Simulate concurrent duplicate scan requests with identical tokens and idempotency keys to verify that exactly one attendance record is created.
* **Offline Sync Verification:** Simulate delayed batch upload payloads containing past timestamps to verify correct state resolution and conflict logging.
* **Load & Spike Testing:** Execute k6 / Locust load simulations targeting 4,000 concurrent scan and status requests over 60 seconds, verifying sub-50ms API response p95 latencies and connection pool stability.

---

## 11. Strict No Demo Data Rule

To protect production integrity and prevent mock artifacts from bleeding into live deployments:
1. **No Hardcoded Demo Records:** Production code, views, and store modules must **never** contain hardcoded sample children, dummy parent profiles, or fake pass codes.
2. **Development Seed Flag Guard:** Any seed scripts used during local engineering must be isolated inside `/src/db/seeds/` and strictly gated behind an explicit `NODE_ENV=development` or `ENABLE_DEV_SEEDS=true` check.
3. **Intentional Empty States:** When a parent or staff view queries an empty dataset, the UI must render a helpful, beautifully styled empty state guiding the user on next actions (e.g., *"You haven't added any children yet. Tap below to add your first child."*).

---

## 12. Implementation Governance Rule

Before any frontend view or module transitions from screen prototype to deep interactive functionality:
* The view **must** consume models strictly conforming to the entities defined in Section 2 (`ParentProfile`, `ChildItem`, `EventEntry`, `EventPass`).
* Mock state management must structure data exactly matching the API payload schemas defined in Section 8.
* **No isolated ad-hoc state structures** are permitted if they cannot directly map to the relational PostgreSQL schema upon integration.
