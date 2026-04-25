import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { motion } from "framer-motion";
import {
  Brain,
  CloudSun,
  Cpu,
  Gauge,
  Mic,
  MicOff,
  Power,
  Radar,
  Send,
  Shield,
  Volume2,
  Wifi,
  Zap
} from "lucide-react";
import "./style.css";

const FRIDAY_ACRONYM = "Fred Roberts Interactive Data Assistant, Yeah";

function chooseVoice() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => v.name.toLowerCase().includes("samantha")) ||
    voices.find((v) => v.name.toLowerCase().includes("zira")) ||
    voices.find((v) => v.name.toLowerCase().includes("female")) ||
    voices.find((v) => v.lang?.toLowerCase().startsWith("en")) ||
    voices[0]
  );
}

function speak(text, onEnd) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  const voice = chooseVoice();
  if (voice) utterance.voice = voice;

  utterance.rate = 0.92;
  utterance.pitch = 1.08;
  utterance.volume = 1;
  utterance.onend = onEnd;
  window.speechSynthesis.speak(utterance);
}

function Ring({ size, speed, reverse, level }) {
  return (
    <motion.div
      className="ring"
      style={{ width: size, height: size }}
      animate={{ rotate: reverse ? -360 : 360, scale: 1 + level * 0.16 }}
      transition={{
        rotate: { duration: speed, repeat: Infinity, ease: "linear" },
        scale: { duration: 0.15 }
      }}
    >
      <div className="ringMarker" />
      <div className="ringDot" />
    </motion.div>
  );
}

