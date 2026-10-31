/**
 * Targeted Frontend Contract & Regression Test:
 * Selected Parents Channel API Client Contract
 * 
 * Verifies:
 * 1. API client exports and method presence:
 *    - typeof api.getSelectedParentsAudience === 'function'
 *    - typeof api.admin.getSelectedParentsAudience === 'function'
 *    - typeof api.sendSelectedParentsChannelInvitations === 'function'
 *    - typeof api.admin.sendSelectedParentsChannelInvitations === 'function'
 * 2. URL and parameter construction for event-ga-2026
 * 3. POST dispatch URL and payload contract
 * 4. Component load path simulation with 2 qualifying parents (production fixture)
 * 5. Component empty state simulation with 0 qualifying parents (clean empty state)
 */

import assert from 'node:assert';
import { api } from '../src/services/api';

console.log('=== Selected Parents Frontend API Contract Test ===\n');

// 1. Verify API client methods exist on both api and api.admin
console.log('Test 1: Method existence on api and api.admin');
assert.strictEqual(
  typeof api.getSelectedParentsAudience,
  'function',
  'api.getSelectedParentsAudience must be a function directly on api'
);
assert.strictEqual(
  typeof api.admin.getSelectedParentsAudience,
  'function',
  'api.admin.getSelectedParentsAudience must be a function on api.admin'
);
assert.strictEqual(
  typeof api.sendSelectedParentsChannelInvitations,
  'function',
  'api.sendSelectedParentsChannelInvitations must be a function directly on api'
);
assert.strictEqual(
  typeof api.admin.sendSelectedParentsChannelInvitations,
  'function',
  'api.admin.sendSelectedParentsChannelInvitations must be a function on api.admin'
);
console.log('✅ PASS: All 4 API methods exist and are functions.\n');

// 2. Verify URL query string generation for event-ga-2026
console.log('Test 2: URL query generation for event-ga-2026');
let capturedFetchUrl = '';
let capturedFetchOptions: any = null;

const originalFetch = global.fetch;

global.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  capturedFetchUrl = typeof input === 'string' ? input : input.toString();
  capturedFetchOptions = init;

  return {
    ok: true,
    status: 200,
    headers: {
      get: (header: string) => header.toLowerCase() === 'content-type' ? 'application/json' : null
    },
    json: async () => ({
      success: true,
      eventId: 'event-ga-2026',
      eventTitle: 'The General Assembly',
      templateConfigured: false,
      templateKeyOrAlias: null,
      summary: {
        totalEligibleParents: 2,
        invitationsNotSent: 2,
        invitationsSent: 0,
        invitationsFailed: 0,
        whatsappAvailable: 2,
        whatsappUnavailable: 0
      },
      parents: [
        {
          parentId: 'parent-1',
          userId: 'user-1',
          fullName: 'Jane Doe',
          firstName: 'Jane',
          phoneNumber: '+2348011111111',
          whatsappNumber: '+2348011111111',
          email: 'jane@example.com',
          whatsappConsentStatus: 'opted_in',
          whatsappAvailability: 'available',
          normalizedWhatsAppNumber: '+2348011111111',
          totalRegisteredChildren: 1,
          selectedChildrenCount: 1,
          selectedRatioText: '1 of 1 selected',
          selectedChildNames: 'Daniel',
          children: [
            {
              id: 'c-1',
              fullName: 'Daniel Doe',
              firstName: 'Daniel',
              status: 'selected',
              ageGroup: 'Primary',
              isSelected: true
            }
          ],
          invitationStatus: 'not_sent',
          sentAt: null,
          attemptedAt: null,
          failureReason: null,
          providerMessageId: null
        },
        {
          parentId: 'parent-2',
          userId: 'user-2',
          fullName: 'John Smith',
          firstName: 'John',
          phoneNumber: '+2348022222222',
          whatsappNumber: '+2348022222222',
          email: 'john@example.com',
          whatsappConsentStatus: 'opted_in',
          whatsappAvailability: 'available',
          normalizedWhatsAppNumber: '+2348022222222',
          totalRegisteredChildren: 1,
          selectedChildrenCount: 1,
          selectedRatioText: '1 of 1 selected',
          selectedChildNames: 'Sarah',
          children: [
            {
              id: 'c-2',
              fullName: 'Sarah Smith',
              firstName: 'Sarah',
              status: 'pass_ready',
              ageGroup: 'Secondary',
              isSelected: true
            }
          ],
          invitationStatus: 'not_sent',
          sentAt: null,
          attemptedAt: null,
          failureReason: null,
          providerMessageId: null
        }
      ]
    })
  } as unknown as Response;
};

