import { Response } from 'express';
import { query } from '../db';
import { AuthenticatedRequest } from '../auth';
import {
  calculateAgeOnDate,
  CANONICAL_GA_EVENT_DATE,
  resolveCanonicalAgeGroup
} from './eligibilityService';
import { getCurrentEvent, getEventById, EventRow } from './eventService';
import {
  normalizeAgeGroupLabelToRange,
  isChildInAgeGroup
} from '../routes/admin';

async function resolveAdminEvent(explicitEventId?: string | null): Promise<EventRow | null> {
  if (explicitEventId && typeof explicitEventId === 'string' && explicitEventId.trim()) {
    const cleanId = explicitEventId.trim();
    const ev = await getEventById(cleanId);
    if (!ev) {
      const err: any = new Error(`Event not found: ${cleanId}`);
      err.statusCode = 404;
      throw err;
    }
    return ev;
  }
  return await getCurrentEvent();
}

function getChildAge(c: any, referenceDate?: string | Date | null): number {
  if (c.date_of_birth) {
    const age = calculateAgeOnDate(c.date_of_birth, referenceDate || CANONICAL_GA_EVENT_DATE);
    if (age !== null) return age;
  }
  if (c.calculated_age !== null && c.calculated_age !== undefined && !isNaN(Number(c.calculated_age))) {
    return Number(c.calculated_age);
  }
  return -1;
}

