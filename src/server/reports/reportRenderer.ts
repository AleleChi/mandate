import { jsPDF } from 'jspdf';
import { ReportDocumentModel, ReportKPI, ReportSection, ReportFinding, ReportRecommendation, ReportChartSpec } from './reportDocumentModel';

// Colors Setup
const colors = {
  gold: [197, 155, 39],       // #C59B27
  deepGold: [140, 109, 35],   // #8C6D23
  brass: [163, 125, 30],      // #A37D1E
  emerald: [22, 131, 93],     // #16835D
  green: [22, 131, 93],       // Alias for emerald
  amber: [208, 138, 29],      // #D08A1D
  red: [194, 65, 59],         // #C2413B
  charcoal: [63, 63, 70],     // #3F3F46
  grey: [113, 113, 122],      // #71717A
  warmGrey: [168, 162, 158],  // #A8A29E
  lightIvory: [250, 249, 246] // #FAF9F6
};

// Date formatting helper
function formatHumanDate(dateVal: any, includeTime: boolean = false): string {
  if (!dateVal) return 'N/A';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return String(dateVal);
  const dateStr = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  if (!includeTime) return dateStr;
  const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  return `${dateStr}, ${timeStr}`;
}

export async function renderDocumentToPDF(model: ReportDocumentModel): Promise<{ pdfBytes: ArrayBuffer; pageCount: number }> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  let currentY = 30;
  const pageHeight = 297;
  const marginX = 20;
  const contentWidth = 170;
  const maxContentY = 270;

  // Helper to trigger a page break cleanly
  function addNewPage() {
    doc.addPage();
    currentY = 35;
    drawPageHeader();
  }

  function ensureHeight(neededHeight: number) {
    if (currentY + neededHeight > maxContentY) {
      addNewPage();
    }
  }

  // Draw Header on normal pages
  function drawPageHeader() {
    doc.setFont('times', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(colors.brass[0], colors.brass[1], colors.brass[2]);
    doc.text('KOINONIA children & teens fellowship', marginX, 15);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(colors.grey[0], colors.grey[1], colors.grey[2]);
    doc.text(model.reportTitle.toUpperCase(), marginX, 19);

    doc.setDrawColor(228, 228, 231);
    doc.setLineWidth(0.18);
    doc.line(marginX, 21, marginX + contentWidth, 21);
  }

  // =========================================================================
  // PAGE 1: LEADERSHIP SUMMARY & EXECUTIVE OVERVIEW
  // =========================================================================
  doc.setFillColor(colors.lightIvory[0], colors.lightIvory[1], colors.lightIvory[2]);
  doc.rect(0, 0, 210, 297, 'F');

  // Refined Subtle Gold Line Accent
  doc.setDrawColor(colors.gold[0], colors.gold[1], colors.gold[2]);
  doc.setLineWidth(0.75);
  doc.line(marginX, 25, marginX + contentWidth, 25);

  // Koinonia Branding Header (Top Right Logo with Bounded Natural Aspect Ratio)
  let logoWidth = 30;
  let logoHeight = 12;

  if (model.branding?.logoBase64) {
    try {
      const imgProps = doc.getImageProperties(model.branding.logoBase64);
      if (imgProps && imgProps.width > 0 && imgProps.height > 0) {
        const originalWidth = imgProps.width;
        const originalHeight = imgProps.height;
        const aspectRatio = originalWidth / originalHeight;

        const maxWidth = 30;
        const maxHeight = 16;

        let renderedWidth = maxWidth;
        let renderedHeight = renderedWidth / aspectRatio;

        if (renderedHeight > maxHeight) {
          renderedHeight = maxHeight;
          renderedWidth = renderedHeight * aspectRatio;
        }

        logoWidth = renderedWidth;
        logoHeight = renderedHeight;
      }
    } catch (e) {
      console.warn('[Report Branding] Could not inspect logo image properties:', e);
    }
  }

  const logoX = marginX + contentWidth - logoWidth;
  const topAreaY = 4;
  const maxHeightBox = 18;
  const logoY = topAreaY + (maxHeightBox - logoHeight) / 2;

  if (model.branding?.logoBase64) {
    try {
      doc.addImage(model.branding.logoBase64, 'PNG', logoX, logoY, logoWidth, logoHeight);
    } catch (e) {
      console.warn('[Report Branding] Failed to embed logo image in PDF:', e);
      doc.setTextColor(colors.brass[0], colors.brass[1], colors.brass[2]);
      doc.setFont('times', 'bold');
      doc.setFontSize(13);
      doc.text('KOINONIA', marginX + contentWidth - 25, 15);
    }
  } else {
    doc.setTextColor(colors.brass[0], colors.brass[1], colors.brass[2]);
    doc.setFont('times', 'bold');
    doc.setFontSize(13);
    doc.text('KOINONIA', marginX + contentWidth - 25, 15);
  }

  // Left Title Header
  doc.setTextColor(colors.charcoal[0], colors.charcoal[1], colors.charcoal[2]);
  doc.setFont('times', 'bold');
  doc.setFontSize(15);
  doc.text('KOINONIA CHILDREN & TEENS', marginX, 14);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(colors.grey[0], colors.grey[1], colors.grey[2]);
  doc.text('Official Event Report', marginX, 18.5);

  // Report Title
  currentY = 27;
  doc.setTextColor(colors.charcoal[0], colors.charcoal[1], colors.charcoal[2]);
  doc.setFont('times', 'bold');
  doc.setFontSize(15);
  const titleText = model.reportTitle.toUpperCase();
  const titleLines = doc.splitTextToSize(titleText, contentWidth);
  doc.text(titleLines, marginX, currentY);
  currentY += titleLines.length * 6 + 1.5;

  if (model.reportDescription) {
    doc.setFont('times', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(colors.grey[0], colors.grey[1], colors.grey[2]);
    const descLines = doc.splitTextToSize(model.reportDescription, contentWidth);
    doc.text(descLines, marginX, currentY);
    currentY += descLines.length * 3.8 + 2;
  }

  // Section A: Metadata Box (Event name, Event date, Generated date/time, Data cutoff)
  doc.setLineWidth(0.22);
  doc.setDrawColor(228, 228, 231);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(marginX, currentY, contentWidth, 14, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(colors.charcoal[0], colors.charcoal[1], colors.charcoal[2]);
  doc.text('EVENT:', marginX + 4, currentY + 5);
  doc.setFont('helvetica', 'normal');
  doc.text(model.eventContext.eventTitle, marginX + 18, currentY + 5);

  doc.setFont('helvetica', 'bold');
  doc.text('EVENT DATE:', marginX + 95, currentY + 5);
  doc.setFont('helvetica', 'normal');
  doc.text(formatHumanDate(model.eventContext.startsAt), marginX + 120, currentY + 5);

  doc.setFont('helvetica', 'bold');
  doc.text('GENERATED:', marginX + 4, currentY + 10);
  doc.setFont('helvetica', 'normal');
  doc.text(formatHumanDate(model.reportingPeriod?.end || model.informationConfirmedUpTo, true), marginX + 26, currentY + 10);

  doc.setFont('helvetica', 'bold');
  doc.text('DATA CUTOFF:', marginX + 95, currentY + 10);
  doc.setFont('helvetica', 'normal');
  doc.text(formatHumanDate(model.informationConfirmedUpTo, true), marginX + 122, currentY + 10);

  currentY += 19;

  // Section B: Headline Metrics / KPI Cards Grid
  if (model.kpis && model.kpis.length > 0) {
    currentY = drawKPIBand(doc, marginX, currentY, contentWidth, model.kpis);
  }

  // Section C: "What this report shows" (First narrative section)
  const firstNarrativeSec = model.sections.find(s => s.type === 'narrative');
  if (firstNarrativeSec) {
    ensureHeight(25);
    currentY = drawSectionHeading(doc, firstNarrativeSec.title || 'What this report shows', marginX, currentY, contentWidth);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.2);
    doc.setTextColor(39, 39, 42);
    const textLines = doc.splitTextToSize(firstNarrativeSec.content.text || '', contentWidth);
    ensureHeight(textLines.length * 3.8);
    doc.text(textLines, marginX, currentY);
    currentY += textLines.length * 3.8 + 6;
  }

  // =========================================================================
  // SECTION D: MAIN DATA SECTIONS (Charts, Tables, and Detail Sections)
  // =========================================================================
  const remainingSections = model.sections.filter(s => s !== firstNarrativeSec);

  for (const sec of remainingSections) {
    if (sec.type === 'narrative') {
      ensureHeight(25);
      currentY = drawSectionHeading(doc, sec.title, marginX, currentY, contentWidth);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.2);
      doc.setTextColor(39, 39, 42);
      const paragraphs = doc.splitTextToSize(sec.content.text || '', contentWidth);
      ensureHeight(paragraphs.length * 4);
      doc.text(paragraphs, marginX, currentY);
      currentY += paragraphs.length * 4 + 6;

    } else if (sec.type === 'table') {
      ensureHeight(35);
      currentY = drawSectionHeading(doc, sec.title, marginX, currentY, contentWidth);

      const { headers, rows, caption } = sec.content;
      currentY = drawTable(doc, marginX, currentY, contentWidth, headers || [], rows || []);

      if (caption) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(7.2);
        doc.setTextColor(113, 113, 122);
        doc.text(caption, marginX, currentY + 3);
        currentY += 6;
      }
      currentY += 6;

    } else if (sec.type === 'chart') {
      const chartSpecs: ReportChartSpec[] = sec.content.charts || [];

      if (sec.content.lineChart) {
        chartSpecs.push({
          id: 'legacy-line',
          kind: 'line',
          title: sec.content.lineChart.title || 'Trend Line Chart',
          labels: sec.content.lineChart.data?.map((d: any) => d.label) || [],
          series: [{ id: 's1', label: 'Scans', values: sec.content.lineChart.data?.map((d: any) => d.value) || [] }],
          caption: sec.content.lineChart.caption || '',
          accessibleSummary: 'Line chart showing metrics over time.',
          emptyState: 'No line metric data available.'
        });
      }
      if (sec.content.barChart) {
        chartSpecs.push({
          id: 'legacy-bar',
          kind: 'bar',
          title: sec.content.barChart.title || 'Distribution Bar Chart',
          labels: sec.content.barChart.data?.map((d: any) => d.label) || [],
          series: [{ id: 's1', label: 'Total', values: sec.content.barChart.data?.map((d: any) => d.value) || [] }],
          caption: sec.content.barChart.caption || '',
          accessibleSummary: 'Bar chart showing distribution values.',
          emptyState: 'No bar metric data available.'
        });
      }

      if (chartSpecs.length > 0) {
        ensureHeight(55);
        currentY = drawSectionHeading(doc, sec.title, marginX, currentY, contentWidth);

        if (chartSpecs.length === 2) {
          const chartW = 81;
          const chartH = 44;
          ensureHeight(chartH + 8);
          drawChartSpec(doc, marginX, currentY, chartW, chartH, chartSpecs[0]);
          drawChartSpec(doc, marginX + chartW + 8, currentY, chartW, chartH, chartSpecs[1]);
          currentY += chartH + 12;
        } else {
          for (const chartSpec of chartSpecs) {
            const chartW = contentWidth;
            const chartH = chartSpec.kind === 'donut' ? 44 : 46;
            ensureHeight(chartH + 8);
            drawChartSpec(doc, marginX, currentY, chartW, chartH, chartSpec);
            currentY += chartH + 12;
          }
        }
      }

    } else if (sec.type === 'callout') {
      ensureHeight(30);
      currentY = drawSectionHeading(doc, sec.title, marginX, currentY, contentWidth);

      const { theme, title, points } = sec.content;
      const calloutBg = theme === 'success' ? [240, 253, 244] : [254, 242, 242];
      const calloutBorder = theme === 'success' ? [74, 222, 128] : [239, 68, 68];
      const calloutText = theme === 'success' ? [21, 128, 61] : [220, 38, 38];

      doc.setFillColor(calloutBg[0], calloutBg[1], calloutBg[2]);
      doc.setDrawColor(calloutBorder[0], calloutBorder[1], calloutBorder[2]);
      doc.setLineWidth(0.25);

      const boxH = 8 + ((points?.length || 1) * 4.5);
      ensureHeight(boxH);
      doc.roundedRect(marginX, currentY, contentWidth, boxH, 1.5, 1.5, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(calloutText[0], calloutText[1], calloutText[2]);
      doc.text(title || sec.title, marginX + 4, currentY + 5);

      if (points && points.length > 0) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(39, 39, 42);
        points.forEach((pt: string, i: number) => {
          doc.text(`• ${pt}`, marginX + 6, currentY + 10 + (i * 4.2));
        });
      }

      currentY += boxH + 6;
    }
  }

  // =========================================================================
  // SECTION E: KEY OBSERVATIONS (Plain English, Deterministic)
  // =========================================================================
  if (model.findings && model.findings.length > 0) {
    ensureHeight(40);
    currentY = drawSectionHeading(doc, 'Key observations', marginX, currentY, contentWidth);

    model.findings.forEach((finding) => {
      ensureHeight(20);

      const hasBadge = Boolean(finding.severity && finding.severity !== 'info');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(colors.charcoal[0], colors.charcoal[1], colors.charcoal[2]);
      const titleLines = doc.splitTextToSize(`•  ${finding.title}`, hasBadge ? contentWidth - 30 : contentWidth);
      doc.text(titleLines, marginX + 2, currentY);

      if (hasBadge) {
        let badgeColor = colors.grey;
        if (finding.severity === 'critical') badgeColor = colors.red;
        else if (finding.severity === 'warning' || finding.severity === 'attention' || finding.severity === 'follow-up required') badgeColor = colors.amber;

        doc.setFillColor(badgeColor[0], badgeColor[1], badgeColor[2]);
        doc.roundedRect(marginX + contentWidth - 28, currentY - 3, 26, 4.2, 1, 1, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6);
        doc.setTextColor(255, 255, 255);
        doc.text(String(finding.severity).toUpperCase(), marginX + contentWidth - 15, currentY + 0.1, { align: 'center' });
      }

      currentY += Math.max(titleLines.length * 3.8, 4.2) + 1;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(71, 71, 78);
      const obsLines = doc.splitTextToSize(finding.observation, contentWidth - 6);
      doc.text(obsLines, marginX + 5, currentY);
      currentY += obsLines.length * 3.8 + 3;
    });
    currentY += 3;
  }

  // =========================================================================
  // SECTION F: ACTION POINTS / FOLLOW-UP (Only when supported by real data)
  // =========================================================================
  if (model.recommendations && model.recommendations.length > 0) {
    ensureHeight(40);
    currentY = drawSectionHeading(doc, 'Action points', marginX, currentY, contentWidth);

    model.recommendations.forEach((rec) => {
      ensureHeight(22);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(colors.brass[0], colors.brass[1], colors.brass[2]);
      const actionLines = doc.splitTextToSize(`•  ${rec.action}`, contentWidth - 28);
      doc.text(actionLines, marginX + 2, currentY);

      // Priority badge
      let pColor = colors.grey;
      if (rec.priority === 'high') pColor = colors.red;
      else if (rec.priority === 'medium') pColor = colors.amber;

      doc.setFillColor(pColor[0], pColor[1], pColor[2]);
      doc.roundedRect(marginX + contentWidth - 25, currentY - 3, 23, 4.2, 1, 1, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6);
      doc.setTextColor(255, 255, 255);
      doc.text(`${rec.priority.toUpperCase()}`, marginX + contentWidth - 13.5, currentY + 0.1, { align: 'center' });

      currentY += Math.max(actionLines.length * 3.8, 4.2) + 1;

      if (rec.rationale) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.8);
        doc.setTextColor(82, 82, 91);
        const rationaleLines = doc.splitTextToSize(rec.rationale, contentWidth - 6);
        doc.text(rationaleLines, marginX + 5, currentY);
        currentY += rationaleLines.length * 3.6 + 1;
      }

      if (rec.responsibility) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.2);
        doc.setTextColor(113, 113, 122);
        doc.text(`Assigned to: ${rec.responsibility}`, marginX + 5, currentY);
        currentY += 4;
      }
      currentY += 2;
    });
    currentY += 3;
  }

  // =========================================================================
  // SECTION G: NOTES & DATA VERIFICATION (Short and Non-Technical)
  // =========================================================================
  ensureHeight(30);
  currentY = drawSectionHeading(doc, 'Notes and data verification', marginX, currentY, contentWidth);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.setTextColor(113, 113, 122);

  const notesList: string[] = [];
  if (model.limitations && model.limitations.length > 0) {
    notesList.push(...model.limitations);
  }
  if (model.methodology && model.methodology.length > 0) {
    notesList.push(...model.methodology);
  }

  if (notesList.length > 0) {
    notesList.forEach((item) => {
      const wrapped = doc.splitTextToSize(`•  ${item}`, contentWidth - 4);
      ensureHeight(wrapped.length * 3.6);
      doc.text(wrapped, marginX + 2, currentY);
      currentY += wrapped.length * 3.6 + 1.5;
    });
    currentY += 3;
  } else {
    doc.text('Figures reflect confirmed check-in and attendance records up to the data cutoff time.', marginX + 2, currentY);
    currentY += 6;
  }

  if (model.appendix && model.appendix.length > 0) {
    model.appendix.forEach((app) => {
      ensureHeight(40);
      currentY = drawSectionHeading(doc, `APPENDIX: ${app.title.toUpperCase()}`, marginX, currentY, contentWidth);
      currentY = drawTable(doc, marginX, currentY, contentWidth, app.headers, app.rows);
      currentY += 8;
    });
  }

  // =========================================================================
  // POST-PASS: ADD FOOTERS WITH ACCURATE DYNAMIC PAGE NUMBERS
  // =========================================================================
  const totalPagesCount = doc.getNumberOfPages();
  for (let pageIdx = 1; pageIdx <= totalPagesCount; pageIdx++) {
    doc.setPage(pageIdx);
    if (pageIdx === 1) continue;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(161, 161, 170);
    
    const eventName = model.eventContext?.eventTitle || 'The General Assembly';
    doc.text(`Koinonia Children & Teens  ·  ${eventName}`, marginX, 287);
    doc.text(`Page ${pageIdx} of ${totalPagesCount}`, marginX + (contentWidth / 2) - 8, 287);
    doc.text('Official management report', marginX + contentWidth - 36, 287);
  }

  return {
    pdfBytes: doc.output('arraybuffer'),
    pageCount: totalPagesCount
  };
}

