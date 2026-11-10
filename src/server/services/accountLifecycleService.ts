import crypto from 'crypto';
import { query, queryOne, execute, transaction } from '../db';

/**
 * Normalizes email by trimming and converting to lowercase.
 * Ensures consistent canonical comparison across all workflows.
 */
export function normalizeEmail(email: string | null | undefined): string {
  return email ? String(email).trim().toLowerCase() : '';
}

/**
 * Generates an irreversibly anonymized tombstone email for permanently deleted users.
 * Does NOT contain the original email to guarantee privacy and release the original address.
 */
export function generateTombstoneEmail(userId: string): string {
  return `deleted-${userId}-${Date.now()}@deleted.invalid`;
}

export type AccountLifecycleState =
  | 'available'
  | 'active'
  | 'invitation_pending'
  | 'removed'
  | 'permanently_deleted'
  | 'role_conflict';

export interface AccountLifecycleResult {
  state: AccountLifecycleState;
  email: string;
  userId?: string;
  role?: string;
  profileId?: string;
  profileType?: 'parent' | 'volunteer' | 'admin';
  code?: string;
  message?: string;
  canRestore?: boolean;
  canResendInvite?: boolean;
}

/**
 * Resolves the lifecycle state of an email address across Users, Parents, Volunteers, and Admins.
 * Enforces:
 * - One unique email globally on `users.email`.
 * - Case-insensitive lookup.
 * - Distinguishes Active, Removed (soft-deleted/archived), and Permanently Deleted accounts.
 * - Detects role conflicts when an email belongs to a different active role.
 */
