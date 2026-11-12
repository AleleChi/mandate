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
}

export const EventActivityChart: React.FC<EventActivityChartProps> = ({ timeline }) => {
  const [mode, setMode] = useState<'interval' | 'cumulative'>('interval');

  return (
    <section className="space-y-4 pb-8 border-b border-zinc-200">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-zinc-900">Event activity</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Completed check-ins and pickups by time.
          </p>
        </div>

        <div className="flex items-center gap-4 border-b border-zinc-200 text-xs">
          <button
            type="button"
            onClick={() => setMode('interval')}
            className={`pb-1.5 border-b-2 transition-colors cursor-pointer ${
              mode === 'interval'
                ? 'border-[#C59B27] text-zinc-900 font-semibold'
                : 'border-transparent text-zinc-500 hover:text-zinc-900'
            }`}
          >
            By interval
          </button>
          <button
            type="button"
            onClick={() => setMode('cumulative')}
            className={`pb-1.5 border-b-2 transition-colors cursor-pointer ${
              mode === 'cumulative'
                ? 'border-[#C59B27] text-zinc-900 font-semibold'
                : 'border-transparent text-zinc-500 hover:text-zinc-900'
            }`}
          >
            Cumulative
          </button>
        </div>
      </div>

      {!timeline || timeline.length === 0 ? (
        <div className="h-52 flex items-center justify-center border-y border-zinc-200 bg-white text-xs text-zinc-500">
          No check-in or pickup activity recorded yet.
        </div>
      ) : (
        <div className="bg-white border-y border-zinc-200 py-4 px-2">
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
                    borderRadius: '4px',
                    fontSize: '12px'
                  }}
                />
                <Line
                  type="monotone"
                  dataKey={mode === 'interval' ? 'checkIns' : 'cumulativeCheckIns'}
                  name={mode === 'interval' ? 'Check-ins' : 'Total checked in'}
                  stroke="#18181B"
                  strokeWidth={2}
                  dot={{ r: 2, fill: '#18181B' }}
                  activeDot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey={mode === 'interval' ? 'pickups' : 'cumulativePickups'}
                  name={mode === 'interval' ? 'Pickups' : 'Total picked up'}
                  stroke="#C59B27"
                  strokeWidth={2}
                  dot={{ r: 2, fill: '#C59B27' }}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-2 px-3 flex items-center gap-5 text-xs text-zinc-600">
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-0.5 bg-zinc-900" />
              <span>Check-ins</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-0.5 bg-[#C59B27]" />
              <span>Pickups</span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
