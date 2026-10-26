import type { Deployment } from '@deploygrid/database';
import { serviceUrl } from '@deploygrid/engine';
export function deploymentDto(d: Deployment) {
  const { environmentSnapshot, workspacePath, ...safe } = d;
  void environmentSnapshot;
  void workspacePath;
  return safe;
}
export function projectDto<
  T extends { slug: string; currentDeployment?: Deployment | null; deployments?: Deployment[] },
>(p: T) {
  return {
    ...p,
    applicationUrl: serviceUrl(p.slug),
    currentDeployment: p.currentDeployment ? deploymentDto(p.currentDeployment) : null,
    ...(p.deployments ? { deployments: p.deployments.map(deploymentDto) } : {}),
  };
}
