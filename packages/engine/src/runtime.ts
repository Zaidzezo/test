import { randomUUID } from 'node:crypto';
import { db } from '@deploygrid/database';
import { AppError } from '@deploygrid/shared';
import { queue } from './queue.js';
import { owned, verifyHealth } from './docker.js';
import { run } from './process.js';
export async function scheduleOperation(projectId: string, action: string) {
 const token = randomUUID();
 const reserved = await db.project.updateMany({where:{id:projectId,activeDeploymentId:null,operationToken:null},data:{operationToken:token}});
 if(!reserved.count) { if(!await db.project.findUnique({where:{id:projectId}})) throw new AppError('NOT_FOUND','Project not found',404); throw new AppError('PROJECT_BUSY','Project is busy',409); }
 try { await queue.add('runtime',{projectId,action,token},{jobId:token}); }
 catch(e) { await db.project.updateMany({where:{id:projectId,operationToken:token},data:{operationToken:null}}); throw e; }
 return {operationId:token};
}
export async function runtimeOperation(projectId: string, action: string, token: string) {
 const p = await db.project.findUnique({where:{id:projectId},include:{currentDeployment:true}});
 if(!p || p.operationToken !== token) return;
 try {
  if(action === 'delete') {
   const ids = await run('docker',['ps','-aq','--filter','label=deploygrid.managed=true','--filter',`label=deploygrid.project=${projectId}`]);
   if(ids) await run('docker',['rm','-f',...ids.split(/\s+/)]);
   const images = await run('docker',['images','-q','--filter','label=deploygrid.managed=true','--filter',`label=deploygrid.project=${projectId}`]);
   if(images) await run('docker',['image','rm',...new Set(images.split(/\s+/))]);
   await db.project.delete({where:{id:projectId}}); return;
  }
  const d = p.currentDeployment;
  if(!d?.containerId) throw new Error('No deployed container exists');
  await owned(d.containerId,projectId);
  await run('docker',[action,d.containerId]);
  const state = await owned(d.containerId,projectId);
  if(action !== 'stop' && state.State.Running) {
   const binding = state.NetworkSettings.Ports[`${d.containerPort}/tcp`]?.[0];
   if(!binding || binding.HostIp !== '127.0.0.1') throw new Error('No loopback application port found after startup');
   const hostPort = Number(binding.HostPort);
   await db.deployment.update({where:{id:d.id},data:{hostPort}});
   await verifyHealth(hostPort,d.healthPath);
  }
  await db.project.update({where:{id:projectId},data:{runtimeStatus:state.State.Running ? 'RUNNING':'STOPPED'}});
 } catch(e) {
  await db.project.update({where:{id:projectId},data:{runtimeStatus:'UNKNOWN'}});
  if(p.currentDeploymentId) await db.deploymentEvent.create({data:{deploymentId:p.currentDeploymentId,type:'runtime',level:'error',message:e instanceof Error ? e.message : 'Runtime operation failed'}});
  throw e;
 } finally { await db.project.updateMany({where:{id:projectId,operationToken:token},data:{operationToken:null}}); }
}
