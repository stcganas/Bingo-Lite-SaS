import { spawnSync } from 'child_process';
const result = spawnSync('node', ['--version'], { encoding: 'utf-8' });
console.log("VERSION:", result.stdout);
const result2 = spawnSync('node', ['server.ts'], { env: { ...process.env, NODE_ENV: 'production' }, encoding: 'utf-8', timeout: 5000 });
console.log("STATUS:", result2.status);
console.log("ERROR:", result2.error?.message);
console.log("STDOUT:", result2.stdout?.substring(0, 500));
console.log("STDERR:", result2.stderr?.substring(0, 500));
