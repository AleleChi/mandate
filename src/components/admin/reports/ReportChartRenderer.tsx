import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';
import { ReportChartSpec } from '../../../server/reports/reportDocumentModel';

interface ReportChartRendererProps {
  chart: ReportChartSpec;
}

// Curated Koinonia editorial palette
const COLORS = [
  '#C59B27', // Koinonia Gold
  '#16835D', // Emerald Green
  '#2563EB', // Sapphire Blue
  '#3F3F46', // Charcoal
  '#D97706', // Warm Amber
  '#7C3AED', // Regal Violet
  '#0D9488', // Deep Teal
  '#71717A'  // Neutral Slate
];

const getSeriesColor = (label: string, index: number): string => {
  const l = (label || '').toLowerCase();
  if (l.includes('attended') || l.includes('arrival') || l.includes('check-in') || l.includes('checked_in')) return '#16835D';
  if (l.includes('picked') || l.includes('release') || l.includes('picked_up')) return '#3F3F46';
  if (l.includes('selected') || l.includes('pass_ready') || l.includes('registered') || l.includes('expected')) return '#C59B27';
  if (l.includes('review') || l.includes('pending') || l.includes('waiting')) return '#D97706';
  if (l.includes('not selected') || l.includes('rejected') || l.includes('incident')) return '#E11D48';
  return COLORS[index % COLORS.length];
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[#18181B] text-white px-3 py-2.5 rounded-xl shadow-xl border border-zinc-700/60 text-xs space-y-1 z-50">
        {label && <p className="font-semibold text-zinc-300 border-b border-zinc-800 pb-1 mb-1">{label}</p>}
        {payload.map((entry: any, index: number) => (
          <div key={`item-${index}`} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-zinc-300">
              <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: entry.color || entry.fill }} />
              {entry.name || 'Count'}:
            </span>
            <span className="font-bold text-white tabular-nums">{Number(entry.value).toLocaleString()}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export const ReportChartRenderer: React.FC<ReportChartRendererProps> = ({ chart }) => {
  const { kind, title, subtitle, labels, series, caption, accessibleSummary, emptyState } = chart;

  const allValues = (series || []).flatMap(s => s.values || []);
  const hasValues = allValues.length > 0 && allValues.some(v => typeof v === 'number' && v > 0);

  if (!labels || labels.length === 0 || !series || series.length === 0 || !hasValues) {
    return (
      <div className="bg-[#FAF9F5] border border-stone-200/80 rounded-2xl p-6 text-center text-xs text-stone-500 my-4 shadow-2xs">
        <p className="font-semibold text-stone-700 mb-1">{title}</p>
        <p>{emptyState || 'No live activity points recorded for this dataset.'}</p>
      </div>
    );
  }

  // Transform labels & series into Recharts tabular data format
  const chartData = labels.map((label, idx) => {
    const item: Record<string, any> = { name: label };
    series.forEach(s => {
      item[s.label || s.id] = s.values[idx] || 0;
    });
    return item;
  });

  // For donut charts
  const donutData = labels.map((label, idx) => ({
    name: label,
    value: series[0]?.values[idx] || 0,
    color: getSeriesColor(label, idx)
  })).filter(d => d.value > 0);

  const totalDonutValue = donutData.reduce((acc, curr) => acc + curr.value, 0);

  const renderDonutChart = () => (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center my-2">
      <div className="md:col-span-6 flex justify-center relative">
        <div className="w-52 h-52 relative">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={donutData}
                innerRadius={62}
                outerRadius={86}
                paddingAngle={3}
                dataKey="value"
                stroke="none"
              >
                {donutData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
            <span className="text-2xl font-bold text-stone-900 tabular-nums tracking-tight">
              {totalDonutValue.toLocaleString()}
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">
              Total Count
            </span>
          </div>
        </div>
      </div>
      <div className="md:col-span-6 space-y-2">
        {donutData.map((entry, idx) => {
          const pct = totalDonutValue > 0 ? Math.round((entry.value / totalDonutValue) * 100) : 0;
          return (
            <div key={idx} className="flex items-center justify-between p-2 rounded-xl bg-stone-50/70 hover:bg-stone-50 text-xs transition-colors">
              <div className="flex items-center gap-2.5 min-w-0 pr-2">
                <span className="w-3 h-3 rounded-full shrink-0 shadow-2xs" style={{ backgroundColor: entry.color }} />
                <span className="font-medium text-stone-700 truncate">{entry.name}</span>
              </div>
              <div className="flex items-center gap-2 text-right shrink-0">
                <span className="font-bold text-stone-900 tabular-nums">{entry.value.toLocaleString()}</span>
                <span className="text-[11px] font-semibold text-stone-400 w-10 text-right tabular-nums">({pct}%)</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderBarChart = (isStacked: boolean = false) => (
    <div className="h-64 w-full my-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F0EFEA" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: '#71717A' }}
            interval={0}
            angle={chartData.length > 5 ? -25 : 0}
            textAnchor={chartData.length > 5 ? 'end' : 'middle'}
            height={chartData.length > 5 ? 45 : 30}
          />
          <YAxis tick={{ fontSize: 11, fill: '#71717A' }} allowDecimals={false} />
          <Tooltip content={<CustomTooltip />} />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />}
          {series.map((s, idx) => (
            <Bar
              key={s.id || s.label}
              dataKey={s.label || s.id}
              fill={getSeriesColor(s.label, idx)}
              stackId={isStacked ? 'stack' : undefined}
              radius={isStacked ? [0, 0, 0, 0] : [4, 4, 0, 0]}
              maxBarSize={48}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );

  const renderHorizontalBarChart = () => (
    <div className="h-64 w-full my-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          layout="vertical"
          data={chartData}
          margin={{ top: 10, right: 20, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#F0EFEA" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 11, fill: '#71717A' }} allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fontSize: 11, fill: '#52525B' }}
            width={110}
          />
          <Tooltip content={<CustomTooltip />} />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />}
          {series.map((s, idx) => (
            <Bar
              key={s.id || s.label}
              dataKey={s.label || s.id}
              fill={getSeriesColor(s.label, idx)}
              radius={[0, 4, 4, 0]}
              maxBarSize={28}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );

  const renderAreaChart = () => {
    const primarySeries = series[0];
    const gradColor = getSeriesColor(primarySeries?.label, 0);

    return (
      <div className="h-64 w-full my-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
            <defs>
              <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={gradColor} stopOpacity={0.4} />
                <stop offset="95%" stopColor={gradColor} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#F0EFEA" vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11, fill: '#71717A' }}
              interval={0}
              angle={chartData.length > 6 ? -25 : 0}
              textAnchor={chartData.length > 6 ? 'end' : 'middle'}
              height={chartData.length > 6 ? 45 : 30}
            />
            <YAxis tick={{ fontSize: 11, fill: '#71717A' }} allowDecimals={false} />
            <Tooltip content={<CustomTooltip />} />
            {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />}
            {series.map((s, idx) => (
              <Area
                key={s.id || s.label}
                type="monotone"
                dataKey={s.label || s.id}
                stroke={getSeriesColor(s.label, idx)}
                strokeWidth={2.5}
                fill={idx === 0 ? 'url(#areaGradient)' : 'none'}
                dot={{ r: 3.5, fill: '#FFFFFF', stroke: getSeriesColor(s.label, idx), strokeWidth: 2 }}
                activeDot={{ r: 5, strokeWidth: 0 }}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  };

  return (
    <div
      className="border-y border-stone-200/80 py-4 my-6 space-y-3 font-sans"
      role="region"
      aria-label={accessibleSummary || title}
    >
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1 border-b border-stone-100 pb-3">
        <div>
          <h4 className="text-sm sm:text-base font-serif font-bold text-stone-900 tracking-tight">{title}</h4>
          {subtitle && <p className="text-xs text-stone-500 mt-0.5">{subtitle}</p>}
        </div>
        {series.length === 1 && series[0].values.length > 0 && (
          <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider tabular-nums">
            Total: {allValues.reduce((a, b) => a + b, 0).toLocaleString()}
          </span>
        )}
      </div>

      <div className="pt-1">
        {kind === 'donut' ? renderDonutChart() : null}
        {kind === 'bar' ? renderBarChart(false) : null}
        {kind === 'stackedBar' ? renderBarChart(true) : null}
        {kind === 'horizontalBar' || kind === 'progress' ? renderHorizontalBarChart() : null}
        {kind === 'line' || kind === 'timeline' || kind === 'heatmap' ? renderAreaChart() : null}
        {kind === 'funnel' ? renderHorizontalBarChart() : null}
      </div>

      {caption && (
        <p className="text-[11px] text-stone-500 leading-relaxed pt-2.5 border-t border-stone-100 italic">
          {caption}
        </p>
      )}
    </div>
  );
};
