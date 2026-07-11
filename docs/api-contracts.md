# Koinonia API Contracts Specification

This document details the RESTful HTTP endpoints implemented for parent-facing operations in the Koinonia Children and Teens application.

## Authentication & User Session (`/api/auth`)

### POST `/api/auth/create-account`
Registers a new parent user account and creates an initial parent profile.
- **Request Body**:
  ```json
  {
    "email": "parent@example.com",
    "password": "SecurePassword123",
    "fullName": "Grace Omikunle",
    "phone": "+2348031234567",
    "whatsapp": "+2348031234567"
  }
  ```
- **Response** (`201 Created`):
  ```json
  {
    "token": "<jwt-token>",
    "user": { "id": "uuid", "email": "parent@example.com", "role": "parent" },
    "profile": { "id": "uuid", "fullName": "Grace Omikunle", ... }
  }
  ```

### POST `/api/auth/sign-in`
Authenticates an existing parent user.
- **Request Body**:
  ```json
  { "email": "parent@example.com", "password": "SecurePassword123" }
  ```
- **Response** (`200 OK`): Returns JWT token, user object, and parent profile.

### GET `/api/auth/me`
Retrieves current authenticated user and profile session. Requires `Authorization: Bearer <token>`.

### POST `/api/auth/verify-email`
Verifies a secure token hash, marks the user's email as verified, and sets the token as used.
- **Side-Effects**: If the verified user has a `volunteer` role, automatically triggers the "under-review" email notice using the `sendVolunteerUnderReviewEmail` helper to let them know their registration is pending administrative review.
- **Request Body**:
  ```json
  { "token": "raw-hex-token-string" }
  ```
- **Response** (`200 OK`):
  ```json
  { "success": true, "message": "Email verified successfully." }
  ```
- **Error Responses**:
  - `400 Bad Request`: Token is missing, expired, already used, or invalid.
  - `500 Internal Server Error`: Safe generic response for server-side exceptions.

### POST `/api/auth/resend-verification`
Generates a new verification token and dispatches a link to the parent's email.
- **Request Body**:
  ```json
  { "email": "parent@example.com" }
  ```
- **Response (Unverified Account)** (`200 OK`):
  ```json
  { "success": true, "message": "Verification link has been sent." }
  ```
- **Response (Already Verified Account)** (`200 OK`):
  ```json
  { "success": true, "alreadyVerified": true, "role": "parent", "emailSent": false, "message": "This email is already confirmed. You can sign in." }
  ```

### POST `/api/auth/forgot-password`
Dispatches a password reset notification email if the email exists.
- **Request Body**:
  ```json
  { "email": "parent@example.com" }
  ```
- **Response** (`200 OK`):
  ```json
  { "success": true, "message": "If an account exists with that email, recovery steps have been sent." }
  ```

### POST `/api/auth/reset-password`
Validates the parent reset token, hashes the new password, updates the users table password_hash, and marks the token used.
- **Request Body**:
  ```json
  {
    "token": "<reset-token>",
    "password": "NewSecurePassword123"
  }
  ```
- **Response** (`200 OK`):
  ```json
  { "success": true, "message": "Your password has been updated. You can now sign in." }
  ```

- **Note on Email Notifications**:
  Resend is configured as the active transactional email provider over a verified sending subdomain (`EMAIL_PROVIDER=resend`), replacing legacy Gmail SMTP. The frontend must never call Resend directly or store API keys.

---

## Device Security & Passkeys

These endpoints implement device security and WebAuthn specifications for parents, volunteers, and admins.

### GET `/api/auth/passkeys`
Lists registered credentials for the current user.
- **Headers**: `Authorization: Bearer <token>`
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "passkeys": [
      {
        "id": "uuid",
        "credentialId": "base64-string",
        "deviceName": "My Device Name",
        "createdAt": "2026-07-10T15:00:00Z"
      }
    ]
  }
  ```

### DELETE `/api/auth/passkeys/:id`
Deletes a registered credential by its identifier.
- **Headers**: `Authorization: Bearer <token>`
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "message": "Passkey removed successfully."
  }
  ```

### POST `/api/auth/passkeys/register/options`
Generates registration challenge details for WebAuthn.
- **Headers**: `Authorization: Bearer <token>`
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "options": {
      "challenge": "random-challenge-string",
      "rp": { "name": "Koinonia Children App" },
      "user": { "id": "user-uuid", "name": "user@example.com", "displayName": "User Name" },
      "pubKeyCredParams": [{ "type": "public-key", "alg": -7 }]
    }
  }
  ```

### POST `/api/auth/passkeys/register/verify`
Verifies WebAuthn assertion signature and registers the credentials.
- **Headers**: `Authorization: Bearer <token>`
- **Request Body**:
  ```json
  {
    "deviceName": "Chrome on Macbook",
    "registrationResponse": { "id": "...", "rawId": "...", "type": "public-key", "response": { "clientDataJSON": "...", "attestationObject": "..." } }
  }
  ```
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "message": "Passkey registered successfully."
  }
  ```

### POST `/api/auth/passkeys/login/options`
Generates assertion check challenge for secure sign-in.
- **Request Body**:
  ```json
  { "email": "user@example.com" }
  ```
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "options": {
      "challenge": "challenge-string",
      "allowCredentials": []
    }
  }
  ```

### POST `/api/auth/passkeys/login/verify`
Validates sign-in credentials and starts the session.
- **Request Body**:
  ```json
  {
    "email": "user@example.com",
    "loginResponse": { "id": "...", "rawId": "...", "response": { "clientDataJSON": "...", "authenticatorData": "...", "signature": "..." } }
  }
  ```
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "token": "jwt-token",
    "user": { "id": "uuid", "email": "user@example.com", "role": "parent" }
  }
  ```

### POST `/api/auth/passkeys/verify-action`
Confirms sensitive event actions using verified authentication.
- **Headers**: `Authorization: Bearer <token>`
- **Request Body**:
  ```json
  {
    "actionResponse": { "id": "...", "rawId": "...", "response": { "clientDataJSON": "...", "authenticatorData": "...", "signature": "..." } }
  }
  ```
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "message": "Action verification confirmed."
  }
  ```

---

## Parent Operations (`/api/parent`)

### GET `/api/parent/home`
Returns dashboard summary counts, current parent profile, and list of registered children with live workflow statuses.
- **Headers**: `Authorization: Bearer <token>`
- **Response** (`200 OK`):
  ```json
  {
    "parentProfile": { "fullName": "Grace Omikunle", ... },
    "summaryCounts": { "incomplete": 0, "underReview": 1, "selected": 1, "passReady": 1 },
    "childrenList": [ ... ]
  }
  ```

### GET `/api/parent/profile`
Retrieves full parent profile details.

### PUT `/api/parent/profile`
Updates parent profile attributes (contact info, worker department, photo).

### POST `/api/parent/children/draft` / PUT `/api/parent/children/:childId/draft`
Saves or updates draft child registration, care notes, medical details, and authorized pickup person without triggering formal review.
- **Response** (`201 Created`): Returns formatted DTO representing the draft child item.

### POST `/api/parent/children/:childId/submit`
Validates completeness of care, health, and pickup person data, then transitions status from `incomplete` to `under_review`.
- **Validation Constraints**:
  - `full_name`, `date_of_birth`, and `gender` must be populated.
  - Pickup person full name and phone number must be populated.
  - `information_confirmed` and `details_confirmed` flags are set to 1.
- **Response** (`200 OK`): Formatted child item DTO with `status: "Under review"`.

### GET `/api/parent/children/:childId/status`
Returns detailed workflow review breakdown for a specific submitted child record.

### GET `/api/parent/children/:childId/pass`
Retrieves read-model event pass containing secure tokenized QR code payload (`koinonia://pass/v1/verify?token=...`).

---

## Media Upload (`/api/media`)

