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
- **Note on Email Notifications**:
  Resend is configured as the active transactional email provider over a verified sending subdomain (`EMAIL_PROVIDER=resend`), replacing legacy Gmail SMTP. The frontend must never call Resend directly or store API keys.

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
Accepts multipart form uploads (`file` and `purpose`) or base64 data URLs for parent avatars, child profile photos, pickup person photos, landing images, and gallery media.
- **Provider**: Uploads directly to Cloudinary server-side using environment credentials (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_UPLOAD_FOLDER`).
- **Validation Rules**:
  - **Photos (`parent_profile_photo`, `child_photo`, `pickup_person_photo`, `volunteer_profile_photo`)**: Max 5MB. Allowed types: `image/jpeg`, `image/png`, `image/webp`.
  - **Landing & Gallery Images (`landing_image`, `gallery_media`)**: Max 10MB. Allowed types: `image/jpeg`, `image/png`, `image/webp`.
  - **Videos (`event_video`)**: Max 50MB. Allowed types: `video/mp4`, `video/webm`.
- **Response** (`201 Created`):
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
