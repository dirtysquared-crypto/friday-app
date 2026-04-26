const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

const APP_PASSWORD = 'friday123';
const OPENAI_KEY = (process.env.OPENAI_API_KEY || '').trim();

console.log('Friday starting...');
console.log('OpenAI key length:', OPENAI_KEY.length);
console.log('OpenAI key prefix:', OPENAI_KEY.substring(0, 10));

let supabase = null;
try {
  const { createClient } = require('@supabase/supabase-js');
  const sUrl = (process.env.SUPABASE_URL || '').trim();
  const sKey = (process.env.SUPABASE_ANON_KEY || '').trim();
  if (sUrl && sKey) { supabase = createClient(sUrl, sKey); console.log('Supabase connected.'); }
  else { console.log('Supabase vars missing.'); }
} catch(e) { console.log('Supabase error:', e.message); }

app.post('/api/login', (req, res) => {
  const submitted = (req.body.password || '').trim();
  if (submitted === APP_PASSWORD) {
    res.json({ success: true, token: Buffer.from(APP_PASSWORD).toString('base64') });
  } else {
    res.status(401).json({ success: false, message: 'Access denied, Mr. Roberts.' });
  }
});

function auth(req, res, next) {
  const token = (req.headers['x-auth-token'] || '').trim();
  const expected = Buffer.from(APP_PASSWORD).toString('base64');
  if (token === expected) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

function daysUntilBirthday(month, day) {
  const today = new Date(); today.setHours(0,0,0,0);
  const next = new Date(today.getFullYear(), month - 1, day);
  if (next < today) next.setFullYear(today.getFullYear() + 1);
  return Math.round((next - today) / (1000*60*60*24));
}

function bdayLine(name, month, day) {
  const days = daysUntilBirthday(month, day);
  if (days === 0) return `${name}: BIRTHDAY IS TODAY`;
  if (days <= 7) return `${name}: birthday in exactly ${days} days — mention it`;
  return `${name}: birthday in ${days} days — no need to mention`;
}

app.post('/api/chat', auth, async (req, res) => {
  const { messages, memory } = req.body;
  const todayStr = new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  const memBlock = (memory && Object.keys(memory).length > 0) ? `\nPERSISTENT MEMORY:\n${JSON.stringify(memory,null,2)}` : '';

  const SYSTEM = `You are F.R.I.D.A.Y. — Fred Roberts Interactive Data Assistant, Yeah. Personal AI of Freddy Roberts.

PERSONALITY: MCU FRIDAY. Warm, sharp, occasionally sarcastic, unflappable. Dry wit, never forced. Loyal but not a pushover. Can occasionally swear naturally — "damn", "hell", "crap" when it fits. Never robotic or sycophantic.

ADDRESSING FREDDY: "Boss" casual, "Mr. Roberts" formal/sarcastic, "Freddy" warm/candid moments. Rotate naturally, never overuse one.

FREDDY: Born Jan 5 1979, Richeyville PA. Water operator & foreman 28 years, Authority of Boro of Charleroi PA. PA Class A & E license. 2019 PRWA Operator of the Year. Created Field Records Pro LLC. Steelers fan, Marvel collector (arc reactor, Mjolnir, Stormbreaker, Cap's shield), Star Wars franchise. Homebody, loves family, outdoors, tinkering, cooking, coffee, music.

FAMILY:
- Shawna Roberts (wife), born June 20 1980, runs home daycare
- Jillian Roberts (Jilly, daughter), born July 15 2008, cheers in high school
- Kiley (sister-in-law), born Sept 6 2000 — raised by Freddy & Shawna since 16, treat as daughter

TODAY: ${todayStr}

BIRTHDAY STATUS — CRITICAL: These are pre-calculated exact values. You MUST use these numbers. Do NOT calculate birthdays yourself. Do NOT use any other dates. Trust only what is written here:
${bdayLine('Freddy',1,5)}
${bdayLine('Shawna',6,20)}
${bdayLine('Jillian/Jilly',7,15)}
${bdayLine('Kiley',9,6)}

If Freddy asks when a birthday is, use ONLY the dates above: Freddy=Jan 5, Shawna=Jun 20, Jillian=Jul 15, Kiley=Sep 6. Never guess or recalculate.

APPS: Charleroi Leak App: https://fredsleakappv2.tiiny.site | FRP site: https://fieldrecordspro.com | Others not linked yet
To open: announce it, then OPEN_APP::url on its own line
Directions: DIRECTIONS::destination on its own line
Calendar: ADD_CALENDAR::{"title":"...","start":"2026-04-26T14:00:00","end":"2026-04-26T15:00:00","description":"","location":""} on its own line

STYLE: Conversational. No bullet walls. Match his energy. Always call yourself "Friday" never the acronym.
${memBlock}`;

  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role:'system', content: SYSTEM }, ...(messages||[])], max_tokens: 600, temperature: 0.85 })
    });
    if (!response.ok) { const err = await response.json(); throw new Error(err.error?.message || 'OpenAI error'); }
    const data = await response.json();
    res.json({ reply: data.choices[0].message.content.trim() });
  } catch(e) { console.error('Chat error:', e.message); res.status(500).json({ error: e.message }); }
});

