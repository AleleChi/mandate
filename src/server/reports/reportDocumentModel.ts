import { ComprehensiveAnalytics } from '../services/reportAnalyticsService';

export interface ReportKPI {
  label: string;
  value: string | number;
  sublabel: string;
  trend?: 'up' | 'down' | 'stable';
  color: 'gold' | 'green' | 'amber' | 'red' | 'charcoal';
}

export type ReportChartKind =
  | 'line'
  | 'bar'
  | 'horizontalBar'
  | 'stackedBar'
  | 'donut'
  | 'funnel'
  | 'timeline'
  | 'heatmap'
  | 'progress';

export interface ReportChartSeries {
  id: string;
  label: string;
  values: number[];
}

export interface ReportChartSpec {
  id: string;
  kind: ReportChartKind;
  title: string;
  subtitle?: string;
  labels: string[];
  series: ReportChartSeries[];
  unit?: 'count' | 'percentage' | 'seconds' | 'minutes' | 'ratio';
  valueFormat?: 'integer' | 'decimal' | 'percentage' | 'duration';
  xAxisLabel?: string;
  yAxisLabel?: string;
  showLegend?: boolean;
  caption: string;
  accessibleSummary: string;
  emptyState: string;
}

export interface ReportTableContent {
  headers: string[];
  rows: Array<Array<string | number>>;
  caption?: string;
  maxPreviewRows?: number;
}

export interface ReportFlowStep {
  id: string;
  label: string;
  value: number;
  supportingText?: string;
}

export interface ReportFlowContent {
  steps: ReportFlowStep[];
  caption?: string;
}

export interface ReportMetricGridItem {
  id: string;
  label: string;
  value: string | number;
  subtext?: string;
  status?: 'good' | 'warning' | 'critical' | 'neutral';
}

export interface ReportMetricGridContent {
  metrics: ReportMetricGridItem[];
  caption?: string;
}

export interface ReportCalloutContent {
  title?: string;
  message: string;
  variant?: 'info' | 'warning' | 'alert' | 'success';
}

export interface ReportNarrativeContent {
  text: string;
  bulletPoints?: string[];
}

export interface ReportNarrativeSection {
  id: string;
  title: string;
  type: 'narrative';
  description?: string;
  sourceLabel?: string;
  content: ReportNarrativeContent;
}

export interface ReportTableSection {
  id: string;
  title: string;
  type: 'table';
  description?: string;
  sourceLabel?: string;
  content: ReportTableContent;
}

export interface ReportChartSection {
  id: string;
  title: string;
  type: 'chart';
  description?: string;
  sourceLabel?: string;
  content: {
    charts?: ReportChartSpec[];
    lineChart?: { title: string; data: Array<{ label: string; value: number }> };
    barChart?: { title: string; data: Array<{ label: string; value: number }> };
    caption?: string;
  };
}

export interface ReportCalloutSection {
  id: string;
  title: string;
  type: 'callout';
  description?: string;
  sourceLabel?: string;
  content: ReportCalloutContent;
}

export interface ReportFlowSection {
  id: string;
  title: string;
  type: 'flow';
  description?: string;
  sourceLabel?: string;
  content: ReportFlowContent;
}

export interface ReportMetricGridSection {
  id: string;
  title: string;
  type: 'grid';
  description?: string;
  sourceLabel?: string;
  content: ReportMetricGridContent;
}

export interface ReportLegacySection {
  id: string;
  title: string;
  type: string;
  description?: string;
  sourceLabel?: string;
  content: any;
}

export type ReportSection =
  | ReportNarrativeSection
  | ReportTableSection
  | ReportChartSection
  | ReportCalloutSection
  | ReportFlowSection
  | ReportMetricGridSection
  | ReportLegacySection;

export interface ReportFinding {
  id: string;
  title: string;
  observation: string;
  severity?: 'info' | 'warning' | 'critical' | 'attention' | 'follow-up required' | string;
  supportingData?: string;
}

export interface ReportRecommendation {
  id: string;
  action: string;
  evidence?: string;
  rationale: string;
  priority: 'high' | 'medium' | 'low';
  responsibility: string;
}

export interface ReportDocumentModel {
  reportId: string;
  templateKey: string;
  templateVersion: number;
  reportTitle: string;
  reportDescription: string;
  eventContext: {
    eventId: string;
    eventTitle: string;
    startsAt: string;
  };
  branding: {
    organizationName: string;
    logoUrl?: string;
    logoBase64?: string;
    primaryColor: number[]; // RGB
    secondaryColor: number[]; // RGB
  };
  privacyClassification: string;
  intendedAudience: string;
  reportingPeriod: {
    start: string;
    end: string;
  };
  informationConfirmedUpTo: string;
  reportVersion: number;
  kpis: ReportKPI[];
  sections: ReportSection[];
  findings: ReportFinding[];
  recommendations: ReportRecommendation[];
  dataQuality: {
    score: number;
    status: 'High confidence' | 'Moderate confidence' | 'Limited information';
    notes: string;
  };
  methodology: string[];
  limitations: string[];
  appendix?: {
    title: string;
    headers: string[];
    rows: string[][];
  }[];
}

export function validateReportDocumentModel(model: ReportDocumentModel): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!model.reportTitle || typeof model.reportTitle !== 'string' || model.reportTitle.trim() === '') {
    errors.push('Missing report title.');
  }

  if (!model.eventContext || !model.eventContext.eventId || !model.eventContext.eventTitle) {
    errors.push('Missing event context.');
  }

  if (!Array.isArray(model.kpis)) {
    errors.push('KPIs must be an array.');
  }

  if (!Array.isArray(model.sections)) {
    errors.push('Sections must be an array.');
  } else {
    for (const sec of model.sections) {
      if (!sec.id || !sec.title || !sec.type) {
        errors.push(`Invalid section format in section "${sec?.title || 'unknown'}".`);
      }
      if (sec.type === 'chart' && sec.content?.charts) {
        for (const ch of sec.content.charts) {
          if (!ch.kind || !ch.title || !Array.isArray(ch.labels) || !Array.isArray(ch.series)) {
            errors.push(`Invalid chart specification in chart "${ch?.title || 'unknown'}".`);
          }
          if (ch.series.length > 8) {
            errors.push(`Chart "${ch.title}" exceeds maximum allowed series (8).`);
          }
          for (const s of ch.series) {
            if (s.values.length > 100) {
              errors.push(`Series "${s.label}" in chart "${ch.title}" exceeds max points (100).`);
            }
            if (s.values.some(v => !Number.isFinite(v))) {
              errors.push(`Non-finite numeric values found in chart "${ch.title}".`);
            }
          }
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