### POST `/api/media/upload`
Accepts multipart form uploads (`file`, `purpose`, and optional `slotKey`) or base64 data URLs for parent avatars, child profile photos, pickup person photos, landing images, and gallery media.
- **Provider**: Uploads directly to Cloudinary server-side using environment credentials (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_UPLOAD_FOLDER`).
- **Image Optimization & Processing (Sharp)**:
  - If the upload is an image, it is parsed and optimized using the server-side `sharp` engine.
  - **Dimenson Presets** (mapped from optional `slotKey` field):
    - `site_logo`: Resized to `150x150` pixels with transparent background preservation.
    - `heroMain`: Optimized to `1000x1250` pixels (4:5 ratio).
    - `heroUpper`: Optimized to `800x1066` pixels (3:4 ratio).
    - `heroRight`: Optimized to `600x600` pixels (1:1 aspect ratio).
    - Other Slots/Images: Uniformly normalized to fit inside `1200x1200` bounding box.
- **Strict Processing & Zero-Fallback Policy**:
  - Raw, unprocessed images are **never** used as fallbacks if processing fails.
  - If image processing fails or is invalid, the operation throws a clean `422 Unprocessable Entity` response, and no data is written to the database or stored in active configurations.
- **Validation Rules**:
  - **Photos (`parent_profile_photo`, `child_photo`, `pickup_person_photo`, `volunteer_profile_photo`)**: Max 10MB. Allowed types: `image/jpeg`, `image/png`, `image/webp`.
  - **Landing & Gallery Images (`landing_image`, `gallery_media`)**: Max 10MB. Allowed types: `image/jpeg`, `image/png`, `image/webp`.
  - **Videos (`event_video`)**: Max 50MB. Allowed types: `video/mp4`, `video/webm`. Videos are strictly kept away from image-processing services.
- **Success Response** (`201 Created`):
  ```json
  {
    "id": "uuid",
    "provider": "cloudinary",
    "publicId": "koinonia-children-teens/parents/uuid",
    "secureUrl": "https://res.cloudinary.com/.../image/upload/v1/.../uuid.jpg",
    "resourceType": "image",
    "fileType": "parent_profile_photo",
    "url": "https://res.cloudinary.com/.../image/upload/v1/.../uuid.jpg"
  }
  ```
- **Error Response** (`422 Unprocessable Entity` for processing failures):
  ```json
  {
    "success": false,
    "error": "We could not process this image. Please try another JPG, PNG, or WebP file.",
    "message": "We could not process this image. Please try another JPG, PNG, or WebP file."
  }
  ```

### POST `/api/media/public-upload`
A public, unauthenticated media upload endpoint designed for registration-phase photo uploads (e.g., volunteer profile photos).
- **Access**: Public / Unauthenticated
- **Allowed Purposes**: Only `volunteer_profile_photo`
- **Validation Rules**: Max 10MB. Allowed types: `image/jpeg`, `image/png`, `image/webp`.
- **Folder Mapping**: Uploads are saved inside the `volunteers` Cloudinary subfolder.
- **Response** (`201 Created`): Identical JSON schema to `/api/media/upload`.

### GET `/api/media/files/:fileId`
Public resolution endpoint for serving media. Automatically redirects (`302`) to the remote Cloudinary `secureUrl` if present, ensuring UI `<img />` tags resolve cleanly without custom headers.

---

## Volunteer Operations (`/api/volunteer`)

### POST `/api/volunteer/create-account`
Registers a new volunteer user account and uploads their profile photo in a single, atomic multipart/form-data request.
- **Request Format**: `multipart/form-data`
- **Fields**:
  - `photo`: Binary file (image/jpeg, image/png, image/webp)
  - `fullName`: string
  - `email`: string
  - `phone`: string
  - `whatsapp`: string
  - `isKoinoniaWorker`: "true" | "false"
  - `department`: string (optional)
  - `preferredTeam`: string
  - `servingExperience`: "true" | "false"
  - `note`: string (optional)
  - `password`: string
- **Response** (`201 Created`):
  ```json
  {
    "success": true,
    "user": { "id": "uuid", "email": "volunteer@example.com", "role": "volunteer" },
    "profile": { "id": "uuid", "full_name": "John Doe", ... },
    "emailSent": true
  }
  ```

### POST `/api/volunteer/resend-verification`
Generates a new verification link or handles verified/generic resends securely with rate limiting.
- **Request Body**:
  ```json
  { "email": "volunteer@example.com" }
  ```
- **Response (Unverified Account - Real Success)** (`200 OK`):
  ```json
  {
    "success": true,
    "emailSent": true,
    "providerId": "msg_abc123xyz",
    "message": "A fresh confirmation link has been sent. Please check your inbox and spam folder.",
    "retryAfterSeconds": 60
  }
  ```
- **Response (Unknown or Profile-less Email - Generic/Privacy-safe Success)** (`200 OK`):
  ```json
  {
    "success": true,
    "generic": true,
    "emailSent": false,
    "message": "If this email is connected to Volunteer Access, a confirmation link will be sent."
  }
  ```
- **Response (Already Verified Account)** (`200 OK`):
  ```json
  {
    "success": true,
    "alreadyVerified": true,
    "emailSent": false,
    "message": "This email is already confirmed. You can sign in."
  }
  ```
- **Response (Resend Fails)** (`502 Bad Gateway`):
  ```json
  {
    "success": false,
    "code": "EMAIL_SEND_FAILED",
    "emailSent": false,
    "message": "We could not send a new confirmation link right now. Please try again."
  }
  ```
- **Response (Cooldown Rate Limit)** (`429 Too Many Requests`):
  ```json
  {
    "success": false,
    "code": "RESEND_COOLDOWN",
    "emailSent": false,
    "retryAfterSeconds": 45,
    "message": "Please wait before requesting another confirmation link."
  }
  ```

### POST `/api/volunteer/sign-in`
Authenticates a volunteer user.
- **Request Body**:
  ```json
  { "email": "volunteer@example.com", "password": "SecurePassword123" }
  ```
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "user": { "id": "uuid", "email": "volunteer@example.com", "role": "volunteer", "email_verified": true },
    "profile": { "id": "uuid", "full_name": "John Doe", "status": "pending_review" },
    "token": "<jwt-token>",
    "nextRoute": "/volunteer/pending-review"
  }
  ```
- **Error Responses**:
  - `401 Unauthorized` (`INVALID_CREDENTIALS`): Email or password is incorrect.
  - `403 Forbidden` (`NO_VOLUNTEER_ACCESS`): Volunteer Access has not been requested for this email.
  - `403 Forbidden` (`EMAIL_NOT_VERIFIED`): Email is not verified. Returns user, profile, and token for verification redirection.

### GET `/api/volunteer/event-home`
Retrieves live event metrics, current active event information, and attention required actionable checklists.
- **Headers**: `Authorization: Bearer <token>`
- **Response** (`200 OK`):
  ```json
  {
    "event": { "id": "uuid", "title": "Assembly 2026", "date": "..." },
    "stats": {
      "expected": 45,
      "checkedIn": 12,
      "pickedUp": 3,
      "attention": 2
    },
    "attentionItems": [
      {
        "id": "missing_photo_uuid",
        "issue_type": "Missing pickup photo",
        "child_name": "Daniel Smith",
        "child_id": "child-uuid",
        "action_text": "RESOLVE"
      }
    ]
  }
  ```

### GET `/api/volunteer/attention-items`
Retrieves the list of active attention items requiring event-day verification or escalation.
- **Headers**: `Authorization: Bearer <token>`
- **Response** (`200 OK`):
  ```json
  [
    {
      "id": "attention_id",
      "child_id": "child_id",
      "child_name": "Sarah Omikunle",
      "child_photo_file_id": "photo_id",
      "type": "missing_pickup_photo",
      "title": "Missing pickup photo",
      "description": "Uncle Jerry photo is missing.",
      "status": "open",
      "priority": "high",
      "action_text": "RESOLVE"
    }
  ]
  ```

### POST `/api/volunteer/attention-items/:id/resolve`
Resolves an active attention item. Volunteers must supply a note documenting physical verification.
- **Headers**: `Authorization: Bearer <token>`
- **Request Body**:
  ```json
  {
    "note": "Verified identity card at the collection desk."
  }
  ```
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "message": "Item successfully resolved."
  }
  ```

### POST `/api/volunteer/attention-items/:id/review`
Reviews/acknowledges a medical alert or support note. Volunteers must supply an acknowledgement note.
- **Headers**: `Authorization: Bearer <token>`
- **Request Body**:
  ```json
  {
    "note": "Reviewed medical note with parent."
  }
  ```
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "message": "Item successfully reviewed."
  }
  ```

