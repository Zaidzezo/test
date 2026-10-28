import assert from 'node:assert/strict';
const api = `http://127.0.0.1:${process.env.API_PORT || 4000}/api`;
const gateway = `http://127.0.0.1:${process.env.GATEWAY_PORT || 8080}`;
const delay = () => new Promise((resolve) => setTimeout(resolve, 1000));
async function call(path, method = 'GET', body) {
  const res = await fetch(api + path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const value = await res.json();
  if (!res.ok) throw new Error(`${res.status}: ${JSON.stringify(value)}`);
  return value;
}
const slug = 'public-static-smoke-' + Date.now();
let project;
try {
  const branch = await call('/repositories/branches', 'POST', {
    repositoryUrl: 'https://github.com/Zaidzezo/test',
  });
  assert(branch.branches.includes('main'));
  assert.equal(branch.defaultBranch, 'main');
  console.log('Real branch API: main discovered.');
  project = await call('/projects', 'POST', {
    name: 'Public GitHub static smoke',
    slug,
    repositoryUrl: 'https://github.com/Zaidzezo/test',
    serviceType: 'STATIC',
    runtime: 'NODE',
    rootDirectory: 'examples/static-site',
    buildCommand: 'node build.mjs',
    publishDirectory: 'dist',
    spaFallback: true,
    deploy: true,
    variables: [{ name: 'PUBLIC_TITLE', value: 'Live public GitHub build' }],
  });
  const deadline = Date.now() + 240000;
  let done = false;
  while (Date.now() < deadline) {
    const deployment = await call('/deployments/' + project.initialDeploymentId);
    if (deployment.status === 'FAILED') throw Error(deployment.errorMessage);
    if (deployment.status === 'SUCCEEDED') {
      console.log('Verified source commit:', deployment.commitSha);
      done = true;
      break;
    }
    await delay();
  }
  assert(done, 'Public deployment did not finish within smoke-test deadline');
  const response = await fetch(gateway + '/dashboard/settings', {
    headers: { host: slug + '.localhost' },
  });
  assert.equal(response.status, 200);
  assert((await response.text()).includes('Live public GitHub build'));
  console.log(
    'Real production worker: cloned GitHub, built static assets with variables, served SPA route.',
  );
} finally {
  if (project) {
    const deadline = Date.now() + 650000;
    let deleted = false;
    while (Date.now() < deadline) {
      const response = await fetch(api + '/projects/' + project.id);
      if (response.status === 404) {
        deleted = true;
        break;
      }
      const current = await response.json();
      if (!current.activeDeploymentId && !current.operationToken)
        await call('/projects/' + project.id, 'DELETE', { confirm: true });
      await delay();
    }
    assert(deleted, 'Smoke-test service cleanup did not finish');
    assert.equal(
      (await fetch(gateway + '/', { headers: { host: slug + '.localhost' } })).status,
      404,
    );
    console.log('Smoke-test service deleted; gateway route removed.');
  }
}
