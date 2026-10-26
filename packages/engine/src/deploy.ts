import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { db } from '@deploygrid/database';
import { errorMessage, positiveInt, terminal } from '@deploygrid/shared';
import { run } from './process.js';
import { transition, failDeployment, LogBuffer } from './store.js';
import { imageName, labels, startCandidate, verifyHealth, removeCandidate, owned } from './docker.js';
export async function cloneRepository(url: string, branch: string, directory: string, log: (text: string) => void) {
 await run('git',['clone','--depth','1',...(branch ? ['--branch',branch] : []),'--',url,directory],{timeout:120000,log});
}
export async function deploy(id: string, clone = cloneRepository) {
  const d = await db.deployment.findUniqueOrThrow({where:{id}});
  if(terminal(d.status)) return;
  const p = await db.project.findUniqueOrThrow({where:{id:d.projectId}});
  if(p.activeDeploymentId !== id) { await failDeployment(id,'Deployment no longer owns the project reservation'); return; }
  if(d.status !== 'QUEUED') { await removeCandidate(id,p.id); await failDeployment(id,'Interrupted attempt recovered. Redeploy to retry.'); return; }
  const log = new LogBuffer(id); let directory: string | undefined; let promoted = false;
  const flushTimer = setInterval(() => {void log.flush().catch(e => console.error(e));},1000);
  try {
    await transition(id,'CLONING');
    directory = await mkdtemp(join(tmpdir(),'deploygrid-'));
    await clone(d.repositoryUrl,d.branch,directory,log.append);
    const sha = await run('git',['rev-parse','HEAD'],{cwd:directory});
    for(const file of ['Dockerfile','package.json']) if(!(await stat(join(directory,file))).isFile()) throw new Error(`Required root ${file} is missing`);
    const image = imageName(p.id,id);
    await db.deployment.update({where:{id},data:{commitSha:sha,imageTag:image}});
    await transition(id,'BUILDING');
    await run('docker',['build',...['HTTP_PROXY','HTTPS_PROXY','NO_PROXY','http_proxy','https_proxy','no_proxy'].filter(key=>process.env[key]).flatMap(key=>['--build-arg',key]),'--progress','plain','-t',image,...labels(p.id,id),'.'],{cwd:directory,timeout:positiveInt(process.env.BUILD_TIMEOUT_MS,600000),log:log.append});
    await log.flush(); await transition(id,'STARTING');
    const candidate = await startCandidate(id,p.id,d.containerPort,image);
    await db.deployment.update({where:{id},data:candidate});
    await transition(id,'VERIFYING');
    await verifyHealth(candidate.hostPort,d.healthPath,undefined,async()=>{const c=await owned(candidate.containerId,p.id);if(c.State.Status!=='running')throw new Error(`Candidate container is ${c.State.Status}`);});
    await db.$transaction(async tx => {
      const lock = await tx.project.updateMany({where:{id:p.id,activeDeploymentId:id},data:{currentDeploymentId:id,activeDeploymentId:null,runtimeStatus:'RUNNING'}});
      if(!lock.count) throw new Error('Candidate lost promotion reservation');
      const changed = await tx.deployment.updateMany({where:{id,status:'VERIFYING'},data:{status:'SUCCEEDED',finishedAt:new Date()}});
      if(!changed.count) throw new Error('Candidate state changed before promotion');
      await tx.deploymentEvent.create({data:{deploymentId:id,type:'state',message:'SUCCEEDED'}});
    });
    promoted = true;
    if(p.currentDeploymentId) {
      const old = await db.deployment.findUnique({where:{id:p.currentDeploymentId}});
      if(old?.containerId) try { await owned(old.containerId,p.id); await run('docker',['stop',old.containerId]); } catch(e) { await db.deploymentEvent.create({data:{deploymentId:id,type:'warning',level:'warning',message:`Previous container cleanup failed: ${errorMessage(e)}`}}); }
    }
  } catch(e) {
    if(promoted) { await db.deploymentEvent.create({data:{deploymentId:id,type:'warning',level:'warning',message:errorMessage(e)}}); return; }
    log.append(errorMessage(e));
    const failed = await db.deployment.findUnique({where:{id}});
    if(failed?.containerId) { try {await owned(failed.containerId,p.id);log.append(await run('docker',['logs','--tail','50',failed.containerId]));} catch(diagnostic) {log.append(`Container diagnostics unavailable: ${errorMessage(diagnostic)}`);} }
    try { await removeCandidate(id,p.id); } catch(cleanup) { log.append(`Cleanup warning: ${errorMessage(cleanup)}`); }
    await failDeployment(id,errorMessage(e));
  } finally { clearInterval(flushTimer); await log.flush(); if(directory) await rm(directory,{recursive:true,force:true}); }
}