### POST `/api/volunteer/attention-items/:id/verify`
Verifies an active attention item (specifically used for age-group reviews or manual registrations). Volunteers must supply a note.
- **Headers**: `Authorization: Bearer <token>`
- **Request Body**:
  ```json
  {
    "note": "Verified age and confirmed correct group."
  }
  ```
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "message": "Item successfully verified."
  }
  ```

### POST `/api/volunteer/attention-items/:id/escalate`
Escalates a difficult issue to administrators or leadership. Note is mandatory.
- **Headers**: `Authorization: Bearer <token>`
- **Request Body**:
  ```json
  {
    "note": "Guardian does not have physical identification."
  }
  ```
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "message": "Item successfully escalated to administrative coordinators."
  }
  ```

### POST `/api/volunteer/forgot-password`
Generates a secure password reset token and sends a volunteer-specific reset email via Resend to verified volunteers.
- **Request Body**:
  ```json
  { "email": "volunteer@example.com" }
  ```
- **Response (Success - Real)** (`200 OK`):
  ```json
  {
    "success": true,
    "emailSent": true,
    "providerId": "<provider-id>",
    "message": "A reset link has been sent. Please check your inbox and spam folder.",
    "retryAfterSeconds": 60
  }
  ```
- **Response (Success - Privacy-Safe Unknown Email / Profile-less Email)** (`200 OK`):
  ```json
  {
    "success": true,
    "generic": true,
    "emailSent": false,
    "message": "If this email is connected to Volunteer Access, a reset link will be sent."
  }
  ```
- **Error Responses**:
  - `429 Too Many Requests` (`RESET_COOLDOWN`): Requested within 60 seconds of a previous active token.
    ```json
    {
      "success": false,
      "code": "RESET_COOLDOWN",
      "emailSent": false,
      "retryAfterSeconds": 45,
      "message": "Please wait before requesting another reset link."
    }
    ```
  - `502 Bad Gateway` (`EMAIL_SEND_FAILED`): Dispatched if mail delivery fails.
    ```json
    {
      "success": false,
      "code": "EMAIL_SEND_FAILED",
      "emailSent": false,
      "message": "We could not send a reset link right now. Please try again."
    }
    ```

### POST `/api/volunteer/reset-password`
Validates the reset token hash, confirms volunteer status, hashes the new password, updates the password, and marks the token used.
- **Request Body**:
  ```json
  { "token": "raw-hex-token-string", "password": "NewSecurePassword123" }
  ```
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "message": "Your password has been updated. You can now sign in."
  }
  ```
- **Error Responses**:
  - `400 Bad Request` (`INVALID_OR_EXPIRED_TOKEN`): Token is invalid, expired, or already used.
  - `403 Forbidden` (`NO_VOLUNTEER_ACCESS`): Token belongs to a user who has no volunteer profile.
  - `400 Bad Request` (`INVALID_PASSWORD`): Password does not meet length/content criteria.

### PATCH `/api/volunteer/me/profile`
Updates the authenticated volunteer's own submitted onboarding/registration details securely.
- **Headers**: `Authorization: Bearer <token>`
- **Request Format**: `multipart/form-data` or `application/json`
- **Fields (Onboarding fields only)**:
  - `photo`: Binary file (optional, image/jpeg, image/png, image/webp, max 10MB)
  - `fullName`: string (optional, 1-100 chars, validated)
  - `phone`: string (optional, normalized/validated Nigeria phone format)
  - `whatsapp`: string (optional, normalized/validated Nigeria phone format)
  - `isKoinoniaWorker`: boolean or "true"/"false" (optional)
  - `department`: string (optional, 1-100 chars)
  - `preferredTeam`: string (optional, Check-In Team | Pickup Team | General Team)
  - `servingExperience`: boolean or "true"/"false" (optional)
  - `note`: string (optional, 1-500 chars)
- **Security Rule**: Any attempt to update admin-controlled fields (e.g. `email`, `role`, `status`, `assignedTeam`, `assignedArea`, `permissions`, `reviewedBy`, `reviewedAt`, `adminNotes`, `userId`, `id`) is strictly rejected or ignored.
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "profile": {
      "id": "uuid",
      "fullName": "John Doe",
      "phone": "+2348031234567",
      "whatsapp": "+2348031234567",
      "isKoinoniaWorker": true,
      "department": "Protocol",
      "preferredTeam": "Check-In Team",
      "servingExperience": true,
      "note": "Excited to serve",
      "photoUrl": "/api/media/files/uuid-photo",
      "status": "approved",
      "assignedTeam": "Check-in Team",
      "assignedArea": "Main Entrance",
      "accessScope": "Check-in only"
    }
  }
  ```
- **Error Responses**:
  - `401 Unauthorized`: Token is missing or invalid.
  - `400 Bad Request`: Validation constraint breached (e.g., phone format invalid, name empty).
  - `404 Not Found`: Volunteer profile record not found.

---

## Volunteer Event-Day Gate Operations (`/api/volunteer`)

### POST `/api/volunteer/pass/lookup`
Performs a lookup on scanned QR codes or manually entered codes to retrieve registered child and parent details. This supports the safe, two-step visual verification flow prior to check-in confirmation.
- **Headers**: `Authorization: Bearer <token>`
- **Request Body**:
  ```json
  {
    "passReference": "KOI-2026-6E80A7",
    "childId": "uuid-optional",
    "childEventEntryId": "uuid-optional"
  }
  ```
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "child": {
      "id": "uuid",
      "fullName": "Sarah Omikunle",
      "photoUrl": "https://...",
      "ageGroup": "Creche",
      "dateOfBirth": "2021-05-14",
      "gender": "Female",
      "parentName": "Grace Omikunle",
      "parentPhone": "+2348031234567",
      "parentWhatsapp": "+2348031234567",
      "schoolClass": "Pre-School Alpha",
      "schoolName": "Tender Years Academy",
      "hasMedicalNotes": true,
      "medicalNotes": "Allergic to peanuts. Requires inhaler if wheezing.",
      "needsExtraSupport": false,
      "supportNotes": "",
      "entryId": "uuid",
      "entryStatus": "registered",
      "passReference": "KOI-2026-6E80A7",
      "pickup": {
        "id": "uuid",
        "fullName": "Daniel Omikunle",
        "relationship": "Uncle",
        "phone": "+2348059876543",
        "whatsapp": "+2348059876543",
        "photoUrl": "https://..."
      }
    }
  }
  ```

### POST `/api/volunteer/check-in`
Confirms and finalizes the physical gate check-in for a child. This is only called after the volunteer has visually reviewed the child's details on the "Child found" screen.
- **Headers**: `Authorization: Bearer <token>`
- **Request Body**:
  ```json
  {
    "childEventEntryId": "uuid"
  }
  ```
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "child": {
      "id": "uuid",
      "fullName": "Sarah Omikunle",
      "status": "checked_in"
    }
  }
  ```

### POST `/api/volunteer/check-out`
Records the secure checkout and release of a child. Must be executed after matching the physical collection person to the Face Photo and info on the Authorized Pickup card.
- **Headers**: `Authorization: Bearer <token>`
- **Request Body**:
  ```json
  {
    "childEventEntryId": "uuid"
  }
  ```
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "message": "Sarah Omikunle successfully checked out."
  }
  ```

### GET `/api/volunteer/reports`
Retrieves comprehensive live metrics, checklists, age group distribution stats, entry logs, pickup logs, needs attention logs, and the latest final event report for administrative or active volunteer oversight.
- **Headers**: `Authorization: Bearer <token>`
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "stats": {
      "expected": 150,
      "checkedIn": 85,
      "pickedUp": 12,
      "attention": 3
    },
    "ageGroups": [
      { "ageGroup": "Creche", "expected": 20, "checkedIn": 10, "pickedUp": 2 },
      { "ageGroup": "Preschool", "expected": 30, "checkedIn": 25, "pickedUp": 4 }
    ],
    "recentEntries": [
      {
        "id": "entry-uuid",
        "childName": "Sarah Omikunle",
        "checkedInAt": "2026-11-18T08:15:00.000Z",
        "volunteerName": "John Doe"
      }
    ],
    "recentPickups": [
      {
        "id": "entry-uuid",
        "childName": "Daniel Omikunle",
        "pickedUpAt": "2026-11-18T12:30:00.000Z",
        "volunteerName": "John Doe",
        "pickupPersonName": "Grace Omikunle",
        "relationship": "Mother"
      }
    ],
    "needsAttention": [
      {
        "id": "entry-uuid",
        "childName": "Sarah Omikunle",
        "issueType": "Missing pickup photo",
        "actionText": "RESOLVE"
      }
    ],
    "finalReport": {
      "notes": "Everything went smoothly today. A minor incident with preschool craft materials was resolved quickly.",
      "submittedAt": "2026-11-18T13:00:00.000Z",
      "submittedBy": "John Doe"
    }
  }
  ```

