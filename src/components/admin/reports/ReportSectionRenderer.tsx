import React from 'react';
import { ReportSection } from '../../../server/reports/reportDocumentModel';
import { ReportChartRenderer } from './ReportChartRenderer';
import { ReportSectionDivider } from './ReportSectionDivider';

interface ReportSectionRendererProps {
  section: ReportSection;
}

export const ReportSectionRenderer: React.FC<ReportSectionRendererProps> = ({ section }) => {
  const { title, description, type, content, sourceLabel } = section;

  return (
    <div className="py-6 space-y-6">
      {/* Section Divider & Heading */}
      <ReportSectionDivider title={title} description={description} />

      {/* Narrative Section */}
      {type === 'narrative' && content && (
        <div className="text-sm sm:text-base text-stone-700 font-sans leading-relaxed space-y-3 max-w-3xl">
          {content.text && <p className="leading-relaxed">{content.text}</p>}
          {content.bulletPoints && content.bulletPoints.length > 0 && (
            <ul className="space-y-1.5 text-stone-600 pl-4 border-l border-stone-200">
              {content.bulletPoints.map((bp: string, idx: number) => (
                <li key={idx} className="flex items-baseline gap-2">
                  <span className="text-[#C59B27] font-bold">•</span>
                  <span>{bp}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Publication Data Table (No heavy box borders) */}
      {type === 'table' && content && (
        <div className="overflow-x-auto my-4 font-sans">
          <table className="w-full text-xs sm:text-sm text-left border-collapse">
            <thead>
              <tr className="border-b-2 border-stone-800 text-stone-900">
                {content.headers?.map((h: string, idx: number) => (
                  <th key={idx} className="py-3 px-3 font-semibold text-xs uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200/70 text-stone-700">
              {content.rows?.map((row: any[], rIdx: number) => {
                const firstCell = String(row[0] || '').toLowerCase();
                let cohortIndicatorColor: string | null = null;
                if (firstCell.includes('under 4')) cohortIndicatorColor = '#10B981';
                else if (firstCell.includes('1 to 3') || firstCell.includes('1-3')) cohortIndicatorColor = '#84CC16';
                else if (firstCell.includes('4 to 6') || firstCell.includes('4-6')) cohortIndicatorColor = '#C59B27';
                else if (firstCell.includes('7 to 9') || firstCell.includes('7-9')) cohortIndicatorColor = '#A67C2E';
                else if (firstCell.includes('10 to 12') || firstCell.includes('10-12')) cohortIndicatorColor = '#D97706';
                else if (firstCell.includes('teen') || firstCell.includes('13+')) cohortIndicatorColor = '#4B5563';

                return (
                  <tr key={rIdx} className="hover:bg-stone-50/70 transition-colors">
                    {row.map((cell: any, cIdx: number) => {
                      const cellStr = String(cell);
                      const isLastCell = cIdx === row.length - 1;

                      return (
                        <td key={cIdx} className="py-3.5 px-3 whitespace-normal break-words">
                          {cIdx === 0 && cohortIndicatorColor ? (
                            <span className="inline-flex items-center gap-2">
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ backgroundColor: cohortIndicatorColor }}
                              />
                              <span className="font-medium text-stone-900">{cellStr}</span>
                            </span>
                          ) : (
                            <span className={isLastCell ? 'font-medium text-stone-900' : 'text-stone-700'}>
                              {cellStr}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {content.caption && (
            <p className="text-xs text-stone-400 mt-3 italic">{content.caption}</p>
          )}
        </div>
      )}

      {/* Chart Section */}
      {type === 'chart' && content && (
        <div className="space-y-6 my-4">
          {content.charts && content.charts.length > 0 ? (
            content.charts.map((chartSpec: any, idx: number) => (
              <ReportChartRenderer key={chartSpec.id || idx} chart={chartSpec} />
            ))
          ) : (
            <>
              {content.lineChart && (
                <ReportChartRenderer
                  chart={{
                    id: 'line-chart-legacy',
                    kind: 'line',
                    title: content.lineChart.title,
                    labels: content.lineChart.data?.map((d: any) => d.label) || [],
                    series: [{ id: 's1', label: 'Value', values: content.lineChart.data?.map((d: any) => d.value) || [] }],
                    caption: content.lineChart.caption || `${content.lineChart.title || 'Check-in activity'} recorded across event hours.`,
                    accessibleSummary: content.lineChart.title,
                    emptyState: 'No line chart data available.'
                  }}
                />
              )}
              {content.barChart && (
                <ReportChartRenderer
                  chart={{
                    id: 'bar-chart-legacy',
                    kind: 'bar',
                    title: content.barChart.title,
                    labels: content.barChart.data?.map((d: any) => d.label) || [],
                    series: [{ id: 's1', label: 'Value', values: content.barChart.data?.map((d: any) => d.value) || [] }],
                    caption: content.barChart.caption || `${content.barChart.title || 'Volume distribution'} recorded across event categories.`,
                    accessibleSummary: content.barChart.title,
                    emptyState: 'No bar chart data available.'
                  }}
                />
              )}
            </>
          )}
        </div>
      )}

      {/* Restrained Factual Callout (Left accent line, no giant colored card) */}
      {type === 'callout' && content && (
        <div className="border-l-2 border-[#C59B27] pl-4 py-2 my-4 text-xs sm:text-sm font-sans text-stone-800 space-y-1">
          {content.title && (
            <h4 className="font-semibold text-stone-900 tracking-tight">{content.title}</h4>
          )}
          {content.message && <p className="leading-relaxed text-stone-700">{content.message}</p>}
          {content.points && (
            <ul className="space-y-1 mt-2 text-stone-600">
              {content.points.map((p: string, idx: number) => (
                <li key={idx} className="flex items-baseline gap-2">
                  <span className="text-[#C59B27]">•</span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Flow Steps (Publication timeline) */}
      {type === 'flow' && content && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 py-4">
          {content.steps?.map((step: any, idx: number) => (
            <div key={step.id || idx} className="space-y-1 border-t border-stone-200 pt-3">
              <span className="text-[10px] font-sans font-semibold uppercase tracking-wider text-stone-400 block">
                Stage {idx + 1}: {step.label}
              </span>
              <span className="text-2xl font-serif font-normal text-stone-900 block tabular-nums">
                {step.value}
              </span>
              {step.supportingText && (
                <span className="text-xs text-stone-500 font-sans block">{step.supportingText}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Metric Grid (Minimal figures) */}
      {type === 'grid' && content && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 py-4">
          {content.metrics?.map((item: any, idx: number) => (
            <div key={item.id || idx} className="space-y-1 border-t border-stone-200 pt-3">
              <span className="text-xs font-medium text-stone-500 font-sans block">{item.label}</span>
              <span className="text-2xl font-serif font-normal text-stone-900 block tabular-nums">{item.value}</span>
              {item.subtext && <span className="text-xs text-stone-400 font-sans block">{item.subtext}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
