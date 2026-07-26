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
    doc.setLineWidth(0.2);
    doc.line(marginX, 21, marginX + contentWidth, 21);
  }

  // =========================================================================
  // PAGE 1: LEADERSHIP SUMMARY & EXECUTIVE OVERVIEW
  // =========================================================================
  doc.setFillColor(colors.lightIvory[0], colors.lightIvory[1], colors.lightIvory[2]);
  doc.rect(0, 0, 210, 297, 'F');

  // Restrained Gold Line Accent
  doc.setDrawColor(colors.gold[0], colors.gold[1], colors.gold[2]);
  doc.setLineWidth(1.5);
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
  doc.setFontSize(18);
  doc.text('KOINONIA GLOBAL', marginX, 15);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(colors.brass[0], colors.brass[1], colors.brass[2]);
  doc.text('Prepared for ministry leadership', marginX, 19);

  // Report Title (Measured height before subtitle & metadata)
  currentY = 32;
  doc.setTextColor(colors.charcoal[0], colors.charcoal[1], colors.charcoal[2]);
  doc.setFont('times', 'bold');
  doc.setFontSize(18);
  const titleText = model.reportTitle.toUpperCase();
  const titleLines = doc.splitTextToSize(titleText, contentWidth);
  doc.text(titleLines, marginX, currentY);
  currentY += titleLines.length * 7 + 2;

  if (model.reportDescription) {
    doc.setFont('times', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(colors.grey[0], colors.grey[1], colors.grey[2]);
    const descLines = doc.splitTextToSize(model.reportDescription, contentWidth);
    doc.text(descLines, marginX, currentY);
    currentY += descLines.length * 4.2 + 2;
  }

  // Metadata Box (Event Date, Cutoff Time)
  doc.setLineWidth(0.3);
  doc.setDrawColor(228, 228, 231);
  doc.setFillColor(244, 244, 245);
  doc.rect(marginX, currentY, contentWidth, 15, 'F');
  doc.rect(marginX, currentY, contentWidth, 15, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(colors.charcoal[0], colors.charcoal[1], colors.charcoal[2]);
  doc.text('EVENT:', marginX + 4, currentY + 5.5);
  doc.setFont('helvetica', 'normal');
  doc.text(model.eventContext.eventTitle, marginX + 20, currentY + 5.5);

  doc.setFont('helvetica', 'bold');
  doc.text('EVENT DATE:', marginX + 90, currentY + 5.5);
  doc.setFont('helvetica', 'normal');
  doc.text(formatHumanDate(model.eventContext.startsAt), marginX + 115, currentY + 5.5);

  doc.setFont('helvetica', 'bold');
  doc.text('DATA CUTOFF:', marginX + 4, currentY + 11);
  doc.setFont('helvetica', 'normal');
  doc.text(formatHumanDate(model.informationConfirmedUpTo, true), marginX + 28, currentY + 11);

  doc.setFont('helvetica', 'bold');
  doc.text('CONFIDENCE:', marginX + 90, currentY + 11);
  doc.setFont('helvetica', 'normal');
  doc.text(`${model.dataQuality.score}% (${model.dataQuality.status})`, marginX + 115, currentY + 11);

  currentY += 20;

  // Render KPIs Bento Grid
  if (model.kpis && model.kpis.length > 0) {
    doc.setFont('times', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(colors.charcoal[0], colors.charcoal[1], colors.charcoal[2]);
    doc.text('KEY PERFORMANCE INDICATORS', marginX, currentY);

    doc.setLineWidth(0.3);
    doc.setDrawColor(colors.gold[0], colors.gold[1], colors.gold[2]);
    doc.line(marginX, currentY + 2, marginX + contentWidth, currentY + 2);

    currentY += 7;

    const count = model.kpis.length;
    const cardGap = 3;
    const cols = count <= 4 ? 4 : 3;
    const cardW = (contentWidth - ((cols - 1) * cardGap)) / cols;
    const cardH = 20;

    model.kpis.forEach((kpi, idx) => {
      const row = Math.floor(idx / cols);
      const col = idx % cols;
      const cardX = marginX + col * (cardW + cardGap);
      const cardY = currentY + row * (cardH + cardGap);
      drawKPICard(doc, cardX, cardY, cardW, cardH, kpi);
    });

    const totalRows = Math.ceil(count / cols);
    currentY += totalRows * (cardH + cardGap) + 6;
  }

  // Render First Section (Leadership Overview Narrative)
  const firstNarrativeSec = model.sections.find(s => s.type === 'narrative');
  if (firstNarrativeSec) {
    doc.setFont('times', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(colors.charcoal[0], colors.charcoal[1], colors.charcoal[2]);
    doc.text(firstNarrativeSec.title, marginX, currentY);

    doc.setLineWidth(0.3);
    doc.setDrawColor(colors.gold[0], colors.gold[1], colors.gold[2]);
    doc.line(marginX, currentY + 2, marginX + contentWidth, currentY + 2);

    currentY += 7;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(39, 39, 42);
    const textLines = doc.splitTextToSize(firstNarrativeSec.content.text || '', contentWidth);
    doc.text(textLines, marginX, currentY);
    currentY += textLines.length * 4.2 + 6;
  }

  // =========================================================================
  // REMAINING SECTIONS, CHARTS, TABLES & FINDINGS (Dynamic Flow)
  // =========================================================================
  const remainingSections = model.sections.filter(s => s !== firstNarrativeSec);

  for (const sec of remainingSections) {
    if (sec.type === 'narrative') {
      ensureHeight(25);
      doc.setFont('times', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(colors.charcoal[0], colors.charcoal[1], colors.charcoal[2]);
      doc.text(sec.title, marginX, currentY);

      doc.setLineWidth(0.3);
      doc.setDrawColor(colors.gold[0], colors.gold[1], colors.gold[2]);
      doc.line(marginX, currentY + 2, marginX + contentWidth, currentY + 2);

      currentY += 7;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(39, 39, 42);
      const paragraphs = doc.splitTextToSize(sec.content.text || '', contentWidth);
      ensureHeight(paragraphs.length * 4.2);
      doc.text(paragraphs, marginX, currentY);
      currentY += paragraphs.length * 4.2 + 6;

    } else if (sec.type === 'table') {
      ensureHeight(35);
      doc.setFont('times', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(colors.charcoal[0], colors.charcoal[1], colors.charcoal[2]);
      doc.text(sec.title, marginX, currentY);

      doc.setLineWidth(0.3);
      doc.setDrawColor(colors.gold[0], colors.gold[1], colors.gold[2]);
      doc.line(marginX, currentY + 2, marginX + contentWidth, currentY + 2);

      currentY += 7;

      const { headers, rows, caption } = sec.content;
      currentY = drawTable(doc, marginX, currentY, contentWidth, headers || [], rows || []);

      if (caption) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(7.5);
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
        doc.setFont('times', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(colors.charcoal[0], colors.charcoal[1], colors.charcoal[2]);
        doc.text(sec.title, marginX, currentY);

        doc.setLineWidth(0.3);
        doc.setDrawColor(colors.gold[0], colors.gold[1], colors.gold[2]);
        doc.line(marginX, currentY + 2, marginX + contentWidth, currentY + 2);

        currentY += 8;

        if (chartSpecs.length === 2) {
          const chartW = 78;
          const chartH = 42;
          ensureHeight(chartH + 8);
          drawChartSpec(doc, marginX, currentY, chartW, chartH, chartSpecs[0]);
          drawChartSpec(doc, marginX + chartW + 14, currentY, chartW, chartH, chartSpecs[1]);
          currentY += chartH + 12;
        } else {
          for (const chartSpec of chartSpecs) {
            const chartW = contentWidth;
            const chartH = 45;
            ensureHeight(chartH + 8);
            drawChartSpec(doc, marginX, currentY, chartW, chartH, chartSpec);
            currentY += chartH + 12;
          }
        }
      }

    } else if (sec.type === 'callout') {
      ensureHeight(30);
      doc.setFont('times', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(colors.charcoal[0], colors.charcoal[1], colors.charcoal[2]);
      doc.text(sec.title, marginX, currentY);

      doc.setLineWidth(0.3);
      doc.setDrawColor(colors.gold[0], colors.gold[1], colors.gold[2]);
      doc.line(marginX, currentY + 2, marginX + contentWidth, currentY + 2);

      currentY += 7;

      const { theme, title, points } = sec.content;
      const calloutBg = theme === 'success' ? [240, 253, 244] : [254, 242, 242];
      const calloutBorder = theme === 'success' ? [74, 222, 128] : [239, 68, 68];
      const calloutText = theme === 'success' ? [21, 128, 61] : [220, 38, 38];

      doc.setFillColor(calloutBg[0], calloutBg[1], calloutBg[2]);
      doc.setDrawColor(calloutBorder[0], calloutBorder[1], calloutBorder[2]);
      doc.setLineWidth(0.3);

      const boxH = 8 + ((points?.length || 1) * 4.5);
      ensureHeight(boxH);
      doc.rect(marginX, currentY, contentWidth, boxH, 'F');
      doc.rect(marginX, currentY, contentWidth, boxH, 'S');

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
  // KEY FINDINGS & RECOMMENDED ACTIONS
  // =========================================================================
  if (model.findings && model.findings.length > 0) {
    ensureHeight(45);
    doc.setFont('times', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(colors.charcoal[0], colors.charcoal[1], colors.charcoal[2]);
    doc.text('KEY FINDINGS', marginX, currentY);

    doc.setDrawColor(colors.gold[0], colors.gold[1], colors.gold[2]);
    doc.setLineWidth(0.3);
    doc.line(marginX, currentY + 2, marginX + contentWidth, currentY + 2);
    currentY += 7;

    model.findings.forEach((finding) => {
      ensureHeight(22);

      const hasBadge = Boolean(finding.severity && finding.severity !== 'info');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(colors.charcoal[0], colors.charcoal[1], colors.charcoal[2]);
      const titleLines = doc.splitTextToSize(finding.title, hasBadge ? contentWidth - 28 : contentWidth);
      doc.text(titleLines, marginX, currentY);

      if (hasBadge) {
        let badgeColor = colors.grey;
        if (finding.severity === 'critical') badgeColor = colors.red;
        else if (finding.severity === 'warning' || finding.severity === 'attention' || finding.severity === 'follow-up required') badgeColor = colors.amber;

        doc.setFillColor(badgeColor[0], badgeColor[1], badgeColor[2]);
        doc.rect(marginX + contentWidth - 26, currentY - 3, 26, 4.5, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(255, 255, 255);
        doc.text(String(finding.severity).toUpperCase(), marginX + contentWidth - 13, currentY + 0.2, { align: 'center' });
      }

      currentY += Math.max(titleLines.length * 4.2, 4.5) + 1;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(82, 82, 91);
      const obsLines = doc.splitTextToSize(finding.observation, contentWidth);
      doc.text(obsLines, marginX, currentY);
      currentY += obsLines.length * 4 + 3;
    });
    currentY += 3;
  }

  if (model.recommendations && model.recommendations.length > 0) {
    ensureHeight(45);
    doc.setFont('times', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(colors.charcoal[0], colors.charcoal[1], colors.charcoal[2]);
    doc.text('RECOMMENDED ACTIONS', marginX, currentY);

    doc.setDrawColor(colors.gold[0], colors.gold[1], colors.gold[2]);
    doc.setLineWidth(0.3);
    doc.line(marginX, currentY + 2, marginX + contentWidth, currentY + 2);
    currentY += 7;

    model.recommendations.forEach((rec) => {
      ensureHeight(24);

      // Wrap action to leave 28mm for priority badge
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(colors.brass[0], colors.brass[1], colors.brass[2]);
      const actionLines = doc.splitTextToSize(rec.action, contentWidth - 28);
      doc.text(actionLines, marginX, currentY);

      // Priority badge
      let pColor = colors.grey;
      if (rec.priority === 'high') pColor = colors.red;
      else if (rec.priority === 'medium') pColor = colors.amber;

      doc.setFillColor(pColor[0], pColor[1], pColor[2]);
      doc.rect(marginX + contentWidth - 24, currentY - 3, 24, 4.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(255, 255, 255);
      doc.text(`${rec.priority.toUpperCase()} PRIORITY`, marginX + contentWidth - 12, currentY + 0.2, { align: 'center' });

      currentY += Math.max(actionLines.length * 4.2, 4.5) + 1;

      if (rec.evidence) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(82, 82, 91);
        const evidenceLines = doc.splitTextToSize(`Evidence: ${rec.evidence}`, contentWidth);
        doc.text(evidenceLines, marginX, currentY);
        currentY += evidenceLines.length * 4;
      }

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(82, 82, 91);
      const rationaleLines = doc.splitTextToSize(`Rationale: ${rec.rationale}`, contentWidth);
      doc.text(rationaleLines, marginX, currentY);
      currentY += rationaleLines.length * 4;

      if (rec.responsibility) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(63, 63, 70);
        doc.text(`Assigned Role: ${rec.responsibility}`, marginX, currentY);
        currentY += 4.5;
      }
      currentY += 3;
    });
    currentY += 3;
  }

  // =========================================================================
  // METHODOLOGY, LIMITATIONS & APPENDIX
  // =========================================================================
  ensureHeight(35);
  doc.setFont('times', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(colors.charcoal[0], colors.charcoal[1], colors.charcoal[2]);
  doc.text('METHODOLOGY AND DATA PROTECTION', marginX, currentY);

  doc.setDrawColor(colors.gold[0], colors.gold[1], colors.gold[2]);
  doc.setLineWidth(0.3);
  doc.line(marginX, currentY + 2, marginX + contentWidth, currentY + 2);
  currentY += 7;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(113, 113, 122);

  if (model.methodology && model.methodology.length > 0) {
    model.methodology.forEach((meth, i) => {
      const wrapped = doc.splitTextToSize(`Method ${i + 1}: ${meth}`, contentWidth);
      ensureHeight(wrapped.length * 4);
      doc.text(wrapped, marginX, currentY);
      currentY += wrapped.length * 4 + 1;
    });
    currentY += 2;
  }

  if (model.limitations && model.limitations.length > 0) {
    model.limitations.forEach((lim, i) => {
      const wrapped = doc.splitTextToSize(`Note ${i + 1}: ${lim}`, contentWidth);
      ensureHeight(wrapped.length * 4);
      doc.text(wrapped, marginX, currentY);
      currentY += wrapped.length * 4 + 1;
    });
    currentY += 4;
  }

  if (model.appendix && model.appendix.length > 0) {
    model.appendix.forEach((app) => {
      ensureHeight(40);
      doc.setFont('times', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(colors.charcoal[0], colors.charcoal[1], colors.charcoal[2]);
      doc.text(`APPENDIX: ${app.title.toUpperCase()}`, marginX, currentY);

      doc.setDrawColor(colors.gold[0], colors.gold[1], colors.gold[2]);
      doc.setLineWidth(0.3);
      doc.line(marginX, currentY + 2, marginX + contentWidth, currentY + 2);
      currentY += 7;

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
    
    // Skip header/footer on page 1
    if (pageIdx === 1) continue;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(161, 161, 170);
    
    doc.text(`Page ${pageIdx} of ${totalPagesCount} | Koinonia Official Report`, marginX, 285);
    doc.text(`Classification: ${model.privacyClassification.toUpperCase()}`, marginX + contentWidth - 65, 285);
    doc.text(`Data Cutoff: ${formatHumanDate(model.informationConfirmedUpTo, true)}`, marginX, 289);
  }

  return {
    pdfBytes: doc.output('arraybuffer'),
    pageCount: totalPagesCount
  };
}

// Draw individual KPI bento grid card
function drawKPICard(doc: jsPDF, x: number, y: number, w: number, h: number, kpi: ReportKPI) {
  doc.setFillColor(colors.lightIvory[0], colors.lightIvory[1], colors.lightIvory[2]);
  doc.rect(x, y, w, h, 'F');

  let themeColor = colors.charcoal;
  if (kpi.color === 'gold') themeColor = colors.gold;
  else if (kpi.color === 'green') themeColor = colors.green;
  else if (kpi.color === 'amber') themeColor = colors.amber;
  else if (kpi.color === 'red') themeColor = colors.red;

  doc.setFillColor(themeColor[0], themeColor[1], themeColor[2]);
  doc.rect(x, y, 1.2, h, 'F');

  doc.setDrawColor(228, 228, 231);
  doc.setLineWidth(0.25);
  doc.rect(x, y, w, h, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(colors.grey[0], colors.grey[1], colors.grey[2]);
  doc.text(kpi.label.toUpperCase(), x + 3.5, y + 4.5);

  doc.setFont('times', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(colors.charcoal[0], colors.charcoal[1], colors.charcoal[2]);
  doc.text(String(kpi.value), x + 3.5, y + 11);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(82, 82, 91);
  
  const subline = doc.splitTextToSize(kpi.sublabel, w - 5);
  doc.text(subline[0] || '', x + 3.5, y + 15.5);
  if (subline[1]) {
    doc.text(subline[1], x + 3.5, y + 18.5);
  }
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
  // Title text
  doc.setFont('times', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(39, 39, 42);
  doc.text(chart.title.toUpperCase(), x, y - 2);

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

  doc.setDrawColor(161, 161, 170);
  doc.setLineWidth(0.25);
  doc.line(x, y, x, y + height);
  doc.line(x, y + height, x + width, y + height);

  if (labels.length === 0 || primarySeries.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(161, 161, 170);
    doc.text(chart.emptyState || 'No bar metrics recorded.', x + width / 4, y + height / 2);
    return;
  }

  const allVals = series.flatMap(s => s.values);
  const maxValue = Math.max(...allVals, 1);
  const barW = (width / labels.length) * 0.55;
  const barGap = (width / labels.length) * 0.45;

  const barColors = [colors.gold, colors.deepGold, colors.emerald, colors.amber, colors.red];

  labels.forEach((label, index) => {
    const val = primarySeries[index] || 0;
    const barH = (val / maxValue) * (height - 4);
    const barX = x + (index * (barW + barGap)) + (barGap / 2);
    const barY = y + height - barH;

    const bColor = barColors[index % barColors.length];
    doc.setFillColor(bColor[0], bColor[1], bColor[2]);
    doc.rect(barX, barY, barW, barH, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.setTextColor(24, 24, 27);
    doc.text(String(val), barX + (barW / 2), barY - 1.5, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.5);
    doc.setTextColor(113, 113, 122);
    doc.text(label, barX + (barW / 2), y + height + 3, { align: 'center' });
  });
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
  const primarySeries = series[0]?.values || [];

  if (labels.length === 0 || primarySeries.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(161, 161, 170);
    doc.text(chart.emptyState || 'No horizontal metrics recorded.', x + width / 4, y + height / 2);
    return;
  }

  const maxValue = Math.max(...primarySeries, 1);
  const rowH = (height - 4) / labels.length;

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

    doc.setFillColor(colors.gold[0], colors.gold[1], colors.gold[2]);
    doc.rect(x + 30, rowY, Math.max(barW, 1), rowH - 2, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.setTextColor(24, 24, 27);
    doc.text(String(val), x + 32 + Math.max(barW, 1), rowY + 3.5);
  });
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
  const rowH = (height - 4) / labels.length;
  const donutColors = [colors.gold, colors.emerald, colors.amber, colors.deepGold, colors.red];

  labels.forEach((label, idx) => {
    const val = primarySeries[idx] || 0;
    const pct = Math.round((val / total) * 100);
    const rowY = y + (idx * rowH);
    const color = donutColors[idx % donutColors.length];

    // Color indicator square
    doc.setFillColor(color[0], color[1], color[2]);
    doc.rect(x, rowY + 1, 3, 3, 'F');

    // Label
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(63, 63, 70);
    doc.text(label, x + 5, rowY + 3.5);

    // Value and percentage
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(24, 24, 27);
    doc.text(`${val} (${pct}%)`, x + width - 15, rowY + 3.5, { align: 'right' });

    // Progress bar behind text
    doc.setFillColor(244, 244, 245);
    doc.rect(x + 50, rowY + 1, width - 70, 2.5, 'F');
    doc.setFillColor(color[0], color[1], color[2]);
    doc.rect(x + 50, rowY + 1, Math.max(((width - 70) * pct) / 100, 1), 2.5, 'F');
  });
}
