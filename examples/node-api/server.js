import http from 'node:http';
const port = Number(process.env.PORT || 3000);
const server = http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(req.url === '/health' ? {status:'ok'} : {message:'Hello from DeployGrid',version:'1.0.0'}));}).listen(port,'0.0.0.0',()=>console.info('Example listening on '+port));

for (const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>server.close(()=>process.exit(0)));
