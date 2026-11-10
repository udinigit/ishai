import fs from 'fs';
const BUILD = Date.now().toString(36); // lets open pages notice a new deploy
// the shared voices (voices.js) go into every page that speaks, where it has the /*__VOICES_JS__*/ marker
const VOICES_JS = fs.readFileSync('public/voices.js','utf8');
const withVoices = (h, name) => { if (!h.includes('/*__VOICES_JS__*/')) throw new Error(name + ' has no /*__VOICES_JS__*/ marker'); return h.replace('/*__VOICES_JS__*/', () => VOICES_JS); };
const html = withVoices(fs.readFileSync('public/index.html','utf8').replace('__BUILD__', BUILD), 'index.html');
const tpl = fs.readFileSync('src/worker.template.js','utf8');

const dir = withVoices(fs.readFileSync('public/director.html','utf8'), 'director.html');
const sandbox = fs.readFileSync('public/sandbox.html','utf8');
const builder = fs.readFileSync('public/builder.html','utf8');
const intro = withVoices(fs.readFileSync('public/intro.html','utf8'), 'intro.html');
const events = fs.readFileSync('public/events.html','utf8');
const sw = fs.readFileSync('public/sw.js','utf8');
// favicons and the link-preview picture (WhatsApp etc.), served by the worker from memory
const ICON_TYPES = { '.ico':'image/x-icon', '.svg':'image/svg+xml', '.png':'image/png' };
const icons = Object.fromEntries(fs.readdirSync('public/icons').map(f => [ '/' + f, { type: ICON_TYPES[f.slice(f.lastIndexOf('.'))], b64: fs.readFileSync('public/icons/' + f).toString('base64') } ]));
const plan = fs.existsSync('../story/plan.json') ? fs.readFileSync('../story/plan.json','utf8') : '{}';
JSON.parse(plan); // fail the build early if the plan is not valid JSON
const course = fs.readFileSync('../story/course.json','utf8');
JSON.parse(course);
fs.writeFileSync('../src/index.js', tpl.replace('__BUILD__', BUILD).replace('__HTML__', () => JSON.stringify(html)).replace('__DIRECTOR_HTML__', () => JSON.stringify(dir)).replace('__SANDBOX_HTML__', () => JSON.stringify(sandbox)).replace('__BUILDER_HTML__', () => JSON.stringify(builder)).replace('__INTRO_HTML__', () => JSON.stringify(intro)).replace('__EVENTS_HTML__', () => JSON.stringify(events)).replace('__SW_JS__', () => JSON.stringify(sw)).replace('__ICONS__', () => JSON.stringify(icons)).replace('__PLAN__', () => plan).replace('__COURSE__', () => course));
console.log('built', fs.statSync('../src/index.js').size, 'bytes');
