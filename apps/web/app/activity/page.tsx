'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, ArrowUpRight, ChevronLeft } from 'lucide-react';
import { api, type Event } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { ErrorBox, Loading, date } from '../../components/common';
interface ActivityEvent extends Event {
  deployment: { id: string; project: { id: string; name: string } };
}
export default function ActivityPage() {
  const [cursors, setCursors] = useState<number[]>([]);
  const before = cursors.at(-1);
  const q = useQuery({
    queryKey: ['activity', before],
    queryFn: () => api<ActivityEvent[]>(`/activity${before ? `?before=${before}` : ''}`),
    refetchInterval: before ? false : 10000,
  });
  return (
    <>
      <div className="page-title">
        <div>
          <div className="eyebrow">WORKSPACE</div>
          <h1>Activity</h1>
          <p>A live record of releases, runtime operations, and health changes.</p>
        </div>
        <span className="service-avatar">
          <Activity size={25} />
        </span>
      </div>
      <ErrorBox error={q.error} />
      {q.isPending ? (
        <Loading />
      ) : (
        <div className="panel activity-feed">
          {q.data?.length ? (
            q.data.map((e) => (
              <Link
                className="feed-item"
                key={e.id}
                href={`/projects/${e.deployment.project.id}/deployments/${e.deployment.id}`}
              >
                <span
                  className={`feed-dot ${e.level === 'error' ? 'failed' : e.type === 'health' ? 'health' : ''}`}
                />
                <div>
                  <strong>
                    {e.deployment.project.name}
                    <span className="event-type">{e.type}</span>
                  </strong>
                  <p>{e.message}</p>
                  <small>{date(e.createdAt)}</small>
                </div>
                <ArrowUpRight size={16} />
              </Link>
            ))
          ) : (
            <div className="quiet-empty">
              <Activity size={22} />
              No activity yet. Deploy a service to start the timeline.
            </div>
          )}
        </div>
      )}
      <div className="pagination">
        <Button disabled={!cursors.length} onClick={() => setCursors((c) => c.slice(0, -1))}>
          <ChevronLeft size={14} />
          Newer
        </Button>
        <span>{before ? 'Earlier activity' : 'Latest activity'}</span>
        <Button
          disabled={(q.data?.length ?? 0) < 30}
          onClick={() => setCursors((c) => [...c, q.data!.at(-1)!.id])}
        >
          Older
        </Button>
      </div>
    </>
  );
}