### POST `/api/volunteer/reports/submit`
Logs a new Final Event Report note in the audit ledger.
- **Headers**: `Authorization: Bearer <token>`
- **Request Body**:
  ```json
  {
    "notes": "Everything went smoothly today. A minor incident with preschool craft materials was resolved quickly."
  }
  ```
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "message": "Final Event Report submitted successfully.",
    "report": {
      "id": "rep-uuid",
      "notes": "Everything went smoothly today. A minor incident with preschool craft materials was resolved quickly.",
      "submittedAt": "2026-11-18T13:05:00.000Z",
      "submittedBy": "John Doe"
    }
  }
  ```

---

## Administrative Operations (`/api/volunteer/admin`)

### POST `/api/volunteer/admin/volunteers/:volunteerId/approve`
Approves a pending volunteer profile, transitioning their status to `'active'`, and assigning them to their preferred team.
- **Headers**: `Authorization: Bearer <token>` (Admin or Super Admin only)
- **Side-Effects**: Automatically dispatches a congratulations email using the `sendVolunteerApprovedEmail` helper, letting the volunteer know they are approved, their team assignment, and providing a link to log in.
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "message": "Volunteer profile approved successfully"
  }
  ```

---

## Command Centre Operations (`/api/admin`)

The following endpoints require admin, super_admin, or team role authorization.

### GET `/api/admin/overview`
Retrieves live overview metadata and stats, along with the most recent submissions queue from the database.
- **Headers**: `Authorization: Bearer <token>`
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "stats": {
      "totalChildren": 24,
      "underReview": 3,
      "approved": 18,
      "totalParents": 15,
      "totalVolunteers": 6,
      "pendingVolunteers": 1,
      "checkedIn": 5
    },
    "recentSubmissions": [
      {
        "id": "child-uuid",
        "name": "Sarah Omikunle",
        "age_group": "Ages 6 to 9",
        "age": 7,
        "status": "under_review",
        "submitted_at": "2026-11-15T09:44:00Z"
      }
    ]
  }
  ```

### POST `/api/admin/change-password`
Allows an authenticated administrator to update their system password.
- **Headers**: `Authorization: Bearer <token>`
- **Request Body**:
  ```json
  {
    "currentPassword": "OldPassword123",
    "newPassword": "NewSecurePassword456"
  }
  ```
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "message": "Your password has been updated."
  }
  ```

### GET `/api/admin/admins`
Lists all active and invited administrators in the system directory.
- **Headers**: `Authorization: Bearer <token>`
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "admins": [
      {
        "id": "uuid",
        "fullName": "System Super Admin",
        "email": "alelechi567@gmail.com",
        "role": "super_admin",
        "status": "active"
      }
    ]
  }
  ```

### POST `/api/admin/invites`
Dispatches a secure email invitation to recruit a new admin or team member.
- **Headers**: `Authorization: Bearer <token>` (Super Admin only)
- **Request Body**:
  ```json
  {
    "email": "team-lead@koinonia.org",
    "role": "admin"
  }
  ```
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "message": "Invitation sent successfully to team-lead@koinonia.org"
  }
  ```

### POST `/api/admin/accept-invite`
Validates an invitation token and activates the new administrator account with a user-defined password.
- **Request Body**:
  ```json
  {
    "token": "raw-invite-token-hex",
    "password": "UserSecurePassword789"
  }
  ```
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "message": "Account activated successfully."
  }
  ```

### GET `/api/admin/applications/:id`
Retrieves detailed, comprehensive folder information for a single child registration application, including health alerts, parent metrics, authorized pickup persons, and historical audit timeline records.
- **Headers**: `Authorization: Bearer <token>` (Admin/Super-Admin only)
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "application": {
      "id": "entry-uuid",
      "childId": "child-uuid",
      "status": "under_review",
      "schoolClass": "Primary 3",
      "schoolName": "Grace Academy",
      "previousProgramme": "None stated / First-time registration",
      "noteToTeam": "Please review medical allergies",
      "hasMedicalNotes": true,
      "medicalNotes": "Peanut allergy",
      "needsExtraSupport": false,
      "supportNotes": null,
      "submittedAt": "2026-11-15T09:44:00Z",
      "reviewedAt": null,
      "child": {
        "fullName": "Sarah Omikunle",
        "gender": "Female",
        "dob": "2019-04-12",
        "age": 7,
        "ageGroup": "Ages 6 to 9",
        "relationship": "Mother",
        "needsAgeReview": false,
        "photoUrl": "https://res.cloudinary.com/.../image.jpg"
      },
      "parent": {
        "id": "parent-uuid",
        "fullName": "Grace Omikunle",
        "phone": "+2348031234567",
        "whatsapp": "+2348031234567",
        "email": "parent@example.com",
        "isWorker": true,
        "department": "Ushering"
      },
      "pickupPeople": [
        {
          "id": "pickup-uuid",
          "fullName": "Daniel Omikunle",
          "relationship": "Father",
          "phone": "+2348037654321",
          "whatsapp": "+2348037654321",
          "photoUrl": "https://res.cloudinary.com/.../pickup.jpg",
          "approved": true
        }
      ],
      "history": [
        {
          "id": "submitted",
          "action": "Application submitted",
          "by": "Grace Omikunle",
          "timestamp": "2026-11-15T09:44:00Z",
          "note": null,
          "status": "under_review"
        }
      ]
    }
  }
  ```

### POST `/api/admin/applications/:id/review`
Submits an administrative decision for a child's registration, optionally updating team notes and triggering warm, brand-compliant notifications.
- **Decoupled Selection and Pass Generation Logic**:
  - If `status` is set to `"selected"`, the system automatically checks for the presence of a valid child photo file (`photo_file_id`).
  - **With Photo**: The system automatically promotes the entry to `"pass_ready"`, issues a secure event pass, and dispatches a "Pass Ready" notification.
  - **Without Photo**: The entry remains in `"selected"` status, no pass is generated, and the parent receives a "Selected (Pass Pending)" notification stating that the pass will be generated shortly.
- **Headers**: `Authorization: Bearer <token>` (Admin/Super-Admin only)
- **Request Body**:
  - `status`: `"selected" | "not_selected" | "waiting_list" | "pass_ready" | "under_review"`
  - `noteToTeam` (optional): string
  - `sendNotification` (optional): boolean
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "message": "Application review submitted successfully."
  }
  ```

### PUT `/api/admin/applications/:id`
Updates child details, parent profile, and authorized pickup details inside a single unified administrative operation.
- **Headers**: `Authorization: Bearer <token>` (Admin/Super-Admin only)
- **Request Body**:
  - `fullName` (optional): string
  - `gender` (optional): `"Male" | "Female"`
  - `dateOfBirth` (optional): `"YYYY-MM-DD"`
  - `schoolClass` (optional): string
  - `schoolName` (optional): string
  - `hasMedicalNotes` (optional): boolean
  - `medicalNotes` (optional): string
  - `needsExtraSupport` (optional): boolean
  - `supportNotes` (optional): string
  - `parentFullName` (optional): string
  - `parentPhone` (optional): string
  - `parentWhatsApp` (optional): string
  - `parentHomeAddress` (optional): string
  - `pickupPersonName` (optional): string
  - `pickupPersonRelationship` (optional): string
  - `pickupPersonPhone` (optional): string
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "message": "Child, parent, and pickup details updated successfully."
  }
  ```

