import { jsPDF } from 'jspdf';
import {
  ReportDocumentModel,
  ReportKPI,
  ReportSection,
  ReportFinding,
  ReportRecommendation,
  ReportChartSpec
} from './reportDocumentModel';

// Curated Koinonia editorial palette (RGB values for jsPDF)
const colors = {
  gold: [197, 155, 39],       // #C59B27 - Koinonia Gold
  deepGold: [140, 109, 35],   // #8C6D23
  brass: [163, 125, 30],      // #A37D1E
  softGold: [214, 188, 118],  // #D6BC76
  emerald: [22, 131, 93],     // #16835D
  amber: [208, 138, 29],      // #D08A1D
  red: [194, 65, 59],         // #C2413B
  charcoal: [24, 24, 27],     // #18181B - Deep Charcoal
  charcoalSoft: [63, 63, 70], // #3F3F46
  grey: [113, 113, 122],      // #71717A
  warmGrey: [168, 162, 158],  // #A8A29E
  lightIvory: [250, 249, 245],// #FAF9F5 - Warm Ivory
  navy: [15, 23, 42],         // #0F172A
  sapphire: [37, 99, 235]     // #2563EB
};

function formatEditorialDate(dateVal: any, includeTime: boolean = false): string {
  if (!dateVal) return 'Date unavailable';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return String(dateVal);
  const dateStr = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  if (!includeTime) return dateStr;
  const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${dateStr} at ${timeStr}`;
}

function getEditorialColor(label: string, index: number): [number, number, number] {
  const l = (label || '').toLowerCase();
  if (l.includes('attended') || l.includes('arrival') || l.includes('check-in') || l.includes('checked_in')) return [22, 131, 93]; // #16835D - Emerald
  if (l.includes('picked') || l.includes('release') || l.includes('picked_up')) return [63, 63, 70]; // #3F3F46 - Charcoal
  if (l.includes('selected') || l.includes('pass_ready') || l.includes('registered') || l.includes('expected')) return [197, 155, 39]; // #C59B27 - Gold
  if (l.includes('review') || l.includes('pending') || l.includes('waiting')) return [217, 119, 6]; // #D97706 - Amber
  if (l.includes('not selected') || l.includes('rejected') || l.includes('incident')) return [225, 29, 72]; // #E11D48 - Red
  const palette: [number, number, number][] = [
    [197, 155, 39], // Gold
    [22, 131, 93],  // Emerald
    [37, 99, 235],  // Sapphire
    [63, 63, 70],   // Charcoal
    [217, 119, 6]   // Amber
  ];
  return palette[index % palette.length];
}

function getCohortColor(cellText: string): [number, number, number] | null {
  const l = (cellText || '').toLowerCase();
  if (l.includes('under 4')) return [16, 185, 129];
  if (l.includes('1 to 3') || l.includes('1-3')) return [132, 204, 22];
  if (l.includes('4 to 6') || l.includes('4-6')) return [197, 155, 39];
  if (l.includes('7 to 9') || l.includes('7-9')) return [166, 124, 46];
  if (l.includes('10 to 12') || l.includes('10-12')) return [217, 119, 6];
  if (l.includes('teen') || l.includes('13+')) return [75, 85, 99];
  return null;
}

export async function renderDocumentToPDF(model: ReportDocumentModel): Promise<{ pdfBytes: ArrayBuffer; pageCount: number; sectionPageMap: Record<string, number> }> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const sectionPageMap: Record<string, number> = {
    'section-cover': 1,
    'cover': 1
  };

  const pageHeight = 297;
  const pageWidth = 210;
  const marginX = 20;
  const contentWidth = 170;
  const maxContentY = 270;
  let currentY = 35;

  const event = model.eventContext;
  const isDarkCover = model.coverStyle === 'charcoal' || !model.coverStyle;

  // Format date range cleanly
  const startDateStr = formatEditorialDate(event.startsAt);
  const endDateStr = event.endsAt ? formatEditorialDate(event.endsAt) : null;
  const dateRangeStr = endDateStr && endDateStr !== startDateStr
    ? `${startDateStr} – ${endDateStr}`
    : startDateStr;

  // Page break helper
  function addNewPage() {
    doc.addPage();
    drawPageHeader();
    currentY = 32;
  }

  function ensureHeight(neededHeight: number) {
    if (currentY + neededHeight > maxContentY) {
      addNewPage();
    }
  }

  // Draw Header on interior pages
  function drawPageHeader() {
    doc.setFont('times', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(colors.brass[0], colors.brass[1], colors.brass[2]);
    doc.text('KOINONIA CHILDREN & TEENS', marginX, 15);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(colors.grey[0], colors.grey[1], colors.grey[2]);
    doc.text(model.reportTitle.toUpperCase(), marginX + contentWidth, 15, { align: 'right' });

    doc.setDrawColor(228, 228, 231);
    doc.setLineWidth(0.2);
    doc.line(marginX, 18, marginX + contentWidth, 18);
  }

  // =========================================================================
  // PAGE 1: PUBLICATION COVER
  // =========================================================================
  if (isDarkCover) {
    doc.setFillColor(colors.charcoal[0], colors.charcoal[1], colors.charcoal[2]);
  } else {
    doc.setFillColor(colors.lightIvory[0], colors.lightIvory[1], colors.lightIvory[2]);
  }
  doc.rect(0, 0, pageWidth, pageHeight, 'F');

  // Subtle editorial watermark / concentric circles at top-right (matches ReportCover.tsx: top-0 right-0 w-96 h-96 opacity-5)
  const circleCenterX = pageWidth - 38;
  const circleCenterY = 38;
  doc.setDrawColor(isDarkCover ? 36 : 238, isDarkCover ? 36 : 238, isDarkCover ? 40 : 232);
  doc.setLineWidth(0.2);
  doc.circle(circleCenterX, circleCenterY, 44, 'S');
  doc.circle(circleCenterX, circleCenterY, 29, 'S');
  doc.circle(circleCenterX, circleCenterY, 15, 'S');

  // Top Bar: Ministry Brand & Classification
  const coverTextColor = isDarkCover ? [255, 255, 255] : colors.charcoal;
  const coverSubtextColor = isDarkCover ? [161, 161, 170] : colors.grey;

  // Header Left: Small uppercase ministry name & secondary subtitle
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(coverTextColor[0], coverTextColor[1], coverTextColor[2]);
  doc.text('KOINONIA CHILDREN & TEENS', marginX, 22);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(coverSubtextColor[0], coverSubtextColor[1], coverSubtextColor[2]);
  doc.text('OFFICIAL MINISTRY PUBLICATION', marginX, 27);

  // Header Right: Logo / Insignia with Aspect-Ratio Protection (object-contain semantics)
  const maxLogoW = 28;
  const maxLogoH = 10.5;

  if (model.branding?.logoBase64) {
    try {
      const imgProps = doc.getImageProperties(model.branding.logoBase64);
      const naturalW = imgProps.width || 1;
      const naturalH = imgProps.height || 1;
      const aspectRatio = naturalW / naturalH;

      let logoW = maxLogoW;
      let logoH = logoW / aspectRatio;
      if (logoH > maxLogoH) {
        logoH = maxLogoH;
        logoW = logoH * aspectRatio;
      }

      const logoX = marginX + contentWidth - logoW;
      const logoY = 17 + (maxLogoH - logoH) / 2;

      doc.addImage(
        model.branding.logoBase64,
        imgProps.fileType || 'PNG',
        logoX,
        logoY,
        logoW,
        logoH
      );
    } catch (_) {
      drawCoverFallbackBadge();
    }
  } else {
    drawCoverFallbackBadge();
  }

  function drawCoverFallbackBadge() {
    const badgeW = 24;
    const badgeH = 7.5;
    const badgeX = marginX + contentWidth - badgeW;
    const badgeY = 19;
    doc.setDrawColor(colors.gold[0], colors.gold[1], colors.gold[2]);
    doc.setLineWidth(0.25);
    doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 1, 1, 'S');

    doc.setTextColor(colors.gold[0], colors.gold[1], colors.gold[2]);
    doc.setFont('times', 'bold');
    doc.setFontSize(8.5);
    doc.text('KOINONIA', badgeX + (badgeW / 2), badgeY + 5.2, { align: 'center' });
  }

  // Header Thin Rule (subtle muted border matching ReportCover.tsx: border-b pb-4 border-stone-200/20)
  doc.setDrawColor(isDarkCover ? 50 : 220, isDarkCover ? 50 : 220, isDarkCover ? 55 : 225);
  doc.setLineWidth(0.2);
  doc.line(marginX, 32, marginX + contentWidth, 32);

  // Dynamic Title Fitting & Measurement (preserves large editorial scale across all 6 report types)
  const displayTitle = model.reportTitle.includes('—') ? model.reportTitle.split('—')[1].trim() : model.reportTitle;
  let titleFontSize = 38;
  let titleLines: string[] = [];

  for (let sz = 38; sz >= 26; sz -= 2) {
    doc.setFont('times', 'bold');
    doc.setFontSize(sz);
    const lines = doc.splitTextToSize(displayTitle, contentWidth);
    if (lines.length <= 2 || sz === 26) {
      titleFontSize = sz;
      titleLines = lines;
      break;
    }
  }

  const titleLineH = titleFontSize * 0.38;

  // Description text wrapping
  const descMaxWidth = Math.min(contentWidth - 15, 145);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const descLines = model.reportDescription ? doc.splitTextToSize(model.reportDescription, descMaxWidth) : [];

  // Theme & Scripture height
  let vignetteH = 0;
  if (event.theme || event.scripture) {
    vignetteH = 8 + (event.theme ? 6.5 : 0) + (event.scripture ? 6 : 0);
  }

  // Calculate total center block height to center vertically
  const goldRuleH = 7;
  const eventLabelH = 9;
  const titleBlockH = titleLines.length * titleLineH + 6;
  const descBlockH = descLines.length > 0 ? descLines.length * 4.6 + 8 : 0;
  const totalCenterH = goldRuleH + eventLabelH + titleBlockH + descBlockH + vignetteH;

  // Vertically center between header rule (Y=32) and bottom metadata rule (Y=252)
  const headerBottomY = 32;
  const bottomMetaY = 252;
  const availableSpace = bottomMetaY - headerBottomY;
  let cursorY = Math.max(headerBottomY + 12, headerBottomY + (availableSpace - totalCenterH) / 2 - 4);

  // Short Gold Rule (w-16 h-0.5 bg-[#C59B27] mb-6)
  doc.setFillColor(colors.gold[0], colors.gold[1], colors.gold[2]);
  doc.rect(marginX, cursorY, 16, 0.7, 'F');
  cursorY += 7;

  // Event title (gold uppercase tracking)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(colors.gold[0], colors.gold[1], colors.gold[2]);
  doc.text((event.eventTitle || 'THE GENERAL ASSEMBLY').toUpperCase(), marginX, cursorY);
  cursorY += 9;

  // Report Title (dominant editorial serif)
  doc.setFont('times', 'bold');
  doc.setFontSize(titleFontSize);
  doc.setTextColor(coverTextColor[0], coverTextColor[1], coverTextColor[2]);
  doc.text(titleLines, marginX, cursorY);
  cursorY += titleLines.length * titleLineH + 6;

  // Report Description
  if (descLines.length > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(coverSubtextColor[0], coverSubtextColor[1], coverSubtextColor[2]);
    doc.text(descLines, marginX, cursorY);
    cursorY += descLines.length * 4.6 + 8;
  }

  // Theme & Scripture Vignette
  if (event.theme || event.scripture) {
    doc.setDrawColor(isDarkCover ? 50 : 220, isDarkCover ? 50 : 220, isDarkCover ? 55 : 225);
    doc.setLineWidth(0.2);
    doc.line(marginX, cursorY, marginX + 85, cursorY);
    cursorY += 6.5;

    if (event.theme) {
      doc.setFont('times', 'italic');
      doc.setFontSize(13);
      doc.setTextColor(coverTextColor[0], coverTextColor[1], coverTextColor[2]);
      doc.text(`"${event.theme}"`, marginX, cursorY);
      cursorY += 6.5;
    }

    if (event.scripture) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(colors.gold[0], colors.gold[1], colors.gold[2]);
      doc.text(event.scripture.toUpperCase(), marginX, cursorY);
    }
  }

  // Bottom Metadata Band
  doc.setDrawColor(isDarkCover ? 50 : 220, isDarkCover ? 50 : 220, isDarkCover ? 55 : 225);
  doc.setLineWidth(0.25);
  doc.line(marginX, bottomMetaY, marginX + contentWidth, bottomMetaY);

  const colWidth = contentWidth / 3;

  // Col 1: Dates
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(coverSubtextColor[0], coverSubtextColor[1], coverSubtextColor[2]);
  doc.text('EVENT DATES', marginX, bottomMetaY + 6);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(coverTextColor[0], coverTextColor[1], coverTextColor[2]);
  doc.text(dateRangeStr, marginX, bottomMetaY + 11);

  // Col 2: Venue
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(coverSubtextColor[0], coverSubtextColor[1], coverSubtextColor[2]);
  doc.text('VENUE', marginX + colWidth, bottomMetaY + 6);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(coverTextColor[0], coverTextColor[1], coverTextColor[2]);
  doc.text(event.venue || 'Event location', marginX + colWidth, bottomMetaY + 11);

  // Col 3: Prepared
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(coverSubtextColor[0], coverSubtextColor[1], coverSubtextColor[2]);
  doc.text('PREPARED', marginX + colWidth * 2, bottomMetaY + 6);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(colors.gold[0], colors.gold[1], colors.gold[2]);
  const compiledDateStr = formatEditorialDate(model.reportingPeriod?.end || model.informationConfirmedUpTo);
  doc.text(compiledDateStr, marginX + colWidth * 2, bottomMetaY + 11);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(coverSubtextColor[0], coverSubtextColor[1], coverSubtextColor[2]);
  doc.text('From event records', marginX + colWidth * 2, bottomMetaY + 15.5);

  // =========================================================================
  // PAGE 2: OPENING SPREAD (Profile, Narrative, Large Data Figures)
  // =========================================================================
  doc.addPage();
  drawPageHeader();
  currentY = 28;

  sectionPageMap['section-kpis'] = 2;
  sectionPageMap['kpis'] = 2;
  sectionPageMap['section-overview'] = 2;
  sectionPageMap['event-overview'] = 2;

  // Title: Operational Overview & Executive Summary
  doc.setFont('times', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(colors.charcoal[0], colors.charcoal[1], colors.charcoal[2]);
  doc.text('Operational Overview & Executive Summary', marginX, currentY);
  currentY += 8;

  // Event Profile Box (Left: 52mm) vs Narrative (Right: 112mm)
  const profileBoxW = 54;
  const narrativeBoxW = 110;
  const profileBoxX = marginX;
  const narrativeBoxX = marginX + profileBoxW + 6;
  const profileBoxY = currentY;

  // Draw Event Profile Box
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(228, 228, 231);
  doc.setLineWidth(0.2);
  doc.roundedRect(profileBoxX, profileBoxY, profileBoxW, 46, 1, 1, 'FD');

  // Left gold bar
  doc.setFillColor(colors.gold[0], colors.gold[1], colors.gold[2]);
  doc.rect(profileBoxX, profileBoxY, 1.2, 46, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(colors.gold[0], colors.gold[1], colors.gold[2]);
  doc.text('EVENT PROFILE', profileBoxX + 4, profileBoxY + 5);

  let profY = profileBoxY + 11;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.2);
  doc.setTextColor(colors.grey[0], colors.grey[1], colors.grey[2]);
  doc.text('SCHEDULE:', profileBoxX + 4, profY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(colors.charcoal[0], colors.charcoal[1], colors.charcoal[2]);
  doc.text(dateRangeStr, profileBoxX + 4, profY + 3.8);

  profY += 9;
  if (event.venue) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.2);
    doc.setTextColor(colors.grey[0], colors.grey[1], colors.grey[2]);
    doc.text('VENUE:', profileBoxX + 4, profY);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(colors.charcoal[0], colors.charcoal[1], colors.charcoal[2]);
    doc.text(event.venue, profileBoxX + 4, profY + 3.8);
    profY += 9;
  }

  if (event.theme) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.2);
    doc.setTextColor(colors.grey[0], colors.grey[1], colors.grey[2]);
    doc.text('THEME:', profileBoxX + 4, profY);
    doc.setFont('times', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(colors.charcoal[0], colors.charcoal[1], colors.charcoal[2]);
    doc.text(`"${event.theme}"`, profileBoxX + 4, profY + 3.8);
    profY += 9;
  }

  // Draw Executive Summary Narrative on the right
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(colors.grey[0], colors.grey[1], colors.grey[2]);
  doc.text('EVENT SUMMARY', narrativeBoxX, profileBoxY + 5);

  const narrativeSec = model.sections.find(s => s.type === 'narrative');
  const narrativeText = narrativeSec?.content?.text ||
    `Factual operational record of event registration, participant attendance, volunteer duty coverage, pass readiness, and child safety for ${event.eventTitle || 'the event'}.`;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.4);
  doc.setTextColor(39, 39, 42);
  const narrativeLines = doc.splitTextToSize(narrativeText, narrativeBoxW);
  doc.text(narrativeLines, narrativeBoxX, profileBoxY + 11);

  currentY = profileBoxY + 52;

  // Large Data Moments (Section 6: Major Figures without Card Boxes)
  if (model.kpis && model.kpis.length > 0) {
    doc.setDrawColor(228, 228, 231);
    doc.setLineWidth(0.2);
    doc.line(marginX, currentY, marginX + contentWidth, currentY);
    currentY += 5;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(colors.grey[0], colors.grey[1], colors.grey[2]);
    doc.text('EVENT AT A GLANCE', marginX, currentY);
    currentY += 7;

    const kpiCount = Math.min(model.kpis.length, 6);
    const kpiW = contentWidth / kpiCount;

    model.kpis.slice(0, 6).forEach((kpi, idx) => {
      const kX = marginX + (idx * kpiW);

      // Thin left rule
      doc.setDrawColor(228, 228, 231);
      doc.setLineWidth(0.25);
      doc.line(kX, currentY, kX, currentY + 16);

      // Label
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.2);
      doc.setTextColor(colors.grey[0], colors.grey[1], colors.grey[2]);
      doc.text(kpi.label.toUpperCase(), kX + 2.5, currentY + 3.5);

      // Big Cormorant Number
      doc.setFont('times', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(colors.charcoal[0], colors.charcoal[1], colors.charcoal[2]);
      doc.text(String(kpi.value), kX + 2.5, currentY + 10.5);

      // Sublabel
      if (kpi.sublabel) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(5.8);
        doc.setTextColor(colors.warmGrey[0], colors.warmGrey[1], colors.warmGrey[2]);
        doc.text(kpi.sublabel, kX + 2.5, currentY + 14.5);
      }
    });

    currentY += 24;
  }

  // =========================================================================
  // SECTION D: INTERIOR OPERATIONAL SECTIONS (Tables, Charts, Narratives)
  // =========================================================================
  const operationalSections = model.sections.filter(s => s !== narrativeSec);

  for (const sec of operationalSections) {
    const secId = sec.id || `sec-${operationalSections.indexOf(sec)}`;
    const secPage = doc.getNumberOfPages();
    sectionPageMap[`section-${secId}`] = secPage;
    sectionPageMap[secId] = secPage;

    if (sec.type === 'narrative') {
      ensureHeight(25);
      currentY = drawEditorialSectionHeading(doc, sec.title, sec.description, marginX, currentY, contentWidth);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.4);
      doc.setTextColor(39, 39, 42);
      const paragraphs = doc.splitTextToSize(sec.content.text || '', contentWidth);
      ensureHeight(paragraphs.length * 4.2);
      doc.text(paragraphs, marginX, currentY);
      currentY += paragraphs.length * 4.2 + 6;

    } else if (sec.type === 'table') {
      ensureHeight(40);
      currentY = drawEditorialSectionHeading(doc, sec.title, sec.description, marginX, currentY, contentWidth);

      const { headers, rows, caption } = sec.content;
      currentY = drawEditorialTable(doc, marginX, currentY, contentWidth, headers || [], rows || []);

      if (caption) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(7);
        doc.setTextColor(colors.grey[0], colors.grey[1], colors.grey[2]);
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
          series: [{ id: 's1', label: 'Activity', values: sec.content.lineChart.data?.map((d: any) => d.value) || [] }],
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
        currentY = drawEditorialSectionHeading(doc, sec.title, sec.description, marginX, currentY, contentWidth);

        for (const chartSpec of chartSpecs) {
          const chartW = contentWidth;
          const chartH = chartSpec.kind === 'donut' ? 44 : 46;
          ensureHeight(chartH + 12);
          drawChartSpec(doc, marginX, currentY, chartW, chartH, chartSpec);
          currentY += chartH + 14;
        }
      }

    } else if (sec.type === 'callout') {
      ensureHeight(25);
      const { title, message, points } = sec.content;

      // Draw restrained left-accent line
      doc.setFillColor(colors.gold[0], colors.gold[1], colors.gold[2]);
      doc.rect(marginX, currentY, 1, 14 + ((points?.length || 0) * 4), 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(colors.charcoal[0], colors.charcoal[1], colors.charcoal[2]);
      doc.text(title || sec.title, marginX + 4, currentY + 4);

      if (message) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(39, 39, 42);
        doc.text(message, marginX + 4, currentY + 8.5);
      }

      let callY = currentY + 13;
      if (points && points.length > 0) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(39, 39, 42);
        points.forEach((pt: string) => {
          doc.text(`• ${pt}`, marginX + 6, callY);
          callY += 4;
        });
      }

      currentY = callY + 6;
    }
  }

  // =========================================================================
  // SECTION E: KEY OBSERVATIONS & RECOMMENDATIONS
  // =========================================================================
  if (model.findings && model.findings.length > 0) {
    ensureHeight(35);
    sectionPageMap['section-findings'] = doc.getNumberOfPages();
    sectionPageMap['findings'] = doc.getNumberOfPages();
    currentY = drawEditorialSectionHeading(doc, 'Key Operational Observations', undefined, marginX, currentY, contentWidth);

    model.findings.forEach((finding) => {
      ensureHeight(15);
      doc.setFillColor(colors.gold[0], colors.gold[1], colors.gold[2]);
      doc.circle(marginX + 2, currentY + 1.5, 0.8, 'F');

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.2);
      doc.setTextColor(39, 39, 42);
      const obsLines = doc.splitTextToSize(finding.observation, contentWidth - 8);
      doc.text(obsLines, marginX + 6, currentY + 2.5);
      currentY += obsLines.length * 4 + 3;
    });

    currentY += 6;
  }

  // Administrative Attention Items
  if (model.managementAttention && model.managementAttention.length > 0) {
    ensureHeight(30);
    sectionPageMap['section-attention'] = doc.getNumberOfPages();
    sectionPageMap['attention'] = doc.getNumberOfPages();
    currentY = drawEditorialSectionHeading(doc, 'Administrative Attention Items', undefined, marginX, currentY, contentWidth);

    model.managementAttention.forEach((item) => {
      ensureHeight(12);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(colors.amber[0], colors.amber[1], colors.amber[2]);
      doc.text('→', marginX + 2, currentY + 2.5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.2);
      doc.setTextColor(39, 39, 42);
      const attLines = doc.splitTextToSize(item, contentWidth - 8);
      doc.text(attLines, marginX + 6, currentY + 2.5);
      currentY += attLines.length * 4 + 2.5;
    });
    currentY += 4;
  }

  // Recommended Action Points
  if (model.recommendations && model.recommendations.length > 0) {
    ensureHeight(35);
    sectionPageMap['section-recommendations'] = doc.getNumberOfPages();
    sectionPageMap['recommendations'] = doc.getNumberOfPages();
    currentY = drawEditorialSectionHeading(doc, 'Recommended Action Points', undefined, marginX, currentY, contentWidth);

    model.recommendations.forEach((rec) => {
      ensureHeight(18);
      doc.setDrawColor(212, 212, 216);
      doc.setLineWidth(0.6);
      doc.line(marginX + 2, currentY, marginX + 2, currentY + 12);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(24, 24, 27);
      doc.text(rec.action, marginX + 6, currentY + 3.5);

      let recY = currentY + 7;
      if (rec.rationale) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.2);
        doc.setTextColor(82, 82, 91);
        const ratLines = doc.splitTextToSize(rec.rationale, contentWidth - 10);
        doc.text(ratLines, marginX + 6, recY);
        recY += ratLines.length * 3.5;
      }
      if (rec.responsibility) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(6.8);
        doc.setTextColor(colors.grey[0], colors.grey[1], colors.grey[2]);
        doc.text(`Assigned to: ${rec.responsibility}`, marginX + 6, recY + 1);
        recY += 4;
      }
      currentY = recY + 3;
    });
    currentY += 4;
  }

  // Data Quality & Notes
  if (model.dataQuality || (model.methodology && model.methodology.length > 0) || (model.limitations && model.limitations.length > 0)) {
    ensureHeight(25);
    sectionPageMap['section-quality-methodology'] = doc.getNumberOfPages();
    sectionPageMap['quality'] = doc.getNumberOfPages();
    currentY = drawEditorialSectionHeading(doc, 'Data Notes and Limitations', undefined, marginX, currentY, contentWidth);

    if (model.dataQuality) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(colors.charcoal[0], colors.charcoal[1], colors.charcoal[2]);
      doc.text(`Confidence: ${model.dataQuality.status || 'High confidence'}`, marginX, currentY + 2);
      currentY += 5;

      if (model.dataQuality.notes) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(colors.grey[0], colors.grey[1], colors.grey[2]);
        const noteLines = doc.splitTextToSize(model.dataQuality.notes, contentWidth);
        doc.text(noteLines, marginX, currentY);
        currentY += noteLines.length * 3.4 + 2;
      }
    }

    if (model.limitations && model.limitations.length > 0) {
      model.limitations.forEach(lim => {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.8);
        doc.setTextColor(colors.grey[0], colors.grey[1], colors.grey[2]);
        doc.text(`• ${lim}`, marginX, currentY);
        currentY += 3.5;
      });
    }
  }

  // =========================================================================
  // SECTION F: INSTITUTIONAL BACK COVER
  // =========================================================================
  doc.addPage();
  const totalPages = doc.getNumberOfPages();
  sectionPageMap['section-back-cover'] = totalPages;
  sectionPageMap['back-cover'] = totalPages;

  doc.setFillColor(colors.lightIvory[0], colors.lightIvory[1], colors.lightIvory[2]);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');

  let backY = 120;

  // Gold accent mark
  doc.setFillColor(colors.gold[0], colors.gold[1], colors.gold[2]);
  doc.rect(marginX + (contentWidth - 20) / 2, backY, 20, 0.9, 'F');
  backY += 14;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(colors.grey[0], colors.grey[1], colors.grey[2]);
  doc.text('KOINONIA CHILDREN & TEENS', pageWidth / 2, backY, { align: 'center' });
  backY += 10;

  doc.setFont('times', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(colors.charcoal[0], colors.charcoal[1], colors.charcoal[2]);
  doc.text(event.eventTitle || 'The General Assembly', pageWidth / 2, backY, { align: 'center' });
  backY += 14;

  doc.setFont('times', 'italic');
  doc.setFontSize(14);
  doc.setTextColor(colors.deepGold[0], colors.deepGold[1], colors.deepGold[2]);
  doc.text('"Children are precious. Care is intentional."', pageWidth / 2, backY, { align: 'center' });
  backY += 40;

  doc.setDrawColor(228, 228, 231);
  doc.setLineWidth(0.2);
  doc.line(marginX + 30, backY, marginX + contentWidth - 30, backY);
  backY += 8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(colors.charcoal[0], colors.charcoal[1], colors.charcoal[2]);
  doc.text('OFFICIAL MINISTRY ARCHIVE', pageWidth / 2, backY, { align: 'center' });
  backY += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(colors.grey[0], colors.grey[1], colors.grey[2]);
  doc.text('This publication constitutes the official event record for administrative and pastoral review.', pageWidth / 2, backY, { align: 'center' });

  // Draw running footers on all interior pages (Pages 2 through pageCount - 1)
  for (let p = 2; p < totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(228, 228, 231);
    doc.setLineWidth(0.2);
    doc.line(marginX, 286, marginX + contentWidth, 286);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(colors.grey[0], colors.grey[1], colors.grey[2]);
    doc.text(`KOINONIA CHILDREN & TEENS · ${(event.eventTitle || 'THE GENERAL ASSEMBLY').toUpperCase()}`, marginX, 290);
    doc.text(`Page ${p} of ${totalPages}`, marginX + contentWidth, 290, { align: 'right' });
  }

  model.sectionPageMap = sectionPageMap;
  const pdfBytes = doc.output('arraybuffer');
  return { pdfBytes, pageCount: totalPages, sectionPageMap };
}

// Draw Section Heading with large numeral support (e.g. "01 Registration & Selection")
function drawEditorialSectionHeading(
  doc: jsPDF,
  title: string,
  description: string | undefined,
  x: number,
  y: number,
  w: number
): number {
  let displayNum = '';
  let cleanTitle = title;
  const match = title.match(/^(\d{2})\s+(.+)$/);
  if (match) {
    displayNum = match[1];
    cleanTitle = match[2];
  }

  let headY = y;
  if (displayNum) {
    doc.setFont('times', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(colors.gold[0], colors.gold[1], colors.gold[2]);
    doc.text(displayNum, x, headY + 5);

    doc.setFont('times', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(colors.charcoal[0], colors.charcoal[1], colors.charcoal[2]);
    doc.text(cleanTitle, x + 12, headY + 5);
    headY += 7;
  } else {
    doc.setFont('times', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(colors.charcoal[0], colors.charcoal[1], colors.charcoal[2]);
    doc.text(cleanTitle, x, headY + 4);
    headY += 6;
  }

  if (description) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(colors.grey[0], colors.grey[1], colors.grey[2]);
    doc.text(description, x, headY + 2);
    headY += 4.5;
  }

  // Thin separator rule
  doc.setDrawColor(228, 228, 231);
  doc.setLineWidth(0.2);
  doc.line(x, headY + 1.5, x + w, headY + 1.5);

  return headY + 6.5;
}

// Draw Publication Table (Subtle horizontal rules, no heavy cell boxes)
function drawEditorialTable(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  headers: string[],
  rows: string[][]
): number {
  let tableY = y;
  const colW = w / Math.max(headers.length, 1);

  // Table Header
  doc.setDrawColor(39, 39, 42);
  doc.setLineWidth(0.35);
  doc.line(x, tableY + 5.5, x + w, tableY + 5.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(24, 24, 27);

  headers.forEach((h, i) => {
    const isRight = i === headers.length - 1;
    if (isRight) {
      doc.text(h.toUpperCase(), x + (i + 1) * colW - 2, tableY + 4, { align: 'right' });
    } else {
      doc.text(h.toUpperCase(), x + i * colW + 2, tableY + 4);
    }
  });

  tableY += 7;

  // Table Rows
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);

  rows.forEach((row, rIdx) => {
    // Determine row height by wrapping
    const cellLines = row.map(cell => doc.splitTextToSize(String(cell || ''), colW - 4));
    const maxLines = Math.max(...cellLines.map(l => l.length), 1);
    const rowH = Math.max(maxLines * 4.2 + 2.5, 6.5);

    // Light divider rule between rows
    doc.setDrawColor(240, 240, 242);
    doc.setLineWidth(0.15);
    doc.line(x, tableY + rowH, x + w, tableY + rowH);

    row.forEach((cell, cellIdx) => {
      const isRight = cellIdx === row.length - 1;
      const isFirst = cellIdx === 0;
      const wrapped = cellLines[cellIdx];
      const isRateCell = isRight && String(cell).includes('%');
      const cohortDot = isFirst ? getCohortColor(String(cell || '')) : null;

      if (isRateCell) {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(colors.charcoal[0], colors.charcoal[1], colors.charcoal[2]);
      } else if (isFirst) {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(24, 24, 27);
      } else {
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(63, 63, 70);
      }

      if (cohortDot) {
        doc.setFillColor(cohortDot[0], cohortDot[1], cohortDot[2]);
        doc.circle(x + 3.5, tableY + 3.5, 0.9, 'F');
      }

      const textOffsetX = (cohortDot && isFirst) ? 6.5 : 2;

      wrapped.forEach((lineText, lineIdx) => {
        if (isRight) {
          doc.text(lineText, x + (cellIdx + 1) * colW - 2, tableY + 4 + (lineIdx * 4), { align: 'right' });
        } else {
          doc.text(lineText, x + cellIdx * colW + textOffsetX, tableY + 4 + (lineIdx * 4));
        }
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
      doc.text(chart.caption, x, y + height + 5);
    }
  } catch (chartErr) {
    console.error(`[PDF Renderer] Failed to draw chart "${chart.id || chart.title}":`, chartErr);
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

  doc.setDrawColor(212, 212, 216);
  doc.setLineWidth(0.2);
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
  doc.setLineWidth(0.18);
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
      doc.setFontSize(5.5);
      doc.setTextColor(24, 24, 27);
      doc.text(String(val), ptX, ptY - 1.5, { align: 'center' });

      if (sIdx === 0) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(5.5);
        doc.setTextColor(113, 113, 122);
        doc.text(labels[index] || '', ptX, y + height + 3.2, { align: 'center' });
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
    doc.setDrawColor(212, 212, 216);
    doc.setLineWidth(0.2);
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

  const seriesColors = [
    [colors.gold[0], colors.gold[1], colors.gold[2]],
    [colors.charcoal[0], colors.charcoal[1], colors.charcoal[2]],
    [colors.emerald[0], colors.emerald[1], colors.emerald[2]],
    [colors.amber[0], colors.amber[1], colors.amber[2]]
  ];

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

  // Base axis & grid lines
  doc.setDrawColor(212, 212, 216);
  doc.setLineWidth(0.2);
  doc.line(x, chartTopY + chartAvailableH, x + width, chartTopY + chartAvailableH);

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

      const bColor = getEditorialColor(label, index);
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
  const primarySeries = series[0]?.values || [];

  if (labels.length === 0 || primarySeries.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(161, 161, 170);
    doc.text(chart.emptyState || 'No comparative records.', x + width / 4, y + height / 2);
    return;
  }

  const allVals = series.flatMap(s => s.values || []);
  const maxValue = Math.max(...allVals, 1);
  const rowCount = labels.length;
  const rowH = height / rowCount;
  const labelColW = 45;
  const barAreaW = width - labelColW - 14;

  const seriesColors = [
    [colors.gold[0], colors.gold[1], colors.gold[2]],
    [colors.charcoal[0], colors.charcoal[1], colors.charcoal[2]],
    [colors.emerald[0], colors.emerald[1], colors.emerald[2]]
  ];

  labels.forEach((label, idx) => {
    const rowY = y + (idx * rowH);

    // Label
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(63, 63, 70);
    const shortLabel = doc.splitTextToSize(label, labelColW - 2);
    doc.text(shortLabel[0] || '', x, rowY + (rowH / 2) + 1);

    // Bar background track
    doc.setFillColor(244, 244, 245);
    doc.rect(x + labelColW, rowY + 1.5, barAreaW, Math.max(rowH - 3, 2), 'F');

    series.forEach((s, sIdx) => {
      const val = s.values[idx] || 0;
      if (val > 0) {
        const bW = Math.max((val / maxValue) * barAreaW, 1);
        const col = seriesColors[sIdx % seriesColors.length];
        doc.setFillColor(col[0], col[1], col[2]);
        doc.rect(x + labelColW, rowY + 1.5, bW, Math.max(rowH - 3, 2), 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6);
        doc.setTextColor(24, 24, 27);
        doc.text(String(val), x + labelColW + bW + 2, rowY + (rowH / 2) + 1.5);
      }
    });
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
    doc.text(chart.emptyState || 'No distribution records.', x + width / 4, y + height / 2);
    return;
  }

  const total = primarySeries.reduce((a, b) => a + b, 0) || 1;

  const cx = x + 30;
  const cy = y + (height / 2);
  const outerR = Math.min(height * 0.44, 20);
  const innerR = outerR * 0.64;

  let currentAngle = -Math.PI / 2;

  labels.forEach((lbl, idx) => {
    const val = primarySeries[idx] || 0;
    if (val <= 0) return;
    const sweep = (val / total) * 2 * Math.PI;
    const startA = currentAngle;
    currentAngle += sweep;

    const points: [number, number][] = [];
    const steps = Math.max(Math.ceil(sweep / (Math.PI / 16)), 4);
    let lastX = cx;
    let lastY = cy;

    const startPtX = cx + outerR * Math.cos(startA);
    const startPtY = cy + outerR * Math.sin(startA);
    points.push([startPtX - lastX, startPtY - lastY]);
    lastX = startPtX;
    lastY = startPtY;

    for (let s = 1; s <= steps; s++) {
      const angle = startA + (s / steps) * sweep;
      const ptX = cx + outerR * Math.cos(angle);
      const ptY = cy + outerR * Math.sin(angle);
      points.push([ptX - lastX, ptY - lastY]);
      lastX = ptX;
      lastY = ptY;
    }
    points.push([cx - lastX, cy - lastY]);

    const col = getEditorialColor(lbl, idx);
    doc.setFillColor(col[0], col[1], col[2]);
    doc.lines(points, cx, cy, [1, 1], 'F', true);
  });

  // Donut inner hole (clear center)
  doc.setFillColor(255, 255, 255);
  doc.circle(cx, cy, innerR, 'F');
  doc.setDrawColor(240, 240, 242);
  doc.setLineWidth(0.15);
  doc.circle(cx, cy, innerR, 'S');

  // Center text: total count and sublabel
  doc.setFont('times', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(24, 24, 27);
  doc.text(String(total), cx, cy + 1, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.2);
  doc.setTextColor(113, 113, 122);
  doc.text('TOTAL COUNT', cx, cy + 4.8, { align: 'center' });

  // Right-side legend card rows (matches ReportChartRenderer.tsx 2-column layout)
  const legX = x + 66;
  const legW = width - 66;
  const rowCount = Math.max(labels.length, 1);
  const rowH = Math.min((height - 2) / rowCount, 9.5);

  labels.forEach((label, idx) => {
    const val = primarySeries[idx] || 0;
    const pct = Math.round((val / total) * 100);
    const rowY = y + (idx * (rowH + 1.8));
    const col = getEditorialColor(label, idx);

    // Card background
    doc.setFillColor(250, 249, 246);
    doc.roundedRect(legX, rowY, legW, rowH, 0.8, 0.8, 'F');

    // Colored indicator dot
    doc.setFillColor(col[0], col[1], col[2]);
    doc.circle(legX + 3.5, rowY + (rowH / 2), 1.2, 'F');

    // Category label
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(63, 63, 70);
    doc.text(label, legX + 7, rowY + (rowH / 2) + 0.8);

    // Value and percentage
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor(24, 24, 27);
    doc.text(`${val}  (${pct}%)`, legX + legW - 3.5, rowY + (rowH / 2) + 0.8, { align: 'right' });
  });
}
