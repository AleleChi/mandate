# Koinonia Database Schema Specification

This document describes the production database model for Koinonia Children and Teens, implemented via `src/server/db.ts` for both PostgreSQL (Production) and SQLite (Local Development).

## Entity Relationship Summary

```
users (1) <----> (0..1) parent_profiles (1) <----> (0..N) children
                                                       |
events (1) <-------------------------------------------+ (1)
  |                                                    |
  v                                                    v
event_passes (1) <--- child_event_entries (1) ---> (1..N) pickup_people
```

## Table Definitions

### 1. `users`
Stores authenticated identity and RBAC role.
- `id` (VARCHAR/TEXT PK): UUID
- `email` (VARCHAR/TEXT UNIQUE NOT NULL): User email
- `password_hash` (VARCHAR/TEXT NOT NULL): Argon2id / scrypt hashed password
- `role` (VARCHAR/TEXT NOT NULL): `parent`, `staff`, `admin`
- `created_at`, `updated_at`: TIMESTAMP

### 2. `parent_profiles`
Stores contact preferences and worker identity.
- `id` (VARCHAR/TEXT PK): UUID
- `user_id` (VARCHAR/TEXT FK -> users.id UNIQUE)
- `full_name`, `email`, `phone_number`, `whatsapp_number`, `home_address`: TEXT
- `preferred_contact`: `WhatsApp`, `Email`, `Both`
- `is_worker` (SMALLINT/INTEGER): 0 or 1
- `department`: TEXT
- `photo_file_id` (VARCHAR/TEXT FK -> media_files.id NULLABLE)

### 3. `events`
Represents children's church events or camp iterations.
- `id` (VARCHAR/TEXT PK): UUID
- `title`, `theme`, `date_label`: TEXT
- `is_active` (SMALLINT/INTEGER): 1 for active event

### 4. `children`
Long-term child identity owned by a parent profile.
- `id` (VARCHAR/TEXT PK): UUID
- `parent_profile_id` (VARCHAR/TEXT FK -> parent_profiles.id)
- `full_name`, `gender`, `date_of_birth`: TEXT
- `calculated_age` (INTEGER): Computed from birth date
- `age_group` (TEXT): Categorized group (e.g. `Ages 7 to 9`)
- `relationship_to_child` (TEXT): `Parent`, `Guardian`, etc.
- `photo_file_id` (VARCHAR/TEXT FK -> media_files.id NULLABLE)
- `needs_age_review` (SMALLINT/INTEGER): Flagged if DOB age mismatches selected group

### 5. `child_event_entries`
Per-event registration workflow and care profile.
- `id` (VARCHAR/TEXT PK): UUID
- `child_id` (VARCHAR/TEXT FK -> children.id)
- `event_id` (VARCHAR/TEXT FK -> events.id)
- `status` (TEXT): `incomplete`, `under_review`, `selected`, `not_selected`, `waiting_list`, `pass_ready`
- `school_class`, `school_name`, `previous_children_programme`, `note_to_team`: TEXT
- `has_medical_notes`, `needs_extra_support`, `information_confirmed`, `details_confirmed`: SMALLINT/INTEGER
- `medical_notes`, `support_notes`: TEXT

### 6. `pickup_people`
Designated adults authorized to pick up the child.
- `id` (VARCHAR/TEXT PK): UUID
- `child_event_entry_id` (VARCHAR/TEXT FK -> child_event_entries.id)
- `pickup_type`: `parent` or `other`
- `full_name`, `relationship_to_child`, `phone_number`, `whatsapp_number`: TEXT
- `photo_file_id` (VARCHAR/TEXT FK -> media_files.id NULLABLE)
- `approved_by_parent` (SMALLINT/INTEGER)

### 7. `event_passes`
Pass ready read-model generated upon final admission approval.
- `id` (VARCHAR/TEXT PK): UUID
- `child_event_entry_id` (VARCHAR/TEXT FK -> child_event_entries.id UNIQUE)
- `pass_code` (TEXT UNIQUE): Human-readable code (e.g. `PASS-6E80A7`)
- `qr_payload` (TEXT): Signed verify token payload

### 8. `media_files`
Metadata catalog for uploaded assets stored via Cloudinary media provider.
- `id` (VARCHAR/TEXT PK): UUID
- `owner_user_id` (VARCHAR/TEXT FK -> users.id)
- `provider` (TEXT DEFAULT 'cloudinary'): Media storage provider
- `file_type` (TEXT): Purpose indicator (`parent_profile_photo`, `child_photo`, `pickup_person_photo`, `landing_image`, `event_video`, `gallery_media`)
- `public_id` (TEXT): Cloudinary public asset ID (e.g., `koinonia-children-teens/parents/uuid`)
- `secure_url` (TEXT): Cloudinary HTTPS asset delivery URL
- `resource_type` (TEXT): Cloudinary resource type (`image`, `video`)
- `mime_type` (TEXT): MIME format (`image/jpeg`, `video/mp4`, etc.)
- `file_size` (INTEGER): Size in bytes
- `width`, `height` (INTEGER NULLABLE): Image/video dimensions
- `duration` (FLOAT NULLABLE): Video duration in seconds
- `folder` (TEXT): Cloudinary folder hierarchy path
- `file_url`, `storage_key`: Legacy compatibility references
- `created_at` (TIMESTAMP): Upload timestamp