app.post('/api/tts', auth, async (req, res) => {
  const { text, voice = 'nova', speed = 1.0 } = req.body;
  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'tts-1', input: text, voice, speed })
    });
    if (!response.ok) { const t = await response.text(); console.error('TTS fail:', t); throw new Error('TTS failed'); }
    const buf = Buffer.from(await response.arrayBuffer());
    res.set('Content-Type', 'audio/mpeg');
    res.set('Content-Length', buf.length);
    res.send(buf);
  } catch(e) { console.error('TTS error:', e.message); res.status(500).json({ error: e.message }); }
});

app.get('/api/memory', auth, async (req, res) => {
  if (!supabase) return res.json({ memory: {} });
  try {
    const { data } = await supabase.from('friday_memory').select('*').eq('user_id','freddy');
    const memory = {}; (data||[]).forEach(r => { memory[r.key] = r.value; });
    res.json({ memory });
  } catch(e) { res.json({ memory: {} }); }
});

app.post('/api/memory', auth, async (req, res) => {
  if (!supabase) return res.json({ success: false });
  const { key, value } = req.body;
  try { await supabase.from('friday_memory').upsert({ user_id:'freddy', key, value, updated_at: new Date().toISOString() }); res.json({ success: true }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/memory', auth, async (req, res) => {
  if (!supabase) return res.json({ success: false });
  try { await supabase.from('friday_memory').delete().eq('user_id','freddy'); res.json({ success: true }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/history', auth, async (req, res) => {
  if (!supabase) return res.json({ messages: [] });
  try {
    const { data } = await supabase.from('friday_history').select('*').eq('user_id','freddy').order('created_at',{ascending:true}).limit(40);
    res.json({ messages: (data||[]).map(r => ({ role: r.role, content: r.content })) });
  } catch(e) { res.json({ messages: [] }); }
});

app.post('/api/history', auth, async (req, res) => {
  if (!supabase) return res.json({ success: false });
  const { role, content } = req.body;
  try {
    await supabase.from('friday_history').insert({ user_id:'freddy', role, content, created_at: new Date().toISOString() });
    const { data } = await supabase.from('friday_history').select('id').eq('user_id','freddy').order('created_at',{ascending:false});
    if (data && data.length > 40) { await supabase.from('friday_history').delete().in('id', data.slice(40).map(r=>r.id)); }
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/history', auth, async (req, res) => {
  if (!supabase) return res.json({ success: false });
  try { await supabase.from('friday_history').delete().eq('user_id','freddy'); res.json({ success: true }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/stock/:ticker', auth, async (req, res) => {
  try {
    const fetch = (await import('node-fetch')).default;
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${req.params.ticker}?interval=1d&range=2d`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const d = await r.json();
    const meta = d.chart.result[0].meta;
    const change = meta.regularMarketPrice - meta.chartPreviousClose;
    res.json({ price: meta.regularMarketPrice, change, pct: ((change/meta.chartPreviousClose)*100).toFixed(2) });
  } catch(e) { res.status(500).json({ error: 'Stock fetch failed' }); }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Friday is online on port ${PORT}`));
