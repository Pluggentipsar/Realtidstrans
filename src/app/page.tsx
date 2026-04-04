'use client';

import Link from 'next/link';
import { useState, useEffect, useCallback, useRef } from 'react';

// ── Demo data ──────────────────────────────────────────────
const SPEAKERS = {
  anna: { name: 'Anna Lindberg', color: '#d97706', role: 'Moderator' },
  erik: { name: 'Erik Holm', color: '#8b5cf6', role: 'Forskare' },
};

const DEMO_LINES = [
  { speaker: 'anna', text: 'Välkomna till dagens panelsamtal om AI i skolan. Erik, du har forskat på det här i flera år — vad ser du som den största förändringen just nu?' },
  { speaker: 'erik', text: 'Tack Anna. Det mest slående är hur snabbt verktygen blivit tillgängliga. För två år sedan var det experimentellt — idag använder hälften av lärarna det dagligen.' },
  { speaker: 'anna', text: 'Men det väcker ju frågor om likvärdighet. Alla skolor har inte samma resurser.' },
  { speaker: 'erik', text: 'Absolut, och det är en av de största riskerna. Vi ser redan en digital klyfta där vissa elever får AI-stöd och andra inte. Det kräver nationell samordning.' },
];

const DEMO_SUMMARY = 'Diskussionen belyser den snabba spridningen av AI-verktyg i skolan. Erik Holm pekar på att användningen gått från experimentell till vardaglig på bara två år, men att en digital klyfta håller på att uppstå mellan skolor med olika resurser.';

const DEMO_QUESTION = 'Vilka konkreta steg behövs för att säkerställa att alla skolor får tillgång till AI-verktyg, oavsett kommunens ekonomi?';

const DEMO_QUOTE = { text: 'Vi ser redan en digital klyfta där vissa elever får AI-stöd och andra inte', speaker: 'Erik Holm' };

// ── Typewriter hook ────────────────────────────────────────
function useTypewriter(text: string, speed: number, startDelay: number, trigger: boolean) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!trigger) { setDisplayed(''); setDone(false); return; }
    let i = 0;
    const startTimeout = setTimeout(() => {
      const interval = setInterval(() => {
        i++;
        setDisplayed(text.slice(0, i));
        if (i >= text.length) { clearInterval(interval); setDone(true); }
      }, speed);
      return () => clearInterval(interval);
    }, startDelay);
    return () => clearTimeout(startTimeout);
  }, [text, speed, startDelay, trigger]);

  return { displayed, done };
}

// ── Waveform component ─────────────────────────────────────
function Waveform({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    let animId: number;
    const draw = () => {
      frameRef.current++;
      ctx.clearRect(0, 0, w, h);

      const bars = 48;
      const barW = 2;
      const gap = (w - bars * barW) / (bars - 1);

      for (let i = 0; i < bars; i++) {
        const x = i * (barW + gap);
        const t = frameRef.current * 0.04;
        const amplitude = active
          ? (Math.sin(t + i * 0.3) * 0.5 + 0.5) * 0.7 + 0.15
          : 0.08 + Math.sin(t * 0.5 + i * 0.2) * 0.03;
        const barH = h * amplitude;
        const y = (h - barH) / 2;

        const gradient = ctx.createLinearGradient(x, y, x, y + barH);
        if (i % 3 === 0) {
          gradient.addColorStop(0, 'rgba(217, 119, 6, 0.8)');
          gradient.addColorStop(1, 'rgba(217, 119, 6, 0.2)');
        } else {
          gradient.addColorStop(0, 'rgba(139, 92, 246, 0.6)');
          gradient.addColorStop(1, 'rgba(139, 92, 246, 0.15)');
        }

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(x, y, barW, barH, 1);
        ctx.fill();
      }

      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(animId);
  }, [active]);

  return <canvas ref={canvasRef} className="w-full h-full" style={{ display: 'block' }} />;
}

