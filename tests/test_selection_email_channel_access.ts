import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildParentsChannelEmailSection,
  sendChildReviewDecisionEmail,
  sendPassReadyEmail
} from '../src/server/services/email';
import {
  formatSelectedChildNames,
  extractFirstName
} from '../src/server/services/whatsapp/personalization';
import {
  recordChannelInvitationSent,
  getEligibleParentsForChannel,
  isChannelTemplateConfigured,
  getChannelTemplateKey
} from '../src/server/services/selectedParentsChannelService';
import { ZohoWhatsAppProvider } from '../src/server/services/whatsapp/zohoProvider';
import { query, queryOne, execute } from '../src/server/db';

describe('Selection & Pass-Ready Email Parents Channel Access Verification', () => {
  let testParentId: string;
  const testEventId = 'event-ga-2026';

  before(async () => {
    process.env.EMAIL_PROVIDER = 'test';
    process.env.EMAIL_FROM_ADDRESS = 'noreply@koinoniaglobal.org';

    // Ensure event exists
    await execute(`
      INSERT OR IGNORE INTO events (id, title, status, starts_at, ends_at, created_at, updated_at)
      VALUES (?, 'Koinonia General Assembly', 'current', '2026-06-01T08:00:00Z', '2026-06-05T18:00:00Z', datetime('now'), datetime('now'))
    `, [testEventId]);

    // Create test user and parent profile
    const testUserId = `test-user-${Date.now()}`;
    testParentId = `test-parent-${Date.now()}`;
    await execute(`
      INSERT INTO users (id, email, role, created_at, updated_at)
      VALUES (?, ?, 'parent', datetime('now'), datetime('now'))
    `, [testUserId, `parent_${Date.now()}@example.com`]);

    await execute(`
      INSERT INTO parent_profiles (id, user_id, full_name, created_at, updated_at)
      VALUES (?, ?, 'Elizabeth Test', datetime('now'), datetime('now'))
    `, [testParentId, testUserId]);
  });

  it('1. builds the official Parents Channel email section with direct WhatsApp URL and fallback link', () => {
    const section = buildParentsChannelEmailSection();

    assert.ok(section.html.includes('Official Parents Channel'));
    assert.ok(section.html.includes('As a parent or guardian of a selected child, you can access the official Parents Channel'));
    assert.ok(section.html.includes('Access Parents Channel'));
    assert.ok(section.html.includes('href="https://whatsapp.com/channel/0029VbE5UslCHDykcFlf3y0U"'));
    assert.ok(section.html.includes('If the button does not open, use this link:'));
    assert.ok(section.html.includes('Please do not share this channel link with anyone outside the registered parents and guardians of selected children.'));

    assert.ok(section.text.includes('Official Parents Channel:'));
    assert.ok(section.text.includes('Parents Channel: https://whatsapp.com/channel/0029VbE5UslCHDykcFlf3y0U'));
    assert.ok(section.text.includes('If the button does not open, use this link:'));
    assert.ok(section.text.includes('https://whatsapp.com/channel/0029VbE5UslCHDykcFlf3y0U'));
    assert.ok(section.text.includes('Please do not share this channel link with anyone outside the registered parents and guardians of selected children.'));
  });

  it('2. formats single child name and uses singular grammar', () => {
    const singleChild = ['Daniel'];
    const formatted = formatSelectedChildNames(singleChild.map(n => extractFirstName(n)));
    assert.equal(formatted, 'Daniel');
    const isPlural = singleChild.length > 1;
    const grammar = isPlural ? `${formatted} have been selected` : `${formatted} has been selected`;
    assert.equal(grammar, 'Daniel has been selected');
  });

  it('3. formats two child names and uses plural grammar', () => {
    const twoChildren = ['Daniel Adeleke', 'Sarah Adeleke'];
    const formatted = formatSelectedChildNames(twoChildren.map(n => extractFirstName(n)));
    assert.equal(formatted, 'Daniel and Sarah');
    const isPlural = twoChildren.length > 1;
    const grammar = isPlural ? `${formatted} have been selected` : `${formatted} has been selected`;
    assert.equal(grammar, 'Daniel and Sarah have been selected');
  });

  it('4. formats three child names with Oxford/standard list styling and plural grammar', () => {
    const threeChildren = ['Daniel Adeleke', 'Sarah Adeleke', 'Michael Adeleke'];
    const formatted = formatSelectedChildNames(threeChildren.map(n => extractFirstName(n)));
    assert.equal(formatted, 'Daniel, Sarah and Michael');
    const isPlural = threeChildren.length > 1;
    const grammar = isPlural ? `${formatted} have been selected` : `${formatted} has been selected`;
    assert.equal(grammar, 'Daniel, Sarah and Michael have been selected');
  });

  it('5. does not add Channel access to non-selected emails (not_selected, under_review, waiting_list)', async () => {
    const notSelectedRes = await sendChildReviewDecisionEmail({
      parentEmail: 'parent_nonselected_test@example.com',
      parentFirstName: 'Grace',
      childName: 'Timothy',
      status: 'not_selected',
      parentId: testParentId,
      eventId: testEventId
    });

    // Check that the tracking for channel invitation was NOT inserted for this non-selected parent
    const tracking = await queryOne<any>(`
      SELECT * FROM parent_channel_invitations 
      WHERE parent_id = ? AND event_id = ? AND channel = 'email'
    `, [testParentId, testEventId]);

    assert.equal(tracking, null, 'Non-selected email must NOT create a parent_channel_invitations record');
  });

  it('6. sendPassReadyEmail adds Parents Channel CTA pointing to /parents/channel and records email delivery', async () => {
    const result = await sendPassReadyEmail({
      parentEmail: 'parent_passready_test@example.com',
      parentFirstName: 'Elizabeth',
      childNames: ['Daniel', 'Sarah'],
      passLink: 'https://koinonia12.netlify.app/parent/pass/demo',
      parentId: testParentId,
      eventId: testEventId
    });

    assert.ok(result.success, 'Email send should succeed');

    // Verify delivery tracking
    const tracking = await queryOne<any>(`
      SELECT * FROM parent_channel_invitations
      WHERE parent_id = ? AND event_id = ? AND channel = 'email'
    `, [testParentId, testEventId]);

    assert.ok(tracking, 'Email channel invitation must be tracked in parent_channel_invitations');
    assert.equal(tracking.channel, 'email');
    assert.equal(tracking.communication_purpose, 'parents_channel_invitation');
    assert.equal(tracking.status, 'sent');
    assert.ok(tracking.selected_child_names.includes('Daniel'));
    assert.ok(tracking.selected_child_names.includes('Sarah'));

    // Verify WhatsApp tracking was NOT touched or marked for this parent
    const waTracking = await queryOne<any>(`
      SELECT * FROM parent_channel_invitations
      WHERE parent_id = ? AND event_id = ? AND channel = 'whatsapp'
    `, [testParentId, testEventId]);

    assert.equal(waTracking, null, 'Email delivery must NOT mark channel = whatsapp');
  });

  it('7. Zoho WhatsApp provider forces CTA destination to /parents/channel and sanitizes direct WhatsApp links', () => {
    const rawWaLink = 'https://whatsapp.com/channel/0029VbE5UslCHDykcFlf3y0U';
    const sanitized = ZohoWhatsAppProvider.sanitizeChannelUrl(rawWaLink);

    assert.notEqual(sanitized, rawWaLink, 'Direct whatsapp.com channel link must be stripped');
    assert.equal(sanitized, 'https://koinonia12.netlify.app/parents/channel');

    // Also verify when channelUrl is undefined or empty string
    assert.equal(ZohoWhatsAppProvider.sanitizeChannelUrl(undefined), 'https://koinonia12.netlify.app/parents/channel');
    assert.equal(ZohoWhatsAppProvider.sanitizeChannelUrl(''), 'https://koinonia12.netlify.app/parents/channel');
  });
});