// Draw Section Heading with soft faded neutral divider line and balanced spacing
function drawSectionHeading(
  doc: jsPDF,
  title: string,
  x: number,
  y: number,
  w: number
): number {
  doc.setFont('times', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(colors.charcoal[0], colors.charcoal[1], colors.charcoal[2]);
  doc.text(title.toUpperCase(), x, y);

  // Soft, faded, elegant neutral divider line
  const lineY = y + 2.5;
  doc.setDrawColor(228, 228, 231); // #E4E4E7 - soft, lighter, faded
  doc.setLineWidth(0.18);
  doc.line(x, lineY, x + w, lineY);

  // Return comfortable next Y with balanced breathing room
  return lineY + 5.5;
}

// Draw Executive KPI Cards Grid (Spacious, rounded cards with room for labels and sublabels)
function drawKPIBand(doc: jsPDF, x: number, y: number, w: number, kpis: ReportKPI[]): number {
  const count = kpis.length;
  if (count === 0) return y;

  const isMultiRow = count > 4;
  const colsPerRow = isMultiRow ? 3 : count;
  const gapX = 3.5;
  const gapY = 3.5;
  const cardW = (w - (colsPerRow - 1) * gapX) / colsPerRow;
  const cardH = 20.5;

  kpis.forEach((kpi, idx) => {
    const colIdx = isMultiRow ? (idx % colsPerRow) : idx;
    const rowIdx = isMultiRow ? Math.floor(idx / colsPerRow) : 0;
    const cardX = x + colIdx * (cardW + gapX);
    const cardY = y + rowIdx * (cardH + gapY);

    // Clean white card background with soft neutral border
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(228, 228, 231);
    doc.setLineWidth(0.22);
    doc.roundedRect(cardX, cardY, cardW, cardH, 1.5, 1.5, 'FD');

    // Subtle top accent line (0.8mm)
    doc.setFillColor(colors.gold[0], colors.gold[1], colors.gold[2]);
    doc.rect(cardX + 2, cardY, cardW - 4, 0.7, 'F');

    // Label: uppercase, subtle grey
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.2);
    doc.setTextColor(113, 113, 122);
    doc.text(kpi.label.toUpperCase(), cardX + 3.5, cardY + 5.8);

    // Value: bold, charcoal
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(24, 24, 27);
    doc.text(String(kpi.value), cardX + 3.5, cardY + 12.5);

    // Sublabel: quiet secondary
    if (kpi.sublabel) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.8);
      doc.setTextColor(113, 113, 122);
      const subLines = doc.splitTextToSize(kpi.sublabel, cardW - 7);
      doc.text(subLines[0] || '', cardX + 3.5, cardY + 17);
    }
  });

  const numRows = isMultiRow ? Math.ceil(count / colsPerRow) : 1;
  return y + (numRows * cardH) + ((numRows - 1) * gapY) + 7;
}