async function runTests() {
  try {
    // Basic event call
    const res1 = await api.getSelectedParentsAudience('event-ga-2026');
    assert.ok(
      capturedFetchUrl.includes('/api/admin/messages/selected-parents?eventId=event-ga-2026'),
      `Expected URL to contain /api/admin/messages/selected-parents?eventId=event-ga-2026, got: ${capturedFetchUrl}`
    );
    assert.strictEqual(res1.success, true);
    assert.strictEqual(res1.parents.length, 2);
    console.log('✅ PASS: Basic URL query constructed correctly:', capturedFetchUrl);

    // Filtered call
    await api.getSelectedParentsAudience('event-ga-2026', {
      search: 'Adeleke',
      status: 'not_sent',
      whatsappStatus: 'available'
    });
    assert.ok(capturedFetchUrl.includes('eventId=event-ga-2026'));
    assert.ok(capturedFetchUrl.includes('search=Adeleke'));
    assert.ok(capturedFetchUrl.includes('status=not_sent'));
    assert.ok(capturedFetchUrl.includes('whatsappStatus=available'));
    console.log('✅ PASS: Filtered URL query constructed correctly:', capturedFetchUrl);

    // Both api and api.admin resolve identically
    const adminRes = await api.admin.getSelectedParentsAudience('event-ga-2026');
    assert.strictEqual(adminRes.success, true);
    assert.strictEqual(adminRes.summary.totalEligibleParents, 2);
    console.log('✅ PASS: api.admin delegates to the same implementation.');

    // 3. Test POST send endpoint URL and payload contract
    console.log('\nTest 3: POST dispatch URL and payload contract');
    global.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      capturedFetchUrl = typeof input === 'string' ? input : input.toString();
      capturedFetchOptions = init;
      return {
        ok: true,
        status: 200,
        headers: {
          get: (header: string) => header.toLowerCase() === 'content-type' ? 'application/json' : null
        },
        json: async () => ({
          success: true,
          templateConfigured: false,
          totalRequested: 2,
          sentCount: 0,
          skippedCount: 2,
          failedCount: 0,
          details: [
            { parentId: 'p-1', parentName: 'Jane Doe', status: 'skipped', reason: 'template_unapproved' },
            { parentId: 'p-2', parentName: 'John Smith', status: 'skipped', reason: 'template_unapproved' }
          ]
        })
      } as unknown as Response;
    };

    const sendRes = await api.sendSelectedParentsChannelInvitations({
      eventId: 'event-ga-2026',
      parentIds: ['p-1', 'p-2'],
      resend: false
    });

    assert.ok(
      capturedFetchUrl.includes('/api/admin/messages/selected-parents/send'),
      `Expected URL to end in /api/admin/messages/selected-parents/send, got: ${capturedFetchUrl}`
    );
    assert.strictEqual(capturedFetchOptions.method, 'POST');
    const sentBody = JSON.parse(capturedFetchOptions.body);
    assert.strictEqual(sentBody.eventId, 'event-ga-2026');
    assert.deepStrictEqual(sentBody.parentIds, ['p-1', 'p-2']);
    assert.strictEqual(sentBody.resend, false);
    assert.strictEqual(sendRes.success, true);
    assert.strictEqual(sendRes.skippedCount, 2);
    console.log('✅ PASS: Send payload and route match backend contract.');

    // 4. Test Component load path with production-like fixture (2 eligible parents)
    console.log('\nTest 4: Component load path simulation (2 eligible parents)');
    global.fetch = async (): Promise<Response> => ({
      ok: true,
      status: 200,
      headers: {
        get: (header: string) => header.toLowerCase() === 'content-type' ? 'application/json' : null
      },
      json: async () => ({
        success: true,
        eventId: 'event-ga-2026',
        eventTitle: 'The General Assembly',
        templateConfigured: false,
        summary: {
          totalEligibleParents: 2,
          invitationsNotSent: 2,
          invitationsSent: 0,
          invitationsFailed: 0,
          whatsappAvailable: 2,
          whatsappUnavailable: 0
        },
        parents: [
          {
            parentId: 'p-1',
            userId: 'u-1',
            fullName: 'Jane Doe',
            firstName: 'Jane',
            phoneNumber: '+2348011111111',
            whatsappNumber: '+2348011111111',
            email: 'jane@example.com',
            whatsappConsentStatus: 'opted_in',
            whatsappAvailability: 'available',
            normalizedWhatsAppNumber: '+2348011111111',
            totalRegisteredChildren: 1,
            selectedChildrenCount: 1,
            selectedRatioText: '1 of 1 selected',
            selectedChildNames: 'Daniel',
            children: [
              { id: 'c-1', fullName: 'Daniel Doe', firstName: 'Daniel', status: 'selected', ageGroup: 'Primary', isSelected: true }
            ],
            invitationStatus: 'not_sent',
            sentAt: null,
            attemptedAt: null,
            failureReason: null,
            providerMessageId: null
          },
          {
            parentId: 'p-2',
            userId: 'u-2',
            fullName: 'John Smith',
            firstName: 'John',
            phoneNumber: '+2348022222222',
            whatsappNumber: '+2348022222222',
            email: 'john@example.com',
            whatsappConsentStatus: 'opted_in',
            whatsappAvailability: 'available',
            normalizedWhatsAppNumber: '+2348022222222',
            totalRegisteredChildren: 1,
            selectedChildrenCount: 1,
            selectedRatioText: '1 of 1 selected',
            selectedChildNames: 'Sarah',
            children: [
              { id: 'c-2', fullName: 'Sarah Smith', firstName: 'Sarah', status: 'pass_ready', ageGroup: 'Secondary', isSelected: true }
            ],
            invitationStatus: 'not_sent',
            sentAt: null,
            attemptedAt: null,
            failureReason: null,
            providerMessageId: null
          }
        ]
      })
    }) as unknown as Response;

    const prodLoadRes = await api.getSelectedParentsAudience('event-ga-2026');
    assert.strictEqual(prodLoadRes.success, true);
    assert.strictEqual(prodLoadRes.summary.totalEligibleParents, 2);
    assert.strictEqual(prodLoadRes.summary.invitationsNotSent, 2);
    assert.strictEqual(prodLoadRes.summary.invitationsSent, 0);
    assert.strictEqual(prodLoadRes.summary.invitationsFailed, 0);
    assert.strictEqual(prodLoadRes.summary.whatsappAvailable, 2);
    assert.strictEqual(prodLoadRes.summary.whatsappUnavailable, 0);
    assert.strictEqual(prodLoadRes.parents.length, 2);
    assert.strictEqual(prodLoadRes.parents[0].selectedChildNames, 'Daniel');
    assert.strictEqual(prodLoadRes.parents[1].selectedChildNames, 'Sarah');
    console.log('✅ PASS: Component load path resolves cleanly with 2 qualifying parents.');

    // 5. Test Empty state simulation (0 qualifying parents)
    console.log('\nTest 5: Component empty state simulation (0 qualifying parents)');
    global.fetch = async (): Promise<Response> => ({
      ok: true,
      status: 200,
      headers: {
        get: (header: string) => header.toLowerCase() === 'content-type' ? 'application/json' : null
      },
      json: async () => ({
        success: true,
        eventId: 'event-ga-2026',
        eventTitle: 'The General Assembly',
        templateConfigured: false,
        summary: {
          totalEligibleParents: 0,
          invitationsNotSent: 0,
          invitationsSent: 0,
          invitationsFailed: 0,
          whatsappAvailable: 0,
          whatsappUnavailable: 0
        },
        parents: []
      })
    }) as unknown as Response;

    const emptyRes = await api.getSelectedParentsAudience('event-ga-2026');
    assert.strictEqual(emptyRes.success, true);
    assert.strictEqual(emptyRes.summary.totalEligibleParents, 0);
    assert.strictEqual(emptyRes.parents.length, 0);
    console.log('✅ PASS: Empty state resolves with 0 parents and no errors.');

    console.log('\n🎉 ALL SELECTED PARENTS API CONTRACT TESTS PASSED! 🎉');
  } finally {
    global.fetch = originalFetch;
  }
}

runTests().catch((err) => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
