import assert from 'node:assert';
import Database from 'better-sqlite3';
import { extractFirstName, formatSelectedChildNames } from '../src/server/services/whatsapp/personalization';
import { QUALIFYING_CHILD_STATUSES } from '../src/server/services/selectedParentsChannelService';

console.log('--- Testing Parent Channel Access Logic ---');

// Test 1: formatSelectedChildNames edge cases
assert.strictEqual(formatSelectedChildNames(['Daniel Adeleke']), 'Daniel');
assert.strictEqual(formatSelectedChildNames(['Daniel Adeleke', 'Sarah Adeleke']), 'Daniel and Sarah');
assert.strictEqual(formatSelectedChildNames(['Daniel Adeleke', 'Sarah Adeleke', 'Michael Adeleke']), 'Daniel, Sarah and Michael');
console.log('✅ Child names formatting passed.');

// Test 2: Qualifying statuses
assert.ok(QUALIFYING_CHILD_STATUSES.includes('selected'));
assert.ok(QUALIFYING_CHILD_STATUSES.includes('pass_ready'));
assert.ok(!QUALIFYING_CHILD_STATUSES.includes('under_review'));
assert.ok(!QUALIFYING_CHILD_STATUSES.includes('waitlist'));
assert.ok(!QUALIFYING_CHILD_STATUSES.includes('declined'));
console.log('✅ Qualifying statuses check passed.');

console.log('All Parent Channel Access tests passed successfully.');
