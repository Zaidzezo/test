import { describe, it, expect } from 'vitest';
import { canonicalRepository, projectSchema, canTransition, healthAccepted, errorMessage, positiveInt, statuses } from '@deploygrid/shared';
describe('repository boundary',()=>{
 it('canonicalizes GitHub URLs',()=>expect(canonicalRepository('https://github.com/acme/app.git/')).toBe('https://github.com/acme/app'));
 it.each(['http://github.com/a/b','https://gitlab.com/a/b','https://u:p@github.com/a/b','https://github.com:44/a/b','https://github.com/a/b?q=x','https://github.com/a/b#x','https://github.com/a/b/tree/main','file:///tmp/app','https://github.com/a'])('rejects %s',url=>expect(()=>canonicalRepository(url)).toThrow());
});
describe('deployment transitions',()=>{
 it.each(statuses.slice(0,5))('allows failure from %s',state=>expect(canTransition(state,'FAILED')).toBe(true));
 it('requires ordered progress',()=>{expect(canTransition('QUEUED','CLONING')).toBe(true);expect(canTransition('QUEUED','SUCCEEDED')).toBe(false);expect(canTransition('SUCCEEDED','BUILDING')).toBe(false);expect(canTransition('FAILED','STARTING')).toBe(false);});
});
describe('configuration',()=>{
 const valid={name:'Test',slug:'test-app',repositoryUrl:'https://github.com/a/b'};
 it('applies sensible defaults',()=>expect(projectSchema.parse(valid)).toMatchObject({containerPort:3000,healthPath:'/',branch:''}));
 it.each([{slug:'Bad Slug'},{containerPort:0},{containerPort:65536},{healthPath:'//evil.test'},{branch:'--upload-pack=bad'},{branch:'../bad'}])('rejects unsafe configuration %j',override=>expect(projectSchema.safeParse({...valid,...override}).success).toBe(false));
 it('validates runtime integers',()=>{expect(positiveInt(undefined,1)).toBe(1);expect(()=>positiveInt('-1',1)).toThrow();});
 it('accepts only healthy response codes',()=>{expect(healthAccepted(200)).toBe(true);expect(healthAccepted(302)).toBe(true);expect(healthAccepted(500)).toBe(false);});
 it('bounds error output',()=>expect(errorMessage(new Error('x'.repeat(6000))).length).toBe(4000));
});
