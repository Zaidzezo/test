'use client';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Github, Save } from 'lucide-react';
import Link from 'next/link';
import { api, type Project } from '../lib/api';
import { ErrorBox } from './common';
import { createServiceSchema, type EnvironmentVariable } from '@deploygrid/shared';
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
  const [saved, setSaved] = useState(false);
  const mutation = useMutation({
    mutationFn: () =>
      api<Project & { initialDeploymentId?: string }>(
        project ? `/projects/${project.id}` : '/projects',
        project ? 'PATCH' : 'POST',
        createServiceSchema.parse({
          name,
          variables,
          deploy: !project,
          slug:
            project?.slug ??
            name
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-|-$/g, ''),
          repositoryUrl: repo,
          branch,
          containerPort: port,
          healthPath: health,
        }),
      ),
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
          <h1>{project ? 'Service settings' : 'Create a web service'}</h1>
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
            <p>Connect a trusted public repository with a root Dockerfile.</p>
          </div>
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
            A root Dockerfile is required. Any language supported by your Dockerfile can run.
          </small>
        </label>
        <label>
          Branch
          <input
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            placeholder="Repository default"
          />
          <small>Leave blank to use the repository’s default branch.</small>
        </label>
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
          Your app must listen on 0.0.0.0 inside its container. Docker assigns an available
          localhost port automatically.
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
          {mutation.isPending ? 'Saving…' : project ? 'Save configuration' : 'Deploy Web Service'}
        </Button>
      </form>
    </>
  );
}