// Beautiful Dynamic Table with Autowrapped Row cells
function drawTable(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  headers: string[],
  rows: string[][]
): number {
  let tableY = y;
  const colW = w / Math.max(headers.length, 1);

  doc.setFillColor(244, 244, 245);
  doc.rect(x, tableY, w, 7, 'F');

  doc.setDrawColor(212, 212, 216);
  doc.setLineWidth(0.25);
  doc.rect(x, tableY, w, 7, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(39, 39, 42);

  headers.forEach((h, i) => {
    doc.text(h, x + i * colW + 3, tableY + 4.8);
  });

  tableY += 7;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(82, 82, 91);

  rows.forEach((row, rowIdx) => {
    const cellLines = row.map(cell => doc.splitTextToSize(String(cell), colW - 4));
    const maxLinesCount = Math.max(...cellLines.map(lines => lines.length), 1);
    const rowH = 3.5 + (maxLinesCount * 3.5);

    if (rowIdx % 2 === 1) {
      doc.setFillColor(colors.lightIvory[0], colors.lightIvory[1], colors.lightIvory[2]);
      doc.rect(x, tableY, w, rowH, 'F');
    }

    doc.setDrawColor(244, 244, 245);
    doc.setLineWidth(0.2);
    doc.rect(x, tableY, w, rowH, 'S');

    row.forEach((cell, cellIdx) => {
      const wrapped = cellLines[cellIdx];
      wrapped.forEach((lineText, lineIdx) => {
        doc.text(lineText, x + cellIdx * colW + 3, tableY + 4 + (lineIdx * 3.5));
      });
    });

    tableY += rowH;
  });

  return tableY;
}

// Universal Chart Spec Generator for PDF
function drawChartSpec(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
  chart: ReportChartSpec
) {
  try {
    // Title text (Plus Jakarta Sans equivalent: Helvetica Bold)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(39, 39, 42);
    doc.text((chart.title || 'Chart').toUpperCase(), x, y - 2);

    if (chart.kind === 'line' || chart.kind === 'timeline') {
      drawLineChartSpec(doc, x, y, width, height, chart);
    } else if (chart.kind === 'horizontalBar' || chart.kind === 'progress') {
      drawHorizontalBarChartSpec(doc, x, y, width, height, chart);
    } else if (chart.kind === 'donut') {
      drawDonutChartSpec(doc, x, y, width, height, chart);
    } else {
      drawBarChartSpec(doc, x, y, width, height, chart);
    }

    if (chart.caption) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(6.5);
      doc.setTextColor(113, 113, 122);
      doc.text(chart.caption, x, y + height + 6);
    }
  } catch (chartErr) {
    console.error(`[PDF Renderer] Failed to draw chart "${chart.id || chart.title}":`, chartErr);
    doc.setDrawColor(228, 228, 231);
    doc.setFillColor(250, 250, 249);
    doc.roundedRect(x, y, width, height, 2, 2, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(113, 113, 122);
    doc.text(chart.emptyState || 'No visualization data available for this metric.', x + 8, y + height / 2);
  }
}

function drawLineChartSpec(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
  chart: ReportChartSpec
) {
  const labels = chart.labels || [];
  const series = chart.series || [];
  const primarySeries = series[0]?.values || [];

  doc.setDrawColor(161, 161, 170);
  doc.setLineWidth(0.25);
  doc.line(x, y, x, y + height);
  doc.line(x, y + height, x + width, y + height);

  if (labels.length === 0 || primarySeries.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(161, 161, 170);
    doc.text(chart.emptyState || 'No trend data recorded.', x + width / 4, y + height / 2);
    return;
  }

  const allVals = series.flatMap(s => s.values);
  const maxValue = Math.max(...allVals, 1);
  const stepX = width / Math.max(labels.length - 1, 1);

  // Horizontal Grid Lines
  doc.setDrawColor(244, 244, 245);
  doc.setLineWidth(0.2);
  for (let i = 1; i <= 3; i++) {
    const gridY = y + height - (i / 3) * height;
    doc.line(x, gridY, x + width, gridY);
  }

  const seriesColors = [colors.gold, colors.emerald, colors.amber];

  series.forEach((s, sIdx) => {
    const color = seriesColors[sIdx % seriesColors.length];
    doc.setDrawColor(color[0], color[1], color[2]);
    doc.setLineWidth(0.7);

    let lastX = 0;
    let lastY = 0;

    s.values.forEach((val, index) => {
      const ptX = x + index * stepX;
      const ptY = y + height - (val / maxValue) * (height - 4);

      if (index > 0) {
        doc.line(lastX, lastY, ptX, ptY);
      }
      lastX = ptX;
      lastY = ptY;

      doc.setFillColor(color[0], color[1], color[2]);
      doc.circle(ptX, ptY, 0.8, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6);
      doc.setTextColor(24, 24, 27);
      doc.text(String(val), ptX, ptY - 1.5, { align: 'center' });

      if (sIdx === 0) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(5.5);
        doc.setTextColor(113, 113, 122);
        doc.text(labels[index] || '', ptX, y + height + 3, { align: 'center' });
      }
    });
  });
}

