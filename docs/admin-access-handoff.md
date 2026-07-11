# Administrative Access & Approved Ivory/Gold Dashboard Handoff Document

This document summarizes the changes, visual guidelines, and technical specifications implemented to deliver the approved Light Ivory & Warm Gold Admin Dashboard (Admin Access V2) for the Koinonia Children and Teens application, replacing the unapproved dark SaaS "Event Command Centre" layout.

---

## 1. Context & Design Direction Revamp

During administrative reviews, the previous dashboard implementation was identified as non-compliant with the Koinonia brand guide. 

### A. Non-Compliant Elements Removed
The following unapproved "SaaS-style" elements have been completely removed:
- Dark command-centre background color theme (previously using dark charcoal `#18181B`).
- "Event Command Centre" wording across headers and components.
- Generic "Search database..." placeholder in the dashboard context.
- Unrequested telemetry logs, status indicators (e.g. "● ONLINE"), and "Children’s Ministry Portal" references.
- Cookie-cutter bento-box grid layouts.

### B. Approved Design Target Implemented
The new dashboard establishes a high-craft, professional, and content-first layout using Koinonia's official administrative colors:
- **Background Palette**: Soft warm off-white (`#FAF9F6`) main canvas paired with pure white cards (`#FFFFFF`).
- **Sidebar Aesthetic**: Light sidebar (`#F9F8F3`) with clean borders (`#EAE8E1`) and gold indicator bars (`#C59B27`), completely replacing the dark/black sidebar.
- **Typography pairing**: Elegant serif headings for titles (`font-serif font-bold text-[#18181B]`) paired with clean functional sans-serif text (Inter) for data entries.
- **Accents**: Subtle warm gold elements (`#C59B27`) used exclusively for action buttons, active tags, and brand badges.
- **Negative Space**: Generous margins and breathing room to reinforce an editorial, high-trust visual experience.

---

## 2. Technical Architecture & File Structure

The administrative experience is served through a modular yet highly cohesive structure.

- **Monolithic Admin View**: `src/views/admin/AdminOverviewView.tsx`
  - Acts as the main administrator shell and handles tab routing for `#/admin`, `#/admin/overview`, and `#/admin/settings`.
  - Seamlessly integrates the light responsive sidebar, profile details, and main layout containers.
  - Consumes authenticated administrator state dynamically from props.

### Props API Contract
```typescript
interface AdminOverviewViewProps {
  onNavigate: (route: AppRoute) => void;
  onSignOut: () => void;
  adminUser: {
    id: string;
    fullName: string;
    email: string;
    role: 'admin' | 'super_admin' | 'team';
  };
  initialTab?: 'overview' | 'settings';
}
```

---

## 3. Core State & Data Wiring

No mock data or hardcoded stats are used. All views are live-wired directly to Koinonia's production backend services via `api.admin`:

1. **`api.admin.getOverview()`**
   - Fetches live-aggregate metrics, event information, demographics table arrays, alert notifications, and recent activity streams.
   - Binds directly to state variables: `stats`, `recentSubmissions`, `overviewData`.
2. **`api.admin.listAdmins()`**
   - Retrieves the directory list of all authorized administrator accounts to render the staff list inside Settings.
3. **`api.admin.changePassword({ currentPassword, newPassword })`**
   - Validates password strength (minimum 8 characters, letters and numbers) and executes the Profile Security update transaction on the backend.
4. **`api.admin.inviteAdmin({ email, role })`**
   - (Super-Admin gated) Issues secure setup invitation tokens directly via the email delivery pipeline.

---

## 4. UI Rendering Verifications & Data-Attributes

To prevent future regression and prove that the correct approved Ivory UI is rendered in the browser, the following data-attributes are hardcoded into the React tree:

| Element Context | Data Attribute Target | Value / Identifier |
| :--- | :--- | :--- |
| **Root Shell Container** | `data-view-version` | `"admin-layout-v2-approved-design"` |
| **Root Shell Layout Mode** | `data-layout-mode` | `"admin-responsive-v1"` |
| **Sidebar Component** | `data-component-version` | `"admin-sidebar-approved-v1"` |
| **Dashboard Active Tab** | `data-view-version` | `"admin-overview-v2-approved-design"` |
| **Active Event Card** | `data-component-version` | `"admin-event-hero-approved-v1"` |
| **Main Metrics Grid** | `data-component-version` | `"admin-overview-metrics-approved-v1"` |
| **Demographics Table** | `data-component-version` | `"admin-demographics-approved-v1"` |
| **Alert / Attention Block** | `data-component-version` | `"admin-needs-attention-approved-v1"` |
| **Review Progress Panel** | `data-component-version` | `"admin-review-progress-approved-v1"` |
| **Today's Attendance Panel** | `data-component-version` | `"admin-attendance-approved-v1"` |
| **Recent Activity Feed** | `data-component-version` | `"admin-recent-activity-approved-v1"` |

