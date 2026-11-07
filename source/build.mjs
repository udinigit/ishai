import fs from 'fs';
const BUILD = Date.now().toString(36); // lets open pages notice a new deploy
const html = fs.readFileSync('public/index.html','utf8').replace('__BUILD__', BUILD);
const tpl = fs.readFileSync('src/worker.template.js','utf8');

const dir = fs.readFileSync('public/director.html','utf8');
const sandbox = fs.readFileSync('public/sandbox.html','utf8');
const builder = fs.readFileSync('public/builder.html','utf8');
const intro = fs.readFileSync('public/intro.html','utf8');
const sw = fs.readFileSync('public/sw.js','utf8');
// favicons and the link-preview picture (WhatsApp etc.), served by the worker from memory
const ICON_TYPES = { '.ico':'image/x-icon', '.svg':'image/svg+xml', '.png':'image/png' };
const icons = Object.fromEntries(fs.readdirSync('public/icons').map(f => [ '/' + f, { type: ICON_TYPES[f.slice(f.lastIndexOf('.'))], b64: fs.readFileSync('public/icons/' + f).toString('base64') } ]));
const plan = fs.existsSync('../story/plan.json') ? fs.readFileSync('../story/plan.json','utf8') : '{}';
JSON.parse(plan); // fail the build early if the plan is not valid JSON
const course = fs.readFileSync('../story/course.json','utf8');
JSON.parse(course);
fs.writeFileSync('../src/index.js', tpl.replace('__BUILD__', BUILD).replace('__HTML__', () => JSON.stringify(html)).replace('__DIRECTOR_HTML__', () => JSON.stringify(dir)).replace('__SANDBOX_HTML__', () => JSON.stringify(sandbox)).replace('__BUILDER_HTML__', () => JSON.stringify(builder)).replace('__INTRO_HTML__', () => JSON.stringify(intro)).replace('__SW_JS__', () => JSON.stringify(sw)).replace('__ICONS__', () => JSON.stringify(icons)).replace('__PLAN__', () => plan).replace('__COURSE__', () => course));
console.log('built', fs.statSync('../src/index.js').size, 'bytes');
