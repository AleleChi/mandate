# Functional & Behaviour Guide

All implementation must strictly align with `/docs/backend-architecture.md`, `/docs/design-style-guide.md`, and the specifications below.

## 1. Product Roles
The application strictly enforces Role-Based Access Control (RBAC) across:
- **Parent or guardian:** Can manage own household, children, pickup persons, and event submissions.
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