### GET `/api/admin/children`
Retrieves a filtered and searched list of children records along with dynamic event statistics.
- **Headers**: `Authorization: Bearer <token>` (Admin/Super-Admin only)
- **Query Parameters**:
  - `q` (optional): Query string to search by child name, parent name, or parent phone.
  - `filter` (optional): Quick filter status (`inside`, `not_arrived`, `picked_up`, `medical_note`, `missing_pickup_photo`, `below_event_age`, `special_support`).
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "stats": {
      "totalChildren": 2,
      "selected": 2,
      "checkedIn": 1,
      "inside": 1,
      "pickedUp": 0,
      "needsAttention": 1
    },
    "children": [
      {
        "id": "entry-uuid",
        "applicationId": "entry-uuid",
        "fullName": "Mary Omikunle",
        "photoUrl": "https://res.cloudinary.com/...",
        "ageLabel": "7y",
        "gender": "Female",
        "ageGroup": "Ages 7 to 9",
        "parentName": "Sarah Omikunle",
        "parentPhone": "+234803...",
        "pickupPersonName": "David Adewale",
        "pickupPersonPhotoUrl": "https://res.cloudinary.com/...",
        "reviewStatus": "selected",
        "entryStatus": "checked_in",
        "pickupStatus": "inside",
        "flags": ["medical_notes"]
      }
    ],
    "total": 1,
    "nextCursor": null
  }
  ```

### GET `/api/admin/attendance`
Retrieves real-time event registers, stats, and activity logs.
- **Headers**: `Authorization: Bearer <token>` (Admin/Super-Admin/Team only)
- **Query Parameters**:
  - `q` (optional): Query string to filter results by child name, parent name, or phone.
  - `status` (optional): Filtering tab value (`all`, `inside`, `picked_up`, `not_arrived`, `needs_attention`).
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "stats": {
      "expected": 600,
      "checkedIn": 350,
      "inside": 100,
      "pickedUp": 250,
      "notArrived": 250,
      "needsAttention": 3
    },
    "rows": [
      {
        "id": "entry-uuid",
        "childId": "child-uuid",
        "applicationId": "entry-uuid",
        "childName": "Samuel Ajayi",
        "ageGroup": "Ages 7-9",
        "parentName": "John Ajayi",
        "parentPhone": "+23480...",
        "status": "checked_in",
        "location": "inside",
        "notes": "Allergic to nuts",
        "lastActivityAt": "2026-07-08T07:22:10Z",
        "lastActivityLabel": "7:22 AM"
      }
    ],
    "ageGroups": [
      {
        "ageGroup": "Ages 7-9",
        "expected": 120,
        "checkedIn": 80,
        "inside": 20,
        "pickedUp": 60,
        "notArrived": 40
      }
    ],
    "recentScans": [
      {
        "id": "entry-uuid-checkin",
        "childName": "Samuel Ajayi",
        "type": "check_in",
        "timeLabel": "7:22 AM",
        "flagged": true
      }
    ],
    "teamActivity": [
      {
        "id": "entry-uuid",
        "teamMemberName": "David Johnson",
        "childName": "Samuel Ajayi",
        "action": "checked in",
        "timeLabel": "7:22 AM"
      }
    ],
    "total": 1,
    "nextCursor": null
  }
  ```

---

## 13. Admin Reports & Performance Metrics

### 13.1 GET `/api/admin/reports`
Retrieves aggregated statistics and performance metrics for the current active children ministry event.

* **Method:** `GET`
* **Protection:** Admin Token / Super Admin / Team Role
* **Query Parameters:**
  * `reportType` (optional): `'pre_event' | 'live_event' | 'end_of_event'`. Also accepts hyphenated aliases (e.g. `'pre-event'`, `'live-event'`, `'end-of-event'`), which are normalized internally. (default: `'end_of_event'`)
* **Success Response (200 OK):**
  ```json
  {
    "success": true,
    "event": {
      "id": "event-ga-2026",
      "name": "The General Assembly",
      "section": "Children and Teens Section",
      "dateRangeLabel": "Oct 12 - Oct 14, 2023"
    },
    "metrics": {
      "totalRegistered": 772,
      "parentAccounts": 600,
      "selected": 548,
      "checkedIn": 52,
      "absent": 496,
      "pickedUp": 18,
      "stillInside": 34,
      "needsAttention": 3,
      "careNotesPresent": 2
    },
    "attendanceOutcome": [
      { "label": "Selected", "value": 548 },
      { "label": "Checked In", "value": 52 },
      { "label": "Absent", "value": 496 },
      { "label": "Picked Up", "value": 18 }
    ],
    "eventSummary": [
      { "label": "Registered children", "value": 772, "desc": "All child applications/records for current event" },
      { "label": "Parent accounts", "value": 600, "desc": "Total parental user profiles" },
      { "label": "Selected", "value": 548, "desc": "Children admitted/selected for current event" }
    ],
    "careAttention": [
      { "key": "medical_notes", "label": "Medical notes", "count": 2 },
      { "key": "extra_support", "label": "Extra support", "count": 1 },
      { "key": "missing_pickup_photo", "label": "Missing pickup photo", "count": 0 },
      { "key": "manual_review", "label": "Manual review", "count": 0 }
    ],
    "notes": "Director notes recorded for this event segment...",
    "exports": {
      "eventReport": true,
      "excelSummary": false,
      "selectedChildren": true,
      "attendance": true,
      "absentChildren": true,
      "careNotes": true,
      "pickupList": true
    }
  }
  ```

### 13.2 POST `/api/admin/reports/notes`
Updates or creates Segment Notes recorded by Ministry Directors for a specific event state.

* **Method:** `POST`
* **Protection:** Admin Token / Super Admin / Team Role
* **Request Body:**
  ```json
  {
    "eventId": "event-ga-2026",
    "reportType": "end_of_event",
    "notes": "The event completed with excellent check-in performance..."
  }
  ```
* **Success Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "Report notes saved successfully."
  }
  ```

### 13.3 GET `/api/admin/reports/export`
Generates live, highly accurate downloadable CSV files for church audit records.

* **Method:** `GET`
* **Protection:** Admin Token / Super Admin / Team Role
* **Query Parameters:**
  * `type` (required): `'event_summary' | 'attendance' | 'absent' | 'care_notes' | 'pickup_list' | 'selected_children'`
  * `format` (required): `'csv'`
* **Success Response (200 OK):**
  * **Content-Type:** `text/csv`
  * **Content-Disposition:** `attachment; filename="attendance_export_2026-07-08.csv"`
  * **Payload:** Dynamic CSV string of selected registry logs.

---

## 14. Message Administration Operations (`/api/admin/messages`)

The following endpoints manage the manual parent messaging system, draft persistence, live token rendering preview, and secure cross-channel delivery.

### 14.1 GET `/api/admin/messages`
Retrieves aggregated statistics of manual dispatches, list of dynamic recipient groups with current counts, predefined templates, historical logs, and the latest saved draft.

* **Method:** `GET`
* **Protection:** Admin Token / Super Admin / Team Role
* **Success Response (200 OK):**
  ```json
  {
    "success": true,
    "stats": {
      "messagesSent": 1240,
      "whatsappSent": 820,
      "emailSent": 420,
      "failed": 18,
      "pending": 0
    },
    "recipientGroups": [
      { "key": "all_parents", "label": "All parents", "count": 24 },
      { "key": "selected_children", "label": "Selected children", "count": 18 },
      { "key": "under_review", "label": "Under review", "count": 3 }
    ],
    "messageTypes": [
      { "key": "pass_ready", "label": "Pass ready" },
      { "key": "general_announcement", "label": "General announcement" }
    ],
    "recentActivity": [
      {
        "id": "uuid-123",
        "recipientGroup": "selected_children",
        "messageType": "pass_ready",
        "channel": "both",
        "subject": "Entry Pass Ready",
        "body": "Dear {Parent name}, your child {Child name} pass is ready...",
        "recipientsCount": 18,
        "status": "sent",
        "createdAt": "2026-07-08T01:48:49.000Z"
      }
    ],
    "latestDraft": {
      "recipientGroup": "selected_children",
      "messageType": "pass_ready",
      "channel": "both",
      "subject": "Entry Pass Ready",
      "body": "Dear {Parent name}, your child {Child name} pass is ready..."
    },
    "emailEnabled": true,
    "whatsappEnabled": false,
    "providerStatus": {
      "emailEnabled": true,
      "whatsappEnabled": false,
      "emailProvider": "resend",
      "whatsappProvider": "twilio",
      "senderName": "Koinonia Global",
      "fromEmail": "info@themandate.dontechservicesconst.com",
      "replyToEmail": "info@themandate.dontechservicesconst.com"
    }
  }
  ```

### 14.2 POST `/api/admin/messages/preview`
Generates a rendered live preview of a message body and subject with template tokens replaced using real sample recipient data from the selected group.

* **Method:** `POST`
* **Protection:** Admin Token / Super Admin / Team Role
* **Request Body:**
  ```json
  {
    "recipientGroup": "selected_children",
    "messageType": "pass_ready",
    "channel": "email",
    "subject": "Your Pass is Ready - {Event name}",
    "body": "Dear {Parent name}, your child {Child name} pass is ready..."
  }
  ```
* **Success Response (200 OK):**
  ```json
  {
    "success": true,
    "preview": {
      "subject": "Your Pass is Ready - The General Assembly",
      "body": "Dear Sarah, your child Mary pass is ready..."
    }
  }
  ```

### 14.3 POST `/api/admin/messages/drafts`
Persists the current composer state (recipient group, message type, delivery channel, subject line, and body markup) as the active primary draft.

* **Method:** `POST`
* **Protection:** Admin Token / Super Admin / Team Role
* **Request Body:**
  ```json
  {
    "recipientGroup": "selected_children",
    "messageType": "pass_ready",
    "channel": "both",
    "subject": "Draft Subject",
    "body": "Dear {Parent name}..."
  }
  ```
* **Success Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "Draft saved successfully."
  }
  ```