export async function resolveAccountByEmail(
  rawEmail: string,
  targetRole?: 'parent' | 'volunteer' | 'admin' | 'super_admin' | 'team'
): Promise<AccountLifecycleResult> {
  const cleanEmail = normalizeEmail(rawEmail);
  if (!cleanEmail) {
    return { state: 'available', email: '' };
  }

  // 1. Check central users table by canonical lowercase email
  const user = await queryOne<any>(
    'SELECT id, email, password_hash, role, status, email_verified FROM users WHERE LOWER(email) = ? LIMIT 1',
    [cleanEmail]
  );

  // If user is permanently deleted (status = 'deleted' or tombstone email), the original email is free
  if (user && (user.status === 'deleted' || String(user.email).endsWith('@deleted.invalid'))) {
    return { state: 'available', email: cleanEmail };
  }

  // Look up parent profile by user_id OR email
  const parentProfile = user
    ? await queryOne<any>(
        `SELECT id, user_id, full_name, email, is_deleted, deleted_at, permanently_deleted_at
         FROM parent_profiles
         WHERE user_id = ? OR LOWER(COALESCE(email, '')) = ?
         ORDER BY (CASE WHEN user_id = ? THEN 1 ELSE 2 END)
         LIMIT 1`,
        [user.id, cleanEmail, user.id]
      )
    : await queryOne<any>(
        `SELECT id, user_id, full_name, email, is_deleted, deleted_at, permanently_deleted_at
         FROM parent_profiles
         WHERE LOWER(COALESCE(email, '')) = ?
         LIMIT 1`,
        [cleanEmail]
      );

  // Look up volunteer profile by user_id OR joined users email
  const volProfile = user
    ? await queryOne<any>(
        `SELECT id, user_id, full_name, status, is_deleted, deleted_at, permanently_deleted_at
         FROM volunteer_profiles
         WHERE user_id = ?
         LIMIT 1`,
        [user.id]
      )
    : await queryOne<any>(
        `SELECT vp.id, vp.user_id, vp.full_name, vp.status, vp.is_deleted, vp.deleted_at, vp.permanently_deleted_at
         FROM volunteer_profiles vp
         JOIN users u ON u.id = vp.user_id
         WHERE LOWER(u.email) = ?
         LIMIT 1`,
        [cleanEmail]
      );

  // If no user and no profile found at all: Available
  if (!user && !parentProfile && !volProfile) {
    return { state: 'available', email: cleanEmail };
  }

  const effectiveRole = user?.role || (parentProfile ? 'parent' : (volProfile ? 'volunteer' : 'user'));
  const effectiveUserId = user?.id || parentProfile?.user_id || volProfile?.user_id;

  // 2. Evaluate when targetRole is 'parent'
  if (targetRole === 'parent') {
    // Check role collision with active volunteer or admin
    if (user && user.role !== 'parent' && user.role !== 'revoked') {
      const isVolActive = volProfile && volProfile.is_deleted !== 1 && volProfile.status !== 'removed' && user.status !== 'revoked';
      const isAdminActive = ['admin', 'super_admin', 'team'].includes(user.role) && user.status !== 'revoked' && user.status !== 'disabled';

      if (isVolActive) {
        return {
          state: 'role_conflict',
          code: 'ROLE_CONFLICT',
          email: cleanEmail,
          userId: user.id,
          role: 'volunteer',
          profileType: 'volunteer',
          message: 'This email already belongs to an active Volunteer account.'
        };
      }

      if (isAdminActive) {
        return {
          state: 'role_conflict',
          code: 'ROLE_CONFLICT',
          email: cleanEmail,
          userId: user.id,
          role: user.role,
          profileType: 'admin',
          message: 'This email already belongs to an active Admin account.'
        };
      }
    }

    // Evaluate parent profile lifecycle
    const isParentRemoved = (parentProfile && parentProfile.is_deleted === 1 && !parentProfile.permanently_deleted_at) ||
                            (user && user.status === 'revoked');

    if (isParentRemoved) {
      return {
        state: 'removed',
        code: 'REMOVED_ACCOUNT_EXISTS',
        email: cleanEmail,
        userId: effectiveUserId,
        profileId: parentProfile?.id,
        role: 'parent',
        profileType: 'parent',
        canRestore: true,
        message: 'A removed parent account already uses this email.'
      };
    }

    // Invitation pending
    if (user && (user.password_hash === 'invited_pending' || user.status === 'invited')) {
      return {
        state: 'invitation_pending',
        code: 'INVITATION_PENDING',
        email: cleanEmail,
        userId: user.id,
        profileId: parentProfile?.id,
        role: 'parent',
        profileType: 'parent',
        canResendInvite: true,
        message: 'An invitation is already pending for this parent.'
      };
    }

    // Active parent exists
    return {
      state: 'active',
      code: 'ACTIVE_ACCOUNT_EXISTS',
      email: cleanEmail,
      userId: effectiveUserId,
      profileId: parentProfile?.id,
      role: 'parent',
      profileType: 'parent',
      message: 'An active account already exists with this email.'
    };
  }

  // 3. Evaluate when targetRole is 'volunteer'
  if (targetRole === 'volunteer') {
    // Check role collision with active parent or admin
    if (user && user.role !== 'volunteer' && user.role !== 'revoked') {
      const isParentActive = parentProfile && parentProfile.is_deleted !== 1 && !parentProfile.permanently_deleted_at && user.status !== 'revoked';
      const isAdminActive = ['admin', 'super_admin', 'team'].includes(user.role) && user.status !== 'revoked' && user.status !== 'disabled';

      if (isParentActive) {
        return {
          state: 'role_conflict',
          code: 'ROLE_CONFLICT',
          email: cleanEmail,
          userId: user.id,
          role: 'parent',
          profileType: 'parent',
          message: 'This email already belongs to an active Parent account.'
        };
      }

      if (isAdminActive) {
        return {
          state: 'role_conflict',
          code: 'ROLE_CONFLICT',
          email: cleanEmail,
          userId: user.id,
          role: user.role,
          profileType: 'admin',
          message: 'This email already belongs to an active Admin account.'
        };
      }
    }

    // Evaluate volunteer profile lifecycle
    const isVolRemoved = (volProfile && (volProfile.is_deleted === 1 || volProfile.status === 'removed') && !volProfile.permanently_deleted_at) ||
                         (user && user.status === 'revoked');

    if (isVolRemoved) {
      return {
        state: 'removed',
        code: 'REMOVED_ACCOUNT_EXISTS',
        email: cleanEmail,
        userId: effectiveUserId,
        profileId: volProfile?.id,
        role: 'volunteer',
        profileType: 'volunteer',
        canRestore: true,
        message: 'A removed volunteer account already uses this email.'
      };
    }

    // Invitation pending
    if (user && (user.password_hash === 'invited_pending' || user.status === 'invited')) {
      return {
        state: 'invitation_pending',
        code: 'INVITATION_PENDING',
        email: cleanEmail,
        userId: user.id,
        profileId: volProfile?.id,
        role: 'volunteer',
        profileType: 'volunteer',
        canResendInvite: true,
        message: 'An invitation is already pending for this volunteer.'
      };
    }

    // Active volunteer exists
    return {
      state: 'active',
      code: 'ACTIVE_ACCOUNT_EXISTS',
      email: cleanEmail,
      userId: effectiveUserId,
      profileId: volProfile?.id,
      role: 'volunteer',
      profileType: 'volunteer',
      message: 'An active volunteer account already exists with this email.'
    };
  }

  // 4. Evaluate when targetRole is 'admin' | 'super_admin' | 'team'
  if (['admin', 'super_admin', 'team'].includes(targetRole || '')) {
    if (user) {
      if (user.role === 'parent' && parentProfile && parentProfile.is_deleted !== 1) {
        return {
          state: 'role_conflict',
          code: 'ROLE_CONFLICT',
          email: cleanEmail,
          userId: user.id,
          role: 'parent',
          profileType: 'parent',
          message: 'This account already exists as a parent. You can update their role from Event Team Access.'
        };
      }

      if (user.role === 'volunteer' && volProfile && volProfile.is_deleted !== 1 && volProfile.status !== 'removed') {
        return {
          state: 'role_conflict',
          code: 'ROLE_CONFLICT',
          email: cleanEmail,
          userId: user.id,
          role: 'volunteer',
          profileType: 'volunteer',
          message: 'This account already exists as a volunteer. You can update their role from Event Team Access.'
        };
      }

      const isAdminRemoved = user.status === 'revoked' || user.role === 'revoked' || user.status === 'disabled';
      if (isAdminRemoved) {
        return {
          state: 'removed',
          code: 'REMOVED_ACCOUNT_EXISTS',
          email: cleanEmail,
          userId: user.id,
          role: user.role === 'revoked' ? 'admin' : user.role,
          profileType: 'admin',
          canRestore: true,
          message: 'A removed admin account already uses this email.'
        };
      }

      if (user.password_hash === 'invited_pending') {
        return {
          state: 'invitation_pending',
          code: 'INVITATION_PENDING',
          email: cleanEmail,
          userId: user.id,
          role: user.role,
          profileType: 'admin',
          canResendInvite: true,
          message: 'An invitation is already pending for this email.'
        };
      }

      return {
        state: 'active',
        code: 'ACTIVE_ACCOUNT_EXISTS',
        email: cleanEmail,
        userId: user.id,
        role: user.role,
        profileType: 'admin',
        message: 'An active team member account already exists with this email.'
      };
    }
  }

  // 5. Generic fallback when targetRole is not specified
  if (parentProfile?.is_deleted === 1 || volProfile?.is_deleted === 1 || user?.status === 'revoked') {
    return {
      state: 'removed',
      code: 'REMOVED_ACCOUNT_EXISTS',
      email: cleanEmail,
      userId: effectiveUserId,
      profileId: parentProfile?.id || volProfile?.id,
      role: effectiveRole,
      canRestore: true,
      message: `A removed ${effectiveRole} account already uses this email.`
    };
  }

  if (user?.password_hash === 'invited_pending') {
    return {
      state: 'invitation_pending',
      code: 'INVITATION_PENDING',
      email: cleanEmail,
      userId: user.id,
      role: user.role,
      canResendInvite: true,
      message: `An invitation is already pending for this ${effectiveRole}.`
    };
  }

  return {
    state: 'active',
    code: 'ACTIVE_ACCOUNT_EXISTS',
    email: cleanEmail,
    userId: effectiveUserId,
    profileId: parentProfile?.id || volProfile?.id,
    role: effectiveRole,
    message: 'An active account already exists with this email.'
  };
}

