'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis, XAxis } from 'recharts';
import { Cpu, MemoryStick, Clock } from 'lucide-react';
import { api, type Project } from '../lib/api';
interface Metrics {
  cpu: number | null;
  memory: string | null;
  memoryPercent: number | null;
  state: string;
  startedAt: string;
}
interface Sample {
  time: string;
  cpu: number;
  memory: number;
}
export function ServiceMetrics({ project: p }: { project: Project }) {
  const [samples, setSamples] = useState<Sample[]>([]);
  const q = useQuery({
    queryKey: ['metrics', p.id],
    queryFn: async () => {
      const m = await api<Metrics>(`/projects/${p.id}/metrics`);
      if (m.cpu !== null && m.memoryPercent !== null)
        setSamples((s) =>
          [
            ...s,
            { time: new Date().toLocaleTimeString(), cpu: m.cpu!, memory: m.memoryPercent! },
          ].slice(-60),
        );
      return m;
    },
    enabled: !!p.currentDeploymentId,
    refetchInterval: 5000,
  });
  const uptime = q.data?.startedAt
    ? Math.max(0, Math.floor((Date.now() - new Date(q.data.startedAt).getTime()) / 60000))
    : null;
  return (
    <>
      <div className="section-heading">
        <h2>Live metrics</h2>
        <span>Actual Docker measurements · 5s interval</span>
      </div>
      <div className="metrics-grid">
        <div className="stat">
          <div>
            CPU usage
            <Cpu size={17} />
          </div>
          <strong>
            {q.data?.cpu !== null && q.data?.cpu !== undefined ? `${q.data.cpu.toFixed(2)}%` : '—'}
          </strong>
          <small>Allocated CPU utilization</small>
        </div>
        <div className="stat">
          <div>
            Memory usage
            <MemoryStick size={17} />
          </div>
          <strong className="memory-value">{q.data?.memory ?? '—'}</strong>
          <small>Used / configured limit</small>
        </div>
        <div className="stat">
          <div>
            Container uptime
            <Clock size={17} />
          </div>
          <strong>
            {uptime !== null && q.data?.state === 'running'
              ? uptime < 60
                ? `${uptime}m`
                : `${Math.floor(uptime / 60)}h ${uptime % 60}m`
              : '—'}
          </strong>
          <small>{q.data?.state ?? 'No application deployed'}</small>
        </div>
      </div>
      {q.error && <div className="notice">Metrics unavailable: {q.error.message}</div>}
      <div className="metric-charts">
        {[
          ['cpu', 'CPU utilization', '#a991ff'],
          ['memory', 'Memory utilization', '#5bd3ae'],
        ].map(([key, label, color]) => (
          <div className="panel chart-panel" key={key}>
            <div className="section-heading">
              <h2>{label}</h2>
              <span>%</span>
            </div>
            {samples.length > 1 ? (
              <ResponsiveContainer width="100%" height={155}>
                <AreaChart data={samples} margin={{ top: 10, right: 5, bottom: 0, left: -25 }}>
                  <YAxis
                    tick={{ fill: '#85828f', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    domain={[0, 'auto']}
                  />
                  <XAxis dataKey="time" hide />
                  <Tooltip
                    contentStyle={{
                      background: '#222126',
                      border: '1px solid #3b3943',
                      borderRadius: 8,
                      fontSize: 11,
                    }}
                  />
                  <Area
                    dataKey={key}
                    stroke={color}
                    fill={color}
                    fillOpacity={0.1}
                    strokeWidth={2}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="chart-empty">
                <span className="chart-baseline" />
                <p>
                  {p.currentDeploymentId
                    ? 'Collecting measurements…'
                    : 'Metrics appear after your first deployment.'}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