// ── Demo window component ──────────────────────────────────
function LiveDemo() {
  const [cycle, setCycle] = useState(0);
  const [lineIndex, setLineIndex] = useState(-1);
  const [showSummary, setShowSummary] = useState(false);
  const [showQuestion, setShowQuestion] = useState(false);
  const [showQuote, setShowQuote] = useState(false);
  const [isActive, setIsActive] = useState(false);

  const line0 = useTypewriter(DEMO_LINES[0].text, 22, 0, lineIndex >= 0);
  const line1 = useTypewriter(DEMO_LINES[1].text, 20, 0, lineIndex >= 1);
  const line2 = useTypewriter(DEMO_LINES[2].text, 22, 0, lineIndex >= 2);
  const line3 = useTypewriter(DEMO_LINES[3].text, 20, 0, lineIndex >= 3);
  const lines = [line0, line1, line2, line3];

  const reset = useCallback(() => {
    setLineIndex(-1);
    setShowSummary(false);
    setShowQuestion(false);
    setShowQuote(false);
    setIsActive(false);
  }, []);

  useEffect(() => {
    reset();
    const timers: NodeJS.Timeout[] = [];

    timers.push(setTimeout(() => setIsActive(true), 300));
    timers.push(setTimeout(() => setLineIndex(0), 800));
    timers.push(setTimeout(() => setLineIndex(1), 3500));
    timers.push(setTimeout(() => setLineIndex(2), 6500));
    timers.push(setTimeout(() => setLineIndex(3), 8500));
    timers.push(setTimeout(() => setShowSummary(true), 5000));
    timers.push(setTimeout(() => setShowQuestion(true), 8000));
    timers.push(setTimeout(() => setShowQuote(true), 10500));

    // Loop
    timers.push(setTimeout(() => setCycle((c) => c + 1), 16000));

    return () => timers.forEach(clearTimeout);
  }, [cycle, reset]);

  const renderLine = (idx: number) => {
    if (lineIndex < idx) return null;
    const line = DEMO_LINES[idx];
    const sp = SPEAKERS[line.speaker as keyof typeof SPEAKERS];
    const { displayed, done } = lines[idx];

    return (
      <div className="flex gap-3 animate-fade-in" style={{ animationDuration: '0.3s' }}>
        <div className="w-1.5 rounded-full flex-shrink-0 mt-1" style={{ background: sp.color, height: '1rem' }} />
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[11px] font-semibold" style={{ color: sp.color }}>{sp.name}</span>
            <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{sp.role}</span>
          </div>
          <p className="text-[13px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
            {displayed}
            {!done && <span className="inline-block w-[2px] h-[14px] ml-0.5 align-middle" style={{ background: sp.color, animation: 'pulse-live 0.8s ease-in-out infinite' }} />}
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="relative rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 24px 80px rgba(0,0,0,0.4), 0 0 120px rgba(217,119,6,0.03)' }}>
      {/* Title bar */}
      <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: 'rgba(255,255,255,0.01)' }}>
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }} />
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }} />
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }} />
          </div>
          <span className="text-[12px] font-semibold" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text-primary)' }}>Panelsamtal: AI i skolan</span>
        </div>
        <div className="flex items-center gap-2">
          {isActive && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full animate-fade-in" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.15)' }}>
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#ef4444', animation: 'pulse-live 1.5s ease-in-out infinite' }} />
              <span className="text-[10px] font-semibold" style={{ color: '#f87171' }}>LIVE</span>
            </div>
          )}
          <span className="text-[11px] font-mono" style={{ color: 'var(--color-text-muted)' }}>482910</span>
        </div>
      </div>

      {/* Waveform */}
      <div className="h-10 px-5" style={{ background: 'rgba(255,255,255,0.008)' }}>
        <Waveform active={isActive} />
      </div>

      {/* Content area */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_260px] min-h-[340px]">
        {/* Left: Transcript */}
        <div className="p-5 space-y-4 overflow-hidden" style={{ borderRight: '1px solid rgba(255,255,255,0.03)' }}>
          <div className="text-[10px] font-semibold tracking-widest uppercase mb-3" style={{ color: 'var(--color-text-muted)' }}>Transkription</div>
          {renderLine(0)}
          {renderLine(1)}
          {renderLine(2)}
          {renderLine(3)}
          {lineIndex < 0 && (
            <div className="flex items-center justify-center h-32">
              <span className="text-[13px]" style={{ color: 'var(--color-text-muted)' }}>Väntar på tal...</span>
            </div>
          )}
        </div>

        {/* Right: AI panel */}
        <div className="p-4 space-y-3" style={{ background: 'rgba(255,255,255,0.008)' }}>
          <div className="text-[10px] font-semibold tracking-widest uppercase mb-2" style={{ color: 'var(--color-text-muted)' }}>AI-insikter</div>

          {/* Summary */}
          {showSummary && (
            <div className="rounded-xl p-3 animate-slide-up" style={{ background: 'rgba(217,119,6,0.04)', border: '1px solid rgba(217,119,6,0.08)' }}>
              <div className="flex items-center gap-1.5 mb-2">
                <div className="w-1 h-1 rounded-full" style={{ background: 'var(--color-accent)' }} />
                <span className="text-[10px] font-semibold" style={{ color: 'var(--color-accent)' }}>SAMMANFATTNING</span>
              </div>
              <p className="text-[11px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                {DEMO_SUMMARY.slice(0, 140)}...
              </p>
            </div>
          )}

          {/* Question */}
          {showQuestion && (
            <div className="rounded-xl p-3 animate-slide-up" style={{ background: 'rgba(139,92,246,0.04)', border: '1px solid rgba(139,92,246,0.08)' }}>
              <div className="flex items-center gap-1.5 mb-2">
                <div className="w-1 h-1 rounded-full" style={{ background: 'var(--color-accent-ai)' }} />
                <span className="text-[10px] font-semibold" style={{ color: 'var(--color-accent-ai)' }}>FÖRDJUPNINGSFRÅGA</span>
              </div>
              <p className="text-[11px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                {DEMO_QUESTION}
              </p>
            </div>
          )}

          {/* Quote */}
          {showQuote && (
            <div className="rounded-xl p-3 animate-slide-up" style={{ borderLeft: '2px solid var(--color-accent)', background: 'rgba(217,119,6,0.03)' }}>
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-[10px] font-semibold" style={{ color: 'var(--color-text-muted)' }}>CITAT</span>
              </div>
              <p className="text-[11px] italic leading-relaxed" style={{ color: 'var(--color-text-primary)' }}>
                &ldquo;{DEMO_QUOTE.text}&rdquo;
              </p>
              <span className="text-[10px] mt-1 block" style={{ color: 'var(--color-accent)' }}>— {DEMO_QUOTE.speaker}</span>
            </div>
          )}

          {!showSummary && !showQuestion && !showQuote && (
            <div className="flex flex-col items-center justify-center h-40 gap-2">
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--color-text-muted)', animation: `typing-bounce 1.2s ease-in-out ${i * 0.15}s infinite` }} />
                ))}
              </div>
              <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>AI analyserar...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────