/**
 * Revokes all active and pending authentication tokens for a user.
 */
export async function revokeUserAuth(userId: string, revokedBy?: string): Promise<void> {
  const now = new Date().toISOString();
  await execute(
    'UPDATE auth_tokens SET revoked_at = ?, revoked_by = ? WHERE user_id = ? AND revoked_at IS NULL',
    [now, revokedBy || null, userId]
  );
}

/**
 * Restores a soft-deleted / archived account and ensures the user status is active.
 * Reuses existing user ID and profile without creating duplicates.
 */
export async function restoreAccount(options: {
  type: 'parent' | 'volunteer' | 'admin';
  id: string; // profileId or userId
  adminUserId: string;
  adminRole: string;
}): Promise<{ success: boolean; code?: string; message: string; userId?: string; profileId?: string }> {
  const { type, id, adminUserId, adminRole } = options;
  const nowStr = new Date().toISOString();

  if (type === 'parent') {
    const parent = await queryOne<any>(
      'SELECT id, user_id, email FROM parent_profiles WHERE id = ? OR user_id = ?',
      [id, id]
    );
    if (!parent) {
      return { success: false, code: 'NOT_FOUND', message: 'Parent profile not found.' };
    }

    await transaction(async () => {
      // 1. Restore parent profile
      await execute(`
        UPDATE parent_profiles
        SET is_deleted = 0, deleted_at = NULL, deleted_by = NULL, delete_reason = NULL,
            restored_at = ?, restored_by = ?, updated_at = ?
        WHERE id = ?
      `, [nowStr, adminUserId, nowStr, parent.id]);

      // 2. Restore user status if applicable
      if (parent.user_id) {
        await execute(`
          UPDATE users
          SET status = 'active', role = 'parent', updated_at = ?
          WHERE id = ?
        `, [nowStr, parent.user_id]);
      }

      // 3. Audit log
      try {
        await execute(`
          INSERT INTO audit_logs (id, user_id, user_role, action, target_type, target_id, details, timestamp)
          VALUES (?, ?, ?, 'ACCOUNT_RESTORED', 'parent_profile', ?, ?, ?)
        `, [
          crypto.randomUUID(), adminUserId, adminRole, parent.id,
          JSON.stringify({ role: 'parent', restoredBy: adminUserId, parentId: parent.id, userId: parent.user_id }),
          nowStr
        ]);
      } catch (aErr) {}
    });

    return {
      success: true,
      message: 'Parent account restored successfully.',
      userId: parent.user_id,
      profileId: parent.id
    };
  }

  if (type === 'volunteer') {
    const volunteer = await queryOne<any>(
      'SELECT id, user_id, status FROM volunteer_profiles WHERE id = ? OR user_id = ?',
      [id, id]
    );
    if (!volunteer) {
      return { success: false, code: 'NOT_FOUND', message: 'Volunteer profile not found.' };
    }

    await transaction(async () => {
      // 1. Restore volunteer profile (default to pending_review or active based on prior approval)
      await execute(`
        UPDATE volunteer_profiles
        SET is_deleted = 0, status = 'pending_review', deleted_at = NULL, deleted_by = NULL, delete_reason = NULL,
            restored_at = ?, restored_by = ?, updated_at = ?
        WHERE id = ?
      `, [nowStr, adminUserId, nowStr, volunteer.id]);

      // 2. Restore user status
      if (volunteer.user_id) {
        await execute(`
          UPDATE users
          SET status = 'active', role = 'volunteer', updated_at = ?
          WHERE id = ?
        `, [nowStr, volunteer.user_id]);
      }

      // 3. Audit log
      try {
        await execute(`
          INSERT INTO audit_logs (id, user_id, user_role, action, target_type, target_id, details, timestamp)
          VALUES (?, ?, ?, 'ACCOUNT_RESTORED', 'volunteer_profile', ?, ?, ?)
        `, [
          crypto.randomUUID(), adminUserId, adminRole, volunteer.id,
          JSON.stringify({ role: 'volunteer', restoredBy: adminUserId, volunteerId: volunteer.id, userId: volunteer.user_id }),
          nowStr
        ]);
      } catch (aErr) {}
    });

    return {
      success: true,
      message: 'Volunteer account restored successfully.',
      userId: volunteer.user_id,
      profileId: volunteer.id
    };
  }

  if (type === 'admin') {
    if (adminRole !== 'super_admin') {
      return { success: false, code: 'SUPER_ADMIN_REQUIRED', message: 'Only Super Administrators can restore admin accounts.' };
    }

    const user = await queryOne<any>('SELECT id, email, role, status FROM users WHERE id = ?', [id]);
    if (!user) {
      return { success: false, code: 'NOT_FOUND', message: 'Admin user not found.' };
    }

    await transaction(async () => {
      const restoredRole = user.role === 'revoked' ? 'admin' : user.role;
      await execute(`
        UPDATE users
        SET status = 'active', role = ?, updated_at = ?
        WHERE id = ?
      `, [restoredRole, nowStr, user.id]);

      try {
        await execute(`
          INSERT INTO audit_logs (id, user_id, user_role, action, target_type, target_id, details, timestamp)
          VALUES (?, ?, ?, 'ACCOUNT_RESTORED', 'user', ?, ?, ?)
        `, [
          crypto.randomUUID(), adminUserId, adminRole, user.id,
          JSON.stringify({ role: restoredRole, restoredBy: adminUserId }),
          nowStr
        ]);
      } catch (aErr) {}
    });

    return {
      success: true,
      message: 'Admin account restored successfully.',
      userId: user.id
    };
  }

  return { success: false, code: 'INVALID_TYPE', message: 'Invalid account type specified.' };
}

