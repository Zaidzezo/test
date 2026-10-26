'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Globe2, ExternalLink, Copy, Check, LockKeyhole, Radio, Unplug } from 'lucide-react';
import { api, type Project } from '../lib/api';
import { Button } from './ui/button';
import { ErrorBox } from './common';
export function NetworkingPanel({ project: p }: { project: Project }) {
  const client = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const [copied, setCopied] = useState('');
  const sharing = useMutation({
    mutationFn: (enabled: boolean) =>
      api(`/projects/${p.id}/sharing`, 'POST', {
        enabled,
        confirmPublic: enabled ? confirm : undefined,
      }),
    onSuccess: () => {
      setConfirm(false);
      void client.invalidateQueries({ queryKey: ['project', p.id] });
    },
  });
  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(''), 2000);
  }
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>Networking</h2>
          <p>A stable address for your service. Optional sharing when you need it.</p>
        </div>
        <Globe2 size={20} />
      </div>
      <div className="panel networking-card">
        <div className="panel-header">
          <span className="service-icon">
            <Globe2 size={19} />
          </span>
          <div>
            <h2>Application gateway</h2>
            <p>This URL stays the same across deploys, rollbacks, and restarts.</p>
          </div>
          <span className="badge neutral">Local</span>
        </div>
        <div className="url-field">
          <a href={p.applicationUrl} target="_blank" rel="noreferrer">
            {p.applicationUrl}
            <ExternalLink size={14} />
          </a>
          <button
            className="icon-button"
            aria-label="Copy application URL"
            onClick={() => copy(p.applicationUrl)}
          >
            {copied === p.applicationUrl ? <Check size={15} /> : <Copy size={15} />}
          </button>
        </div>
        <dl className="details-list">
          <div>
            <dt>Container port</dt>
            <dd>{p.containerPort}</dd>
          </div>
          <div>
            <dt>Health endpoint</dt>
            <dd>{p.healthPath}</dd>
          </div>
          <div>
            <dt>Direct container address</dt>
            <dd>
              {p.currentDeployment?.hostPort
                ? `127.0.0.1:${p.currentDeployment.hostPort}`
                : 'Available after first deployment'}
            </dd>
          </div>
        </dl>
      </div>
      <div className="panel networking-card">
        <div className="panel-header">
          <span className="service-icon">
            <Radio size={19} />
          </span>
          <div>
            <h2>Public sharing</h2>
            <p>Share this application through a temporary Cloudflare Tunnel.</p>
          </div>
          <span
            className={`badge ${p.sharingStatus === 'ACTIVE' ? 'good' : p.sharingStatus === 'FAILED' ? 'bad' : 'neutral'}`}
          >
            {p.sharingStatus.toLowerCase()}
          </span>
        </div>
        <div className="panel-body">
          <ErrorBox error={sharing.error || p.sharingError} />
          {p.publicUrl ? (
            <div className="url-field public-url">
              <a href={p.publicUrl} target="_blank" rel="noreferrer">
                {p.publicUrl}
                <ExternalLink size={14} />
              </a>
              <button
                className="icon-button"
                aria-label="Copy public URL"
                onClick={() => copy(p.publicUrl!)}
              >
                {copied === p.publicUrl ? <Check size={15} /> : <Copy size={15} />}
              </button>
            </div>
          ) : (
            <p>
              {p.sharingStatus === 'STARTING'
                ? 'Connecting a real tunnel. A URL appears after cloudflared confirms a connection.'
                : 'Public sharing is off. Your service remains accessible locally.'}
            </p>
          )}
          <div className="callout compact">
            <LockKeyhole size={17} />
            <p>
              Only this application is shared. The DeployGrid dashboard, API, and Docker daemon stay
              private. Quick-tunnel URLs change when the tunnel restarts; your machine must stay
              online.
            </p>
          </div>
          {p.shareEnabled ? (
            <Button disabled={sharing.isPending} onClick={() => sharing.mutate(false)}>
              <Unplug size={15} />
              Disable sharing
            </Button>
          ) : (
            <>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={confirm}
                  onChange={(e) => setConfirm(e.target.checked)}
                />
                I understand that anyone with the public link can access this application.
              </label>
              <Button
                variant="default"
                disabled={
                  !confirm || !p.currentDeploymentId || !p.desiredRunning || sharing.isPending
                }
                onClick={() => sharing.mutate(true)}
              >
                <Radio size={15} />
                {sharing.isPending ? 'Enabling…' : 'Enable public sharing'}
              </Button>
            </>
          )}
          <p className="help sharing-help">
            Requires the cloudflared CLI installed on the same machine as the worker. No Cloudflare
            account is required for a quick tunnel.
          </p>
        </div>
      </div>
    </>
  );
}