function drawBarChartSpec(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
  chart: ReportChartSpec
) {
  const labels = chart.labels || [];
  const series = chart.series || [];
  const primarySeries = series[0]?.values || [];

  if (labels.length === 0 || primarySeries.length === 0) {
    doc.setDrawColor(161, 161, 170);
    doc.setLineWidth(0.25);
    doc.line(x, y, x, y + height);
    doc.line(x, y + height, x + width, y + height);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(161, 161, 170);
    doc.text(chart.emptyState || 'No bar metrics recorded.', x + width / 4, y + height / 2);
    return;
  }

  const isMultiSeries = series.length > 1;
  const allVals = series.flatMap(s => s.values || []);
  const maxValue = Math.max(...allVals, 1);

  // Colors for series: Gold, Charcoal, Emerald, Amber, Deep Gold
  const seriesColors = [
    [colors.gold[0], colors.gold[1], colors.gold[2]],
    [colors.charcoal[0], colors.charcoal[1], colors.charcoal[2]],
    [22, 131, 93],
    [208, 138, 29],
    [140, 109, 35]
  ];

  // If multi-series, render legend at top
  let chartTopY = y;
  let chartAvailableH = height;

  if (isMultiSeries) {
    chartTopY = y + 6;
    chartAvailableH = height - 6;

    let legX = x + 2;
    series.forEach((s, sIdx) => {
      const col = seriesColors[sIdx % seriesColors.length];
      doc.setFillColor(col[0], col[1], col[2]);
      doc.rect(legX, y, 2.5, 2.5, 'F');

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.8);
      doc.setTextColor(82, 82, 91);
      doc.text(s.label || `Series ${sIdx + 1}`, legX + 3.5, y + 2.2);
      legX += 34;
    });
  }

  // Base axes
  doc.setDrawColor(212, 212, 216);
  doc.setLineWidth(0.22);
  doc.line(x, chartTopY, x, chartTopY + chartAvailableH);
  doc.line(x, chartTopY + chartAvailableH, x + width, chartTopY + chartAvailableH);

  // Background light grid lines
  doc.setDrawColor(244, 244, 245);
  doc.setLineWidth(0.18);
  for (let g = 1; g <= 3; g++) {
    const gridY = chartTopY + chartAvailableH - (g / 3) * chartAvailableH;
    doc.line(x, gridY, x + width, gridY);
  }

  const groupSlotW = width / labels.length;

  if (isMultiSeries) {
    const numSeries = series.length;
    const groupBarW = (groupSlotW * 0.72) / numSeries;
    const groupPad = (groupSlotW * 0.28) / 2;

    labels.forEach((label, labelIdx) => {
      const groupStartX = x + (labelIdx * groupSlotW) + groupPad;

      series.forEach((s, sIdx) => {
        const val = s.values[labelIdx] || 0;
        const bH = (val / maxValue) * (chartAvailableH - 4);
        const bX = groupStartX + (sIdx * groupBarW);
        const bY = chartTopY + chartAvailableH - bH;
        const col = seriesColors[sIdx % seriesColors.length];

        if (val > 0) {
          doc.setFillColor(col[0], col[1], col[2]);
          doc.rect(bX, bY, Math.max(groupBarW - 0.4, 0.8), bH, 'F');

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(5);
          doc.setTextColor(24, 24, 27);
          doc.text(String(val), bX + (groupBarW / 2), bY - 1, { align: 'center' });
        }
      });

      // Category label
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.5);
      doc.setTextColor(113, 113, 122);
      doc.text(label, groupStartX + (groupSlotW * 0.36), chartTopY + chartAvailableH + 3.2, { align: 'center' });
    });
  } else {
    const barW = groupSlotW * 0.55;
    const barGap = groupSlotW * 0.45;
    const barColors = [colors.gold, colors.deepGold, colors.emerald, colors.amber, colors.charcoal];

    labels.forEach((label, index) => {
      const val = primarySeries[index] || 0;
      const barH = (val / maxValue) * (chartAvailableH - 4);
      const barX = x + (index * (barW + barGap)) + (barGap / 2);
      const barY = chartTopY + chartAvailableH - barH;

      const bColor = barColors[index % barColors.length];
      if (val > 0) {
        doc.setFillColor(bColor[0], bColor[1], bColor[2]);
        doc.rect(barX, barY, barW, barH, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6);
        doc.setTextColor(24, 24, 27);
        doc.text(String(val), barX + (barW / 2), barY - 1.5, { align: 'center' });
      }

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.5);
      doc.setTextColor(113, 113, 122);
      doc.text(label, barX + (barW / 2), chartTopY + chartAvailableH + 3.2, { align: 'center' });
    });
  }
}