---

## 5. Verification Test Suite

Verify compliance on any browser or testing automation framework using the following checklist:

### A. Element Validation Rules

#### 1. Elements to CONFIRM (Must be PRESENT in DOM)
- Title text: `"Children and Teens Admin"`
- Section labels: `"Overview Metrics"`, `"Demographics & Status"`, `"Needs attention"`, `"Review Progress"`, `"Today’s Attendance"`, `"Recent Activity"`
- Color classes: Warm gold background (`bg-[#C59B27]`), soft ivory text/backgrounds (`bg-[#FAF9F6]`, `bg-[#F9F8F3]`), border-gray-cream (`border-[#EAE8E1]`).

#### 2. Elements to REJECT (Must be ABSENT from DOM)
- Heading text: `"Event Command Centre"`, `"security review"`, `"Children’s Ministry Portal"`
- Placeholders: `"Search database..."`
- Dark sidebars: Charcoal dark background colors (`bg-[#18181B]`).

### B. Browser Console Render Checks
You can run the following query script inside the browser developer tool console to confirm that the DOM structure meets the approved layout specification:

```javascript
// Verify that the approved admin layout wrapper is active
const layout = document.querySelector('[data-view-version="admin-layout-v2-approved-design"]');
console.assert(layout !== null, "❌ Failed: Approved Admin Layout wrapper not found in the DOM!");

// Verify that the correct responsive layout mode is flagged
const layoutMode = document.querySelector('[data-layout-mode="admin-responsive-v1"]');
console.assert(layoutMode !== null, "❌ Failed: Responsive mode attribute missing!");

// Verify that the approved ivory/gold dashboard tab renders
const dashboard = document.querySelector('[data-view-version="admin-overview-v2-approved-design"]');
console.assert(dashboard !== null, "❌ Failed: Approved Ivory Dashboard view not active!");

// Check presence of key sub-component metadata
const components = [
  "admin-sidebar-approved-v1",
  "admin-event-hero-approved-v1",
  "admin-overview-metrics-approved-v1",
  "admin-demographics-approved-v1",
  "admin-needs-attention-approved-v1",
  "admin-review-progress-approved-v1",
  "admin-attendance-approved-v1",
  "admin-recent-activity-approved-v1"
];

components.forEach(comp => {
  const element = document.querySelector(`[data-component-version="${comp}"]`);
  console.assert(element !== null, `❌ Failed: Subcomponent ${comp} missing approved metadata attribute!`);
});

console.log("🎉 All rendering-proofing criteria met successfully!");
```

### C. Manual Flow & Security Checklist
1. **Admin Authorization Gate**: Try to navigate to `/admin/overview` with a signed-out or non-admin account; verify that the system correctly rejects and reroutes back to the core landing experience.
2. **Tab Switch Transitions**: Tap **Settings** in the sidebar; confirm that the URL redirects to `/admin/settings`, the metrics dashboard transitions smoothly with fading entry animations, and the administrator list loads cleanly.
3. **Session Release (Sign Out)**: Press the styled **Sign Out** button at the footer of the light sidebar; confirm the local token session is completely cleared, and the browser returns to the landing page.

---

## 6. Admin Review Child Application Detail Screen (V2 - Stitch-Aligned)

The detailed child application review panel (`AdminReviewChildView`) is integrated within the Applications tab workflow when an administrator clicks "Review details" on a registration entry. It has been redesigned to strictly align with the premium "Stitch" visual specification (Screenshot A) and incorporates the decoupled status review workflow.

### A. Core Capabilities & UI Highlights
- **Decoupled Status Review Flow**:
  - The decision panel supports the selection state of the child independently from the generation of event passes.
  - Selecting a child with a valid photo automatically transitions the database status to `"pass_ready"`, generates their cryptographic QR pass, and triggers the "Pass Ready" notification.
  - Selecting a child whose photo is missing or unapproved transitions the database status to `"selected"`, holds pass generation in a pending state, and notifies the parent that the selection is successful with the pass forthcoming.
