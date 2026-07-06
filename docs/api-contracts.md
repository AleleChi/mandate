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
- **Response** (`200 OK`):
  ```json
  { "success": true, "message": "Verification link has been sent." }
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
  - **Photos (`parent_profile_photo`, `child_photo`, `pickup_person_photo`)**: Max 5MB. Allowed types: `image/jpeg`, `image/png`, `image/webp`.
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

### GET `/api/media/files/:fileId`
Public resolution endpoint for serving media. Automatically redirects (`302`) to the remote Cloudinary `secureUrl` if present, ensuring UI `<img />` tags resolve cleanly without custom headers.
