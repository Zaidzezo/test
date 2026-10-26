import { Worker } from 'bullmq';
import { db } from '@deploygrid/database';
import { connection, queue, deploy, enqueue, runtimeOperation, run, removeCandidate, failDeployment } from '@deploygrid/engine';
import { positiveInt } from '@deploygrid/shared';
// A single worker process is supported. BullMQ owns each deployment during execution.
await run('docker',['info','--format','{{.ServerVersion}}']);
const worker = new Worker(process.env.DEPLOYGRID_QUEUE_NAME ?? 'deploygrid',async job => {
 if(job.name === 'deploy') await deploy(job.data.deploymentId);
 else if(job.name === 'runtime') await runtimeOperation(job.data.projectId,job.data.action,job.data.token);
},{connection,concurrency:positiveInt(process.env.WORKER_CONCURRENCY,1),lockDuration:60000});
worker.on('error',error => console.error(JSON.stringify({level:'error',message:error.message})));
worker.on('failed',(job,error) => console.error(JSON.stringify({level:'error',jobId:job?.id,message:error.message})));
let reconciling = false;
async function reconcile() {
 if(reconciling) return; reconciling = true; try {
 for(const d of await db.deployment.findMany({where:{status:{notIn:['SUCCEEDED','FAILED']}}})) {
  const job = await queue.getJob(d.id); const state = job ? await job.getState() : 'missing';
  if(d.status === 'QUEUED') { if(state === 'missing') await enqueue(d.id,d.projectId); else if(state === 'failed' || state === 'completed') {await job!.remove();await enqueue(d.id,d.projectId);} }
  else if(['missing','failed','completed'].includes(state)) {await removeCandidate(d.id,d.projectId);await failDeployment(d.id,'Abandoned deployment recovered; create a new attempt.');}
 }
 for(const p of await db.project.findMany({where:{operationToken:{not:null}}})) {
  const job = await queue.getJob(p.operationToken!);
  if(!job || ['failed','completed'].includes(await job.getState())) await db.project.updateMany({where:{id:p.id,operationToken:p.operationToken},data:{operationToken:null}});
 }
} finally {reconciling = false;}
}
await reconcile();
const timer = setInterval(() => {reconcile().catch(error => console.error(error));},10000);
console.info(JSON.stringify({level:'info',message:'DeployGrid worker ready'}));
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,async () => {clearInterval(timer); await worker.close(); await queue.close(); await db.$disconnect(); process.exit(0);});
