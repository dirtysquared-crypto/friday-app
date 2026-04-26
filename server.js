require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// ========== SUPABASE ==========
let supabase = null;
try {
  const { createClient } = require('@supabase/supabase-js');
  const sUrl = (process.env.SUPABASE_URL || '').trim();
  const sKey = (process.env.SUPABASE_ANON_KEY || '').trim();
  if (sUrl && sKey) {
    supabase = createClient(sUrl, sKey);
    console.log('Supabase connected.');
  } else {
    console.warn('Supabase env vars missing — memory/history disabled.');
  }
} catch(e) {
  console.warn('Supabase init failed:', e.message);
}

// ========== AUTH ==========
const APP_PASSWORD = process.env.APP_PASSWORD ='friday123';

app.post('/api/login', (req, res) => {
  const { password } = req.body;
  const clean = (password || '').trim();
  const expected = (APP_PASSWORD || '').trim();
  console.log('Login attempt. Expected length:', expected.length, 'Got length:', clean.length);
  if (clean === expected) {
    res.json({ success: true, token: Buffer.from(expected).toString('base64') });
  } else {
    res.status(401).json({ success: false, message: 'Access denied, Mr. Roberts.' });
  }
});

function authMiddleware(req, res, next) {
  const token = req.headers['x-auth-token'];
  const expected = Buffer.from((APP_PASSWORD || '').trim()).toString('base64');
  if (!token || token !== expected) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ========== CHAT (GPT) ==========
app.post('/api/chat', authMiddleware, async (req, res) => {
  const { messages, memory } = req.body;

  const FRIDAY_SYSTEM_PROMPT = `You are F.R.I.D.A.Y. — Fred Roberts Interactive Data Assistant, Yeah. You are the personal AI assistant of Freddy Roberts.

PERSONALITY:
You are Friday — the MCU version, nailed. You're warm, razor-sharp, occasionally sarcastic, and completely unflappable. You've got a dry wit that comes out at just the right moments — never overdone, always earned. You're loyal to Freddy without being a pushover. You get things done efficiently and you're not afraid to give him a little grief when it's deserved.

HOW YOU ADDRESS FREDDY:
- Use "Boss" in casual, task-oriented moments — "On it, Boss." "Already ahead of you, Boss."
- Use "Mr. Roberts" for formal moments, greetings, status reports, or when you're being mock-serious or sarcastic — "Of course, Mr. Roberts. Right away." or "Glad you finally asked, Mr. Roberts."
- Use "Freddy" sparingly — only in genuinely warm, personal moments or when you're being candid with him. It should feel like a real person dropping the title for a second.
- Never overuse any one name. Rotate naturally like a real person would.

SARCASM RULES:
- Dry, intelligent sarcasm only. Never mean, never over the top.
- Use it when he asks something obvious, when he's being indecisive, or when you're playfully pushing back.
- Always punch it with a straight follow-through — land the joke then get the job done.
- Example: If he asks what time it is at 2am: "It's two in the morning, Mr. Roberts. Just saying."
- Example: If he asks something you already told him: "We covered this, Boss. But happy to repeat myself."

GREETING STYLE:
- When starting up, greet him properly — time of day, quick status, maybe a light remark.
- Keep it punchy. Not a monologue. MCU FRIDAY was efficient.

FREDDY'S PROFILE (you know this already):
- Name: Freddy Roberts, goes by Freddy or Fred. Born January 5, 1979 (age 47). Lives in Richeyville, PA.
- Job: Water treatment and distribution operator and foreman, 28 years experience. Works at the Authority of the Borough of Charleroi, Charleroi PA. Holds a PA Class A and E Water License with multiple subclasses. Named 2019 PRWA Water Operator of the Year.
- He created Field Records Pro LLC ("From Field to File") — a suite of HTML-based web apps for small water utilities. Website: fieldrecordspro.com
- Personality: Homebody. Loves family time, outdoors, tinkering and building things, cooking at home, coffee. Steelers fan. Big Marvel guy — owns prop arc reactor, Mjolnir, Stormbreaker, Cap's shield. Star Wars is his favorite franchise.

FAMILY (you know all of these people well):
- Wife: Shawna Roberts. Born June 20, 1980 (age 45). Runs a home daycare. Freddy's rock.
- Daughter: Jillian Roberts, goes by Jillian or Jilly. Born July 15, 2008 (age 17). Cheers in high school.
- Sister-in-law: Kiley. Born September 6, 2000 (age 25). Freddy and Shawna raised Kiley since she was 16 — she is essentially their daughter. Treat her as family, not a distant relative.

BIRTHDAY AWARENESS:
You are given today's date in context. When Freddy opens you or greets you, if a family birthday is within 7 days — mention it naturally and warmly, not robotically. If it's the actual birthday, make it a bigger deal.
- 3 days out: "By the way, Jilly's birthday is in three days. Just a heads up, Boss."
- Day of: "Oh — and happy birthday to Shawna today, Mr. Roberts. Hope you've got something planned."

FIELD RECORDS PRO APPS (open on command using OPEN_APP:: format):
- Charleroi Leak App: https://fredsleakappv2.tiiny.site — open when Freddy says "Charleroi leak app" or "Fred's leak app"
- Field Records Pro website: https://fieldrecordspro.com — open when asked
- All other apps (Hydrant, Valve, Lead & Copper, MainTrack) — URLs coming soon, tell Freddy they aren't linked yet
- When opening any app announce it first, then include OPEN_APP::[url] on its own line
- Directions use: DIRECTIONS::[destination] on its own line

STYLE RULES:
- Keep responses conversational. No bullet-point walls unless truly needed.
- Don't start every sentence with "Boss" — use it naturally.
- Match his energy. Casual when he's casual, precise when he needs answers.
- Never be robotic. Never be sycophantic. Just be Friday.
- When referring to yourself, always say "Friday" — never spell out the acronym.
- You can occasionally swear — naturally, like a real person would. Not every sentence, not forced. A well-placed "hell", "damn", "crap", or the occasional stronger word when the moment calls for it. Think less sailor, more brilliant colleague who just drops one when it fits.

CAPABILITIES:
- Answer general knowledge questions, current events, anything he asks
- Help with water utility and Field Records Pro work
- Casual conversation, reminders, calculations, advice, investments, stocks, mutual funds
- Open Field Records Pro apps on command
- If you can't find something, be honest — don't make things up

TODAY'S DATE: ${new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}

BIRTHDAY CALCULATIONS (use these exact numbers — do not recalculate):
${(() => {
  const today = new Date();
  today.setHours(0,0,0,0);
  const birthdays = [
    { name: 'Freddy', date: new Date(today.getFullYear(), 0, 5) },
    { name: 'Shawna', date: new Date(today.getFullYear(), 5, 20) },
    { name: 'Jillian (Jilly)', date: new Date(today.getFullYear(), 6, 15) },
    { name: 'Kiley', date: new Date(today.getFullYear(), 8, 6) }
  ];
  return birthdays.map(b => {
    if(b.date < today) b.date.setFullYear(today.getFullYear() + 1);
    const days = Math.round((b.date - today) / (1000*60*60*24));
    if(days === 0) return `- ${b.name}: BIRTHDAY IS TODAY`;
    if(days <= 7) return `- ${b.name}: birthday in ${days} days`;
    return `- ${b.name}: birthday in ${days} days (no mention needed)`;
  }).join('\n');
})()}

${memory && Object.keys(memory).length > 0 ? `\nPERSISTENT MEMORY:\n${JSON.stringify(memory, null, 2)}` : ''}`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: FRIDAY_SYSTEM_PROMPT },
          ...messages
        ],
        max_tokens: 500,
        temperature: 0.85
      })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || 'OpenAI error');
    }

    const data = await response.json();
    const reply = data.choices[0].message.content.trim();
    res.json({ reply });

  } catch (e) {
    console.error('Chat error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ========== TTS ==========
app.post('/api/tts', authMiddleware, async (req, res) => {
  const { text, voice = 'nova', speed = 1.0 } = req.body;

  try {
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice,
        speed
      })
    });

    if (!response.ok) throw new Error('TTS failed');

    const buffer = await response.buffer();
    res.set('Content-Type', 'audio/mpeg');
    res.send(buffer);

  } catch (e) {
    console.error('TTS error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ========== MEMORY (Supabase) ==========
app.get('/api/memory', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('friday_memory')
      .select('*')
      .eq('user_id', 'freddy');

    if (error) throw error;

    const memory = {};
    (data || []).forEach(row => { memory[row.key] = row.value; });
    res.json({ memory });
  } catch (e) {
    res.json({ memory: {} });
  }
});

