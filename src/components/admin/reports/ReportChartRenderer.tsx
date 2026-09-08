import React from 'react';
import { ReportChartSpec } from '../../../server/reports/reportDocumentModel';

interface ReportChartRendererProps {
  chart: ReportChartSpec;
}

// Restrained palette: Koinonia Gold accent, charcoal, neutral grey, emerald green
const COLORS = [
  '#C59B27', // Koinonia Antique Gold
  '#3F3F46', // Charcoal
  '#16835D', // Emerald Green (completion/attendance)
  '#71717A', // Neutral Grey
  '#A37D1E', // Deep Brass Gold
  '#A8A29E', // Warm Grey
  '#D08A1D', // Amber
];

const getSeriesColor = (label: string, index: number): string => {
  const l = (label || '').toLowerCase();
  if (l.includes('attended') || l.includes('arrival') || l.includes('check')) return '#16835D'; // Emerald
  if (l.includes('picked') || l.includes('release')) return '#3F3F46'; // Charcoal
  if (l.includes('registered') || l.includes('expected') || l.includes('selected')) return '#C59B27'; // Gold
  return COLORS[index % COLORS.length];
};

const getCohortColor = (label: string, fallbackColor: string): string => {
  const l = (label || '').toLowerCase();
  if (l.includes('under 4') || l.includes('below 1') || l.includes('0-3')) return '#16835D';
  if (l.includes('1-3') || l.includes('1 to 3')) return '#A37D1E';
  if (l.includes('4-6') || l.includes('4 to 6')) return '#C59B27';
  if (l.includes('7-9') || l.includes('7 to 9')) return '#71717A';
  if (l.includes('10-12') || l.includes('10 to 12')) return '#3F3F46';
  if (l.includes('teen') || l.includes('13+')) return '#52525B';
  return fallbackColor;
};