### 14.4 POST `/api/admin/messages/send`
Dispatches the composed notification to all matching parents in the selected group over selected channels. Leverages automatic template-token parsing and parent deduplication.

* **Method:** `POST`
* **Protection:** Admin Token / Super Admin / Team Role
* **Request Body:**
  ```json
  {
    "recipientGroup": "selected_children",
    "messageType": "pass_ready",
    "channel": "email",
    "subject": "Entry Pass - {Event name}",
    "body": "Dear {Parent name}, entry pass for {Child name} is ready at {Pass link}...",
    "confirmed": true
  }
  ```
* **Success Response (200 OK):**
  ```json
  {
    "success": true,
    "summary": {
      "requested": 18,
      "sent": 18,
      "pending": 0,
      "failed": 0
    },
    "message": "Message sending has completed."
  }
  ```

### 14.5 GET `/api/admin/messages/settings`
Retrieves the custom configured sender name and reply-to email settings.

* **Method:** `GET`
* **Protection:** Admin Token / Super Admin / Team Role
* **Success Response (200 OK):**
  ```json
  {
    "success": true,
    "senderName": "Koinonia Global",
    "fromEmail": "info@themandate.dontechservicesconst.com",
    "replyToEmail": "info@themandate.dontechservicesconst.com",
    "emailEnabled": true,
    "whatsappEnabled": false,
    "emailProvider": "resend",
    "whatsappProvider": "twilio"
  }
  ```

### 14.6 POST `/api/admin/messages/settings`
Updates the custom configured sender name and reply-to email.

* **Method:** `POST`
* **Protection:** Admin Token / Super Admin / Team Role
* **Request Body:**
  ```json
  {
    "senderName": "Koinonia Global",
    "replyToEmail": "office@koinoniaglobal.org"
  }
  ```
* **Success Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "Sender settings updated successfully."
  }
  ```

---

## General System Settings & Team Governance (`/api/admin`)

### GET `/api/admin/general-settings`
Retrieves system-wide configurations and rules for parent onboarding registrations and safety-critical photo mandates.

* **Method:** `GET`
* **Protection:** Admin Token / Super Admin Role
* **Success Response (200 OK):**
  ```json
  {
    "success": true,
    "settings": {
      "parentRegistrationEnabled": 1,
      "parentLoginEnabled": 1,
      "requiredChildPhoto": 1,
      "requiredParentPhoto": 1,
      "requiredMedicalNotes": 0,
      "requiredPickupPerson": 1
    }
  }
  ```

### POST `/api/admin/general-settings`
Updates system-wide configurations, toggles, and mandatory form fields.

* **Method:** `POST`
* **Protection:** Admin Token / Super Admin Role
* **Request Body:**
  ```json
  {
    "parentRegistrationEnabled": true,
    "parentLoginEnabled": true,
    "requiredChildPhoto": true,
    "requiredParentPhoto": true,
    "requiredMedicalNotes": false,
    "requiredPickupPerson": true
  }
  ```
* **Success Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "General settings updated successfully."
  }
  ```

### GET `/api/admin/settings/media`
Retrieves currently configured custom URLs for Parent Hero, Volunteer Hero, and Default Event Cover slots.

* **Method:** `GET`
* **Protection:** Admin Token / Super Admin Role
* **Success Response (200 OK):**
  ```json
  {
    "success": true,
    "media": {
      "parent_dashboard_hero": "https://res.cloudinary.com/.../image/upload/v1/.../uuid.webp",
      "volunteer_dashboard_hero": "",
      "default_event_hero": ""
    }
  }
  ```

### POST `/api/admin/settings/media`
Uploads and optimizes a custom image for a specified app slot.
* **Method:** `POST`
* **Protection:** Admin Token / Super Admin Role
* **Multipart Field:** `file` (JPG, PNG, or WebP up to 5MB)
* **Request Body (form-data):**
  - `slot`: `"parent_dashboard_hero" | "volunteer_dashboard_hero" | "default_event_hero"`
* **Image Optimization (Sharp & Landings):**
  - Hero image slots are auto-optimized with Sharp to WebP format, stripped of metadata, scaled to a maximum of 1600px width/height, and compressed at 80–85 quality.
* **Strict Validation Rules:**
  - Files over 5MB are strictly rejected.
  - MIME types must match `image/jpeg`, `image/jpg`, `image/png`, or `image/webp`.
  - File extension (e.g. `.png`) must match the uploaded file's binary MIME signature to prevent renamed executable exploits.
  - Image processing failures result in an immediate `422 Unprocessable Entity` error status. Raw/unprocessed fallback files are never stored or published.
  - Environment-Aware Safe Storage: Silently falling back to ephemeral local storage in production is forbidden. Explicit errors are raised to the admin if Cloudinary is misconfigured or fails, unless persistent local storage is explicitly configured (`LOCAL_MEDIA_PERSISTENT=true`).
* **Success Response (200 OK):**
  ```json
  {
    "success": true,
    "media": {
      "slot": "parent_dashboard_hero",
      "url": "https://res.cloudinary.com/.../image/upload/v1/.../uuid.webp"
    }
  }
  ```
* **Error Response (422 Unprocessable Entity):**
  ```json
  {
    "success": false,
    "error": "We could not process this image. Please try another JPG, PNG, or WebP file."
  }
  ```
* **Error Response (500 Internal Server Error / Misconfigured Storage):**
  ```json
  {
    "success": false,
    "error": "Media storage is not fully configured. Please connect Cloudinary or persistent storage before uploading images."
  }
  ```

### POST `/api/admin/settings/media/reset`
Resets a custom slot config back to its system default illustration or stock image.
* **Method:** `POST`
* **Protection:** Admin Token / Super Admin Role
* **Request Body:**
  ```json
  {
    "slot": "parent_dashboard_hero"
  }
  ```
