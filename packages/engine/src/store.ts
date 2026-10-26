import { db, Prisma } from '@deploygrid/database';
import { AppError, canTransition, type Status } from '@deploygrid/shared';
export async function transition(id: string, to: Status, message = to) {
  return db.$transaction(async tx => {
    const d = await tx.deployment.findUniqueOrThrow({where:{id}});
    if (!canTransition(d.status, to)) throw new AppError('INVALID_TRANSITION', `${d.status} → ${to}`,409);
    const result = await tx.deployment.updateMany({where:{id,status:d.status}, data:{status:to, ...(to === 'CLONING' ? {startedAt:new Date()} : {}), ...(['SUCCEEDED','FAILED'].includes(to) ? {finishedAt:new Date()} : {})}});
    if (!result.count) throw new AppError('STATE_CONFLICT','Deployment changed concurrently',409);
    await tx.deploymentEvent.create({data:{deploymentId:id,type:'state',level:to === 'FAILED' ? 'error':'info',message}});
  });
}
export async function reserveDeployment(projectId: string) {
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT \"id\" FROM \"Project\" WHERE \"id\" = ${projectId} FOR UPDATE`;
    const p = await tx.project.findUnique({where:{id:projectId}});
    if (!p) throw new AppError('NOT_FOUND','Project not found',404);
    if(p.activeDeploymentId || p.operationToken) throw new AppError('PROJECT_BUSY','A deployment or runtime operation is already in progress.',409);
    const d = await tx.deployment.create({data:{projectId,repositoryUrl:p.repositoryUrl,branch:p.branch,containerPort:p.containerPort,healthPath:p.healthPath}});
    const lock = await tx.project.updateMany({where:{id:projectId,activeDeploymentId:null,operationToken:null},data:{activeDeploymentId:d.id}});
    if (!lock.count) throw new AppError('PROJECT_BUSY','A deployment or runtime operation is already in progress.',409);
    await tx.deploymentEvent.create({data:{deploymentId:d.id,type:'state',message:'QUEUED'}});
    return d;
  });
}
export async function failDeployment(id: string, message: string) {
  await db.$transaction(async tx => {
    const d = await tx.deployment.findUniqueOrThrow({where:{id}});
    if (d.status === 'SUCCEEDED' || d.status === 'FAILED') return;
    await tx.deployment.update({where:{id},data:{status:'FAILED',errorMessage:message,finishedAt:new Date()}});
    await tx.deploymentEvent.create({data:{deploymentId:id,type:'state',level:'error',message}});
    await tx.project.updateMany({where:{id:d.projectId,activeDeploymentId:id},data:{activeDeploymentId:null}});
  });
}
export class LogBuffer {
  private lines: string[] = []; private count = 0; private pending = Promise.resolve();
  constructor(private id: string) {}
  append = (text: string) => { for (const line of text.split(/\r?\n/)) if(line && this.count++ < 5000) this.lines.push(line.slice(0,2000)); if(this.lines.length >= 40) this.flush(); };
  flush() { const batch = this.lines.splice(0); if(batch.length) this.pending = this.pending.then(async () => {await db.deploymentEvent.createMany({data:batch.map(message => ({deploymentId:this.id,type:'log',message}))});}); return this.pending; }
}
export const projectInclude = {currentDeployment:true,deployments:{orderBy:{createdAt:'desc'},take:1}} satisfies Prisma.ProjectInclude;