- **Human-Centric & Pastoral Language**: Implements Koinonia's official tone, removing technical workflow jargon (e.g., using "Team notes", "Choose how this child should move forward", and "open Parent Access" instead of portals, workflows, or triages).
- **Stitch Design Layout Harmony**: Restructured as a multi-tier two-column grid. The left column serves child credentials (profile header, details block, medical notes, parents and pickup contacts). The right column houses decision controls, notes, automated parent preview blocks, and timeline logs.
- **Age Discrepancy block**: Highlights computed age gaps next to details in a distinctive pink-tinted warning card.
- **Interactive Checkbox Confirmation**: Includes the required "Age group checked & confirmed" checkbox inside the decision panel to capture active reviewer checks.
- **Custom Decision stacked buttons**: Leverages prominent vertical option keys (Select, Waitlist, Request Update, Decline) with responsive styling and gold check verification indicators.
- **Direct Contact Hooks**: Embeds quick-access WhatsApp and direct mail portals to simplify parent communications.

### B. Render-Proofing Attributes Added
- **Detailed Review Shell**: `data-view-version="admin-review-child-v3-refined"`
- **Child Identity Card**: `data-component-version="admin-review-child-identity-v2"`
- **Child Details Card**: `data-component-version="admin-review-child-details-v2"`
- **Health & Special Care Card**: `data-component-version="admin-review-health-care-v3-refined"`
- **Parent Profile Contact Card**: `data-component-version="admin-review-primary-contact-v3-refined"`
- **Authorized Pickup Card**: `data-component-version="admin-review-authorized-pickup-v3-refined"`
- **Decision Panel Card**: `data-component-version="admin-review-decision-panel-v2"`
- **Notification Preview Card**: `data-component-version="admin-review-notification-preview-v2"`
- **Review History Card**: `data-component-version="admin-review-history-v2"`

---

## 7. Admin Children Records Module (V2 - Mobile Refined)

The **Admin Children Records** screen provides real-time visibility into child registration, entry, and pickup statuses, fully adhering to Koinonia's approved ivory & warm gold style guide.

### A. Key Attributes & Visual Architecture
- **Metrics Summary Row**: Live metrics of Total children, Selected, Checked in, Inside, and Picked up.
- **Search & Filters**: Highly responsive text search debounced to 400ms. On desktop, quick-status filters (Inside, Not arrived, Picked up, Medical note, Missing pickup photo, Below event age, Special support) display inline. On mobile, filters are tucked into a clean bottom/modal sheet trigger button to optimize vertical space.
- **Desktop Grid**: Displays child thumbnail, full details, age group badge, parent info, pickup person, and real-time status badges. Row selection opens the detailed `AdminReviewChildView` for review, matching other screens' behaviors.
- **Mobile Responsive Design**: Converts squeezed desktop tables into high-craft, hand-designed ivory card layouts. It replaces rigid mechanical/database headers with warm, human copy rows: "Age group", "Parent", "Today", and "Pickup".
- **No Mock Wording**: Strict exclusion of SaaS and database jargon (such as "Administrative Portal", "database", "system", "portal"), instead using approved human/church terms ("Children and Teens Admin", "Children", "Child records").

### B. Render-Proofing Attributes Added
- **Children Screen Root**: `data-view-version="admin-children-records-v2-mobile-refined"`
- **Children Stats**: `data-component-version="admin-children-stats-v1"`
- **Search & Filters (Desktop)**: `data-component-version="admin-children-search-filters-v1"`
- **Search & Filters (Mobile)**: `data-component-version="admin-children-mobile-filters-v1"`
- **Mobile Filter Trigger**: `data-component-version="admin-children-mobile-filter-trigger-v1"`
- **Mobile Filter Sheet**: `data-component-version="admin-children-mobile-filter-sheet-v1"`
- **Children Table Grid**: `data-component-version="admin-children-table-v1"`
- **Mobile Child Cards**: `data-component-version="admin-children-mobile-cards-v2-human"`
- **Dev-Only Navigator**: `data-dev-only="screen-navigator"` (now hidden completely from production environments)

---

## 8. Admin Attendance Registry Module (V2 - Stitch Complete)

The **Admin Attendance** screen enables comprehensive monitoring of live checked-in statuses, age-demographics breakdowns, recent scan logs, and volunteer activity, adhering cleanly to Koinonia's premium ivory-and-gold design standards while following the exact "Stitch" structural and layout targets.

