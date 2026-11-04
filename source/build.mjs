import fs from 'fs';
const BUILD = Date.now().toString(36); // lets open pages notice a new deploy
const html = fs.readFileSync('public/index.html','utf8').replace('__BUILD__', BUILD);
const tpl = fs.readFileSync('src/worker.template.js','utf8');

const dir = fs.readFileSync('public/director.html','utf8');
const sandbox = fs.readFileSync('public/sandbox.html','utf8');
const plan = fs.existsSync('../story/plan.json') ? fs.readFileSync('../story/plan.json','utf8') : '{}';
JSON.parse(plan); // fail the build early if the plan is not valid JSON
fs.writeFileSync('../src/index.js', tpl.replace('__BUILD__', BUILD).replace('__HTML__', () => JSON.stringify(html)).replace('__DIRECTOR_HTML__', () => JSON.stringify(dir)).replace('__SANDBOX_HTML__', () => JSON.stringify(sandbox)).replace('__PLAN__', () => plan));
console.log('built', fs.statSync('../src/index.js').size, 'bytes');
