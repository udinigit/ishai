import fs from 'fs';
const html = fs.readFileSync('public/index.html','utf8');
const tpl = fs.readFileSync('src/worker.template.js','utf8');

const dir = fs.readFileSync('public/director.html','utf8');
fs.writeFileSync('../src/index.js', tpl.replace('__HTML__', () => JSON.stringify(html)).replace('__DIRECTOR_HTML__', () => JSON.stringify(dir)));
console.log('built', fs.statSync('../src/index.js').size, 'bytes');
