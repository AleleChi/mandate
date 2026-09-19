import { getCurrentEvent } from '../../eventService';
import {
  AutomationEvaluationResult,
  evaluateCurrentEventAutomations
} from './automationEngine';
import { isAutomationSchemaReady } from './automationPersistence';

/**
 * Server-side Automation Runner - Phase 3C Background Monitoring
 * 
 * Cadence: Evaluates canonical current event every 5 minutes.
 * Overlap protection: In-memory flag prevents concurrent local executions.
 * Cross-process safety: Handled at persistence layer via fingerprints & unique constraints.
 * Canonical current event only: Resolved fresh every cycle (never cached).
 */

export const AUTOMATION_EVALUATION_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let evaluationInProgress = false;
let schedulerTimer: NodeJS.Timeout | null = null;

export function isEvaluationInProgress(): boolean {
  return evaluationInProgress;
}

export async function waitForCurrentEvaluation(): Promise<void> {
  while (evaluationInProgress) {
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

/**
 * Executes a single evaluation cycle for the canonical CURRENT EVENT.
 * Safe under local overlap and schema availability.
 */
export async function runAutomationEvaluationCycle(): Promise<AutomationEvaluationResult> {
  if (evaluationInProgress) {
    console.log('[AutomationScheduler] Evaluation already in progress; skipping this interval.');
    return {
      success: true,
      eventId: null,
      signalsDetectedCount: 0,
      newItemsCount: 0,
      resolvedItemsCount: 0,
      durationMs: 0
    };
  }

  evaluationInProgress = true;
  try {
    // 1. Verify schema readiness before running
    const schemaReady = await isAutomationSchemaReady();
    if (!schemaReady) {
      console.warn('[AutomationScheduler] Automation schema not ready. Skipping cycle.');
      return {
        success: false,
        eventId: null,
        signalsDetectedCount: 0,
        newItemsCount: 0,
        resolvedItemsCount: 0,
        durationMs: 0,
        error: 'Schema not ready'
      };
    }

    // 2. Resolve canonical current event fresh (never cached, no fallback)
    const currentEvent = await getCurrentEvent();
    if (!currentEvent) {
      // No current event configured: safe no-op
      return {
        success: true,
        eventId: null,
        signalsDetectedCount: 0,
        newItemsCount: 0,
        resolvedItemsCount: 0,
        durationMs: 0
      };
    }

    // 3. Evaluate deterministic automations for current event
    const result = await evaluateCurrentEventAutomations(currentEvent.id);
    return result;
  } catch (err: any) {
    console.error('[AutomationScheduler] Unexpected error during scheduled cycle:', err?.message || err);
    return {
      success: false,
      eventId: null,
      signalsDetectedCount: 0,
      newItemsCount: 0,
      resolvedItemsCount: 0,
      durationMs: 0,
      error: err?.message || 'Cycle error'
    };
  } finally {
    evaluationInProgress = false;
  }
}

/**
 * Initializes and starts the background automation runner.
 * Safe to call on backend startup without blocking or crashing.
 */
export function startAutomationScheduler(): void {
  if (schedulerTimer) {
    return; // Already running
  }

  console.log(`[AutomationScheduler] Starting background automation runner (${AUTOMATION_EVALUATION_INTERVAL_MS / 1000}s interval).`);

  // Initial evaluation tick (non-blocking)
  runAutomationEvaluationCycle().catch(err => {
    console.error('[AutomationScheduler] Initial startup evaluation error:', err?.message || err);
  });

  // Scheduled recurring runner
  schedulerTimer = setInterval(() => {
    runAutomationEvaluationCycle().catch(err => {
      console.error('[AutomationScheduler] Scheduled evaluation error:', err?.message || err);
    });
  }, AUTOMATION_EVALUATION_INTERVAL_MS);

  // Unref timer so it does not keep Node process alive during graceful shutdown or tests
  if (schedulerTimer && typeof schedulerTimer.unref === 'function') {
    schedulerTimer.unref();
  }
}

/**
 * Stops the background automation runner.
 */
export function stopAutomationScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
    console.log('[AutomationScheduler] Stopped background automation runner.');
  }
}
