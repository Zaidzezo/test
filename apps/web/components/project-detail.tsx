'use client';
import { ConfirmDialog } from './confirm-dialog';
import Link from 'next/link';
import { useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowUpRight,
  Github,
  GitBranch,
  Play,
  Square,
  RotateCw,
  Rocket,
  Globe2,
  ChevronDown,
  Trash2,
  ExternalLink,
  Copy,
  Check,
} from 'lucide-react';
import { api, type Project, type Deployment } from '../lib/api';
import { Badge, ErrorBox, Loading } from './common';
import { Button } from './ui/button';
import { ProjectForm } from './project-form';
import { Terminal } from './terminal';
import { EnvironmentPanel } from './environment-panel';
import { NetworkingPanel } from './networking-panel';
import { HealthPanel } from './health-panel';
import { DeploymentHistory } from './deployment-history';
import { ServiceMetrics } from './service-metrics';
export function ProjectDetail({ id }: { id: string }) {
  const router = useRouter();
  const client = useQueryClient();
  const search = useSearchParams();
  const tab = search.get('tab') ?? 'overview';
  const [confirm, setConfirm] = useState(false);
  const [copied, setCopied] = useState(false);
  const q = useQuery({
    queryKey: ['project', id],
    queryFn: () => api<Project>(`/projects/${id}`),
    refetchInterval: 3000,
  });
  const logs = useQuery({
    queryKey: ['runtimeLogs', id],
    queryFn: () => api<{ text: string }>(`/projects/${id}/runtime-logs`),
    enabled: tab === 'logs' && !!q.data?.currentDeploymentId,
    refetchInterval: 3000,
  });
  const deploy = useMutation({
    mutationFn: () => api<Deployment>(`/projects/${id}/deployments`, 'POST'),
    onSuccess: (d) => router.push(`/projects/${id}/deployments/${d.id}`),
  });
  const operation = useMutation({
    mutationFn: (action: string) =>
      api(
        `/projects/${id}${action === 'delete' ? '' : '/' + action}`,
        action === 'delete' ? 'DELETE' : 'POST',
        action === 'delete' ? { confirm: true } : undefined,
      ),
    onSuccess: (_data, action) => {
      if (action === 'delete') router.push('/');
      setConfirm(false);
      void client.invalidateQueries({ queryKey: ['project', id] });
    },
  });
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const p = q.data!;
  const d = p.currentDeployment;
  const busy = !!p.activeDeploymentId || !!p.operationToken || operation.isPending;
  const sections = [
    ['overview', 'Overview'],
    ['deployments', 'Deployments'],
    ['logs', 'Application logs'],
    ['environment', 'Environment'],
    ['networking', 'Networking'],
    ['health', 'Health checks'],
    ['settings', 'Settings'],
  ];
  return (
    <>
      <Link className="back" href="/">
        <ArrowLeft size={14} />
        All services
      </Link>
      <div className="service-heading">
        <div className="service-heading-main">
          <span className="service-avatar">
            <Globe2 size={28} strokeWidth={1.5} />
          </span>
          <div>
            <div className="service-type">
              {p.serviceType === 'STATIC' ? 'STATIC SITE' : 'WEB SERVICE'}{' '}
              <span>{p.sourceType === 'IMAGE' ? 'IMAGE' : p.runtime}</span>
            </div>
            <div className="title-with-badge">
              <h1>{p.name}</h1>
              <Badge status={p.runtimeStatus} />
            </div>
            <p>
              <a
                href={p.sourceType === 'IMAGE' ? 'https://hub.docker.com/' : p.repositoryUrl}
                target="_blank"
                rel="noreferrer"
              >
                <Github size={13} />
                {p.sourceType === 'IMAGE'
                  ? p.imageUrl
                  : p.repositoryUrl.replace('https://github.com/', '')}
              </a>
              <span className="meta-sep">/</span>
              <GitBranch size={12} />
              {p.sourceType === 'IMAGE' ? 'Container image' : p.branch || 'Default branch'}
            </p>
          </div>
        </div>
        <Button
          variant="default"
          disabled={busy || deploy.isPending}
          onClick={() => deploy.mutate()}
        >
          <Rocket size={15} />
          {p.activeDeploymentId ? 'Deploying…' : d ? 'Deploy latest commit' : 'Deploy project'}
        </Button>
      </div>
      <div className="service-url-row">
        <span className="dot" />
        <a href={p.applicationUrl} target="_blank" rel="noreferrer">
          {p.applicationUrl}
          <ExternalLink size={12} />
        </a>
        <button
          className="icon-button"
          aria-label="Copy service URL"
          onClick={async () => {
            await navigator.clipboard.writeText(p.applicationUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
        <span className="url-label">Stable application address</span>
      </div>
      <ErrorBox error={deploy.error || operation.error} />
      {p.operationToken && (
        <div role="status" className="notice">
          Applying runtime operation. Status updates after Docker verification.
        </div>
      )}
      {p.activeDeploymentId && (
        <Link
          className="notice active-deployment"
          href={`/projects/${id}/deployments/${p.activeDeploymentId}`}
        >
          <span>
            <span className="dot" />
            Deployment in progress — follow the build output
          </span>
          <ArrowUpRight size={16} />
        </Link>
      )}
      <div className="tabs">
        {sections.map(([key, label]) => (
          <Link
            className={tab === key ? 'active' : ''}
            key={key}
            href={`/projects/${id}?tab=${key}`}
          >
            {label}
          </Link>
        ))}
      </div>
      {tab === 'environment' ? (
        <EnvironmentPanel id={id} busy={busy} />
      ) : tab === 'networking' ? (
        <NetworkingPanel project={p} />
      ) : tab === 'health' ? (
        <HealthPanel project={p} />
      ) : tab === 'deployments' ? (
        <DeploymentHistory project={p} />
      ) : tab === 'logs' ? (
        <>
          <div className="section-heading">
            <div>
              <h2>Application logs</h2>
              <p>
                Recent stdout and stderr from your current container. Refreshes every three seconds.
              </p>
            </div>
          </div>
          <ErrorBox error={logs.error} />
          <Terminal title="Application stdout / stderr" text={logs.data?.text ?? ''} />
        </>
      ) : tab === 'settings' ? (
        <>
          <ProjectForm project={p} />
          <div className="danger-zone">
            <div>
              <h2>Delete service</h2>
              <p>Permanently remove this service, history, variables, and its Docker resources.</p>
            </div>
            <Button variant="destructive" disabled={busy} onClick={() => setConfirm(true)}>
              <Trash2 size={15} />
              Delete project
            </Button>
          </div>
          {confirm && (
            <ConfirmDialog titleId="delete-title" onClose={() => setConfirm(false)}>
              <h2 id="delete-title">Delete {p.name}?</h2>
              <p>
                History, encrypted configuration, managed containers, and images will be permanently
                removed.
              </p>
              <div className="actions">
                <Button onClick={() => setConfirm(false)}>Cancel</Button>
                <Button variant="destructive" onClick={() => operation.mutate('delete')}>
                  Confirm deletion
                </Button>
              </div>
            </ConfirmDialog>
          )}
        </>
      ) : (
        <>
          <div className="overview-grid">
            <div className="panel release-card">
              <div className="panel-header">
                <h2>Current release</h2>
                <span className="current-tag">Production</span>
              </div>
              <div className="panel-body">
                {d ? (
                  <>
                    <div className="release-commit">
                      <GitBranch size={20} />
                      <code>{d.commitSha?.slice(0, 7)}</code>
                      <Badge status={d.status} />
                    </div>
                    <p>
                      {d.kind === 'ROLLBACK'
                        ? 'Restored from a retained image'
                        : 'Built from your connected repository'}
                    </p>
                    <Link className="text-link" href={`/projects/${id}/deployments/${d.id}`}>
                      View deployment
                      <ArrowUpRight size={14} />
                    </Link>
                  </>
                ) : (
                  <>
                    <span className="service-icon">
                      <Rocket size={23} />
                    </span>
                    <h3>Ready for your first deploy.</h3>
                    <p>
                      We’ll build your Docker image, verify readiness, and bring your service
                      online.
                    </p>
                  </>
                )}
              </div>
            </div>
            <div className="panel runtime-card">
              <div className="panel-header">
                <h2>Service controls</h2>
                <ChevronDown size={15} />
              </div>
              <div className="panel-body">
                <p>Manage the current application without changing its deployment history.</p>
                <div className="actions">
                  {[
                    ['start', Play],
                    ['stop', Square],
                    ['restart', RotateCw],
                  ].map(([action, Icon]) => {
                    const C = Icon as typeof Play;
                    return (
                      <Button
                        key={String(action)}
                        disabled={busy || !d}
                        onClick={() => operation.mutate(String(action))}
                      >
                        <C size={14} />
                        {String(action)}
                      </Button>
                    );
                  })}
                </div>
                <small className="muted">
                  {p.lastCheckedAt
                    ? `Last health check ${new Date(p.lastCheckedAt).toLocaleTimeString()}`
                    : 'Health monitoring starts after the first deployment.'}
                </small>
              </div>
            </div>
          </div>
          <ServiceMetrics project={p} />
          <DeploymentHistory project={p} compact />
          {d && (
            <div className="metadata">
              <span>
                CONTAINER<code>{d.containerId?.slice(0, 12)}</code>
              </span>
              <span>
                IMAGE<code>{d.imageTag}</code>
              </span>
            </div>
          )}
        </>
      )}
    </>
  );
}
