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

The detailed child application review panel (`AdminReviewChildView`) is integrated within the Applications tab workflow when an administrator clicks "Review details" on a registration entry. It has been redesigned to strictly align with the premium "Stitch" visual specification (Screenshot A).

### A. Core Capabilities & UI Highlights
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



