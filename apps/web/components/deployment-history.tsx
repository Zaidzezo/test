'use client';
import { ConfirmDialog } from './confirm-dialog';
import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { GitCommitHorizontal, RotateCcw, ArrowUpRight, GitBranch, Clock } from 'lucide-react';
import { api, type Project, type Deployment } from '../lib/api';
import { Badge, ErrorBox, date } from './common';
import { Button } from './ui/button';
export function DeploymentHistory({
  project: p,
  compact = false,
}: {
  project: Project;
  compact?: boolean;
}) {
  const router = useRouter();
  const client = useQueryClient();
  const [target, setTarget] = useState<Deployment | null>(null);
  const [offset, setOffset] = useState(0);
  const q = useQuery({
    queryKey: ['history', p.id, offset],
    queryFn: () =>
      api<Deployment[]>(`/projects/${p.id}/deployments?limit=${compact ? 5 : 20}&after=${offset}`),
    refetchInterval: 5000,
  });
  const rollback = useMutation({
    mutationFn: (id: string) =>
      api<Deployment>(`/projects/${p.id}/rollback`, 'POST', { deploymentId: id }),
    onSuccess: (d) => {
      setTarget(null);
      void client.invalidateQueries({ queryKey: ['project', p.id] });
      router.push(`/projects/${p.id}/deployments/${d.id}`);
    },
  });
  const busy = !!p.activeDeploymentId || !!p.operationToken;
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>{compact ? 'Recent deployments' : 'Deployment history'}</h2>
          <p>Every release has a story. Keep the good ones within reach.</p>
        </div>
        {compact && (
          <Link className="text-link" href={`/projects/${p.id}?tab=deployments`}>
            View all
            <ArrowUpRight size={14} />
          </Link>
        )}
      </div>
      <ErrorBox error={q.error || rollback.error} />
      <div className="panel deployment-list">
        {!q.data?.length ? (
          <div className="quiet-empty">
            <GitBranch size={21} />
            No deployments yet. Your first release starts above.
          </div>
        ) : (
          q.data.map((d) => (
            <div className="deployment-row" key={d.id}>
              <span className="activity-icon">
                {d.kind === 'ROLLBACK' ? (
                  <RotateCcw size={17} />
                ) : (
                  <GitCommitHorizontal size={17} />
                )}
              </span>
              <div className="deployment-summary">
                <Link href={`/projects/${p.id}/deployments/${d.id}`}>
                  <strong>
                    {d.kind === 'ROLLBACK' ? 'Rollback' : 'Deploy'}{' '}
                    <code>{d.commitSha?.slice(0, 7) ?? d.id.slice(-7)}</code>
                  </strong>
                  {d.id === p.currentDeploymentId && <span className="current-tag">Current</span>}
                </Link>
                <small>
                  <Clock size={11} />
                  {date(d.createdAt)}
                  {d.cleanupPending && <span className="warning-text">Cleanup will retry</span>}
                </small>
              </div>
              <Badge status={d.status} />
              <div className="row-actions">
                {d.status === 'SUCCEEDED' && d.id !== p.currentDeploymentId && (
                  <button
                    className="icon-button"
                    aria-label={`Rollback to ${d.commitSha?.slice(0, 7) ?? d.id}`}
                    disabled={busy}
                    onClick={() => setTarget(d)}
                  >
                    <RotateCcw size={15} />
                  </button>
                )}
                <Link
                  className="icon-button"
                  aria-label="View deployment details"
                  href={`/projects/${p.id}/deployments/${d.id}`}
                >
                  <ArrowUpRight size={16} />
                </Link>
              </div>
            </div>
          ))
        )}
      </div>
      {!compact && (
        <div className="pagination">
          <Button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 20))}>
            Previous
          </Button>
          <span>Page {offset / 20 + 1}</span>
          <Button disabled={(q.data?.length ?? 0) < 20} onClick={() => setOffset(offset + 20)}>
            Next
          </Button>
        </div>
      )}
      {target && (
        <ConfirmDialog titleId="rollback-title" onClose={() => setTarget(null)}>
          <span className="service-icon">
            <RotateCcw size={22} />
          </span>
          <h2 id="rollback-title">Restore this release?</h2>
          <p>
            Deploy the retained image for commit <code>{target.commitSha?.slice(0, 7)}</code> with
            its original environment snapshot. Your current application stays available until the
            candidate passes readiness checks.
          </p>
          <div className="actions">
            <Button onClick={() => setTarget(null)}>Cancel</Button>
            <Button
              variant="default"
              disabled={rollback.isPending}
              onClick={() => rollback.mutate(target.id)}
            >
              {rollback.isPending ? 'Queuing…' : 'Confirm rollback'}
            </Button>
          </div>
        </ConfirmDialog>
      )}
    </>
  );
}