// Canonical Selected Children Report Logic (shared between JSON and CSV exports)
export async function handleSelectedChildrenReport(
  req: AuthenticatedRequest,
  res: Response,
  isExportCsv = false
) {
  try {
    if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'team')) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const event = await resolveAdminEvent(req.query.eventId as string);
    if (!event) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }

    const eventId = event.id;
    const eventTitle = event.title;
    const eventDate = event.starts_at || CANONICAL_GA_EVENT_DATE;

    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const pageSize = Math.max(1, parseInt((req.query.pageSize || req.query.limit) as string, 10) || 25);
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : (typeof req.query.q === 'string' ? req.query.q.trim() : '');
    const ageGroupFilter = typeof req.query.ageGroup === 'string' ? req.query.ageGroup.trim() : '';
    const passStatusFilter = typeof req.query.passStatus === 'string' ? req.query.passStatus.trim() : '';
    const attendanceStatusFilter = typeof req.query.attendanceStatus === 'string' ? req.query.attendanceStatus.trim() : '';
    const genderFilter = typeof req.query.gender === 'string' ? req.query.gender.trim() : '';

    // Fetch configured event age groups
    const configuredAgeGroups = await query('SELECT * FROM event_age_groups WHERE event_id = ? ORDER BY sort_order ASC', [eventId]);

    // Query all active selected entries for this event with parent & pass information
    const rows = await query(`
      SELECT 
        e.id as event_entry_id,
        e.child_id,
        e.status as entry_status,
        c.full_name as child_name,
        c.date_of_birth,
        c.calculated_age,
        c.age_group as child_stored_age_group,
        c.gender,
        c.photo_file_id,
        m.secure_url as child_photo_url,
        p.id as parent_id,
        p.full_name as parent_name,
        p.phone_number as parent_phone,
        COALESCE(p.email, u.email) as parent_email,
        ep.id as active_pass_id,
        ep.pass_reference,
        ep.status as pass_record_status
      FROM child_event_entries e
      JOIN children c ON c.id = e.child_id
      LEFT JOIN parent_profiles p ON p.id = c.parent_profile_id
      LEFT JOIN users u ON u.id = p.user_id
      LEFT JOIN media_files m ON m.id = c.photo_file_id
      LEFT JOIN event_passes ep ON ep.child_event_entry_id = e.id AND ep.status = 'active'
      WHERE e.event_id = ?
        AND (e.is_deleted = 0 OR e.is_deleted IS NULL)
        AND (c.is_deleted = 0 OR c.is_deleted IS NULL)
        AND e.status IN ('selected', 'pass_ready', 'checked_in', 'inside', 'picked_up')
      ORDER BY c.full_name ASC
    `, [eventId]);

    // Map each child to report structure with canonical age group and operational statuses
    const allMapped = rows.map((r: any) => {
      const numericAge = getChildAge(r, eventDate);
      
      let resolvedAgeGroup = '';
      if (configuredAgeGroups && configuredAgeGroups.length > 0) {
        const matched = configuredAgeGroups.find((g: any) => isChildInAgeGroup(r, g, eventDate));
        if (matched) {
          resolvedAgeGroup = normalizeAgeGroupLabelToRange(matched.label) || matched.label;
        }
      }

      if (!resolvedAgeGroup) {
        if (r.date_of_birth || (numericAge !== null && numericAge >= 0)) {
          const canonicalRes = resolveCanonicalAgeGroup(r.date_of_birth || numericAge, eventDate);
          if (!canonicalRes.isOutOfRange && canonicalRes.group) {
            resolvedAgeGroup = canonicalRes.group;
          }
        }
      }

      if (!resolvedAgeGroup && r.child_stored_age_group) {
        resolvedAgeGroup = normalizeAgeGroupLabelToRange(r.child_stored_age_group);
      }

      if (!resolvedAgeGroup) {
        if (numericAge !== null && numericAge >= 0) {
          if (numericAge >= 2 && numericAge <= 3) resolvedAgeGroup = '2–3';
          else if (numericAge >= 4 && numericAge <= 6) resolvedAgeGroup = '4–6';
          else if (numericAge >= 7 && numericAge <= 9) resolvedAgeGroup = '7–9';
          else if (numericAge >= 10 && numericAge <= 12) resolvedAgeGroup = '10–12';
          else if (numericAge >= 13 && numericAge <= 14) resolvedAgeGroup = '13–14';
          else if (numericAge < 2) resolvedAgeGroup = 'Under 2';
          else resolvedAgeGroup = '15+';
        } else {
          resolvedAgeGroup = 'Age review needed';
        }
      }

      const hasActivePass = Boolean(r.active_pass_id) || ['pass_ready', 'checked_in', 'inside', 'picked_up'].includes(r.entry_status);
      const passStatus: 'pass_ready' | 'missing_pass' = hasActivePass ? 'pass_ready' : 'missing_pass';

      let attendanceStatus: 'not_arrived' | 'checked_in' | 'inside' | 'picked_up' = 'not_arrived';
      if (r.entry_status === 'picked_up' || r.entry_status === 'checked_out') {
        attendanceStatus = 'picked_up';
      } else if (r.entry_status === 'inside') {
        attendanceStatus = 'inside';
      } else if (r.entry_status === 'checked_in') {
        attendanceStatus = 'checked_in';
      }

      let genderDisplay = 'Unspecified';
      const rawGender = String(r.gender || '').trim().toLowerCase();
      if (['male', 'm', 'boy', 'boys'].includes(rawGender)) {
        genderDisplay = 'Male';
      } else if (['female', 'f', 'girl', 'girls'].includes(rawGender)) {
        genderDisplay = 'Female';
      }

      return {
        childId: r.child_id,
        eventEntryId: r.event_entry_id,
        fullName: r.child_name || 'Unnamed Child',
        photoUrl: r.child_photo_url || null,
        dateOfBirth: r.date_of_birth || '',
        age: numericAge !== null && numericAge >= 0 ? numericAge : (r.calculated_age ? Number(r.calculated_age) : 0),
        ageGroup: resolvedAgeGroup,
        gender: genderDisplay,
        parent: {
          id: r.parent_id || '',
          fullName: r.parent_name || 'Parent / Guardian',
          phone: r.parent_phone || null,
          email: r.parent_email || null
        },
        passStatus,
        attendanceStatus,
        passReference: r.pass_reference || null
      };
    });

    // Unpaginated overall event summary
    const summary = {
      totalSelected: allMapped.length,
      passReady: allMapped.filter((c: any) => c.passStatus === 'pass_ready').length,
      missingPass: allMapped.filter((c: any) => c.passStatus === 'missing_pass').length,
      checkedIn: allMapped.filter((c: any) => c.attendanceStatus === 'checked_in').length,
      inside: allMapped.filter((c: any) => c.attendanceStatus === 'inside').length,
      pickedUp: allMapped.filter((c: any) => c.attendanceStatus === 'picked_up').length
    };

    // Unpaginated age group breakdown
    const canonicalBuckets = ['2–3', '4–6', '7–9', '10–12', '13–14'];
    const ageGroups = canonicalBuckets.map((bucket) => {
      const inBucket = allMapped.filter((c: any) => {
        return c.ageGroup === bucket || normalizeAgeGroupLabelToRange(c.ageGroup) === bucket;
      });
      return {
        ageGroup: bucket,
        selected: inBucket.length,
        passReady: inBucket.filter((c: any) => c.passStatus === 'pass_ready').length,
        missingPass: inBucket.filter((c: any) => c.passStatus === 'missing_pass').length
      };
    });

    // Apply active filters
    let filtered = allMapped;

    if (search) {
      const s = search.toLowerCase();
      filtered = filtered.filter((c: any) => 
        (c.fullName && c.fullName.toLowerCase().includes(s)) ||
        (c.parent.fullName && c.parent.fullName.toLowerCase().includes(s)) ||
        (c.parent.phone && c.parent.phone.toLowerCase().includes(s)) ||
        (c.parent.email && c.parent.email.toLowerCase().includes(s))
      );
    }

    if (ageGroupFilter && ageGroupFilter.toLowerCase() !== 'all' && ageGroupFilter.toLowerCase() !== 'all age groups') {
      const normFilter = normalizeAgeGroupLabelToRange(ageGroupFilter);
      filtered = filtered.filter((c: any) => {
        return c.ageGroup === normFilter || normalizeAgeGroupLabelToRange(c.ageGroup) === normFilter;
      });
    }

    if (passStatusFilter && passStatusFilter.toLowerCase() !== 'all') {
      filtered = filtered.filter((c: any) => c.passStatus === passStatusFilter);
    }

    if (attendanceStatusFilter && attendanceStatusFilter.toLowerCase() !== 'all') {
      filtered = filtered.filter((c: any) => c.attendanceStatus === attendanceStatusFilter);
    }

    if (genderFilter && genderFilter.toLowerCase() !== 'all') {
      const targetG = genderFilter.toLowerCase();
      filtered = filtered.filter((c: any) => c.gender.toLowerCase() === targetG);
    }

    // CSV Export requested
    if (isExportCsv || req.query.format === 'csv' || req.query.export === 'csv') {
      const escapeCSVField = (val: any): string => {
        if (val === null || val === undefined) return '""';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
      };

      let csvContent = 'Child Name,Age,Age Group,Gender,Parent / Guardian,Parent Phone,Parent Email,Pass Status,Attendance Status\n';
      for (const c of filtered) {
        const passText = c.passStatus === 'pass_ready' ? 'Pass ready' : 'Missing pass';
        const attendanceText = c.attendanceStatus === 'picked_up'
          ? 'Picked up'
          : c.attendanceStatus === 'inside'
            ? 'Inside'
            : c.attendanceStatus === 'checked_in'
              ? 'Checked in'
              : 'Not arrived';

        csvContent += [
          escapeCSVField(c.fullName),
          escapeCSVField(`${c.age} yrs`),
          escapeCSVField(c.ageGroup),
          escapeCSVField(c.gender),
          escapeCSVField(c.parent.fullName),
          escapeCSVField(c.parent.phone || ''),
          escapeCSVField(c.parent.email || ''),
          escapeCSVField(passText),
          escapeCSVField(attendanceText)
        ].join(',') + '\n';
      }

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="selected-children-report.csv"');
      return res.status(200).send(csvContent);
    }

    // Paginated response
    const totalRecords = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
    const startIndex = (page - 1) * pageSize;
    const paginatedChildren = filtered.slice(startIndex, startIndex + pageSize);

    return res.json({
      success: true,
      event: {
        id: eventId,
        title: eventTitle
      },
      summary,
      ageGroups,
      children: paginatedChildren,
      pagination: {
        page,
        pageSize,
        totalRecords,
        totalPages
      }
    });
  } catch (err: any) {
    console.error('Error in handleSelectedChildrenReport:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to generate selected children report' });
  }
}
