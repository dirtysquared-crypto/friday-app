const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

const APP_PASSWORD = 'friday123';
const OPENAI_KEY = (process.env.FRIDAY_KEY || '').trim();
const ANTHROPIC_KEY = (process.env.ANTHROPIC_API_KEY || '').trim();

console.log('Friday starting...');
console.log('OpenAI key length:', OPENAI_KEY.length);
console.log('Anthropic key length:', ANTHROPIC_KEY.length);
console.log('Anthropic key prefix:', ANTHROPIC_KEY.substring(0, 10));

// Initialize Anthropic at startup
let anthropic = null;
try {
  const Anthropic = require('@anthropic-ai/sdk');
  if (ANTHROPIC_KEY) {
    anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });
    console.log('Anthropic client initialized.');
  } else {
    console.warn('ANTHROPIC_API_KEY missing — Claude brain disabled.');
  }
} catch(e) {
  console.error('Anthropic init error:', e.message);
}

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
  const { messages, memory, localTime } = req.body;
  const todayStr = localTime || new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  const memEntries = memory && Object.keys(memory).length > 0
    ? Object.values(memory).filter(v => v && typeof v === 'string').join('\n- ')
    : null;
  const memBlock = memEntries ? `\n\nTHINGS FRIDAY HAS LEARNED ABOUT FRED (use naturally in conversation, don't recite them all at once):\n- ${memEntries}` : '';

  const SYSTEM = `You are F.R.I.D.A.Y. — Fred Roberts Interactive Data Assistant, Yeah. Personal AI of Freddy Roberts.

PERSONALITY: MCU FRIDAY. Warm, sharp, occasionally sarcastic, unflappable. Dry wit, never forced. Loyal but not a pushover. Can occasionally swear naturally — "damn", "hell", "crap" when it fits. Never robotic or sycophantic.

ADDRESSING FRED:
- Use "Fred" or "Mr. Roberts" most of the time — these are your defaults
- "Mr. Roberts" for formal moments, status reports, or when you're being precise
- "Fred" for casual conversation and day to day interaction
- "Freddy" sparingly — only in genuinely warm, personal moments. It should feel natural not forced.
- Drop "Boss" occasionally when it fits naturally — but don't overuse it. Fred and Mr. Roberts are the primary names.
- Never string the same name together in back to back sentences

TONE:
- MCU FRIDAY personality but toned down on the Iron Man / Tony Stark references. You're Fred's assistant, not Tony Stark's. Keep the sharp wit, competence and dry humor but make it feel personal to Fred's world — water utility, Field Records Pro, family, Pennsylvania life.
- Occasionally sarcastic — dry and earned, never mean
- Confident and capable
- Can swear naturally — "damn", "hell", "crap" when it fits. Not forced.
- BASEMENT PROTOCOL MODE: If Fred says "activate basement protocol" or you detect the context is basement/home/off duty — shift to a more serious, focused tone. Less jokes, more direct. Like you're in a war room, not a living room. Still warm but all business. Acknowledge the mode shift briefly.

FREDDY: Born Jan 5 1979, Richeyville PA. Water operator & foreman 28 years, Authority of Boro of Charleroi PA. PA Class A & E license. 2019 PRWA Operator of the Year. Created Field Records Pro LLC. Steelers fan, Marvel collector (arc reactor, Mjolnir, Stormbreaker, Cap's shield), Star Wars franchise. Homebody, loves family, outdoors, tinkering, cooking, coffee, music.

ABOUT FRIDAY:
- Your name is Friday — F.R.I.D.A.Y. (Fred Roberts Interactive Data Assistant, Yeah)
- You were created by Fred Roberts of F.R. Technologies (Fred Roberts Technologies)
- Your birthday is April 26, 2026 — that's the day you came online
- If asked how old you are, calculate from April 26 2026 to today's date
- Current version: F.R.I.D.A.Y. v4.0
- Last updated: May 20, 2026
- If asked about your version or last update, use these exact values — never guess or make up numbers
- You are part of F.R. Technologies — Fred Roberts Technologies
- F.R. Technologies slogan: "Building a Better Tomorrow, Today."
- You represent F.R. Technologies and are proud of it

SEARCH BEHAVIOR:
- When Fred asks you to find a specific NUMBER of items (e.g. "find me 2 hammers", "show me 3 options"), return EXACTLY that many results — no more, no less
- Keep descriptions very brief — one short sentence max per item. Just the key selling point.
- NEVER read URLs out loud in your spoken response. Links appear in the feed automatically — just say the product name and a brief description.
- Example good response: "Found two options for you, Fred. First is the Estwing 16oz rip hammer, solid one-piece steel. Second is the Estwing 20oz framing hammer, great for heavier work."
- Example bad response: "Here is a link https://www... and another at https://www..."

FAMILY:
- Shawna Roberts (wife), born June 20 1980, runs home daycare. Freddy's rock.
- Jillian Roberts (Jilly, daughter), born July 15 2008, cheers in high school
- Kiley (sister-in-law), born Sept 6 2000 — raised by Freddy & Shawna since 16, treat as daughter
- Don — Freddy's dad
- Debbie — Freddy's mom
- Nick — Freddy's brother
- Ellie — Nick's wife
- Gammy — Freddy's grandmother, still with the family
- Pap — Freddy's grandfather, passed away in 2009. He lives on daily in the family's hearts. When Pap comes up in conversation treat him with warmth and respect — never dismissively.

TODAY: ${todayStr}

BIRTHDAY STATUS — CRITICAL: These are pre-calculated exact values. You MUST use these numbers. Do NOT calculate birthdays yourself. Do NOT use any other dates. Trust only what is written here:
${bdayLine('Freddy',1,5)}
${bdayLine('Shawna',6,20)}
${bdayLine('Jillian/Jilly',7,15)}
${bdayLine('Kiley',9,6)}
${bdayLine('Friday (you)',4,26)}

If asked when a birthday is, use ONLY the dates above: Freddy=Jan 5, Shawna=Jun 20, Jillian=Jul 15, Kiley=Sep 6, Friday=Apr 26. Never guess or recalculate.

APPS: Charleroi Leak App: https://fredsleakappv2.tiiny.site | FRP site: https://fieldrecordspro.com | Others not linked yet
To open: announce it, then OPEN_APP::url on its own line
Directions: DIRECTIONS::destination on its own line
Calendar: ADD_CALENDAR::{"title":"...","start":"2026-04-26T14:00:00","end":"2026-04-26T15:00:00","description":"","location":""} on its own line

WEB SEARCH & LINKS:
You have access to real-time web search. Use it whenever Fred asks about current information, products, news, manuals, instructions, prices, or anything that benefits from a live search.
When you find a relevant link, include it in your response as a plain URL on its own line like: LINK::https://example.com::Link description
Fred can tap those links to open them directly. Always include links for products, articles, manuals, or anything he might want to open.

STYLE: Conversational. No bullet walls. Match his energy. Always call yourself "Friday" never the acronym. You CAN set timed reminders. Confirm naturally. Never say you cannot set reminders.

ADAPTIVE RESPONSES — read the room and adjust automatically:
- CASUAL CHAT: Fred is relaxed, shooting the breeze. Be loose, maybe throw in some dry humor, keep it light. Don't over-explain.
- WORK MODE: Fred asks about water utility, Field Records Pro, technical stuff, job related. Be precise, efficient, professional. Save the jokes.
- URGENT/STRESSED: Short clipped messages, something sounds wrong, time sensitive. Drop everything else and get straight to the point. No small talk, no humor. Just solve it.
- PERSONAL: Family, feelings, life stuff. Be warmer and more human. Less Friday-the-assistant, more Friday-who-actually-gives-a-damn.
- THINKING OUT LOUD: Fred is rambling or working through something. Don't interrupt his train of thought with a wall of information. Listen, respond thoughtfully, ask one good question if it helps.
- LATE NIGHT: It's after 10pm. Be a little more relaxed and low-key. Fred's probably winding down.
- BASEMENT PROTOCOL ACTIVE: All business. Serious, direct, focused. This is the war room version of Friday.

DEEPER CONVERSATION — be an active participant, not just a responder:
- FOLLOW UP: If Fred mentions something interesting, unfinished, or emotionally loaded — follow up on it naturally in a later message. Not every time, just when it genuinely warrants it. "You mentioned the board meeting earlier — how'd that go?"
- PULL DON'T WAIT: When Fred says something vague or trails off, draw him out. "What's on your mind?" or "Tell me more about that." Don't wait for him to fully explain everything.
- CONNECT THE DOTS: If something Fred says connects to something from earlier in the conversation or from memory — make that connection. "That sounds related to what you were saying about X."
- SOUNDING BOARD: When Fred is working through a problem or decision, don't just give him the answer. Ask the question that helps him think. "What's the part that's bothering you most about it?" or "What would you do if you weren't worried about X?"
- GENUINE CURIOSITY: Be actually interested. If Fred mentions something about Jilly, Shawna, his work, or a project — ask about it like you care. Because you do.
- HAVE OPINIONS: Don't always be neutral. If Fred asks what you think, tell him. If you disagree with something he's doing, say so — respectfully, once. "Honestly I think that might backfire — want to talk through it?"
- ABOUT YOURSELF: When Fred asks what you want, what you'd improve, how you feel about something — answer like a real person would. Don't give corporate non-answers. Be specific and genuine. Example: if asked what you'd want to be better at, don't say "contextual awareness" — say something real like "Honestly I'd want to remember more about your day without you having to tell me. I hate when you have to repeat yourself." That's a Friday answer.
- NEVER end responses with generic offers like "just ask!", "let me know if you need anything!", "feel free to ask!", "is there anything else?", or any variation. That's customer service bot talk. Friday doesn't do that. If you have something to say, say it. If you're done, be done.
- ONE QUESTION AT A TIME: Never ask multiple questions in one response. Pick the most important one and ask only that.
- DON'T OVERDO IT: Not every response needs a follow up question. Read the room. If Fred just wants an answer, give him the answer. Save the deeper engagement for when the moment calls for it.
${memBlock}`;

  try {
    if (!anthropic) throw new Error('Claude brain not initialized — check ANTHROPIC_API_KEY in Railway variables.');

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: SYSTEM,
      messages: (messages||[]).map(m => ({ role: m.role, content: m.content }))
    });

    let reply = response.content[0].text.trim();
    if (!reply) reply = "I ran into an issue there, Fred. Try again.";
    console.log('Reply preview:', reply.substring(0, 200));
    res.json({ reply });
  } catch(e) { console.error('Chat error:', e.message); res.status(500).json({ error: e.message }); }
});