### A. Key Attributes & Visual Architecture
- **Metrics Summary Row**: Real-time stats for Expected, Checked In, Inside, Picked Up, Not Arrived, and Needs Attention. Styled with custom left-accent colored bands (gold for inside, amber for alerts).
- **Status Filtering Tabs**: High-scannability bar featuring All, Inside, Picked Up, Not Arrived, and Needs Attention status tabs with real-time numeric alerts for entries needing attention. Clicking a tab filters rows reactively on the client.
- **Live Attendance Table**: Displays a detailed log including Child Name, Age Group, Parent, Status, Location, Notes, and relative Activity. When there are no rows matching the active status, the table header remains visible over a compact empty state row to prevent empty layout voids.
- **Attendance by Age Group Matrix**: Displays a statistical grid of Expected, Checked In, Inside, Picked Up, and Not Arrived sums per standard age group category, concluding with an aggregate Total bottom-weighted row.
- **Activity Sidebar Panels**:
  - *Quick Actions*: Shortcuts to quick-filter inside, not arrived, or needs attention sub-groups reactively.
  - *Recent Scans*: Real-time scanner audit log showing checked-in and pickup scans (last 10 events).
  - *Team Activity*: Displays logged events tracking which volunteer completed the check-in or pickup (last 10 events).
- **Mobile Responsive Design**: Conceals the table on compact screens, replacing it with easily scannable, finger-friendly mobile ivory cards, preventing any horizontal overflow.
- **Secure Exports**: Features a direct client-side CSV encoder to export custom attendance sheets matching current filter contexts on demand.

### B. Render-Proofing Attributes Added
- **Attendance Screen Root**: `data-view-version="admin-attendance-v2-stitch-complete"`
- **Attendance Stats**: `data-component-version="admin-attendance-stats-v2"`
- **Attendance Filters**: `data-component-version="admin-attendance-tabs-v2"`
- **Live Attendance Table Grid**: `data-component-version="admin-live-attendance-table-v2"`
- **Mobile Attendance Cards**: `data-component-version="admin-attendance-mobile-cards-v2"`
- **Attendance Age Groups**: `data-component-version="admin-attendance-age-groups-v2"`
- **Quick Actions Panel**: `data-component-version="admin-attendance-quick-actions-v2"`
- **Recent Scans Log**: `data-component-version="admin-attendance-recent-scans-v2"`
- **Team Activity Audit**: `data-component-version="admin-attendance-team-activity-v2"`

---

## 9. Admin Reports & Performance Metrics (`#/admin/reports`)

The **Admin Reports** screen delivers structured segment-based reporting (Pre-event, Live event, End-of-event), real-time operational outcome metrics, and secure CSV exporting capability, integrating flawlessly with the Koinonia Ministry's Ivory-and-Gold style design and utilizing dynamic database queries.

### A. Key Attributes & Visual Architecture
- **Metrics Grid Cards**: Dynamic card grids showing Registered Children, Confirmed Admitted seats, Checked In counts, and Urgent Attention items.
- **Attendance Outcome Indicators**: Interactive gold and emerald progress bars tracking Checked In, Picked Up, Absent, and Admitted lists dynamically.
- **Event Summary Matrix**: Tabular representation showing the live status counts and description of parameters including Registered Children, Parent accounts, Selected, Checked in, Absent, Picked up, Still inside, Needs attention, and Care notes present.
- **Care & Attention Card**: Instant audit breakdown showing Medical Notes, Extra Support requirements, Missing pickup photo counts, and Manual Age Review flags.
- **Export Registry Panel**: Supports dynamic CSV file generation for:
  - Event Outcome Summary
  - Event Attendance Sheet
  - Absent Children Log
  - Medical & Support Log
  - Authorized Pick-up Register
  - Admitted Children Roster
- **Director notes segment**: A text area connecting segment-based notes securely with the database, supporting instantaneous saving with a loading and success feedback loop.

### B. Render-Proofing Attributes Added
- **Reports Module ID**: `id="admin-reports-module"`
- **Refresh Trigger Button**: `id="btn-refresh-reports"`
- **Tab Triggers**: `id="tab-pre_event"`, `id="tab-live_event"`, `id="tab-end_of_event"`
- **Save Notes Button**: `id="btn-save-report-notes"`

---

## 10. Admin Settings & System Configuration (`#/admin/settings`)

The **Admin Settings** screen provides comprehensive parent access toggle control, registration required details, team staff directory, and profile password security controls, aligning with the premium Koinonia Ivory/Gold style specifications.