* **Success Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "Media slot reset successfully."
  }
  ```

### GET `/api/public/app-media`
Public unauthenticated endpoint to retrieve all configured media assets. This is accessed directly by Parent and Volunteer dashboards at load-time to obtain dynamic cover images.

* **Method:** `GET`
* **Protection:** Public (None)
* **Success Response (200 OK):**
  ```json
  {
    "success": true,
    "media": {
      "parentDashboardHero": {
        "url": "/api/media/files/1a2b3c4d-5e6f-7g8h-9i0j-k1l2m3n4o5p6",
        "thumbnailUrl": "/api/media/files/1a2b3c4d-5e6f-7g8h-9i0j-k1l2m3n4o5p6"
      },
      "volunteerDashboardHero": {
        "url": null,
        "thumbnailUrl": null
      },
      "defaultEventHero": {
        "url": "/api/media/files/9z8y7x6w-5v4u-3t2s-1r0q-p9o8n7m6l5k4",
        "thumbnailUrl": "/api/media/files/9z8y7x6w-5v4u-3t2s-1r0q-p9o8n7m6l5k4"
      }
    }
  }
  ```

### GET `/uploads/:filename`
Secure, public unauthenticated endpoint to resolve and stream uploaded images stored on the local/persistent file system.

* **Method:** `GET`
* **Protection:** Public (None)
* **Path Parameters:**
  - `filename`: Standard safe filename (e.g., `some-uuid.jpg`, `another-uuid.webp`).
* **Security Controls:**
  - Strictly prevents directory traversal (rejects `..`, `/`, `\`).
  - Limits file serving to allowed image extensions (`.jpg`, `.jpeg`, `.png`, `.webp`).
  - Serves files only from the designated media storage subfolders (`data/media`).
  - Automatically sends correct content types (e.g., `image/jpeg`, `image/png`, `image/webp`).
  - Attaches robust HTTP caching headers (`Cache-Control: public, max-age=31536000, immutable`).
* **Success Response (200 OK):** Binary image stream.
* **Error Response (400 Bad Request):** Path traversal attempts or invalid/unsupported file types.
* **Error Response (404 Not Found):** File does not exist on the server.

---

## Administrative Profile Soft-Delete Operations (`/api/admin`)

The following endpoints manage the secure soft-delete (archiving) and restoration of parent and volunteer profiles. Access is restricted to `admin` and `super_admin` users.

### 15.1 POST `/api/admin/parents/:id/remove`
Archives (soft-deletes) an active parent profile. Does NOT hard-delete child registrations, pickup records, or attendance logs.
- **Headers**: `Authorization: Bearer <token>`
- **Request Body**:
  ```json
  {
    "reason": "Relocated out of town"
  }
  ```
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "message": "Parent profile removed successfully."
  }
  ```

### 15.2 POST `/api/admin/parents/:id/restore`
Restores an archived parent profile back to active status.
- **Headers**: `Authorization: Bearer <token>`
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "message": "Parent profile restored successfully."
  }
  ```

### 15.3 POST `/api/admin/volunteers/:id/remove`
Archives (soft-deletes) an active volunteer profile. Disables their active schedule assignments but preserves historical audit ledgers.
- **Headers**: `Authorization: Bearer <token>`
- **Request Body**:
  ```json
  {
    "reason": "Requested temporary hiatus from ministry serving"
  }
  ```
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "message": "Volunteer profile removed successfully."
  }
  ```

### 15.4 POST `/api/admin/volunteers/:id/restore`
Restores an archived volunteer profile back to active status, making them available for service team assignment.
- **Headers**: `Authorization: Bearer <token>`
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "message": "Volunteer profile restored successfully."
  }
  ```

---

## Administrative Overview, Reports & Demographics (`/api/admin`)

The following endpoints support the executive dashboards and reports, querying the dynamically calculated, active event metrics.

### 15.5 GET `/api/admin/overview`
Retrieves live administrative statistics and real demographics counts dynamically computed from date of birth fields.
- **Headers**: `Authorization: Bearer <token>`
- **Response** (`200 OK`):
  ```json
  {
    "totalChildren": 240,
    "underReview": 5,
    "approved": 235,
    "fullName": "Senior Admin",
    "roleTitle": "Global Director",
    "event": { "id": "event-ga-2026", "title": "The General Assembly", ... },
    "demographics": [
      {
        "ageGroup": "Below 1",
        "boys": 2,
        "girls": 3,
        "total": 5,
        "underReview": 1,
        "selected": 4,
        "checkedIn": 2
      },
      ...
    ]
  }
  ```

### 15.6 GET `/api/admin/reports/demographics`
Provides a dedicated demographics aggregation report for a selected event.
- **Query Parameters**:
  - `eventId` (optional): Filter stats by a specific event ID. Defaults to current active event.
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "eventId": "event-ga-2026",
    "generatedAt": "2026-07-10T12:00:00.000Z",
    "groups": [
      {
        "key": "below_1",
        "label": "Below 1",
        "boys": 2,
        "girls": 3,
        "total": 5,
        "underReview": 1,
        "selected": 4,
        "checkedIn": 2
      },
      ...
    ],
    "summary": {
      "totalChildren": 240,
      "totalUnderReview": 5,
      "totalSelected": 235,
      "totalCheckedIn": 180
    }
  }
  ```

---

## Administrative Events & Gathering Operations (`/api/admin/events`)

The following endpoints manage the administrative lifecycle of gatherings, events, and age groups/capacities.

### 16.1 GET `/api/admin/events`
Returns all registered gatherings.
- **Query Parameters**:
  - `status` (optional): Filter events by status (`draft`, `upcoming`, `current`, `closed`, `archived`).
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "events": [
      {
        "id": "event-xyz",
        "title": "Koinonia Autumn Gathering",
        "sectionName": "Children and Teens",
        "location": "Main Auditorium",
        "startsAt": "2025-11-22",
        "endsAt": "2025-11-22",
        "dailyStartTime": "09:00",
        "dailyEndTime": "17:00",
        "status": "upcoming",
        "timezone": "Africa/Lagos",
        "parentAccessOpensAt": "2025-10-01T00:00:00.000Z",
        "parentAccessClosesAt": "2025-11-20T23:59:59.000Z",
        "parentsCanCreateAccount": true,
        "allowMultipleChildren": true,
        "allowSaveAndContinue": true,
        "allowEditAfterSubmission": false,
        "description": "Annual Autumn gathering for spiritual fellowship and fun.",
        "totalCapacity": 310,
        "applicationsCount": 15,
        "selectedCount": 8
      }
    ]
  }
  ```

### 16.2 GET `/api/admin/events/:eventId`
Returns full details of an individual event and its configured age capacity limits.
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "event": {
      "id": "event-xyz",
      "title": "Koinonia Autumn Gathering",
      "sectionName": "Children and Teens",
      "location": "Main Auditorium",
      "startsAt": "2025-11-22",
      "endsAt": "2025-11-22",
      "dailyStartTime": "09:00",
      "dailyEndTime": "17:00",
      "status": "upcoming",
      "parentAccessOpensAt": "2025-10-01T00:00:00.000Z",
      "parentAccessClosesAt": "2025-11-20T23:59:59.000Z",
      "parentsCanCreateAccount": true,
      "allowMultipleChildren": true,
      "allowSaveAndContinue": true,
      "allowEditAfterSubmission": false,
      "description": "Annual Autumn gathering..."
    },
    "ageGroups": [
      {
        "id": "group-abc",
        "label": "Ages 4",
        "minAge": 4,
        "maxAge": 6,
        "capacity": 60,
        "manualReview": false,
        "sortOrder": 2
      }
    ]
  }
  ```

### 16.3 POST `/api/admin/events`
Creates a new event and registers its corresponding age capacity records.
- **Request Body**:
  ```json
  {
    "title": "Youth Summer Camp",
    "sectionName": "Children and Teens",
    "location": "Youth Hall",
    "startsAt": "2025-07-15",
    "endsAt": "2025-07-15",
    "dailyStartTime": "08:30",
    "dailyEndTime": "16:30",
    "description": "Summer camp details...",
    "status": "draft",
    "parentAccessOpensAt": "2025-06-01T09:00:00",
    "parentAccessClosesAt": "2025-07-10T18:00:00",
    "parentsCanCreateAccount": true,
    "allowMultipleChildren": true,
    "allowSaveAndContinue": true,
    "allowEditAfterSubmission": false,
    "ageGroups": [
      { "label": "Ages 4", "minAge": 4, "maxAge": 6, "capacity": 60, "manualReview": false }
    ]
  }
  ```
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "eventId": "event-xyz",
    "message": "Event created successfully."
  }
  ```

### 16.4 PATCH `/api/admin/events/:eventId`
Updates event details and synchronizes/re-registers age groups.
- **Request Body**: Same schema as POST `/api/admin/events` (fields can be individually omitted/included for partial updates).
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "message": "Event updated successfully."
  }
  ```