function drawHorizontalBarChartSpec(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
  chart: ReportChartSpec
) {
  const labels = chart.labels || [];
  const series = chart.series || [];

  const allValues = series.flatMap(s => s.values || []);
  const maxValAll = Math.max(...allValues, 0);

  if (labels.length === 0 || series.length === 0 || maxValAll === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(161, 161, 170);
    doc.text(chart.emptyState || 'No horizontal metrics recorded.', x + width / 4, y + height / 2);
    return;
  }

  const isMultiSeries = series.length > 1;
  const maxValue = Math.max(maxValAll, 1);
  const rowH = (height - 4) / labels.length;

  if (isMultiSeries) {
    const subBarH = Math.max((rowH - 3) / series.length, 1.5);
    const seriesPalette = [
      [colors.gold[0], colors.gold[1], colors.gold[2]],
      [colors.charcoal[0], colors.charcoal[1], colors.charcoal[2]],
      [22, 131, 93],
      [113, 113, 122]
    ];

    labels.forEach((label, idx) => {
      const rowY = y + (idx * rowH);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6);
      doc.setTextColor(63, 63, 70);
      doc.text(label, x, rowY + 3, { maxWidth: 30 });

      series.forEach((s, sIdx) => {
        const val = s.values[idx] || 0;
        const subY = rowY + (sIdx * subBarH);
        const barW = (val / maxValue) * (width - 45);
        const col = seriesPalette[sIdx % seriesPalette.length];

        doc.setFillColor(244, 244, 245);
        doc.rect(x + 32, subY, width - 45, subBarH - 0.5, 'F');

        if (val > 0) {
          doc.setFillColor(col[0], col[1], col[2]);
          doc.rect(x + 32, subY, Math.max(barW, 1), subBarH - 0.5, 'F');
        }

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(5);
        doc.setTextColor(82, 82, 91);
        doc.text(String(val), x + 34 + Math.max(barW, 1), subY + subBarH - 0.5);
      });
    });
  } else {
    const primarySeries = series[0]?.values || [];
    labels.forEach((label, idx) => {
      const val = primarySeries[idx] || 0;
      const rowY = y + (idx * rowH);
      const barW = (val / maxValue) * (width - 35);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.setTextColor(63, 63, 70);
      doc.text(label, x, rowY + 3.5, { maxWidth: 28 });

      doc.setFillColor(244, 244, 245);
      doc.rect(x + 30, rowY, width - 35, rowH - 2, 'F');

      if (val > 0) {
        doc.setFillColor(colors.gold[0], colors.gold[1], colors.gold[2]);
        doc.rect(x + 30, rowY, Math.max(barW, 1), rowH - 2, 'F');
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6);
      doc.setTextColor(24, 24, 27);
      doc.text(String(val), x + 32 + Math.max(barW, 1), rowY + 3.5);
    });
  }
}