export default function Home() {
  return (
    <div className="relative overflow-hidden">
      {/* Atmospheric background */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        <div className="hero-glow" style={{ background: 'radial-gradient(circle, rgba(217,119,6,0.12) 0%, transparent 70%)', top: '-200px', left: '50%', marginLeft: '-300px' }} />
        <div className="hero-glow" style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 70%)', top: '200px', right: '-100px', animation: 'glow-drift-reverse 10s ease-in-out infinite alternate' }} />
      </div>

      {/* ====== HERO ====== */}
      <div className="relative max-w-5xl mx-auto px-6 pt-28 pb-8 text-center">
        <h1
          className="text-5xl sm:text-7xl font-extrabold mb-6 animate-slide-up"
          style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.05em', lineHeight: '0.95' }}
        >
          <span className="bg-clip-text text-transparent" style={{ backgroundImage: 'linear-gradient(180deg, #fafaf9 20%, rgba(250,250,249,0.4) 100%)' }}>
            Realtids
          </span>
          <span className="bg-clip-text text-transparent" style={{ backgroundImage: 'linear-gradient(135deg, var(--color-accent-hover) 0%, var(--color-accent) 60%, #92400e 100%)' }}>
            trans
          </span>
        </h1>

        <p className="text-lg max-w-lg mx-auto mb-10 animate-slide-up stagger-2" style={{ color: 'var(--color-text-secondary)', lineHeight: '1.6' }}>
          AI-drivet samtalsstöd för live-event. Transkribering, sammanfattningar,
          fördjupningsfrågor och publikinteraktion — i realtid.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-20 animate-slide-up stagger-3">
          <Link href="/session/new" className="btn-primary text-[15px] px-10 py-4">
            Skapa session
          </Link>
          <Link href="/join" className="btn-secondary text-[15px] px-10 py-4">
            Gå med som publik
          </Link>
        </div>
      </div>

      {/* ====== INTERACTIVE DEMO ====== */}
      <div className="relative max-w-4xl mx-auto px-6 mb-32">
        <LiveDemo />
        <div className="text-center mt-5">
          <span className="text-[11px] tracking-widest uppercase" style={{ color: 'var(--color-text-muted)' }}>Simulerad live-session</span>
        </div>
      </div>

      {/* ====== HOW IT WORKS ====== */}
      <div className="relative max-w-4xl mx-auto px-6 mb-40">
        <div className="text-center mb-16">
          <span className="text-[11px] font-semibold tracking-[0.15em] uppercase" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-body)' }}>Process</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-10">
          {[
            { n: '01', title: 'Skapa', desc: 'Ange ämne, talare och kontext. Ju mer du ger, desto vassare AI.' },
            { n: '02', title: 'Ljudprov', desc: 'Varje talare gör ett kort test för talaridentifiering.' },
            { n: '03', title: 'Kör live', desc: 'Transkribering, sammanfattningar och frågor — i realtid.' },
            { n: '04', title: 'Sammanfatta', desc: 'Exportera kronologisk eller tematisk AI-sammanfattning.' },
          ].map((step) => (
            <div key={step.n} className="group">
              <div className="text-[11px] font-bold mb-3 transition-colors duration-300 group-hover:text-amber-400" style={{ color: 'var(--color-accent)', fontFamily: 'var(--font-body)', letterSpacing: '0.05em' }}>{step.n}</div>
              <h4 className="text-base font-bold mb-2" style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}>{step.title}</h4>
              <p className="text-[13px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{step.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ====== BOTTOM CTA ====== */}
      <div className="relative max-w-5xl mx-auto px-6 mb-24">
        <div className="relative text-center py-20 rounded-3xl overflow-hidden" style={{ background: 'linear-gradient(180deg, rgba(217,119,6,0.04) 0%, rgba(6,6,10,0) 100%)', border: '1px solid rgba(217,119,6,0.06)' }}>
          <div className="absolute inset-0 pointer-events-none" aria-hidden>
            <div className="hero-glow" style={{ background: 'radial-gradient(circle, rgba(217,119,6,0.08) 0%, transparent 70%)', top: '-250px', left: '50%', marginLeft: '-300px', width: '600px', height: '600px' }} />
          </div>
          <h2 className="relative text-3xl sm:text-4xl font-bold mb-4" style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.03em' }}>
            Redo för scenen?
          </h2>
          <p className="relative text-[15px] mb-8" style={{ color: 'var(--color-text-secondary)' }}>
            Skapa din första session på under en minut.
          </p>
          <Link href="/session/new" className="relative btn-primary text-base px-12 py-4">
            Kom igång
          </Link>
        </div>
      </div>

      <div className="h-16" />
    </div>
  );
}
