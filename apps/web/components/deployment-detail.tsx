'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, Circle, GitCommitHorizontal } from 'lucide-react';
import { api, type Deployment, type Event } from '../lib/api';
import { Badge, ErrorBox, Loading, date } from './common';
import { Terminal } from './terminal';
export function DeploymentDetail({ id, projectId }: { id: string; projectId: string }) {
  const client = useQueryClient();
  const [events, setEvents] = useState<Event[]>([]);
  const [connected, setConnected] = useState(false);
  const q = useQuery({
    queryKey: ['deployment', id],
    queryFn: () => api<Deployment>(`/deployments/${id}`),
    refetchInterval: 3000,
  });
  useEffect(() => {
    setEvents([]);
    const source = new EventSource(`/api/deployments/${id}/events`);
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.onmessage = (message) => {
      const event = JSON.parse(message.data) as Event;
      setEvents((old) => (old.some((e) => e.id === event.id) ? old : [...old, event].slice(-5500)));
      if (event.type === 'state') void client.invalidateQueries({ queryKey: ['deployment', id] });
    };
    return () => source.close();
  }, [id, client]);
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const d = q.data!;
  const stages = ['QUEUED', 'CLONING', 'BUILDING', 'STARTING', 'VERIFYING', 'SUCCEEDED'];
  return (
    <>
      <Link className="back" href={`/projects/${projectId}`}>
        <ArrowLeft size={15} />
        Back to project
      </Link>
      <div className="page-title">
        <div>
          <div className="title-with-badge">
            <h1>Deployment details</h1>
            <Badge status={d.status} />
          </div>
          <p>
            <GitCommitHorizontal size={15} />
            <code>{d.commitSha?.slice(0, 7) ?? 'Commit pending'}</code>
            <span className="meta-sep">/</span>
            {date(d.createdAt)}
          </p>
        </div>
        <code className="deployment-id">{id}</code>
      </div>
      <div className="timeline">
        {stages.map((stage, index) => {
          const occurred =
            events.some((e) => e.type === 'state' && e.message === stage) ||
            d.status === stage ||
            (d.status !== 'FAILED' && index < stages.indexOf(d.status));
          return (
            <div key={stage} className={occurred ? 'occurred' : ''}>
              <span>{occurred ? <Check size={15} /> : <Circle size={13} />}</span>
              <strong>{stage.toLowerCase()}</strong>
            </div>
          );
        })}
      </div>
      {d.errorMessage && <ErrorBox error={d.errorMessage} />}
      <Terminal
        connected={connected}
        text={events
          .map(
            (e) =>
              `[${new Date(e.createdAt).toLocaleTimeString()}] ${e.level === 'error' ? 'ERROR ' : ''}${e.message}`,
          )
          .join('\n')}
      />
      <div className="metadata">
        <span>
          STARTED <code>{date(d.createdAt)}</code>
        </span>
        <span>
          FINISHED <code>{d.finishedAt ? date(d.finishedAt) : 'In progress'}</code>
        </span>
        {d.hostPort && (
          <span>
            HOST PORT <code>{d.hostPort}</code>
          </span>
        )}
      </div>
    </>
  );
}
