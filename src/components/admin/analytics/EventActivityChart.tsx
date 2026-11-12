import React, { useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip
} from 'recharts';
import { AnalyticsTimelineBucket } from './types';

interface EventActivityChartProps {
  timeline: AnalyticsTimelineBucket[];
  timeZone?: string;
}

export const EventActivityChart: React.FC<EventActivityChartProps> = ({ timeline, timeZone }) => {
  const [mode, setMode] = useState<'interval' | 'cumulative'>('interval');

  return (
    <section className="bg-white border border-zinc-200 rounded-md p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">Event Activity Over Time</h2>
          <p className="text-xs text-zinc-500">
            15-minute intervals ({timeZone || 'Europe/London'}) · Check-ins vs Pickups
          </p>
        </div>

        <div className="inline-flex border border-zinc-200 rounded-md overflow-hidden bg-[#FAF9F5]">
          <button
            type="button"
            onClick={() => setMode('interval')}
            className={`px-3 py-1 text-xs font-medium transition-colors ${
              mode === 'interval'
                ? 'bg-zinc-900 text-white'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            Activity
          </button>
          <button
            type="button"
            onClick={() => setMode('cumulative')}
            className={`px-3 py-1 text-xs font-medium border-l border-zinc-200 transition-colors ${
              mode === 'cumulative'
                ? 'bg-zinc-900 text-white'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            Cumulative
          </button>
        </div>
      </div>

      {!timeline || timeline.length === 0 ? (
        <div className="h-56 flex items-center justify-center border border-dashed border-zinc-200 rounded bg-[#FAF9F5] text-xs text-zinc-500">
          No check-in or pickup activity recorded for the selected filters yet.
        </div>
      ) : (
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={timeline} margin={{ top: 8, right: 16, left: -12, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E4E4E7" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: '#71717A' }}
                axisLine={{ stroke: '#E4E4E7' }}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: '#71717A' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#FFFFFF',
                  borderColor: '#E4E4E7',
                  borderRadius: '6px',
                  fontSize: '12px',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.06)'
                }}
              />
              <Line
                type="monotone"
                dataKey={mode === 'interval' ? 'checkIns' : 'cumulativeCheckIns'}
                name={mode === 'interval' ? 'Check-ins' : 'Total checked in'}
                stroke="#18181B"
                strokeWidth={2}
                dot={{ r: 2.5, fill: '#18181B' }}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey={mode === 'interval' ? 'pickups' : 'cumulativePickups'}
                name={mode === 'interval' ? 'Pickups' : 'Total picked up'}
                stroke="#C59B27"
                strokeWidth={2}
                dot={{ r: 2.5, fill: '#C59B27' }}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="mt-3 flex items-center gap-5 text-xs text-zinc-600">
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-0.5 bg-zinc-900" />
          <span>Check-ins</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-0.5 bg-[#C59B27]" />
          <span>Pickups</span>
        </div>
      </div>
    </section>
  );
};

