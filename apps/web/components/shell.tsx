'use client';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import {
  Boxes,
  LayoutGrid,
  Plus,
  Github,
  PanelLeftClose,
  PanelLeftOpen,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  Globe2,
  Activity,
  Settings2,
  KeyRound,
  ScrollText,
  Network,
  Server,
  ArrowLeft,
} from 'lucide-react';
import { api, type Project, type SystemStatus } from '../lib/api';
export function Shell({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1 } } }));
  return (
    <QueryClientProvider client={client}>
      <Suspense fallback={<div className="loading">Loading workspace…</div>}>
        <Frame>{children}</Frame>
      </Suspense>
    </QueryClientProvider>
  );
}
function Frame({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const search = useSearchParams();
  const [collapsed, setCollapsed] = useState(false);
  const id = path.match(/^\/projects\/([^/]+)/)?.[1];
  const service = id && id !== 'new' ? id : undefined;
  const tab = search.get('tab') ?? 'overview';
  const q = useQuery({
    queryKey: ['project', service],
    queryFn: () => api<Project>(`/projects/${service}`),
    enabled: !!service,
  });
  const system = useQuery({
    queryKey: ['system'],
    queryFn: () => api<SystemStatus>('/system'),
    refetchInterval: 15000,
  });
  const nav = [
    ['overview', 'Overview', Globe2],
    ['deployments', 'Deployments', ScrollText],
    ['logs', 'Logs', ScrollText],
    ['environment', 'Environment', KeyRound],
    ['networking', 'Networking', Network],
    ['health', 'Health checks', Activity],
    ['settings', 'Settings', Settings2],
  ] as const;
  const healthy =
    !!system.data &&
    system.data.database &&
    system.data.redis &&
    system.data.docker &&
    system.data.worker;
  return (
    <div className={collapsed ? 'app collapsed' : 'app'}>
      <aside>
        <Link href="/" className="brand" aria-label="DeployGrid workspace">
          <span className="brand-icon">
            <Boxes size={22} />
          </span>
          <span>
            deploygrid<span className="brand-dot">.</span>
          </span>
        </Link>
        <div className="workspace">
          <span className="avatar">Z</span>
          <div>
            <strong>Personal workspace</strong>
            <small>Self-hosted infrastructure</small>
          </div>
          <ChevronDown size={14} />
        </div>
        {service ? (
          <>
            <Link className="sidebar-back" href="/">
              <ArrowLeft size={14} />
              All services
            </Link>
            <div className="nav-label">WEB SERVICE</div>
            <div className="sidebar-service">
              <span className="service-icon">
                <Globe2 size={17} />
              </span>
              <strong>{q.data?.name ?? 'Service'}</strong>
            </div>
            <nav>
              {nav.map(([key, label, Icon]) => (
                <Link
                  key={key}
                  href={`/projects/${service}?tab=${key}`}
                  aria-label={label}
                  className={!path.includes('deployments/') && tab === key ? 'selected' : ''}
                >
                  <Icon size={16} />
                  <span>{label}</span>
                </Link>
              ))}
            </nav>
          </>
        ) : (
          <>
            <div className="nav-label">WORKSPACE</div>
            <nav>
              <Link href="/" aria-label="Overview" className={path === '/' ? 'selected' : ''}>
                <LayoutGrid size={17} />
                <span>Overview</span>
              </Link>
              <Link
                href="/activity"
                aria-label="Activity"
                className={path === '/activity' ? 'selected' : ''}
              >
                <Activity size={17} />
                <span>Activity</span>
              </Link>
              <Link
                href="/projects/new"
                aria-label="New service"
                className={path === '/projects/new' ? 'selected' : ''}
              >
                <Plus size={17} />
                <span>New service</span>
              </Link>
            </nav>
          </>
        )}
        <div className="sidebar-bottom">
          <div className="system-status">
            <span className={`dot ${healthy ? 'success' : 'muted'}`} />
            <div>
              <strong>{healthy ? 'All systems operational' : 'Infrastructure status'}</strong>
              <small>
                {system.isError
                  ? 'Cannot reach API'
                  : system.isPending
                    ? 'Checking local services…'
                    : `${Object.values(system.data ?? {}).filter((v) => v === true).length}/4 components connected`}
              </small>
            </div>
          </div>
          <a href="https://github.com/Zaidzezo/test" target="_blank" rel="noreferrer">
            <Github size={16} />
            Documentation
            <ArrowUpRight size={13} />
          </a>
          <button
            className="collapse-control"
            onClick={() => setCollapsed(!collapsed)}
            aria-label="Toggle sidebar"
          >
            {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
            <span>Collapse sidebar</span>
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header>
          <span className="breadcrumb">
            <span className="workspace-crumb">Personal workspace</span>
            <ChevronRight size={13} />
            {service ? (
              <>
                <Server size={13} />
                {q.data?.name ?? 'Service'}
              </>
            ) : path === '/activity' ? (
              'Activity'
            ) : path.endsWith('/new') ? (
              'New service'
            ) : (
              'Overview'
            )}
          </span>
          <div className="topbar-right">
            <span className="local-badge">
              <span className="dot" />
              Self-hosted
            </span>
            <span className="user-avatar">Z</span>
          </div>
        </header>
        <main>{children}</main>
        <footer>
          <span>DEPLOYGRID</span>
          <span>From repository to running application.</span>
          <span className="footer-right">YOUR CODE. YOUR INFRASTRUCTURE.</span>
        </footer>
      </div>
    </div>
  );
}