function drawDonutChartSpec(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
  chart: ReportChartSpec
) {
  const labels = chart.labels || [];
  const series = chart.series || [];
  const primarySeries = series[0]?.values || [];

  if (labels.length === 0 || primarySeries.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(161, 161, 170);
    doc.text(chart.emptyState || 'No status distribution metrics recorded.', x + width / 4, y + height / 2);
    return;
  }

  const total = primarySeries.reduce((a, b) => a + b, 0) || 1;
  const donutColors = [
    [22, 131, 93],                                    // Emerald
    [colors.gold[0], colors.gold[1], colors.gold[2]], // Gold
    [colors.charcoal[0], colors.charcoal[1], colors.charcoal[2]], // Charcoal
    [208, 138, 29],                                   // Amber
    [194, 65, 59]                                     // Red
  ];

  // Top Visual: Segmented Proportion Bar
  const barH = 5;
  const barY = y;
  doc.setFillColor(244, 244, 245);
  doc.roundedRect(x, barY, width, barH, 1.2, 1.2, 'F');

  let accumPct = 0;
  labels.forEach((_, idx) => {
    const val = primarySeries[idx] || 0;
    if (val <= 0) return;
    const segW = (val / total) * width;
    const segX = x + (accumPct / 100) * width;
    const col = donutColors[idx % donutColors.length];

    doc.setFillColor(col[0], col[1], col[2]);
    doc.rect(segX, barY, Math.max(segW, 1), barH, 'F');
    accumPct += (val / total) * 100;
  });

  // Legend / Breakdown Rows Below Bar
  const rowsStartY = barY + barH + 4;
  const availableH = height - (barH + 4);
  const rowH = availableH / Math.max(labels.length, 1);

  labels.forEach((label, idx) => {
    const val = primarySeries[idx] || 0;
    const pct = Math.round((val / total) * 100);
    const rowY = rowsStartY + (idx * rowH);
    const col = donutColors[idx % donutColors.length];

    // Color indicator square
    doc.setFillColor(col[0], col[1], col[2]);
    doc.roundedRect(x + 1, rowY + 1, 3, 3, 0.6, 0.6, 'F');

    // Category Label
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(63, 63, 70);
    doc.text(label, x + 7, rowY + 3.5);

    // Value and percentage
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(24, 24, 27);
    doc.text(`${val}  (${pct}%)`, x + width - 4, rowY + 3.5, { align: 'right' });

    // Subtle inline track
    const trackStartX = x + 58;
    const trackW = width - 95;
    if (trackW > 20) {
      doc.setFillColor(244, 244, 245);
      doc.roundedRect(trackStartX, rowY + 1.2, trackW, 2.2, 0.8, 0.8, 'F');
      if (val > 0) {
        doc.setFillColor(col[0], col[1], col[2]);
        doc.roundedRect(trackStartX, rowY + 1.2, Math.max((trackW * pct) / 100, 1.2), 2.2, 0.8, 0.8, 'F');
      }
    }
  });
}
