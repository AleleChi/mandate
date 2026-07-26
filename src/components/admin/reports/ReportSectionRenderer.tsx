import React from 'react';
import { ReportSection } from '../../../server/reports/reportDocumentModel';
import { ReportChartRenderer } from './ReportChartRenderer';

interface ReportSectionRendererProps {
  section: ReportSection;
}

export const ReportSectionRenderer: React.FC<ReportSectionRendererProps> = ({ section }) => {
  const { title, description, type, content, sourceLabel } = section;

  return (
    <div className="bg-white border border-stone-200/80 rounded-xl p-5 mb-5 shadow-xs space-y-3">
      <div className="flex items-start justify-between border-b border-stone-100 pb-2.5">
        <div>
          <h3 className="text-sm font-serif font-semibold text-stone-900 tracking-tight">{title}</h3>
          {description && <p className="text-xs text-stone-500 mt-0.5">{description}</p>}
        </div>
        {sourceLabel && (
          <span className="text-[10px] bg-stone-100 text-stone-600 px-2 py-0.5 rounded font-mono font-medium">
            {sourceLabel}
          </span>
        )}
      </div>

      {type === 'narrative' && content && (
        <div className="text-xs text-stone-700 leading-relaxed space-y-2">
          {content.text && <p className="leading-relaxed">{content.text}</p>}
          {content.bulletPoints && content.bulletPoints.length > 0 && (
            <ul className="list-disc list-inside space-y-1 text-stone-600 pl-1">
              {content.bulletPoints.map((bp: string, idx: number) => (
                <li key={idx}>{bp}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {type === 'table' && content && (
        <div className="overflow-x-auto my-2">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-stone-50 border-y border-stone-200 text-stone-600 font-medium">
                {content.headers?.map((h: string, idx: number) => (
                  <th key={idx} className="py-2 px-3 font-semibold text-[11px]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 text-stone-700">
              {content.rows?.map((row: any[], rIdx: number) => {
                const firstCell = String(row[0] || '').toLowerCase();
                let cohortDotColor: string | null = null;
                if (firstCell.includes('under 4')) cohortDotColor = '#10B981';
                else if (firstCell.includes('1 to 3') || firstCell.includes('1-3')) cohortDotColor = '#84CC16';
                else if (firstCell.includes('4 to 6') || firstCell.includes('4-6')) cohortDotColor = '#C59B27';
                else if (firstCell.includes('7 to 9') || firstCell.includes('7-9')) cohortDotColor = '#A67C2E';
                else if (firstCell.includes('10 to 12') || firstCell.includes('10-12')) cohortDotColor = '#D97706';
                else if (firstCell.includes('teen') || firstCell.includes('13+')) cohortDotColor = '#4B5563';

                return (
                  <tr key={rIdx} className="hover:bg-stone-50/50 transition-colors">
                    {row.map((cell: any, cIdx: number) => {
                      const cellStr = String(cell);
                      const isYieldCell = cIdx === row.length - 1 && cellStr.includes('%');
                      const pctVal = parseFloat(cellStr);

                      return (
                        <td key={cIdx} className="py-2.5 px-3 whitespace-normal break-words">
                          {cIdx === 0 && cohortDotColor ? (
                            <span className="inline-flex items-center gap-2">
                              <span 
                                className="w-2.5 h-2.5 rounded-full shrink-0" 
                                style={{ backgroundColor: cohortDotColor }} 
                              />
                              <span className="font-medium text-stone-900">{cellStr}</span>
                            </span>
                          ) : isYieldCell && !isNaN(pctVal) ? (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${
                              pctVal >= 70 
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                                : pctVal >= 40 
                                ? 'bg-amber-50 text-amber-800 border-amber-200' 
                                : 'bg-red-50 text-red-800 border-red-200'
                            }`}>
                              {cellStr}
                            </span>
                          ) : (
                            cellStr
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
            <p className="text-[11px] text-stone-500 mt-2 italic">{content.caption}</p>
          )}
        </div>
      )}

      {type === 'chart' && content && (
        <div className="space-y-4">
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

      {type === 'callout' && content && (
        <div className={`p-4 rounded-xl border text-xs leading-relaxed ${
          content.theme === 'warning' || content.variant === 'warning'
            ? 'bg-amber-50/60 border-amber-200 text-amber-900'
            : content.theme === 'success' || content.variant === 'success'
            ? 'bg-emerald-50/60 border-emerald-200 text-emerald-900'
            : 'bg-stone-50 border-stone-200 text-stone-800'
        }`}>
          {content.title && <h4 className="font-semibold text-sm mb-1">{content.title}</h4>}
          {content.message && <p>{content.message}</p>}
          {content.points && (
            <ul className="list-disc list-inside space-y-1 mt-2">
              {content.points.map((p: string, idx: number) => (
                <li key={idx}>{p}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {type === 'flow' && content && (
        <div className="space-y-2 py-2">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {content.steps?.map((step: any, idx: number) => (
              <div key={step.id || idx} className="bg-stone-50 border border-stone-200 p-3 rounded-lg text-center">
                <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500 block">
                  Step {idx + 1}: {step.label}
                </span>
                <span className="text-xl font-serif font-bold text-stone-900 my-1 block">
                  {step.value}
                </span>
                {step.supportingText && (
                  <span className="text-[10px] text-stone-500">{step.supportingText}</span>
                )}
              </div>
            ))}
          </div>
          {content.caption && <p className="text-[11px] text-stone-500 italic mt-1">{content.caption}</p>}
        </div>
      )}

      {type === 'grid' && content && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 my-2">
          {content.metrics?.map((item: any, idx: number) => (
            <div key={item.id || idx} className="bg-stone-50 border border-stone-200/80 p-3 rounded-lg">
              <span className="text-[11px] font-medium text-stone-600 block">{item.label}</span>
              <span className="text-lg font-serif font-bold text-stone-900 my-0.5 block">{item.value}</span>
              {item.subtext && <span className="text-[10px] text-stone-500">{item.subtext}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