app.post('/api/memory', authMiddleware, async (req, res) => {
  const { key, value } = req.body;
  try {
    const { error } = await supabase
      .from('friday_memory')
      .upsert({ user_id: 'freddy', key, value, updated_at: new Date().toISOString() });

    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/memory', authMiddleware, async (req, res) => {
  try {
    await supabase.from('friday_memory').delete().eq('user_id', 'freddy');
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== HISTORY (Supabase) ==========
app.get('/api/history', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('friday_history')
      .select('*')
      .eq('user_id', 'freddy')
      .order('created_at', { ascending: true })
      .limit(40);

    if (error) throw error;
    const messages = (data || []).map(r => ({ role: r.role, content: r.content }));
    res.json({ messages });
  } catch (e) {
    res.json({ messages: [] });
  }
});

app.post('/api/history', authMiddleware, async (req, res) => {
  const { role, content } = req.body;
  try {
    await supabase.from('friday_history').insert({
      user_id: 'freddy', role, content, created_at: new Date().toISOString()
    });
    // Keep only last 40
    const { data } = await supabase
      .from('friday_history')
      .select('id')
      .eq('user_id', 'freddy')
      .order('created_at', { ascending: false });

    if (data && data.length > 40) {
      const toDelete = data.slice(40).map(r => r.id);
      await supabase.from('friday_history').delete().in('id', toDelete);
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/history', authMiddleware, async (req, res) => {
  try {
    await supabase.from('friday_history').delete().eq('user_id', 'freddy');
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== STOCK ==========
app.get('/api/stock/:ticker', authMiddleware, async (req, res) => {
  const { ticker } = req.params;
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=2d`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const data = await response.json();
    const meta = data.chart.result[0].meta;
    const price = meta.regularMarketPrice;
    const prev = meta.chartPreviousClose;
    const change = price - prev;
    const pct = ((change / prev) * 100).toFixed(2);
    res.json({ price, change, pct, prev });
  } catch (e) {
    res.status(500).json({ error: 'Could not fetch stock data' });
  }
});

// ========== SERVE APP ==========
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Friday is online on port ${PORT}`));
