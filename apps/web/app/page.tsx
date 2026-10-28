'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Plus,
  ArrowUpRight,
  GitBranch,
  Globe2,
  Layers,
  CheckCircle2,
  Activity,
  Search,
  LayoutGrid,
  List,
  ArrowRight,
  Github,
} from 'lucide-react';
import { api, type Project } from '../lib/api';
import { Badge, ErrorBox, Loading, date } from '../components/common';
import { Button } from '../components/ui/button';
export default function Dashboard() {
  const q = useQuery({
    queryKey: ['projects'],
    queryFn: () => api<Project[]>('/projects'),
    refetchInterval: 5000,
  });
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [type, setType] = useState('all');
  const [status, setStatus] = useState('all');
  const projects = q.data ?? [];
  const filtered = projects.filter(
    (p) =>
      (p.name + ' ' + p.repositoryUrl + ' ' + p.imageUrl)
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (type === 'all' || p.serviceType === type) &&
      (status === 'all' || p.runtimeStatus === status),
  );
  const running = projects.filter((p) => p.runtimeStatus === 'RUNNING').length;
  const active = projects.filter((p) => p.activeDeploymentId).length;
  const failed = projects.filter((p) => p.deployments[0]?.status === 'FAILED').length;
  return (
    <>
      <div className="page-title">
        <div>
          <div className="eyebrow">PERSONAL WORKSPACE</div>
          <h1>Workspace overview</h1>
          <p>Your services, deployments, and infrastructure. All in one place.</p>
        </div>
        <Button variant="default" asChild>
          <Link href="/projects/new">
            <Plus size={16} />
            New service
          </Link>
        </Button>
      </div>
      <ErrorBox error={q.error} />
      <div className="workspace-stats">
        {[
          {
            label: 'Services',
            value: projects.length,
            icon: Layers,
            note: 'Connected to your workspace',
          },
          {
            label: 'Healthy services',
            value: running,
            icon: CheckCircle2,
            note: 'Responding to health checks',
          },
          {
            label: 'Deploying now',
            value: active,
            icon: Activity,
            note: 'Live deployment pipelines',
          },
          {
            label: 'Failed latest deploys',
            value: failed,
            icon: GitBranch,
            note: 'Previous releases stay available',
          },
        ].map((item) => (
          <div className="workspace-stat" key={item.label}>
            <span>
              <item.icon size={16} />
              {item.label}
            </span>
            <strong>{q.isPending ? '—' : item.value}</strong>
            <small>{item.note}</small>
          </div>
        ))}
      </div>
      <div className="section-heading services-heading">
        <div>
          <h2>
            Services <span className="count">{projects.length}</span>
          </h2>
          <p>Build something worth shipping.</p>
        </div>
        <Link className="text-link" href="/activity">
          View activity
          <ArrowRight size={14} />
        </Link>
      </div>
      <div className="service-toolbar">
        <div className="search-field">
          <Search size={16} />
          <input
            aria-label="Search services"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search services or repositories…"
          />
        </div>
        <select
          aria-label="Filter services by status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="all">All statuses</option>
          <option value="RUNNING">Running</option>
          <option value="DEGRADED">Degraded</option>
          <option value="STOPPED">Stopped</option>
          <option value="NOT_DEPLOYED">Not deployed</option>
        </select>
        <select
          aria-label="Filter services by type"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="all">All service types</option>
          <option value="WEB">Web Services</option>
          <option value="STATIC">Static Sites</option>
        </select>
        <div className="view-switch">
          <button
            className={view === 'list' ? 'active' : ''}
            aria-label="List view"
            onClick={() => setView('list')}
          >
            <List size={16} />
          </button>
          <button
            className={view === 'grid' ? 'active' : ''}
            aria-label="Grid view"
            onClick={() => setView('grid')}
          >
            <LayoutGrid size={16} />
          </button>
        </div>
      </div>
      {q.isPending ? (
        <Loading />
      ) : !projects.length ? (
        <div className="empty">
          <div className="empty-grid">
            <Globe2 size={32} strokeWidth={1.4} />
          </div>
          <span className="eyebrow">YOUR NEXT RELEASE STARTS HERE</span>
          <h2>Bring your first service online.</h2>
          <p>
            Connect a GitHub repository. DeployGrid builds your container,
            <br />
            checks its health, and gives it a stable application URL.
          </p>
          <Button variant="default" asChild>
            <Link href="/projects/new">
              <Plus size={16} />
              Create your first service
            </Link>
          </Button>
          <div className="empty-steps">
            <span>
              <Github size={14} />
              Connect a repository
            </span>
            <ArrowRight size={13} />
            <span>
              <Layers size={14} />
              Build & verify
            </span>
            <ArrowRight size={13} />
            <span>
              <Globe2 size={14} />
              Ship your application
            </span>
          </div>
        </div>
      ) : !filtered.length ? (
        <div className="panel quiet-empty">No services match your search.</div>
      ) : view === 'list' ? (
        <div className="service-table-wrap">
          <table className="service-table">
            <thead>
              <tr>
                <th>Service</th>
                <th>Status</th>
                <th>Source</th>
                <th>Latest deployment</th>
                <th aria-label="Open service" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link className="service-name" href={`/projects/${p.id}`}>
                      <span className="service-icon">
                        <Globe2 size={18} />
                      </span>
                      <span>
                        <strong>{p.name}</strong>
                        <small>
                          {p.serviceType === 'STATIC' ? 'Static site' : 'Web service'} ·{' '}
                          {p.sourceType === 'IMAGE' ? 'Image' : p.runtime}
                        </small>
                      </span>
                    </Link>
                  </td>
                  <td>
                    <Badge
                      status={
                        p.activeDeploymentId
                          ? (p.deployments[0]?.status ?? 'QUEUED')
                          : p.runtimeStatus
                      }
                    />
                  </td>
                  <td>
                    <div className="source-cell">
                      <Github size={13} />
                      {p.sourceType === 'IMAGE'
                        ? p.imageUrl
                        : p.repositoryUrl.replace('https://github.com/', '')}
                    </div>
                    <small className="branch-cell">
                      <GitBranch size={12} />
                      {p.sourceType === 'IMAGE' ? 'container image' : p.branch || 'default branch'}
                    </small>
                  </td>
                  <td>
                    {p.deployments[0] ? (
                      <Link href={`/projects/${p.id}/deployments/${p.deployments[0].id}`}>
                        <code>{p.deployments[0].commitSha?.slice(0, 7) ?? 'Pending commit'}</code>
                        <small className="table-time">{date(p.deployments[0].createdAt)}</small>
                      </Link>
                    ) : (
                      <span className="muted">Not deployed yet</span>
                    )}
                  </td>
                  <td>
                    <Link aria-label={`Open ${p.name}`} href={`/projects/${p.id}`}>
                      <ArrowUpRight size={17} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="project-grid">
          {filtered.map((p) => (
            <Link className="project-card" href={`/projects/${p.id}`} key={p.id}>
              <div className="card-top">
                <span className="service-icon">
                  <Globe2 size={20} />
                </span>
                <Badge status={p.runtimeStatus} />
              </div>
              <h3>
                {p.name}
                <ArrowUpRight size={16} />
              </h3>
              <p>
                <Github size={13} />
                {p.sourceType === 'IMAGE'
                  ? p.imageUrl
                  : p.repositoryUrl.replace('https://github.com/', '')}
              </p>
              <div className="card-bottom">
                <span>
                  <GitBranch size={13} />
                  {p.branch || 'Default branch'}
                </span>
                <code>{p.currentDeployment?.commitSha?.slice(0, 7) ?? 'No release'}</code>
              </div>
            </Link>
          ))}
        </div>
      )}
      <div className="section-heading activity-heading">
        <h2>Recent deployments</h2>
        <span>Latest attempt for each service</span>
      </div>
      <div className="panel">
        {projects.some((p) => p.deployments.length) ? (
          projects
            .filter((p) => p.deployments.length)
            .map((p) => (
              <Link
                className="activity-row"
                href={`/projects/${p.id}/deployments/${p.deployments[0].id}`}
                key={p.id}
              >
                <span className="activity-icon">
                  <GitBranch size={15} />
                </span>
                <strong>{p.name}</strong>
                <Badge status={p.deployments[0].status} />
                <code>
                  {p.deployments[0].commitSha?.slice(0, 7) ?? p.deployments[0].id.slice(-8)}
                </code>
                <span>{date(p.deployments[0].createdAt)}</span>
                <ArrowUpRight size={14} />
              </Link>
            ))
        ) : (
          <div className="quiet-empty">
            <Activity size={19} />
            Your first deployment will start your activity timeline.
          </div>
        )}
      </div>
      <div className="workspace-note">
        <span className="dot" />
        <strong>Self-hosted. Fully yours.</strong>
        <span>
          Applications run on your machine. Share an application publicly when you choose.
        </span>
      </div>
    </>
  );
}