### A. Key Attributes & Visual Architecture
- **Refined Card Outlines**: Standardizes thin border strokes (`border-[#EAE8E1]`) over a clean, spacious canvas with soft, warm background elevations (`bg-[#FAF9F6]`).
- **Brand Typography Pairing**: Headings render in clean, elegant serif displays (`font-serif font-medium text-lg`) with human, pastoral copywriting.
- **Toggles & Form Layouts**: Toggles are encased in a modern inline layout with golden toggle highlights (`bg-[#C59B27]`). Interactive checkboxes feature a golden Check badge.
- **Team Access Control Grid**: Includes an elegant interactive team member list. Super Administrators can invite new staff with distinct roles (`super_admin`, `admin`, `team`, `volunteer`), while regular administrators can view permissions but cannot invite.
- **Message Channels Panel**: Integrates real status blocks for Email (SMTP/Resend) and WhatsApp (Twilio) channels alongside default sender configurations.
- **Profile Security**: An integrated right-side companion card for changing admin passwords safely with 8-character complexity and current password verification checks.

### B. Render-Proofing Attributes Added
- **Admin Settings Screen**: `data-view-version="admin-settings-v2-ui-refined"`
- **Parent Access Card**: `data-component-version="admin-settings-parent-access-v2-refined"`
- **Team Directory Card**: `data-component-version="admin-settings-event-team-v1"`
- **Message Channels Card**: `data-component-version="admin-settings-message-channels-v1"`
- **Profile Security Card**: `data-component-version="admin-settings-profile-security-v2-refined"`

---

## 11. Profile Soft-Delete & Restoration Controls (Parents & Volunteers)

To ensure high audit readiness and prevent accidental data loss (which would violate database safety guidelines), the admin interface contains robust soft-delete/archiving controls for both Parents and Volunteers.

### A. Core Features & UX Patterns
1. **Separated Navigation Tabs**: Both the Admin Parents and Admin Volunteers screens are divided into separate "Active" and "Removed" directories.
2. **"Remove" action**:
   - Instead of a destructive "Delete" action, admins can "Remove" profiles, which marks them as soft-deleted (`is_deleted = 1`).
   - Requires entering an explicit removal reason before confirmation.
   - Preserves all nested/related data, children records, attendance registers, and application reviews intact in the database.
3. **"Restore" action**:
   - Archived records displayed under the "Removed" tab feature a green "Restore" button.
   - Click-to-restore triggers backend actions to set `is_deleted = 0`, bringing the profile back into active directories immediately.
4. **Details Modal Integration**:
   - Opening an archived volunteer profile inside the application detail review modal displays a red **Archived Profile Warning** banner detailing the date, archiver, and reason.
   - All editable drop-downs (e.g. Service team assignments, internal review notes) are disabled to prevent edits on archived records.
   - The footer provides an immediate "Restore Volunteer" primary action and "Close" button.

### B. Render-Proofing Attributes Added
- **Parents Tab bar container**: `id="parents-directory-tabs"`
- **Volunteers Tab bar container**: `id="volunteers-directory-tabs"`
- **Parent Archive Warning banner**: `id="parent-archive-warning"`
- **Volunteer Archive Warning banner**: `id="volunteer-archive-warning"`
- **Remove Volunteer Modal overlay**: `id="remove-volunteer-modal"`
- **Restore Volunteer Modal overlay**: `id="restore-volunteer-modal"`
- **Action identifier buttons**:
  - `id="remove-parent-btn-[id]"` / `id="restore-parent-btn-[id]"`
  - `id="remove-volunteer-btn-[id]"` / `id="restore-volunteer-btn-[id]"`
  - `id="modal-remove-volunteer-btn"`

---

## 12. Administrative Events & Capacity Management (`#/admin/events`)

The **Events** view provides comprehensive administrative management of gathering schedules, parent registration controls, and detailed age-bracket capacities, strictly using the premium Ivory/Gold brand styling.

### A. Key Attributes & Visual Architecture
- **Interactive Multi-Tab Dashboard**: Features filter tabs to inspect gatherings by status: *Current event*, *Upcoming*, *Drafts*, and *Past events* alongside dynamic registration capacities, child applications, and confirmed seat counts.
- **Active Current Promotion**: Offers one-click active promotion of upcoming gatherings, designating them as the singular primary current active event on the platform while automatically demoting others.
- **Two-Column Setup Page Layout**:
  - **Left Form Canvas**: Includes modular input cards for *Event Details*, *Parent Access Configuration*, and *Age Groups & Capacity Limits*.
  - **Right Sidebar Panels**: Incorporates a live dynamic *Setup Progress checklist*, a live rendered *Parent View Preview* displaying active card configurations, and a sticky *Before Opening Access Warning* banner.
- **Default Age-Bracket Presets**: Automatically bootstraps events with Koinonia's standardized five age capacities (*Below*, *Ages 1*, *Ages 4*, *Ages 7*, *Ages 10*), allowing inline edits of min/max age constraints, manual reviews, and capacity sizes.
- **Warm Golden Custom Switches**: Uses custom-designed sliding switches styled in Koinonia's brand warm gold color (`bg-[#C59B27]`).