export const ReportChartRenderer: React.FC<ReportChartRendererProps> = ({ chart }) => {
  const { kind, title, subtitle, labels, series, caption, accessibleSummary, emptyState } = chart;

  const allValues = (series || []).flatMap(s => s.values || []);
  const hasValues = allValues.length > 0 && allValues.some(v => typeof v === 'number' && v > 0);

  if (!labels || labels.length === 0 || !series || series.length === 0 || !hasValues) {
    return (
      <div className="bg-[#FAF9F6] border border-stone-200/80 rounded-xl p-6 text-center text-xs text-stone-500 my-4">
        <p className="font-medium text-stone-700 mb-1">{title}</p>
        <p>{emptyState || 'No dataset points recorded for this metric.'}</p>
      </div>
    );
  }

  const renderBarChart = () => {
    const maxVal = Math.max(...series.flatMap(s => s.values), 1);
    const isMultiSeries = series.length > 1;

    return (
      <div className="space-y-4">
        {labels.map((label, idx) => (
          <div key={idx} className="space-y-1.5">
            <div className="flex justify-between items-center text-xs font-medium text-stone-700">
              <span className="font-semibold text-stone-900">{label}</span>
              <span className="tabular-nums text-stone-600">
                {series.map(s => `${s.label ? s.label + ': ' : ''}${s.values[idx] || 0}`).join('  |  ')}
              </span>
            </div>

            {isMultiSeries ? (
              <div className="space-y-1 pl-2 border-l-2 border-stone-200">
                {series.map((s, sIdx) => {
                  const val = s.values[idx] || 0;
                  const pct = Math.min((val / maxVal) * 100, 100);
                  const color = getSeriesColor(s.label, sIdx);
                  return (
                    <div key={s.id || sIdx} className="flex items-center gap-2 text-[11px]">
                      <span className="w-28 text-stone-600 truncate text-right font-normal">{s.label || `Series ${sIdx + 1}`}</span>
                      <div className="flex-1 bg-stone-100 h-3.5 rounded-md overflow-hidden relative">
                        <div
                          style={{ width: `${pct}%`, backgroundColor: color }}
                          className="h-full rounded-md transition-all duration-300"
                        />
                      </div>
                      <span className="w-8 tabular-nums font-medium text-stone-800 text-right">{val}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="w-full bg-stone-100 h-4 rounded-md overflow-hidden relative">
                <div
                  style={{
                    width: `${Math.min(((series[0]?.values[idx] || 0) / maxVal) * 100, 100)}%`,
                    backgroundColor: getCohortColor(label, COLORS[idx % COLORS.length])
                  }}
                  className="h-full rounded-md transition-all duration-300"
                />
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  const renderHorizontalBarChart = () => {
    const maxVal = Math.max(...series.flatMap(s => s.values), 1);
    const isMultiSeries = series.length > 1;

    if (isMultiSeries) {
      return (
        <div className="space-y-4">
          {/* Legend */}
          <div className="flex flex-wrap gap-4 text-xs mb-1">
            {series.map((s, sIdx) => (
              <div key={s.id || sIdx} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: getSeriesColor(s.label, sIdx) }} />
                <span className="text-stone-600 font-medium">{s.label || `Series ${sIdx + 1}`}</span>
              </div>
            ))}
          </div>
          {labels.map((label, idx) => (
            <div key={idx} className="space-y-1.5">
              <div className="flex justify-between items-center text-xs font-medium text-stone-700">
                <span className="font-semibold text-stone-900">{label}</span>
                <span className="tabular-nums text-stone-600">
                  {series.map(s => `${s.label ? s.label + ': ' : ''}${s.values[idx] || 0}`).join('  |  ')}
                </span>
              </div>
              <div className="space-y-1 pl-2 border-l-2 border-stone-200">
                {series.map((s, sIdx) => {
                  const val = s.values[idx] || 0;
                  const pct = Math.min((val / maxVal) * 100, 100);
                  const color = getSeriesColor(s.label, sIdx);
                  return (
                    <div key={s.id || sIdx} className="flex items-center gap-2 text-[11px]">
                      <span className="w-24 text-stone-600 truncate text-right font-normal">{s.label || `Series ${sIdx + 1}`}</span>
                      <div className="flex-1 bg-stone-100 h-3.5 rounded-md overflow-hidden relative">
                        <div
                          style={{ width: `${pct}%`, backgroundColor: color }}
                          className="h-full rounded-md transition-all duration-300"
                        />
                      </div>
                      <span className="w-8 tabular-nums font-medium text-stone-800 text-right">{val}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className="space-y-2.5">
        {labels.map((label, idx) => {
          const val = series[0]?.values[idx] || 0;
          const pct = Math.min((val / maxVal) * 100, 100);
          const color = getCohortColor(label, COLORS[idx % COLORS.length]);
          return (
            <div key={idx} className="flex items-center gap-3 text-xs">
              <span className="w-28 text-stone-600 truncate font-medium text-right">{label}</span>
              <div className="flex-1 bg-stone-100 h-4 rounded-md overflow-hidden relative">
                <div
                  style={{ width: `${pct}%`, backgroundColor: color }}
                  className="h-full rounded-md transition-all duration-300"
                />
              </div>
              <span className="w-12 tabular-nums font-semibold text-stone-800 text-right">{val}</span>
            </div>
          );
        })}
      </div>
    );
  };

  const renderDonutChart = () => {
    const total = series[0]?.values.reduce((a, b) => a + b, 0) || 1;
    let accumulated = 0;

    return (
      <div className="flex flex-col sm:flex-row items-center gap-6">
        <div className="relative w-36 h-36 shrink-0">
          <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
            {labels.map((label, idx) => {
              const val = series[0]?.values[idx] || 0;
              const pct = (val / total) * 100;
              const strokeDasharray = `${pct} ${100 - pct}`;
              const strokeDashoffset = -accumulated;
              accumulated += pct;
              return (
                <circle
                  key={idx}
                  cx="18"
                  cy="18"
                  r="15.91549430918954"
                  fill="transparent"
                  stroke={COLORS[idx % COLORS.length]}
                  strokeWidth="3.8"
                  strokeDasharray={strokeDasharray}
                  strokeDashoffset={strokeDashoffset}
                />
              );
            })}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-xs font-semibold text-stone-900 tabular-nums">{total}</span>
            <span className="text-[10px] text-stone-500 uppercase tracking-wider font-semibold">Total</span>
          </div>
        </div>
        <div className="flex-1 space-y-1.5 w-full">
          {labels.map((label, idx) => {
            const val = series[0]?.values[idx] || 0;
            const pct = Math.round((val / total) * 100);
            return (
              <div key={idx} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full inline-block shrink-0" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                  <span className="text-stone-700">{label}</span>
                </div>
                <span className="tabular-nums text-stone-900 font-semibold">{val} ({pct}%)</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderLineChart = () => {
    const maxVal = Math.max(...series.flatMap(s => s.values), 1);
    const height = 140;
    const width = 480;
    const padding = 20;

    return (
      <div className="space-y-2">
        <div className="w-full overflow-x-auto">
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-36 min-w-[320px]">
            {/* Grid lines */}
            {[0, 0.5, 1].map((ratio, i) => (
              <line
                key={i}
                x1={padding}
                y1={padding + ratio * (height - 2 * padding)}
                x2={width - padding}
                y2={padding + ratio * (height - 2 * padding)}
                stroke="#E7E5E4"
                strokeDasharray="3 3"
              />
            ))}

            {series.map((s, sIdx) => {
              const points = s.values.map((val, idx) => {
                const x = padding + (idx / Math.max(labels.length - 1, 1)) * (width - 2 * padding);
                const y = height - padding - (val / maxVal) * (height - 2 * padding);
                return `${x},${y}`;
              }).join(' ');

              return (
                <g key={s.id || sIdx}>
                  <polyline
                    fill="none"
                    stroke={COLORS[sIdx % COLORS.length]}
                    strokeWidth="2.5"
                    points={points}
                  />
                  {s.values.map((val, idx) => {
                    const x = padding + (idx / Math.max(labels.length - 1, 1)) * (width - 2 * padding);
                    const y = height - padding - (val / maxVal) * (height - 2 * padding);
                    return (
                      <circle
                        key={idx}
                        cx={x}
                        cy={y}
                        r="3.5"
                        fill="#FFFFFF"
                        stroke={COLORS[sIdx % COLORS.length]}
                        strokeWidth="2"
                      />
                    );
                  })}
                </g>
              );
            })}
          </svg>
        </div>
        <div className="flex justify-between text-[11px] text-stone-500 font-medium px-2">
          {labels.map((l, i) => (
            <span key={i} className="truncate max-w-[60px] text-center">{l}</span>
          ))}
        </div>
      </div>
    );
  };

  const renderFunnelChart = () => {
    const maxVal = series[0]?.values[0] || 1;
    return (
      <div className="space-y-3 max-w-md mx-auto">
        {labels.map((label, idx) => {
          const val = series[0]?.values[idx] || 0;
          const pct = Math.max(Math.round((val / maxVal) * 100), 10);
          return (
            <div key={idx} className="flex flex-col items-center">
              <div
                style={{ width: `${pct}%`, backgroundColor: COLORS[idx % COLORS.length] }}
                className="py-2 px-3 rounded-lg text-white text-xs text-center shadow-xs transition-all flex justify-between items-center min-w-[120px]"
              >
                <span className="font-medium truncate mr-2">{label}</span>
                <span className="tabular-nums font-bold shrink-0">{val}</span>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div
      className="bg-white border border-stone-200 rounded-xl p-5 shadow-xs my-3"
      role="region"
      aria-label={accessibleSummary || title}
    >
      <div className="mb-4">
        <h4 className="text-sm font-semibold text-stone-900">{title}</h4>
        {subtitle && <p className="text-xs text-stone-500 mt-0.5">{subtitle}</p>}
      </div>

      <div className="my-2">
        {kind === 'bar' || kind === 'stackedBar' ? renderBarChart() : null}
        {kind === 'horizontalBar' || kind === 'progress' ? renderHorizontalBarChart() : null}
        {kind === 'donut' ? renderDonutChart() : null}
        {kind === 'line' || kind === 'timeline' || kind === 'heatmap' ? renderLineChart() : null}
        {kind === 'funnel' ? renderFunnelChart() : null}
      </div>

      {series.length > 1 && (
        <div className="flex flex-wrap gap-4 mt-4 pt-3 border-t border-stone-100 text-xs">
          {series.map((s, idx) => (
            <div key={s.id || idx} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: getSeriesColor(s.label, idx) }} />
              <span className="text-stone-700 font-medium">{s.label}</span>
            </div>
          ))}
        </div>
      )}

      {caption && (
        <p className="text-[11px] text-stone-500 leading-relaxed mt-3 pt-2 border-t border-stone-100 italic">
          {caption}
        </p>
      )}
    </div>
  );
};