### 16.5 POST `/api/admin/events/:eventId/publish`
Transitions an event status to `upcoming`.
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "message": "Event published successfully."
  }
  ```

### 16.6 POST `/api/admin/events/:eventId/archive`
Archives an event, locking parent access and application submissions.
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "message": "Event archived successfully."
  }
  ```

### 16.7 POST `/api/admin/events/:eventId/set-current`
Promotes a gathering to the single active `current` event, demoting other events.
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "message": "Event is now set as the active current event."
  }
  ```

---

## 17. Notification Operations (`/api/notifications`)

The following endpoints manage the secure, unified notifications center for all roles (parents, volunteers, staff, and admins).

### 17.1 GET `/api/notifications`
Retrieves a sorted list of active notifications tailored specifically for the user's active role.
- **Role Scoping & Merging Rules**:
  - **Parents**: Merges broad system announcements, specific parent-directed notifications, child-specific updates, and personalized items from the `parent_notifications` table. Includes automatic content deduplication (preferring the richer `parent_notifications` copy).
  - **Staff & Volunteers**: Filters announcements matching staff or volunteer target audiences, or administrative team alerts.
  - **Admins**: Retrieves all notification types.
- **Response** (`200 OK`):
  ```json
  {
    "notifications": [
      {
        "id": "notifications:notif-uuid",
        "title": "Koinonia Application Selected!",
        "message": "Hello Tochukwu,\n\nBaby Livina has been selected...",
        "type": "info",
        "audienceRole": "parent",
        "audienceScope": "individual",
        "eventId": "event-ga-2026",
        "childId": "child-12345",
        "parentId": null,
        "createdByUserId": null,
        "visibleToEventTeam": false,
        "createdAt": "2026-07-09T00:19:05.593Z",
        "expiresAt": null,
        "priority": "normal",
        "channel": "in-app",
        "metadata": null,
        "isRead": true,
        "readAt": "2026-07-09T00:19:05.593Z"
      }
    ]
  }
  ```

### 17.2 POST `/api/notifications/:id/read`
Marks a specific notification as read.
- **Composite ID Processing**: Parses the composite format `<source_table>:<id>` (e.g., `parent_notifications:pnotif-123` or `notifications:notif-456`) to target the appropriate database table atomically.
- **Security Check**: Restricts access to ensure that parents can only mark notifications that belong to them or their registered children.
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "message": "Notification marked as read"
  }
  ```

### 17.3 POST `/api/notifications/read-all`
Marks all active, unread notifications matching the user's role and scoping parameters as read in a single atomic transaction.
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "message": "All notifications marked as read"
  }
  ```

### 17.4 GET `/api/notifications/admin/updates`
Retrieves Messages & updates list with advanced premium filters for the History center. Supports search, read/unread filtering, priority, and pagination.
- **Query Parameters**:
  - `search`: string (optional search keyword)
  - `status`: `'all' | 'unread' | 'archived'` (defaults to `'all'`)
  - `priority`: `'all' | 'normal' | 'important'` (defaults to `'all'`)
  - `senderRole`: `'all' | 'volunteer' | 'parent'` (defaults to `'all'`)
  - `page`: number (page index, default 1)
  - `limit`: number (items per page, default 20)
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "updates": [
      {
        "id": "notif-uuid",
        "title": "Care updates escalated",
        "message": "Attention item escalated...",
        "type": "escalation",
        "priority": "important",
        "createdAt": "2026-07-09T00:19:05.593Z",
        "isRead": false,
        "isArchived": false,
        "metadata": {}
      }
    ],
    "pagination": {
      "total": 42,
      "page": 1,
      "limit": 20,
      "pages": 3
    }
  }
  ```

### 17.5 POST `/api/notifications/admin/updates/:id/read`
Marks an individual administrative message or care update as read. Does not delete or remove the item from the History center.
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "message": "Update marked as read"
  }
  ```

### 17.6 POST `/api/notifications/admin/updates/:id/unread`
Marks an individual administrative message or care update as unread.
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "message": "Update marked as unread"
  }
  ```

### 17.7 POST `/api/notifications/admin/updates/:id/archive`
Archives an administrative message or care update. The archived item is preserved and accessible in the archive filter of the History center.
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "message": "Update archived successfully"
  }
  ```

### 17.8 POST `/api/notifications/admin/updates/:id/unarchive`
Restores an archived administrative message or care update.
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "message": "Update restored successfully"
  }
  ```

### 17.9 POST `/api/notifications/admin/updates/read-all`
Marks all active administrative messages and care updates as read.
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "message": "All updates marked as read"
  }
  ```

### 17.10 GET `/api/notifications/admin/updates/summary`
Retrieves live aggregate message totals and safety concern states across the active system (excluding archived updates).
- **Headers**: `Authorization: Bearer <token>` (Admin/Super-Admin only)
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "summary": {
      "total": 42,
      "unread": 5,
      "read": 37,
      "openAlerts": 1,
      "urgent": 2,
      "important": 4,
      "resolved": 15,
      "acknowledged": 10,
      "archived": 3,
      "deliveryIssues": 0
    }
  }
  ```

### 17.11 POST `/api/admin/safety-alerts/:id/acknowledge`
Marks an active safety alert as acknowledged.
- **Side-Effects on Client**: Once acknowledged, the server updates the alert status. The client instantly terminates any ongoing triple-tone audio loops, ceases haptic vibrations via `navigator.vibrate(0)`, and cancels any active `speechSynthesis` spoken alerts.
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "message": "Alert acknowledged.",
    "alert": {
      "id": "alert-uuid",
      "status": "acknowledged",
      "acknowledgedAt": "2026-07-09T00:19:05.593Z",
      "resolvedAt": null,
      "soundEligible": false
    }
  }
  ```

### 17.12 POST `/api/admin/safety-alerts/:id/resolve`
Marks a safety alert as resolved with a detailed resolution note.
- **Side-Effects on Client**: Clears the emergency takeover overlay completely on all connected devices, resets device audio context, and terminates haptic motors immediately.
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "message": "Alert resolved.",
    "alert": {
      "id": "alert-uuid",
      "status": "resolved",
      "acknowledgedAt": "2026-07-09T00:19:05.593Z",
      "resolvedAt": "2026-07-09T00:25:12.112Z",
      "soundEligible": false
    }
  }
  ```


### 17.13 POST `/api/admin/parents/:id/permanent-delete`
Permanently deletes and anonymizes a soft-removed parent's profile and disables their user login credentials.
- **Headers**: `Authorization: Bearer <token>` (Admin/Super-Admin only)
- **Request Body**:
  - `reason`: string (required)
  - `confirmation`: string (must be exactly `"DELETE"`)
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "message": "Parent profile and login permanently deleted/anonymized successfully."
  }
  ```

### 17.5 POST `/api/admin/volunteers/:id/permanent-delete`
Permanently deletes and anonymizes a soft-removed volunteer's profile and disables their user login credentials.
- **Headers**: `Authorization: Bearer <token>` (Admin/Super-Admin only)
- **Request Body**:
  - `reason`: string (required)
  - `confirmation`: string (must be exactly `"DELETE"`)
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "message": "Volunteer profile and login permanently deleted/anonymized successfully."
  }
  ```

---

## 18. Volunteer Check-In Client Integration & Guardrails

The mobile check-in scanner leverages the `/api/volunteer/pass/lookup` and `/api/volunteer/check-in` contracts with critical client-side state protections:
- **Lookup Debouncing & Locking**: Prior to triggering a lookup request, the client locks scanning using a local reference guard (`isLookupInFlightRef`). No multiple requests are triggered for the same code.
- **Immediate Viewfinder Shutdown**: On a successful lookup, the camera stream is halted instantly to prevent background scans.
- **Transition Flow**: The lookup response drives transition directly to the "Child Found" screen, which contains custom action triggers pointing to `/api/volunteer/check-in` and state-cleanup handlers to safely restore operational scanning on dismiss.