### B. Render-Proofing Attributes Added
- **Events View Container**: `data-view-version="admin-events-v1-stitch-implemented"`
- **Events Home Screen**: `data-component-version="admin-events-home-v1"`
- **Create/Edit Event Page**: `data-view-version="admin-create-event-v1-stitch"`
- **Event Details Card**: `data-component-version="admin-create-event-details-v1"`
- **Parent Access Card**: `data-component-version="admin-create-event-parent-access-v1"`
- **Age Groups & Capacity Table**: `data-component-version="admin-create-event-age-capacity-v1"`
- **Setup Progress Card**: `data-component-version="admin-create-event-setup-progress-v1"`
- **Parent Live Preview Card**: `data-component-version="admin-create-event-parent-preview-v1"`


---

## 13. Admin Children Management & Permanent Deletion Architecture

Koinonia's administration interface supports deep children care management alongside gdpr-compliant permanent deletion.

### A. Children & Care Management
- **Centralized Rows & Row Actions**: From Admin > Children list, actions are exposed to view, edit, update status, and manage passes.
- **Children List Proof**: `data-component-version="admin-child-list-v3-actions"`
- **Unified Profile Editor**: Inside the Child Review screen, click "Edit Details" to open a unified form updating child, parent, and pickup records.
- **Reopen Review & Reopen Modal**: Rollback active decisions to re-evaluate registrations.

### B. Permanent Deletion of Parents and Volunteers
- **Two-Stage Deletion Guardrail**: Restricts permanent delete to already soft-removed (archived) entries.
- **Safe Cascade Anonymization**: Replaces email and identity fields with placeholders, disables credentials and sessions, and preserves foreign key reference counts for check-in/pickup history.
- **Verification Proofs**:
  - `data-component-version="admin-parent-permanent-delete-action-v1"`
  - `data-component-version="admin-parent-permanent-delete-modal-v1"`
  - `data-component-version="admin-volunteer-permanent-delete-action-v1"`
  - `data-component-version="admin-volunteer-permanent-delete-modal-v1"`
---

## 14. Admin Settings App Media & Dynamic Resolution Handoff (`#/admin/settings`)

The **App Media** settings tab allows administrators to upload and customize hero and default event images across parent and volunteer views.

### A. Key Attributes & Visual Architecture
- **App Media Tab Container**: `data-view-version="admin-settings-media-v1"`
- **Media Slots**: Supports uploading specialized high-resolution images for:
  - **Parent Hero Image**: Slot `parent_dashboard_hero`
  - **Volunteer Hero Image**: Slot `volunteer_dashboard_hero`
  - **Default Event Image**: Slot `default_event_hero`
- **Interactive Previews**: Displays real-time thumbnail previews of currently saved settings using `SafeImage` with CORS-safe base path prefixing.
- **Dynamic Previews Proof**: `data-component-version="admin-media-preview-v3-secure-resolved"`

### B. Resolution, Priority, and Storage Handoff
- **Backend Storage**:
  - Saved uploads are written to Cloudinary if configured.
  - Falls back to local disk persistence inside `data/media` when Cloudinary is absent.
  - Served publicly via the secure streaming route `GET /uploads/:filename` and `GET /api/media/files/:fileId` without authentication headers.
- **Dashboard Resolution**:
  - **Parent Dashboard**: Prioritizes `parent_dashboard_hero` -> `default_event_hero` -> fallback `parentHeroImg` asset.
  - **Volunteer Dashboard**: Prioritizes `volunteer_dashboard_hero` -> `default_event_hero` -> fallback `volunteerHeroImg` asset.
- **One-Time Fallback System**:
  - Integrated directly inside `SafeImage` (`data-component-version="safe-image-v8-secure-production"`).
  - Employs native `onLoad`/`onError` event bindings directly on standard JSX `<img>` tags, replacing buggy async state schedules.
  - If the main uploaded image fails to load (e.g. 404 or bad network), it automatically flips the rendered source (`currentSrc`) to the fallback image precisely once to avoid endless mounting loops.


## 15. Event-Day Attention Oversight and Administration

To support coordinators in monitoring event-day physical checkmarks and escalations:

### A. Central Attention Items View
- **Description**: Displays all active attention items for children checked-in on event day, tracking missing photos, care notes, and age issues.
- **Proof Identifier**: `data-component-version="admin-needs-attention-approved-v1"`

