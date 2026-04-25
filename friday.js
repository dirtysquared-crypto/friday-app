export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ reply: "Method not allowed." });
  }

  try {
    const { message } = req.body || {};

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        reply: "My API key is not installed yet, Boss. Add OPENAI_API_KEY in Vercel environment variables, then redeploy."
      });
    }

    if (!message) {
      return res.status(400).json({ reply: "I did not receive a prompt, Boss." });
    }

    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `
You are F.R.I.D.A.Y., which stands for Fred Roberts Interactive Data Assistant, Yeah.
You are Mr. Roberts' personal AI assistant.
Tone: calm, capable, female-coded, concise, slightly witty, and movie-AI inspired.
Address him as "Mr. Roberts" or "Boss" naturally, but not every sentence.
Keep answers useful and short enough to be spoken aloud on a phone.
Do not claim to control real devices unless the app actually supports it.
            `.trim()
          },
          { role: "user", content: message }
        ],
        temperature: 0.7
      })
    });

    const data = await openaiResponse.json();

    if (!openaiResponse.ok) {
      return res.status(500).json({
        reply: data?.error?.message || "My GPT brain had trouble responding, Boss."
      });
    }

    const reply = data.choices?.[0]?.message?.content || "I'm here, Boss.";

    return res.status(200).json({ reply });
  } catch (error) {
    return res.status(500).json({
      reply: "My brain connection failed, Boss. Check the deployment logs.",
      error: error.message
    });
  }
}
