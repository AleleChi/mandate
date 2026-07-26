import { getDb } from './src/server/db';
import { compileReportSnapshot, processQueuedReportJobs } from './src/server/services/reportService';
import { compileReportDocument } from './src/server/reports/reportTemplateRegistry';
import { renderDocumentToPDF } from './src/server/reports/reportRenderer';
import { calculateAnalytics } from './src/server/services/reportAnalyticsService';
import fs from 'fs';
import path from 'path';

async function main() {
  console.log('Starting diagnostic report generation test...');
  try {
    getDb();
    
    const templateKey = 'attendance-demographics-report-v1';
    const privacyLevel = 'Internal operational';
    const sections = ['Executive Summary', 'Operational Metrics', 'Child Profiles & Demographic Details'];
    const userId = 'user-admin';
    const role = 'super_admin';
    
    console.log('Compiling snapshot...');
    const snapshot = await compileReportSnapshot(
      'event-ga-2026',
      null,
      templateKey,
      userId,
      role,
      privacyLevel
    );
    
    console.log('Snapshot successfully compiled. Keys:', Object.keys(snapshot));
    console.log('Calculating analytics...');
    const analytics = calculateAnalytics(snapshot);
    console.log('Analytics computed successfully.');

    console.log('Compiling report document model...');
    const model = compileReportDocument(
      'test-doc-id',
      snapshot,
      analytics,
      templateKey,
      privacyLevel,
      sections
    );
    console.log('Model title:', model.reportTitle);
    console.log('KPI count:', model.kpis.length);
    console.log('Sections count:', model.sections.length);

    console.log('Rendering document to PDF...');
    const { pdfBytes, pageCount } = await renderDocumentToPDF(model);
    console.log(`PDF rendered successfully! Page count: ${pageCount}, Size: ${pdfBytes.byteLength} bytes.`);
    
    const outputPath = path.join(process.cwd(), 'test_output.pdf');
    fs.writeFileSync(outputPath, Buffer.from(pdfBytes));
    console.log(`Saved output PDF to ${outputPath}`);
  } catch (err) {
    console.error('ERROR during report generation:', err);
  } finally {
    process.exit(0);
  }
}

main();
