import { spawn } from 'child_process';

const child = spawn('node', ['server.ts'], { env: { ...process.env, NODE_ENV: 'production' } });

child.stdout.on('data', (data) => console.log(`stdout: ${data}`));
child.stderr.on('data', (data) => console.error(`stderr: ${data}`));

setTimeout(() => {
  console.log("Shutting down child");
  child.kill();
  process.exit();
}, 6000);
