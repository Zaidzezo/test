export interface Deployment {
  id: string;
  projectId: string;
  status: string;
  kind: string;
  sourceDeploymentId: string | null;
  commitSha: string | null;
  hostPort: number | null;
  containerId: string | null;
  imageTag: string | null;
  errorMessage: string | null;
  createdAt: string;
  finishedAt: string | null;
  startedAt: string | null;
  cleanupPending: boolean;
  cleanupError: string | null;
}
export interface Project {
  serviceType: 'WEB' | 'STATIC';
  sourceType: 'GIT' | 'IMAGE';
  runtime: 'AUTO' | 'NODE' | 'DOCKER';
  imageUrl: string;
  rootDirectory: string;
  dockerfilePath: string;
  buildCommand: string;
  startCommand: string;
  publishDirectory: string;
  spaFallback: boolean;
  id: string;
  name: string;
  slug: string;
  repositoryUrl: string;
  branch: string;
  containerPort: number;
  healthPath: string;
  runtimeStatus: string;
  currentDeploymentId: string | null;
  activeDeploymentId: string | null;
  operationToken: string | null;
  currentDeployment: Deployment | null;
  deployments: Deployment[];
  applicationUrl: string;
  desiredRunning: boolean;
  healthFailures: number;
  lastCheckedAt: string | null;
  healthMessage: string | null;
  shareEnabled: boolean;
  publicUrl: string | null;
  sharingStatus: string;
  sharingError: string | null;
}
export interface Event {
  id: number;
  type: string;
  level: string;
  message: string;
  createdAt: string;
}
export interface HealthCheck {
  id: string;
  status: string;
  httpStatus: number | null;
  responseTimeMs: number | null;
  message: string | null;
  checkedAt: string;
}
export interface SystemStatus {
  database: boolean;
  redis: boolean;
  docker: boolean;
  worker: boolean;
  gatewayPort: number;
}
export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch('/api' + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? 'Request failed');
  return data;
}
