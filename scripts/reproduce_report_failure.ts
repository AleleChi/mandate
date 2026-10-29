import dotenv from 'dotenv';
dotenv.config({ path: '.env.production.local' });
process.env.SKIP_DB_SCHEMA_INIT = 'true';

import { compileReportSnapshot, requestReportJob, processQueuedReportJobs } from '../src/server/services/reportService';
import { calculateAnalytics } from '../src/server/services/reportAnalyticsService';
import { compileReportDocument } from '../src/server/reports/reportTemplateRegistry';
import { renderDocumentToPDF } from '../src/server/reports/reportRenderer';
import { queryOne, query } from '../src/server/db';

async function main() {
  console.log('=== TESTING REPORT PIPELINE AGAINST PRODUCTION DATABASE ===\n');
  
  const event = await queryOne("SELECT id, title FROM events WHERE title ILIKE '%General Assembly%' LIMIT 1");
  console.log('Resolved event:', event?.title, `(${event?.id})`);
  const eventId = event ? event.id : 'event-ga-2026';

  const testTemplates = [
    { key: 'management-summary', sections: ['Executive summary', 'Registration & participation', 'Attendance & movement', 'Volunteer coverage', 'Care & safety'] },
    { key: 'full-event-report', sections: ['Executive summary', 'Registration & demand', 'Attendance & movement', 'Volunteer coverage', 'Care & safety'] },
    { key: 'registration-selection', sections: ['Registration & selection', 'Participation profile', 'Key observations'] },
    { key: 'attendance-movement', sections: ['Attendance & movement', 'Participation profile', 'Key observations'] },
    { key: 'volunteer-coverage', sections: ['Volunteer & team coverage', 'Service distribution', 'Key observations'] },
    { key: 'care-safety-summary', sections: ['Care & safety summary', 'Follow-up actions', 'Key observations'] }
  ];

  for (const t of testTemplates) {
    console.log(`\n--------------------------------------------------`);
    console.log(`TESTING TEMPLATE: ${t.key}`);
    console.log(`--------------------------------------------------`);

    try {
      console.log('1. Compiling snapshot...');
      const snapshot = await compileReportSnapshot(
        eventId,
        null,
        t.key,
        'u-test',
        'super_admin',
        'Internal operational',
        { timezone: 'Africa/Lagos' }
      );
      console.log('  Snapshot compiled! Volunteers:', snapshot.dutyAssignments?.length, 'Children:', snapshot.childEntries?.length);

      console.log('2. Calculating analytics...');
      const analytics = calculateAnalytics(snapshot);
      console.log('  Analytics calculated! Event:', analytics.eventTitle);

      console.log('3. Compiling report document...');
      const docModel = compileReportDocument(
        `test-doc-${t.key}`,
        snapshot,
        analytics,
        t.key,
        'Internal operational',
        t.sections
      );
      console.log('  Document model compiled! Title:', docModel.reportTitle, 'Sections:', docModel.sections.length);

      console.log('4. Rendering to PDF...');
      const pdfResult = await renderDocumentToPDF(docModel);
      console.log(`  PDF rendered! Pages: ${pdfResult.pageCount}, Size: ${pdfResult.pdfBytes.byteLength} bytes`);
      console.log(`>>> ${t.key}: SUCCESS`);

    } catch (err: any) {
      console.error(`>>> ${t.key}: FAILED with error:`, err);
      if (err?.stack) {
        console.error(err.stack);
      }
      throw err;
    }
  }

  console.log('\n=== ALL 6 REPORT TEMPLATES GENERATED SUCCESSFULLY ===');
}

main().then(() => process.exit(0)).catch(e => {
  console.error('\nTest aborted on failure:', e.message);
  process.exit(1);
});