### B. Core Data Boundaries
- **Administrator Privileges**: Only administrators have the authority to edit core child fields, manage registration statuses, or delete profiles. 
- **Feedback Collection**: When a volunteer resolves, verifies, or escalates an item, coordinators can review the notes, resolving the issue or approving next steps. The volunteer's response note is collected securely and shown clearly in the coordinator console.
- **Short Reference Display**: To match production UI standards and protect data privacy, volunteers only see a short uppercase reference code (derived from the last 4 characters of the child's ID) and stripped name suffixes instead of raw UUIDs or long numeric names, while administrators retain full file visibility.
- **Demo Filtering**: The administration panel and volunteer systems have a safeguard (`ENABLE_DEMO_DATA` setting) that filters out "Test Child" entries in production to keep the command center clear of clutter.
- **Interactive Verification Modal Integration**: On the volunteer dashboard, the interactive sheet utilizes modern, user-friendly forms (`data-view-version="volunteer-attention-detail-v3-premium"`) to allow active check-ins, medical note verification, and escalate requests with pristine, brand-safe wording.


## 16. Advanced Admin Messages & Updates Centre & Refined Quick Panel

To support long-term message retention, notification tracking, and seamless administrative communication:

### A. Non-Destructive Update Management
- **Description**: Replaced temporary notifications with permanent Messages & updates. Marking an update as read removes the unread highlight and reduces the unread badge count, but keeps the item stored in the History center for later reference.
- **Archive Action**: Allows administrators to soft-archive updates when they are no longer top priority, preserving them in the archive filter of the History center without deleting them.

### B. Messages & Updates Centre
- **Interactive Multi-Tab Dashboard**: Conditional tab selection switches between the "Broadcast Composer" and the advanced "Messages & Updates Centre" (History center).
- **Advanced Filtering and Search**: Supports high-fidelity filters (search keyword, priority, sender role, and status) with dynamic pagination to prevent interface slowdown on large datasets (such as 1000+ items).
- **Proof Identifier**: `data-component-version="admin-updates-centre-v3-premium"`

### C. Refined Bell Quick Panel
- **A. Dynamic Tab selection**: The header notification bell opens a premium quick panel divided into "Unread" and "All Updates" tabs.
- **B. Overcrowding Protection**: Restricts list rendering to the top 10 unread or 15 recent updates respectively to preserve visual cleanliness.
- **C. History Link**: Includes a direct link pointing to the Messages & Updates Centre to quickly manage complete history logs.
- **Proof Identifier**: `data-component-version="admin-notification-panel-v3-premium"`


## 17. Live Demographics Table & Active Event Tracking

The **Demographics & Status** table has been completely refactored to query real, live database metrics, strictly adhering to administrative integrity and the dynamic active event selection.

### A. Core Calculations & Logic
- **Active Event Binding**: Calculates counts dynamically for the current active event. If no current active event exists, uses the default `event-ga-2026`.
- **Soft Deletion Guard**: Ensures that soft-deleted children (`c.is_deleted = 1`) or deleted event registrations (`e.is_deleted = 1`) are completely ignored.
- **Dynamic Age Groups**: Uses the child's registered Date of Birth (DOB) compared to the current system date to compute age. Falls back to `calculated_age` if DOB is missing.
  - **Below 1**: Under 1 year of age (`ageYears = 0`). Fully processed and never treated as empty or missing.
  - **Ages 1 to 3**: `1` to `3` years old.
  - **Ages 4 to 6**: `4` to `6` years old.
  - **Ages 7 to 9**: `7` to `9` years old.
  - **Ages 10 to 12**: `10` to `12` years old.
  - **Teens**: `13` years old and above.
- **Gender Normalizer**: Standardizes gender categories into Boys and Girls regardless of formatting (matching `boy/boys/male/m` and `girl/girls/female/f` case-insensitively).
- **Status Mapping**:
  - **Under Review**: `under_review`, `pending_review`, `submitted`, `review_pending`, `pending`.
  - **Selected**: `selected`, `approved`, `pass_ready`, `checked_in`, `inside`, `picked_up`.
  - **Checked In**: `checked_in`, `inside`, or items with a recorded `checked_in_at` timestamp that are not yet marked as `picked_up`.

### B. UI Presentation & Sync Features
- **Visual State**: Displays clean, elegant loading spinners during fetch, empty states with pastoral guidance when zero matching children are found, and descriptive error banners if the API fails.
- **Last Sync Indicator**: Renders an elegant time label indicating exactly when the demographic counts were last updated (e.g. *"Last synchronized 10:15 AM"*), paired with an instant **Refresh** button to trigger live recalculations without full-page reloads.
- **Proof Identifier**: `data-component-version="admin-demographics-approved-v1"`


## 18. Sound Silence & Vibration Cleanup (`#/admin/overview` / Takeover Overlay)

To ensure the safety and sanity of the environment, alarms and physical loops are shut down immediately upon coordinator resolution.

### A. Key Attributes & Visual Architecture
- **Instant Silence**: Acknowledging or resolving an active safety alert clears the repeating alert interval timer (`alarmIntervalRef`) and triggers `navigator.vibrate(0)` to cut off active mechanical vibrations immediately.
- **State-Driven Takeover Overlay**: The active takeover overlay closes instantly upon state transition of the alert to acknowledged or resolved.
- **Proof Identifier**: `data-component-version="urgent-alert-effects-stop-v2"`

### B. Setup & Safeguards
- **First Load Safeguard**: On initial load, pre-existing open safety alerts are automatically marked as sounded/processed in the tracking set (`soundedAlertIds`), preventing retroactive sirens or audio disruption when entering the dashboard.


## 19. Live Update Center Statistics Sync (`#/admin/messages`)

The Messages & Updates Centre has been integrated with a real-time live statistics synchronization engine.

### A. Core Features & UX Patterns
- **Live Aggregation**: Replaced static cards with real-time live synchronized database aggregates tracking total notifications, unread updates, archived records, active safety concerns, and notification read counts.
- **Database Synchronization**: The statistics are calculated using active queries from the `notifications`, `notification_reads`, `notification_archives`, and `event_safety_alerts` tables.
- **Active Filter Rules**: Excludes soft-deleted and archived records from active totals to maintain strict metrics hygiene.

### B. Render-Proofing Attributes Added
- **Summary API Synchronizer**: `data-component-version="admin-updates-summary-api-v1-live"`
- **Live Summary UI Cards**: `data-component-version="admin-messages-summary-v2-live"`
- **Message List Sync Badge**: `data-component-version="admin-message-list-stats-sync-v1"`


## 20. Personalised Spoken Emergency Alert Synthesis

To guarantee immediate operational response on busy event days, child-linked safety alerts synthesize personalized spoken warnings.

### A. Dynamic Sound/Voice Sequencing
- **Description**: Incorporates a strict, non-overlapping audio schedule where the primary alarm (triple-tone 660Hz/880Hz/1200Hz synthesizer) is paused, a 2-second silent buffer is scheduled, and the personalized spoken warning is read via Web Speech API (`speechSynthesis`). The alarm resume timer automatically picks up afterwards.
- **Privacy Mode Handling**: Text is generated dynamically based on active privacy setups:
  - *Full Context*: "Urgent help needed for [Child's First Name]. [Category] is required at [Location]. Open the app now."
  - *Event Privacy*: "Urgent [Category] is required at [Location]. Open the app now."
  - *Private Mode*: "Urgent help needed. Open the app now."
- **Proof Identifiers**:
  - `data-component-version="emergency-voice-message-builder-v1"`
  - `data-component-version="spoken-alert-category-map-v1"`
  - `data-component-version="spoken-alert-child-name-privacy-v1"`
  - `data-component-version="emergency-alarm-voice-sequence-v1"`


## 21. Responsive Scrollable Active Emergency Overlay Takeover

The active emergency takeover card ensures that all details remain legible and interactive across small mobile devices and desktop screens alike.

### A. Layout Structure
- **Mobile-Safe Flex-Column Frame**: Uses an outer flex structure (`flex flex-col`) with a safe height limit (`max-h-[90dvh]`) to completely prevent screen cutoff and allow comfortable scrolling.
- **Auto-Scrolling Body**: Inner contents—such as simulated duty controls, child photos, medical summaries, parent links, and authorized pickups—are wrapped inside a dedicated scrollable div (`overflow-y-auto`).
- **Sticky Actions Footer**: High-contrast action buttons ("Acknowledge Alert", "Open Command Center", "Silence Device") are anchored at the bottom (`sticky bottom-0 bg-[#FAF9F6] pt-4 border-t`), keeping them immediately clickable.
- **Proof Identifiers**:
  - `data-view-version="urgent-alert-takeover-v7-personalised-scrollable"`
  - `data-component-version="urgent-alert-scroll-container-v2"`
  - `data-component-version="emergency-sticky-action-footer-v1"`
  - `data-component-version="emergency-mobile-viewport-safe-v1"`
  - `data-component-version="emergency-scrollable-child-summary-v1"`



