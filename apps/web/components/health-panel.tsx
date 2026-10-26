'use client';
import { useQuery } from '@tanstack/react-query';
import { Activity, HeartPulse, Clock, ShieldCheck } from 'lucide-react';
import { api, type Project, type HealthCheck } from '../lib/api';
import { Badge, ErrorBox, date } from './common';
export function HealthPanel({ project: p }: { project: Project }) {
  const q = useQuery({
    queryKey: ['health', p.id],
    queryFn: () => api<HealthCheck[]>(`/projects/${p.id}/health-checks?limit=60`),
    refetchInterval: 10000,
  });
  const rows = q.data ?? [];
  const successful = rows.filter((h) => h.status === 'RUNNING');
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>Application health</h2>
          <p>Background checks keep running when this dashboard is closed.</p>
        </div>
        <HeartPulse size={21} />
      </div>
      <div className="metrics-grid">
        <div className="stat">
          <div>
            Current health
            <ShieldCheck size={17} />
          </div>
          <strong className="memory-value">
            <Badge status={p.runtimeStatus} />
          </strong>
          <small>{p.healthMessage ?? 'Verified HTTP readiness and container state'}</small>
        </div>
        <div className="stat">
          <div>
            Latest response
            <Clock size={17} />
          </div>
          <strong>
            {rows[0]?.responseTimeMs !== undefined && rows[0]?.responseTimeMs !== null
              ? `${rows[0].responseTimeMs}ms`
              : '—'}
          </strong>
          <small>
            {p.lastCheckedAt ? date(p.lastCheckedAt) : 'Waiting for the first background check'}
          </small>
        </div>
        <div className="stat">
          <div>
            Healthy samples
            <Activity size={17} />
          </div>
          <strong>
            {rows.length ? `${Math.round((successful.length / rows.length) * 100)}%` : '—'}
          </strong>
          <small>Of the last {rows.length} checks; not a lifetime uptime measure</small>
        </div>
      </div>
      <ErrorBox error={q.error} />
      <div className="panel">
        <div className="panel-header">
          <h2>Recent health checks</h2>
          <span className="muted">
            Endpoint: <code>{p.healthPath}</code>
          </span>
        </div>
        <div className="health-strip">
          {rows.length ? (
            rows
              .slice()
              .reverse()
              .map((h) => (
                <span
                  key={h.id}
                  title={`${date(h.checkedAt)} · ${h.status}${h.httpStatus ? ` · HTTP ${h.httpStatus}` : ''}`}
                  className={
                    h.status === 'RUNNING'
                      ? 'healthy'
                      : h.status === 'STOPPED'
                        ? 'stopped'
                        : 'unhealthy'
                  }
                />
              ))
          ) : (
            <p className="muted">No measurements yet. Deploy an application to start monitoring.</p>
          )}
        </div>
        {rows.slice(0, 20).map((h) => (
          <div className="health-row" key={h.id}>
            <Badge status={h.status} />
            <span>
              {h.httpStatus ? `HTTP ${h.httpStatus}` : (h.message ?? 'Container observation')}
            </span>
            <code>{h.responseTimeMs}ms</code>
            <small>{date(h.checkedAt)}</small>
          </div>
        ))}
      </div>
    </>
  );
}