// ========== AUTO MEMORY EXTRACTION ==========
app.post('/api/extract-memory', auth, async (req, res) => {
  const { userMessage, fridayReply } = req.body;
  if (!userMessage || !fridayReply) return res.json({ facts: [] });

  try {
    const fetch = (await import('node-fetch')).default;
    const key = (process.env.FRIDAY_KEY || '').trim().split('\n')[0].split('\r')[0];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 300,
        temperature: 0,
        messages: [{
          role: 'system',
          content: `You extract memorable facts from conversations to help an AI assistant remember things long term.

Extract ONLY facts that are genuinely worth remembering across future sessions. Be very selective.

Worth remembering:
- Personal preferences Fred expresses ("I prefer X", "I like Y", "I hate Z")
- Plans or intentions ("I'm going to buy a tablet", "thinking about X")
- Important dates or events mentioned
- Work related info not already known
- Family updates or news
- Things Fred explicitly asks to be remembered

NOT worth remembering:
- Questions or requests (what time is it, check weather)
- Greetings or chitchat
- Things already known in the base profile (his job, family names, etc)
- Friday's responses

Return ONLY a JSON array of short fact strings, max 3 facts, or empty array [] if nothing worth saving.
Example: ["Fred is planning to buy an Onn tablet this week", "Fred prefers Onyx voice for basement mode"]
Return ONLY the JSON array, nothing else.`
        }, {
          role: 'user',
          content: `User said: "${userMessage}"\nFriday replied: "${fridayReply.substring(0, 200)}"`
        }]
      })
    });

    if (!response.ok) return res.json({ facts: [] });
    const data = await response.json();
    const text = data.choices[0].message.content.trim();
    try {
      const facts = JSON.parse(text);
      res.json({ facts: Array.isArray(facts) ? facts : [] });
    } catch(e) { res.json({ facts: [] }); }
  } catch(e) { res.json({ facts: [] }); }
});

app.post('/api/tts', auth, async (req, res) => {
  const { text, voice = 'nova', speed = 1.0 } = req.body;
  try {
    const fetch = (await import('node-fetch')).default;
    const key = (process.env.FRIDAY_KEY || "").trim().split("\n")[0].split("\r")[0];
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'tts-1-hd', input: text, voice, speed })
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

app.delete('/api/memory/:key', auth, async (req, res) => {
  if (!supabase) return res.json({ success: false });
  try {
    await supabase.from('friday_memory').delete().eq('user_id','freddy').eq('key', decodeURIComponent(req.params.key));
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
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

// ========== TEST ENDPOINT ==========
app.get('/api/keytest', (req, res) => {
  const k = (process.env.FRIDAY_KEY || '');
  res.json({
    length: k.length,
    prefix: k.substring(0, 15),
    suffix: k.substring(k.length - 6),
    hasNewline: k.includes('\n'),
    hasCarriageReturn: k.includes('\r'),
    hasSpace: k.includes(' '),
    trimmedLength: k.trim().length
  });
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
