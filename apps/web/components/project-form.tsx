'use client';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Github, Save } from 'lucide-react';
import Link from 'next/link';
import { api, type Project } from '../lib/api';
import { ErrorBox } from './common';
import {
  createServiceSchema,
  checkServiceConfiguration,
  type EnvironmentVariable,
} from '@deploygrid/shared';
import { VariableEditor } from './variable-editor';
import { Button } from './ui/button';
export function ProjectForm({ project }: { project?: Project }) {
  const router = useRouter();
  const [name, setName] = useState(project?.name ?? '');
  const [repo, setRepo] = useState(project?.repositoryUrl ?? '');
  const [branch, setBranch] = useState(project?.branch ?? '');
  const [port, setPort] = useState(project?.containerPort ?? 3000);
  const [health, setHealth] = useState(project?.healthPath ?? '/');
  const [variables, setVariables] = useState<EnvironmentVariable[]>([]);
  const [serviceType, setServiceType] = useState(project?.serviceType ?? 'WEB');
  const [sourceType, setSourceType] = useState(project?.sourceType ?? 'GIT');
  const [runtime, setRuntime] = useState(project?.runtime ?? 'AUTO');
  const [imageUrl, setImageUrl] = useState(project?.imageUrl ?? '');
  const [rootDirectory, setRootDirectory] = useState(project?.rootDirectory ?? '');
  const [dockerfilePath, setDockerfilePath] = useState(project?.dockerfilePath ?? 'Dockerfile');
  const [buildCommand, setBuildCommand] = useState(project?.buildCommand ?? '');
  const [startCommand, setStartCommand] = useState(project?.startCommand ?? '');
  const [publishDirectory, setPublishDirectory] = useState(project?.publishDirectory ?? 'dist');
  const [spaFallback, setSpaFallback] = useState(project?.spaFallback ?? false);
  const branches = useMutation({
    mutationFn: () =>
      api<{ branches: string[]; defaultBranch: string | null }>('/repositories/branches', 'POST', {
        repositoryUrl: repo,
      }),
    onSuccess: (result) => {
      if (!branch && result.defaultBranch) setBranch(result.defaultBranch);
    },
  });
  const [saved, setSaved] = useState(false);
  const mutation = useMutation({
    mutationFn: () => {
      const data = createServiceSchema.parse({
        name,
        serviceType,
        sourceType,
        runtime,
        imageUrl: sourceType === 'IMAGE' ? imageUrl : '',
        rootDirectory: sourceType === 'GIT' ? rootDirectory : '',
        dockerfilePath:
          sourceType === 'GIT' && runtime !== 'NODE' && serviceType !== 'STATIC'
            ? dockerfilePath
            : 'Dockerfile',
        buildCommand:
          sourceType === 'GIT' && (runtime !== 'DOCKER' || serviceType === 'STATIC')
            ? buildCommand
            : '',
        startCommand:
          serviceType === 'WEB' && (sourceType === 'IMAGE' || runtime !== 'DOCKER')
            ? startCommand
            : '',
        publishDirectory: serviceType === 'STATIC' ? publishDirectory : 'dist',
        spaFallback: serviceType === 'STATIC' && spaFallback,
        variables,
        deploy: !project,
        slug:
          project?.slug ??
          name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, ''),
        repositoryUrl: sourceType === 'GIT' ? repo : '',
        branch: sourceType === 'GIT' ? branch : '',
        containerPort: port,
        healthPath: health,
      });
      checkServiceConfiguration(data);
      return api<Project & { initialDeploymentId?: string }>(
        project ? `/projects/${project.id}` : '/projects',
        project ? 'PATCH' : 'POST',
        data,
      );
    },
    onSuccess: (p) => {
      setSaved(true);
      if (!project)
        router.push(
          p.initialDeploymentId
            ? `/projects/${p.id}/deployments/${p.initialDeploymentId}`
            : `/projects/${p.id}`,
        );
    },
  });
  return (
    <>
      <Link className="back" href={project ? `/projects/${project.id}` : '/'}>
        <ArrowLeft size={15} />
        Back to {project ? 'project' : 'workspace'}
      </Link>
      <div className="page-title">
        <div>
          <h1>
            {project
              ? 'Service settings'
              : serviceType === 'STATIC'
                ? 'Create a static site'
                : 'Create a web service'}
          </h1>
          <p>Connect your source. We’ll handle the container.</p>
        </div>
      </div>
      <form
        className="form-panel"
        onSubmit={(e) => {
          e.preventDefault();
          setSaved(false);
          mutation.mutate();
        }}
      >
        <div className="form-heading">
          <Github size={22} />
          <div>
            <h2>Repository configuration</h2>
            <p>Connect a trusted public repository or container image.</p>
          </div>
        </div>
        <div className="form-columns">
          <label>
            Service type
            <select
              aria-label="Service type"
              disabled={!!project}
              value={serviceType}
              onChange={(e) => {
                setServiceType(e.target.value as 'WEB' | 'STATIC');
                if (e.target.value === 'STATIC') {
                  setSourceType('GIT');
                  setRuntime('NODE');
                }
              }}
            >
              <option value="WEB">Web Service</option>
              <option value="STATIC">Static Site</option>
            </select>
          </label>
          <label>
            Source
            <select
              aria-label="Source"
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value as 'GIT' | 'IMAGE')}
            >
              <option value="GIT">Public Git Repository</option>
              {serviceType === 'WEB' && <option value="IMAGE">Existing Image</option>}
            </select>
          </label>
        </div>
        <label>
          Project name
          <input
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My awesome application"
          />
        </label>
        {sourceType === 'GIT' ? (
          <>
            <label>
              GitHub repository URL
              <input
                required
                type="url"
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                placeholder="https://github.com/you/your-app"
              />
              <small>
                Use Docker for any language, or Node for a generated build. Static sites publish
                only the output folder.
              </small>
            </label>
            <label>
              Branch
              <input
                list="repository-branches"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                placeholder="Repository default"
              />
              <small>Leave blank to use the repository’s default branch.</small>
              <datalist id="repository-branches">
                {branches.data?.branches.map((b) => (
                  <option value={b} key={b} />
                ))}
              </datalist>
            </label>
            <Button
              type="button"
              disabled={branches.isPending || !repo}
              onClick={() => branches.mutate()}
            >
              {branches.isPending ? 'Loading branches…' : 'Load repository branches'}
            </Button>
            <ErrorBox error={branches.error} />
            <label>
              Root directory
              <input
                value={rootDirectory}
                onChange={(e) => setRootDirectory(e.target.value)}
                placeholder="Optional, e.g. apps/web"
              />
            </label>
            {serviceType !== 'STATIC' && (
              <label>
                Runtime
                <select
                  aria-label="Runtime"
                  value={runtime}
                  onChange={(e) => setRuntime(e.target.value as Project['runtime'])}
                >
                  <option value="DOCKER">Docker</option>
                  <option value="NODE">Node.js 22</option>
                  <option value="AUTO">Auto detect (Docker or Node)</option>
                </select>
              </label>
            )}
            {serviceType === 'WEB' && runtime !== 'NODE' && (
              <label>
                Dockerfile path
                <input value={dockerfilePath} onChange={(e) => setDockerfilePath(e.target.value)} />
                <small>
                  Relative to the root directory; Auto uses Node when this file is absent.
                </small>
              </label>
            )}
            {(serviceType === 'STATIC' || runtime !== 'DOCKER') && (
              <label>
                Build command
                <input
                  value={buildCommand}
                  onChange={(e) => setBuildCommand(e.target.value)}
                  placeholder={
                    serviceType === 'STATIC'
                      ? 'e.g. npm ci && npm run build (blank skips build)'
                      : 'Default: npm ci or npm install'
                  }
                />
                <small>
                  Applies to Node/static builds. In Auto mode a Dockerfile takes priority and
                  defines its own build commands.
                </small>
              </label>
            )}
            {serviceType === 'WEB' && runtime !== 'DOCKER' && (
              <label>
                Start command
                <input
                  value={startCommand}
                  onChange={(e) => setStartCommand(e.target.value)}
                  placeholder="npm start"
                />
              </label>
            )}
            {serviceType === 'STATIC' && (
              <>
                <label>
                  Publish directory
                  <input
                    required
                    value={publishDirectory}
                    onChange={(e) => setPublishDirectory(e.target.value)}
                  />
                  <small>
                    Relative output folder containing index.html. Every published file is public.
                  </small>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={spaFallback}
                    onChange={(e) => setSpaFallback(e.target.checked)}
                  />
                  Rewrite SPA routes to index.html
                </label>
              </>
            )}
          </>
        ) : (
          <>
            <label>
              Public image reference
              <input
                required
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="docker.io/library/nginx:alpine"
              />
              <small>Docker Hub or GHCR. Private registry credentials are not supported.</small>
            </label>
            <label>
              Docker command (optional)
              <input value={startCommand} onChange={(e) => setStartCommand(e.target.value)} />
              <small>
                Overrides the image command using /bin/sh -c; leave blank for its default command.
              </small>
            </label>
          </>
        )}
        <div className="form-columns">
          <label>
            Container port
            <input
              required
              type="number"
              min={1}
              max={65535}
              value={port}
              onChange={(e) => setPort(Number(e.target.value))}
            />
          </label>
          <label>
            Health-check path
            <input
              required
              pattern="/.*"
              value={health}
              onChange={(e) => setHealth(e.target.value)}
              placeholder="/health"
            />
          </label>
        </div>
        <p className="help">
          Generated static servers use the configured port automatically. Web apps must listen on
          0.0.0.0 inside its container. Docker assigns an available localhost port automatically.
        </p>
        {!project && <VariableEditor variables={variables} onChange={setVariables} />}
        <ErrorBox error={mutation.error} />
        {saved && (
          <p role="status" className="success">
            Configuration saved.
          </p>
        )}
        <Button variant="default" disabled={mutation.isPending}>
          <Save size={16} />
          {mutation.isPending
            ? 'Saving…'
            : project
              ? 'Save configuration'
              : serviceType === 'STATIC'
                ? 'Deploy Static Site'
                : 'Deploy Web Service'}
        </Button>
      </form>
    </>
  );
}