/**
 * Permanently deletes an account by tombstoning the email address, revoking credentials,
 * and anonymizing personal details while preserving necessary historical operational links.
 * Requires Super Admin authorization.
 */
export async function permanentlyDeleteAccount(options: {
  type: 'parent' | 'volunteer' | 'admin';
  id: string; // profileId or userId
  adminUserId: string;
  adminRole: string;
  reason?: string;
}): Promise<{ success: boolean; code?: string; message: string }> {
  const { type, id, adminUserId, adminRole, reason } = options;
  if (adminRole !== 'super_admin') {
    return { success: false, code: 'FORBIDDEN', message: 'Super administrator authorization is required.' };
  }

  const nowStr = new Date().toISOString();

  if (type === 'parent') {
    const parent = await queryOne<any>(
      'SELECT id, user_id, email, is_deleted, deleted_at FROM parent_profiles WHERE id = ?',
      [id]
    );
    if (!parent) {
      return { success: false, code: 'NOT_FOUND', message: 'Parent profile not found.' };
    }

    if (parent.is_deleted !== 1 && !parent.deleted_at) {
      return {
        success: false,
        code: 'NOT_REMOVED',
        message: 'Only removed parents can be permanently deleted. Remove this parent first.'
      };
    }

    // Safety check: ensure no linked children are currently checked in or inside
    const activeAttendance = await queryOne<any>(`
      SELECT COUNT(*) as count 
      FROM child_event_entries e 
      JOIN children c ON c.id = e.child_id 
      WHERE c.parent_profile_id = ? AND e.status IN ('checked_in', 'inside')
    `, [id]);
    if (Number(activeAttendance?.count || 0) > 0) {
      return {
        success: false,
        code: 'CHILDREN_INSIDE',
        message: 'Cannot permanently delete this parent because one or more children are currently checked in.'
      };
    }

    const tombstoneEmail = generateTombstoneEmail(parent.user_id || parent.id);

    await transaction(async () => {
      // 1. Audit logs
      try {
        await execute(`
          INSERT INTO audit_logs (id, user_id, user_role, action, target_type, target_id, details, timestamp)
          VALUES (?, ?, ?, 'ACCOUNT_PERMANENTLY_DELETED', 'parent_profile', ?, ?, ?)
        `, [
          crypto.randomUUID(), adminUserId, adminRole, parent.id,
          JSON.stringify({ reason: reason || 'Permanent deletion', profileId: parent.id, userId: parent.user_id }),
          nowStr
        ]);

        if (parent.user_id) {
          await execute(`
            INSERT INTO audit_logs (id, user_id, user_role, action, target_type, target_id, details, timestamp)
            VALUES (?, ?, ?, 'ACCOUNT_EMAIL_RELEASED', 'user', ?, ?, ?)
          `, [
            crypto.randomUUID(), adminUserId, adminRole, parent.user_id,
            JSON.stringify({ reason: reason || 'Permanent deletion', userId: parent.user_id }),
            nowStr
          ]);
        }
      } catch (aErr) {}

      // 2. Tombstone user record to release original email and prevent login
      if (parent.user_id) {
        await execute(`
          UPDATE users
          SET email = ?, status = 'deleted', password_hash = NULL, email_verified = 0, updated_at = ?
          WHERE id = ?
        `, [tombstoneEmail, nowStr, parent.user_id]);

        // 3. Revoke all tokens
        await revokeUserAuth(parent.user_id, adminUserId);
      }

      // 4. Anonymize parent profile
      await execute(`
        UPDATE parent_profiles
        SET full_name = 'Deleted user', phone_number = NULL, whatsapp_number = NULL,
            email = ?, photo_file_id = NULL, home_address = NULL, city = NULL, state_region = NULL,
            permanently_deleted_at = ?, permanently_deleted_by = ?,
            permanent_delete_reason = ?, anonymized_at = ?, updated_at = ?
        WHERE id = ?
      `, [tombstoneEmail, nowStr, adminUserId, reason || 'Permanent deletion', nowStr, nowStr, parent.id]);

      // 5. Soft-delete linked children to keep them archived with their historical attendances
      await execute(`
        UPDATE children
        SET is_deleted = 1, deleted_at = ?, deleted_by = ?, delete_reason = 'Parent permanently deleted'
        WHERE parent_profile_id = ? AND (is_deleted = 0 OR is_deleted IS NULL)
      `, [nowStr, adminUserId, parent.id]);
    });

    return {
      success: true,
      message: 'Parent record permanently deleted and email address released.'
    };
  }

  if (type === 'volunteer') {
    const volunteer = await queryOne<any>(
      'SELECT id, user_id, status, is_deleted, deleted_at FROM volunteer_profiles WHERE id = ?',
      [id]
    );
    if (!volunteer) {
      return { success: false, code: 'NOT_FOUND', message: 'Volunteer profile not found.' };
    }

    if (volunteer.is_deleted !== 1 && volunteer.status !== 'removed') {
      return {
        success: false,
        code: 'NOT_REMOVED',
        message: 'Only removed volunteers can be permanently deleted. Remove this volunteer first.'
      };
    }

    const tombstoneEmail = generateTombstoneEmail(volunteer.user_id || volunteer.id);

    await transaction(async () => {
      // 1. Audit logs
      try {
        await execute(`
          INSERT INTO audit_logs (id, user_id, user_role, action, target_type, target_id, details, timestamp)
          VALUES (?, ?, ?, 'ACCOUNT_PERMANENTLY_DELETED', 'volunteer_profile', ?, ?, ?)
        `, [
          crypto.randomUUID(), adminUserId, adminRole, volunteer.id,
          JSON.stringify({ reason: reason || 'Permanent deletion', profileId: volunteer.id, userId: volunteer.user_id }),
          nowStr
        ]);

        if (volunteer.user_id) {
          await execute(`
            INSERT INTO audit_logs (id, user_id, user_role, action, target_type, target_id, details, timestamp)
            VALUES (?, ?, ?, 'ACCOUNT_EMAIL_RELEASED', 'user', ?, ?, ?)
          `, [
            crypto.randomUUID(), adminUserId, adminRole, volunteer.user_id,
            JSON.stringify({ reason: reason || 'Permanent deletion', userId: volunteer.user_id }),
            nowStr
          ]);
        }
      } catch (aErr) {}

      // 2. Tombstone user record
      if (volunteer.user_id) {
        await execute(`
          UPDATE users
          SET email = ?, status = 'deleted', password_hash = NULL, email_verified = 0, updated_at = ?
          WHERE id = ?
        `, [tombstoneEmail, nowStr, volunteer.user_id]);

        // 3. Revoke all tokens
        await revokeUserAuth(volunteer.user_id, adminUserId);
      }

      // 4. Anonymize volunteer profile
      await execute(`
        UPDATE volunteer_profiles
        SET full_name = 'Deleted user', phone = '0000000000', whatsapp = '0000000000',
            note = NULL, photo_file_id = NULL, permanently_deleted_at = ?, permanently_deleted_by = ?,
            permanent_delete_reason = ?, anonymized_at = ?, updated_at = ?
        WHERE id = ?
      `, [nowStr, adminUserId, reason || 'Permanent deletion', nowStr, nowStr, volunteer.id]);
    });

    return {
      success: true,
      message: 'Volunteer record permanently deleted and email address released.'
    };
  }

  if (type === 'admin') {
    const user = await queryOne<any>(
      'SELECT id, email, role, status FROM users WHERE id = ?',
      [id]
    );
    if (!user) {
      return { success: false, code: 'NOT_FOUND', message: 'Admin user not found.' };
    }

    if (user.id === adminUserId) {
      return {
        success: false,
        code: 'SELF_DELETION_NOT_ALLOWED',
        message: 'You cannot permanently delete your own account while signed in.'
      };
    }

    if (user.status !== 'revoked' && user.role !== 'revoked' && user.status !== 'disabled') {
      return {
        success: false,
        code: 'NOT_REMOVED',
        message: 'Only removed or revoked admin accounts can be permanently deleted. Remove access first.'
      };
    }

    const tombstoneEmail = generateTombstoneEmail(user.id);

    await transaction(async () => {
      // 1. Audit logs
      try {
        await execute(`
          INSERT INTO audit_logs (id, user_id, user_role, action, target_type, target_id, details, timestamp)
          VALUES (?, ?, ?, 'ACCOUNT_PERMANENTLY_DELETED', 'user', ?, ?, ?)
        `, [
          crypto.randomUUID(), adminUserId, adminRole, user.id,
          JSON.stringify({ reason: reason || 'Permanent deletion', userId: user.id }),
          nowStr
        ]);

        await execute(`
          INSERT INTO audit_logs (id, user_id, user_role, action, target_type, target_id, details, timestamp)
          VALUES (?, ?, ?, 'ACCOUNT_EMAIL_RELEASED', 'user', ?, ?, ?)
        `, [
          crypto.randomUUID(), adminUserId, adminRole, user.id,
          JSON.stringify({ reason: reason || 'Permanent deletion', userId: user.id }),
          nowStr
        ]);
      } catch (aErr) {}

      // 2. Tombstone user record
      await execute(`
        UPDATE users
        SET email = ?, status = 'deleted', password_hash = NULL, email_verified = 0, updated_at = ?
        WHERE id = ?
      `, [tombstoneEmail, nowStr, user.id]);

      // 3. Revoke all tokens
      await revokeUserAuth(user.id, adminUserId);
    });

    return {
      success: true,
      message: 'Admin account permanently deleted and email address released.'
    };
  }

  return { success: false, code: 'INVALID_TYPE', message: 'Invalid account type specified.' };
}