function StatusCard({ icon: Icon, label, value, detail }) {
  return (
    <div className="statusCard">
      <div className="statusTop">
        <Icon size={16} />
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function weatherText(code) {
  if (code === 0) return "Clear";
  if ([1, 2, 3].includes(code)) return "Clouds";
  if ([45, 48].includes(code)) return "Fog";
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return "Rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snow";
  if ([95, 96, 99].includes(code)) return "Storm";
  return "Active";
}

function App() {
  const [time, setTime] = useState(new Date());
  const [mode, setMode] = useState("Standby");
  const [listening, setListening] = useState(false);
  const [level, setLevel] = useState(0.05);
  const [prompt, setPrompt] = useState("");
  const [weather, setWeather] = useState({ temp: "--", wind: "--", status: "Refresh" });
  const [log, setLog] = useState([
    "F.R.I.D.A.Y. mobile HUD initialized.",
    FRIDAY_ACRONYM,
    "Type a prompt, or tap Wake and say: Friday status."
  ]);
  const recRef = useRef(null);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    window.speechSynthesis?.getVoices();

    return () => {
      clearInterval(timer);
      recRef.current?.stop?.();
      window.speechSynthesis?.cancel?.();
    };
  }, []);

  useEffect(() => {
    let pulse;
    if (["Speaking", "Listening", "Thinking", "Scanning"].includes(mode)) {
      pulse = setInterval(() => setLevel(Math.random()), 100);
    } else {
      setLevel(0.06);
    }
    return () => clearInterval(pulse);
  }, [mode]);

  const clock = useMemo(
    () => time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    [time]
  );

  const dateLine = useMemo(
    () => time.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }),
    [time]
  );

  function addLog(line) {
    setLog((items) => [line, ...items].slice(0, 8));
  }

  function say(text) {
    setMode("Speaking");
    addLog(text);
    speak(text, () => setMode(listening ? "Listening" : "Standby"));
  }

  function systemStatus() {
    say("All systems are online, Mr. Roberts. Core, network, voice, and display are operating normally.");
  }

  function runScan() {
    setMode("Scanning");
    addLog("Scan sequence initiated.");
    setTimeout(() => say("Scan complete, Boss. No immediate issues detected."), 1200);
  }

  async function loadWeather() {
    if (!navigator.geolocation) {
      setWeather({ temp: "--", wind: "--", status: "No GPS" });
      say("Location services are not available, Boss.");
      return;
    }

    addLog("Weather request started.");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,wind_speed_10m,weather_code&temperature_unit=fahrenheit&wind_speed_unit=mph`;
          const res = await fetch(url);
          const data = await res.json();

          const next = {
            temp: `${Math.round(data.current.temperature_2m)}°F`,
            wind: `${Math.round(data.current.wind_speed_10m)} mph`,
            status: weatherText(data.current.weather_code)
          };

          setWeather(next);
          say(`Current weather is ${next.status}, ${next.temp}, with wind at ${next.wind}.`);
        } catch {
          setWeather({ temp: "--", wind: "--", status: "Offline" });
          say("I could not retrieve weather data, Boss.");
        }
      },
      () => {
        setWeather({ temp: "--", wind: "--", status: "Permission off" });
        say("Location permission is off, Boss. I need location access for weather.");
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 }
    );
  }

  async function askBrain(text) {
    const clean = text.trim();
    if (!clean) return;

    setMode("Thinking");
    addLog(`Boss: ${clean}`);

    try {
      const res = await fetch("/api/friday", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: clean })
      });

      const data = await res.json();
      say(data.reply || "I'm here, Boss.");
    } catch {
      say("My brain connection failed, Boss. Check the Vercel deployment and API key.");
    }
  }

  function processCommand(text, source = "Typed") {
    const raw = text.trim();
    if (!raw) return;

    addLog(`${source}: ${raw}`);

    const q = raw.toLowerCase().replace(/^friday[, ]*/i, "").trim();

    if (q.includes("status")) systemStatus();
    else if (q.includes("weather")) loadWeather();
    else if (q.includes("scan")) runScan();
    else if (q.includes("time")) say(`The time is ${clock}, Mr. Roberts.`);
    else if (q.includes("stand for") || q.includes("acronym")) {
      say(`F.R.I.D.A.Y. stands for ${FRIDAY_ACRONYM}.`);
    } else {
      askBrain(q || raw);
    }
  }

  function submitPrompt(e) {
    e.preventDefault();
    const text = prompt.trim();
    if (!text) return;
    setPrompt("");
    processCommand(text, "Typed");
  }

  function handleVoice(text) {
    const q = text.toLowerCase();
    if (!q.includes("friday")) return;
    processCommand(text, "Heard");
  }

  function startWake() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      say("Voice recognition is not supported in this browser. Chrome on Android is recommended.");
      return;
    }

    recRef.current?.stop?.();

    const rec = new SpeechRecognition();
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = false;

    rec.onstart = () => {
      setListening(true);
      setMode("Listening");
      addLog("Wake mode armed. Say Friday, then your request.");
    };

    rec.onresult = (e) => {
      const last = e.results[e.results.length - 1][0].transcript;
      handleVoice(last);
    };

    rec.onerror = () => {
      setListening(false);
      setMode("Standby");
      addLog("Microphone recognition error.");
    };

    rec.onend = () => {
      setListening(false);
      setMode("Standby");
    };

    recRef.current = rec;
    rec.start();
  }

  function stopWake() {
    recRef.current?.stop?.();
    setListening(false);
    setMode("Standby");
    addLog("Wake mode disabled.");
  }

  return (
    <div className="app">
      <div className="grid" />
      <div className="scanLine" />

      <main className="phone">
        <header>
          <div>
            <p className="eyebrow">{FRIDAY_ACRONYM}</p>
            <h1>FRIDAY</h1>
          </div>
          <div className="miniPulse">
            <Zap size={24} />
          </div>
        </header>

        <section className="core">
          <Ring size={310} speed={22} level={level} />
          <Ring size={235} speed={15} reverse level={level} />
          <Ring size={160} speed={9} level={level} />

          <motion.div
            className="reactor"
            animate={{ scale: [1, 1 + level * 0.28, 1] }}
            transition={{ duration: 0.35 }}
          />

          <div className="coreText">
            <span>{mode}</span>
            <strong>{clock}</strong>
            <small>{dateLine}</small>
          </div>
        </section>

        <form className="promptBox" onSubmit={submitPrompt}>
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Type a prompt or command..."
          />
          <button type="submit">
            <Send size={18} />
          </button>
        </form>

        <section className="cards">
          <StatusCard icon={Cpu} label="Core" value="Online" detail="Neural link ready" />
          <StatusCard icon={Wifi} label="Network" value={navigator.onLine ? "Secure" : "Offline"} detail="Channel active" />
          <StatusCard icon={Shield} label="Security" value="Locked" detail="Private session" />
          <StatusCard icon={Gauge} label="Power" value="Stable" detail="HUD nominal" />
        </section>

        <section className="panel">
          <div className="panelHead">
            <span><CloudSun size={16} /> Weather</span>
            <button type="button" onClick={loadWeather}>Refresh</button>
          </div>
          <div className="weatherGrid">
            <div><strong>{weather.temp}</strong><small>Temp</small></div>
            <div><strong>{weather.wind}</strong><small>Wind</small></div>
            <div><strong>{weather.status}</strong><small>Status</small></div>
          </div>
        </section>

        <section className="panel">
          <div className="panelHead">
            <span><Brain size={16} /> FRIDAY Feed</span>
            <Volume2 size={16} />
          </div>
          <div className="log">
            {log.map((line, i) => <div key={i}>&gt; {line}</div>)}
          </div>
        </section>

        <section className="controls">
          <button type="button" onClick={() => say("F.R.I.D.A.Y. online. Good evening, Mr. Roberts.")}>
            <Power />Start
          </button>
          <button type="button" onClick={listening ? stopWake : startWake}>
            {listening ? <MicOff /> : <Mic />}{listening ? "Stop" : "Wake"}
          </button>
          <button type="button" onClick={systemStatus}>
            <Cpu />Status
          </button>
          <button type="button" onClick={runScan}>
            <Radar />Scan
          </button>
        </section>

        <p className="hint">
          Type anything, or say: “Friday status”, “Friday weather”, “Friday scan”, or “Friday time”.
        </p>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
