// ================= voices: shared by the show page, the trailer and the director page =================
// build.mjs inlines this file where a page has the /*__VOICES_JS__*/ marker. No AI, no server cost.
// - Device voices: the best English voices the browser has (neural/natural first, never the novelty ones),
//   matched to each character's gender, with gentle pitch and rate.
// - HD voices: the Kokoro-82M neural voice model, run in a web worker in the viewer's browser
//   (kokoro-js from jsdelivr, weights from Hugging Face, ~90 MB once, cached by the browser).
// - The director's settings (/director → Voices) override gender, HD voice, pitch and speed per character.
const Voices = (() => {
  // phones and tablets (iPads report themselves as a Mac with touch): no HD voices there, the model is too heavy for them
  const PHONE = (() => { try { const ua = navigator.userAgent || '';
    return /Android|iPhone|iPad|iPod|Mobi|Silk|Kindle/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
      || !!(navigator.userAgentData && navigator.userAgentData.mobile); } catch(e){ return false; } })();
  const hsh = id => { let x = 0; for (const ch of String(id)) x = (x * 31 + ch.charCodeAt(0)) >>> 0; return x; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const num = v => (typeof v === 'number' && isFinite(v)) ? v : null;
  const GENDER = {zohar:'f', oren:'m', ishai:'m', levi:'f', noa:'f', avi:'m', dana:'f', tomer:'m', gadi:'m', michal:'f', sivan:'f', zelig:'m', kobi:'m', lior:'m',
    yael:'f', sasson:'m', hagit:'f', boaz:'m', ronit:'f', moti:'m', yossi:'m', radio:'m', tv:'f', narrator:'m', dj_benny:'m', dj_shira:'f', dj_yoni:'m'};
  let cfg = {}, castOf = () => null;
  const listeners = [];
  const changed = () => listeners.forEach(f => { try { f(); } catch(e){} });
  function genderOf(id){
    const o = cfg[id]; if (o && (o.g === 'm' || o.g === 'f')) return o.g;
    if (GENDER[id]) return GENDER[id];
    const c = castOf(id), L = c && c.look;
    if (c && /^(mrs|ms|miss)\b/i.test(c.name || '')) return 'f';
    if (L) return (/^(long|bun|ponytail|pigtails|braids|bob)$/.test(L.hair) || L.top === 'dress' || L.bottom === 'skirt') ? 'f' : 'm';
    return hsh(id) % 2 ? 'f' : 'm';
  }
  // each character's base pitch and rate (the show page's own table; anyone else from their id), before softening
  const BASE = {zohar:[1.35,1.15], oren:[.7,.95], ishai:[1,1], levi:[1.6,1.15], noa:[1.25,1.1], avi:[.6,.85], dana:[1,.8], narrator:[.9,1.05],
    radio:[1.1,1.15], tv:[.95,1.1], dj_benny:[1.1,1.18], dj_shira:[1.4,1.05], dj_yoni:[.75,.9]};
  const baseOf = id => { const b = BASE[id]; if (b) return {pitch: b[0], rate: b[1]}; const x = hsh(id); return {pitch: .6 + (x % 100) / 100, rate: .85 + (x % 30) / 100}; };
  // pitch and rate: the director's numbers when set, otherwise the caller's own (base, or the table above), softened
  function tone(id, base){
    const o = cfg[id] || {}, b = base || baseOf(id);
    return {pitch: num(o.pitch) ?? clamp(1 + ((b.pitch ?? 1) - 1) * .3, .85, 1.2), rate: num(o.rate) ?? clamp(1 + ((b.rate ?? 1) - 1) * .5, .9, 1.12)};
  }

  // ---- the device's voices ----
  let voices = [], voiceFor = {};
  const V_FEM = /\b(female|woman|samantha|victoria|karen|moira|tessa|fiona|serena|allison|ava|susan|zira|hazel|aria|jenny|michelle|libby|sonia|natasha|emma|clara|catherine|joanna|salli|kimberly|ivy|kendra|nicky|sara|martha|kate|amy|ashley|cora|elizabeth|jane|nancy|maisie|molly|olivia|isla|heather|linda|veena|evie|stephanie|sinead|ana|zoe|nora|jessa|monica|emily|abbi|bella|hollie)\b/i;
  const V_MAL = /\b(male|man|daniel|alex|tom|aaron|arthur|gordon|lee|rishi|oliver|thomas|david|mark|george|guy|ryan|eric|christopher|roger|steffan|brian|andrew|william|liam|james|evan|nathan|tony|jason|noah|mitchell|sean|connor|neil|prabhat|ravi|davis|brandon|elliot|ethan|alfie|matthew|joey|justin)\b/i;
  const V_BAD = /\b(albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|deranged|hysterical|princess|junior|ralph|fred|kathy|grandma|grandpa|rocko|shelley|flo|eddy|reed|sandy)\b|espeak|eloquence/i;
  const vGender = v => /google us english$/i.test(v.name) ? 'f' : V_FEM.test(v.name) ? 'f' : V_MAL.test(v.name) ? 'm' : '';
  const vScore = v => { const n = v.name + ' ' + (v.voiceURI || '');
    return (/natural|neural/i.test(n) ? 100 : /online/i.test(n) ? 90 : /google/i.test(n) ? 80 : /premium/i.test(n) ? 75 : /enhanced|siri/i.test(n) ? 65 : 30)
      - (V_BAD.test(v.name) ? 300 : 0) + (/en[-_](us|gb)/i.test(v.lang) ? 5 : 0); };
  function loadDevice(){ try { voices = speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang)); voiceFor = {}; } catch(e){} }
  if (typeof speechSynthesis !== 'undefined'){ loadDevice(); try { speechSynthesis.addEventListener('voiceschanged', loadDevice); } catch(e){ speechSynthesis.onvoiceschanged = loadDevice; } }
  function pickVoice(id){
    if (id in voiceFor) return voiceFor[id];
    const ok = voices.filter(v => vScore(v) > 0), g = genderOf(id);
    let pool = ok.filter(v => vGender(v) === g); if (!pool.length) pool = ok.filter(v => !vGender(v)); if (!pool.length) pool = ok;
    const best = Math.max(-1, ...pool.map(vScore)), tier = pool.filter(v => vScore(v) >= best - 15);
    return (voiceFor[id] = tier.length ? tier[hsh(id) % tier.length] : null);
  }

  // ---- HD voices (Kokoro) ----
  const KOKORO_URL = 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js';
  // every Kokoro English voice worth using, best first (the model's own grades); the director's dropdown lists these
  const K_LIST = [['af_heart','Heart','f','A'],['af_bella','Bella','f','A-'],['af_nicole','Nicole','f','B-'],['bf_emma','Emma (UK)','f','B-'],['af_aoede','Aoede','f','C+'],
    ['af_kore','Kore','f','C+'],['af_sarah','Sarah','f','C+'],['bf_isabella','Isabella (UK)','f','C'],['af_nova','Nova','f','C'],['af_alloy','Alloy','f','C'],['af_sky','Sky','f','C-'],
    ['am_michael','Michael','m','C+'],['am_fenrir','Fenrir','m','C+'],['am_puck','Puck','m','C+'],['bm_george','George (UK)','m','C'],['bm_fable','Fable (UK)','m','C'],
    ['am_eric','Eric','m','D'],['am_liam','Liam','m','D'],['am_onyx','Onyx','m','D'],['am_echo','Echo','m','D'],['bm_lewis','Lewis (UK)','m','D+'],['bm_daniel','Daniel (UK)','m','D']]
    .map(([id, name, g, grade]) => ({id, name, g, grade}));
  const KVOICE = {ishai:'am_michael', zohar:'af_bella', oren:'bm_george', noa:'af_heart', levi:'bf_isabella', avi:'am_fenrir', dana:'af_nicole', tomer:'am_puck',
    gadi:'am_eric', michal:'af_sky', sivan:'af_sarah', zelig:'bm_lewis', kobi:'am_onyx', lior:'bm_fable', yael:'af_kore', sasson:'bm_daniel', hagit:'af_aoede',
    boaz:'am_liam', ronit:'bf_emma', moti:'am_echo', yossi:'am_eric', radio:'am_echo', tv:'af_nova', narrator:'bm_fable', dj_benny:'am_echo', dj_shira:'af_alloy', dj_yoni:'am_onyx'};
  const K_OK = new Set(K_LIST.map(k => k.id));
  const kVoice = id => { const o = cfg[id]; if (o && K_OK.has(o.kv)) return o.kv;
    if (KVOICE[id] && !(o && o.g)) return KVOICE[id];
    const pool = K_LIST.filter(k => k.g === genderOf(id)).slice(0, 11); return pool[hsh(id) % pool.length].id; };
  const HD = {state: 'off', w: null, pct: 0, cache: new Map(), want: new Map(), doing: null, err: '', made: 0, fails: 0, device: '', rtf: 0};
  const WORKER = `let tts = null;
self.onmessage = async ({data: m}) => {
  try {
    if (m.type === 'load'){
      const { KokoroTTS } = await import('${KOKORO_URL}');
      const progress_callback = p => { if (p && p.status === 'progress' && /onnx/.test(p.file || '')) self.postMessage({type: 'progress', pct: Math.round(p.progress || 0)}); };
      // a short line both warms the model up and measures its speed; silence or NaN means this device's graphics card can't run it
      const warm = async () => { const t0 = performance.now(), a = await tts.generate('Hello there, how are you?', { voice: 'af_heart' });
        let peak = 0; for (let i = 0; i < a.audio.length; i += 50){ const v = Math.abs(a.audio[i]); if (!(v === v)) return null; if (v > peak) peak = v; }
        return peak > .01 ? { ms: performance.now() - t0, secs: a.audio.length / a.sampling_rate } : null; };
      let device = 'wasm', w = null;
      // the graphics card (WebGPU) is many times faster; it needs the full-precision model (~310 MB). Otherwise the processor with the small one (~90 MB).
      if (m.gpu && self.navigator && navigator.gpu){
        try { if (await navigator.gpu.requestAdapter()){
          tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'fp32', device: 'webgpu', progress_callback });
          w = await warm(); if (w) device = 'webgpu'; else tts = null; } }
        catch (e){ tts = null; }
      }
      if (!tts){ self.postMessage({type: 'progress', pct: 0, restart: true});
        tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'wasm', progress_callback }); w = await warm(); }
      self.postMessage({type: 'ready', device, ms: w ? w.ms : 0, secs: w ? w.secs : 0});
    } else if (m.type === 'gen'){
      const t0 = performance.now(), a = await tts.generate(m.text, { voice: m.voice, speed: m.speed });
      const pcm = a.audio; self.postMessage({type: 'audio', key: m.key, pcm, sr: a.sampling_rate, ms: performance.now() - t0}, [pcm.buffer]);
    }
  } catch (e){ self.postMessage({type: m.type === 'gen' ? 'genfail' : 'fail', key: m.key, msg: String(e && e.message || e)}); }
};`;
  const nowMs = () => (typeof NOW === 'function' ? NOW() : Date.now());
  function fail(msg){ HD.state = 'failed'; HD.err = String(msg || 'error').slice(0, 160); try { HD.w && HD.w.terminate(); } catch(e){} HD.w = null; HD.want.clear(); HD.doing = null; changed(); }
  function start(){
    if (PHONE || HD.w || HD.state === 'ready') return;
    if (HD.state === 'failed'){ HD.state = 'off'; HD.err = ''; }
    try {
      HD.w = new Worker(URL.createObjectURL(new Blob([WORKER], {type: 'text/javascript'})), {type: 'module'});
      HD.state = 'loading'; HD.pct = 0; changed();
      HD.w.onerror = e => fail(e && e.message || 'worker error');
      HD.w.onmessage = ({data: m}) => {
        if (m.type === 'progress'){ if (m.restart){ HD.pct = 0; changed(); } else if (m.pct > HD.pct){ HD.pct = Math.min(99, m.pct); changed(); } }
        else if (m.type === 'ready'){ HD.state = 'ready'; HD.device = m.device || 'wasm'; if (m.secs) HD.rtf = m.ms / 1000 / m.secs;
          try { localStorage.setItem('ishaiHD', '1'); } catch(e){} changed(); pump(); }
        else if (m.type === 'audio' || m.type === 'genfail'){
          if (m.type === 'audio' && m.pcm && m.pcm.length){ HD.cache.set(m.key, {pcm: m.pcm, sr: m.sr}); HD.made++; HD.fails = 0;
            const r = m.ms / 1000 / (m.pcm.length / m.sr); HD.rtf = HD.rtf ? HD.rtf * .7 + r * .3 : r;   // seconds of work per second of speech
            if (HD.cache.size > 200) HD.cache.delete(HD.cache.keys().next().value); }
          if (m.type === 'genfail'){ HD.err = String(m.msg || 'error').slice(0, 160); if (++HD.fails >= 3 && !HD.made){ fail('could not make speech: ' + HD.err); return; } }
          if (HD.doing === m.key) HD.doing = null; changed(); pump(); }
        else if (m.type === 'fail') fail(m.msg);
      };
      HD.w.postMessage({type: 'load', gpu: true});   // computers only (phones never start HD): try the graphics card first
    } catch(e){ fail(e && e.message); }
  }
  const keyOf = (id, text, base) => kVoice(id) + '|' + tone(id, base).rate.toFixed(2) + '|' + text;
  function pump(){
    if (HD.state !== 'ready' || HD.doing || !HD.w) return;
    const now = nowMs(); let k = null, best = Infinity;
    for (const [key, x] of HD.want){ if (x.at < now - 4000 && !x.keep){ HD.want.delete(key); continue; } if (x.at < best){ best = x.at; k = key; } }
    if (!k) return; const x = HD.want.get(k); HD.want.delete(k); HD.doing = k;
    HD.w.postMessage({type: 'gen', key: k, text: x.text, voice: x.voice, speed: x.speed});
  }
  // make a line ahead of time; `at` orders the work (earliest first), `keep` never drops it for being late
  function prefetch(id, text, at, base, keep){
    if (HD.state === 'failed' || !text) return; if (!HD.w) start();
    const k = keyOf(id, text, base); if (HD.cache.has(k) || HD.want.has(k) || HD.doing === k) return;
    HD.want.set(k, {text: String(text).slice(0, 400), voice: kVoice(id), speed: tone(id, base).rate, at: at ?? nowMs(), keep: !!keep}); pump();
  }
  const get = (id, text, base) => HD.cache.get(keyOf(id, text, base)) || null;
  // a WAV file of a made line, for pages that play speech as media (the trailer, the director's preview)
  function wav(c){
    const n = c.pcm.length, b = new ArrayBuffer(44 + n * 2), v = new DataView(b), w = (o, t) => [...t].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, c.sr, true); v.setUint32(28, c.sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, c.pcm[i])) * 32767, true);
    return new Blob([b], {type: 'audio/wav'});
  }
  // speak a line with the device's voice (used by the trailer and the director's preview; the show page has its own queue rules)
  function deviceSay(id, text, base, opts = {}){
    if (typeof speechSynthesis === 'undefined') return null;
    const u = new SpeechSynthesisUtterance(text), v = pickVoice(id), t = tone(id, base);
    if (v) u.voice = v; u.pitch = t.pitch; u.rate = t.rate; u.volume = opts.vol ?? 1;
    if (opts.cancel) speechSynthesis.cancel(); speechSynthesis.speak(u); return u;
  }
  // how fast the HD voice is on this device, in words: "0.3× speech time" = it makes a 10-second line in 3 seconds
  const speed = () => HD.rtf ? (HD.rtf < 1 ? `${HD.rtf.toFixed(2)}× speech time` : `${HD.rtf.toFixed(1)}× slower than speech`) : '';
  function info(){
    return `${voices.length} English voices` + (HD.state !== 'off' ? ` · HD ${HD.state}${HD.state === 'loading' ? ' ' + HD.pct + '%' : ''}${HD.device ? ' on ' + (HD.device === 'webgpu' ? 'GPU' : 'CPU') : ''}${speed() ? ', ' + speed() : ''}, ${HD.made} made, ${HD.want.size} waiting${HD.err ? ' (last error: ' + HD.err + ')' : ''}` : '');
  }
  return {
    genderOf, tone, baseOf, pickVoice, kVoice, deviceSay, K_LIST, KVOICE, GENDER,
    setConfig(c){ cfg = (c && typeof c === 'object') ? c : {}; voiceFor = {}; changed(); }, config: () => cfg,
    setCast(f){ castOf = typeof f === 'function' ? f : () => null; voiceFor = {}; },
    start, prefetch, get, wav, info, onChange(f){ listeners.push(f); },
    hd: () => ({state: HD.state, pct: HD.pct, made: HD.made, waiting: HD.want.size, err: HD.err, device: HD.device, rtf: HD.rtf, speed: speed()}),
    phone: PHONE, hdAllowed: () => !PHONE && typeof Worker !== 'undefined',
    wasReady: () => { if (PHONE) return false; try { return localStorage.getItem('ishaiHD') === '1'; } catch(e){ return false; } }
  };
})();
