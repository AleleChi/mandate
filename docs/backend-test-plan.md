# Koinonia Children and Teens Access - Backend Verification Test Plan

This document defines the comprehensive verification and test plan for the Phase 1C Backend Hardening of the **Koinonia Children and Teens** event access management platform.

---

## 1. Test Environment Setup
- **Development Engine:** Local SQLite (`data/koinonia.db`).
- **Production Engine:** PostgreSQL specified via `DATABASE_URL`.
- **Requirements:**
  - Stateless Express server running on port `3000`.
  - Auth token signing using environment `JWT_SECRET`.
  - Media cache mapped to `data/media/` or cloud storage bucket.

---

## 2. Core Functional Test Scenarios

### Scenario 1: Parent Account Creation & Authentication
- **Test 1.1: Create Account**
  - **Action:** `POST /api/auth/create-account` with `fullName="Test Parent"`, `email="parent1@example.com"`, `phone="08011112222"`, `password="SecurePass123!"`.
  - **Expected Result:** Status `201 Created`, returns `token` (JWT) and `parentProfile` object. Password is hashed via `scryptSync` and never stored or returned in plaintext.
- **Test 1.2: Duplicate Account Block**
  - **Action:** Repeat `POST /api/auth/create-account` with `email="parent1@example.com"`.
  - **Expected Result:** Status `400 Bad Request`, error `"Account already exists with this email or phone number"`.
- **Test 1.3: Sign In**
  - **Action:** `POST /api/auth/sign-in` with valid credentials.
  - **Expected Result:** Status `200 OK`, returns valid `token` and profile.

---

### Scenario 2: Parent Profile Management
- **Test 2.1: Update Parent Profile**
  - **Action:** `PUT /api/parent/profile` with `Authorization: Bearer <token>`, payload `{ isWorker: 'Yes', department: 'Ushering', whatsapp: '08011112222' }`.
  - **Expected Result:** Status `200 OK`, profile saved to backend database.
- **Test 2.2: Department Requirement Rule**
  - **Action:** `PUT /api/parent/profile` with `{ isWorker: 'Yes', department: '' }`.
  - **Expected Result:** Status `400 Bad Request`, error `"Department is required for Koinonia workers"`.

---

### Scenario 3: Child Draft Creation & Persistence
- **Test 3.1: Create Child Draft**
  - **Action:** `POST /api/parent/children/draft` with initial step 1 payload `{ childDetails: { fullName: 'Grace Omikunle', gender: 'Female', dateOfBirth: '2018-05-10' } }`.
  - **Expected Result:** Status `201 Created`, returns child object with `id` (UUID starting with `child-` replaced by permanent UUID), `status="incomplete"`.
- **Test 3.2: Draft Refresh Resilience**
  - **Action:** `GET /api/parent/children` with Parent 1 token.
  - **Expected Result:** Status `200 OK`, list contains draft child with exact attributes.

---

### Scenario 4: Submission Validation & Review Status
- **Test 4.1: Block Incomplete Submission**
  - **Action:** `POST /api/parent/children/<childId>/submit` without providing school class or pickup person.
  - **Expected Result:** Status `400 Bad Request`, error indicating missing required field (e.g., `"School class is required"` or `"Pickup person details incomplete"`).
- **Test 4.2: Successful Submission for Review**
  - **Action:** Complete all required steps (photo, health confirmation, school class, pickup person details) and send `POST /api/parent/children/<childId>/submit`.
  - **Expected Result:** Status `200 OK`, child entry status transitions from `incomplete` to `under_review`, `submittedAt` timestamp recorded.

---

### Scenario 5: Access Control & Authorization Security
- **Test 5.1: Block Unauthorized Parent from Accessing `childId`**
  - **Action:** Sign in as Parent 2 (`parent2@example.com`). Attempt `GET /api/parent/children/<Parent1_ChildId>/status` or `PUT /api/parent/children/<Parent1_ChildId>/draft`.
  - **Expected Result:** Status `403 Forbidden`, error `"You do not have authorization to access this child profile"`.
- **Test 5.2: Unauthenticated API Block**
  - **Action:** Send request to `/api/parent/children` without `Authorization` header.
  - **Expected Result:** Status `401 Unauthorized`.

---

### Scenario 6: Event Pass Generation Rules
- **Test 6.1: Prevent Pass View Unless `pass_ready`**
  - **Action:** Send `GET /api/parent/children/<childId>/pass` while status is `under_review` or `incomplete`.
  - **Expected Result:** Status `403 Forbidden`, error `"Event pass is not ready yet"`.
- **Test 6.2: Secure Pass Reference & QR Generation**
  - **Action:** Update child status in database to `pass_ready` via verification workflow. Then call `GET /api/parent/children/<childId>/pass`.
  - **Expected Result:** Status `200 OK`, returns unique `passReference` formatted as `KOI-2026-XXXXXX`. QR code displays `passReference` without exposing database numerical or internal UUID identifiers.
