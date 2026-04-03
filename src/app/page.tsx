import Link from 'next/link';

export default function Home() {
  return (
    <div className="max-w-5xl mx-auto px-4">
      {/* Hero */}
      <div className="text-center py-24 sm:py-32">
        <div className="inline-flex items-center gap-2 badge-accent text-xs mb-6 px-3 py-1.5">
          AI-drivet samtalsstod i realtid
        </div>
        <h1 className="text-4xl sm:text-6xl font-bold tracking-tight mb-6">
          Realtids<span style={{ color: 'var(--color-accent)' }}>trans</span>
        </h1>
        <p className="text-lg sm:text-xl max-w-2xl mx-auto mb-10 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
          Transkribering, AI-sammanfattningar, fordjupande fragor och
          publikinteraktion — allt live, allt pa en skarm.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/session/new" className="btn-primary text-base px-8 py-3.5">
            Skapa session
          </Link>
          <Link href="/join" className="btn-secondary text-base px-8 py-3.5">
            Ga med som publik
          </Link>
        </div>
      </div>

      {/* Feature cards */}
      <div className="grid sm:grid-cols-3 gap-4 mb-24">
        {[
          {
            icon: '\uD83C\uDFA4',
            title: 'Realtidstranskribering',
            desc: 'Tal till text med talaridentifiering. Gor ett ljudprov sa vet systemet vem som talar.',
          },
          {
            icon: '\uD83E\uDDE0',
            title: 'AI-insikter',
            desc: 'Sammanfattningar, fordjupningsfragor, citatextraktion och lucka-analys — automatiskt.',
          },
          {
            icon: '\uD83D\uDCF1',
            title: 'Publikinteraktion',
            desc: 'Publiken ansluter med en kod, staller fragor och reagerar. AI grupperar och rangordnar.',
          },
        ].map((f) => (
          <div key={f.title} className="card group">
            <div className="text-3xl mb-4">{f.icon}</div>
            <h3 className="font-semibold mb-2 group-hover:text-indigo-400 transition-colors">{f.title}</h3>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{f.desc}</p>
          </div>
        ))}
      </div>

      {/* How it works */}
      <div className="card-raised mb-24">
        <h2 className="text-xl font-bold mb-8 text-center">Sa fungerar det</h2>
        <div className="grid sm:grid-cols-4 gap-6">
          {[
            { step: '1', title: 'Skapa', desc: 'Ange titel, amne och kontext. Valj AI-installningar.' },
            { step: '2', title: 'Ljudprov', desc: 'Talare gor ett kort test for igenkanning.' },
            { step: '3', title: 'Kor live', desc: 'Transkribering och AI-analys sker automatiskt.' },
            { step: '4', title: 'Sammanfatta', desc: 'Fa kronologisk eller tematisk AI-sammanfattning.' },
          ].map((s) => (
            <div key={s.step} className="text-center">
              <div className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-3 font-bold text-white" style={{ background: 'var(--color-accent)' }}>
                {s.step}
              </div>
              <h4 className="font-medium mb-1">{s.title}</h4>
              <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Projection feature highlight */}
      <div className="card-glow text-center mb-24 py-10">
        <div className="text-4xl mb-4">&#x1F4FA;</div>
        <h3 className="text-lg font-bold mb-2">Byggd for scenen</h3>
        <p className="max-w-lg mx-auto text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          Presentationslage med fokusvy, textstorlek +/- for projektoranvandning,
          och tangentbordsgenvagar. Perfekt for storsalar och event.
        </p>
        <div className="flex justify-center gap-3 mt-6">
          <div className="badge-muted text-xs">F11 = Fokus</div>
          <div className="badge-muted text-xs">Ctrl +/- = Textstorlek</div>
          <div className="badge-muted text-xs">1-5 = Byt vy</div>
        </div>
      </div>
    </div>
  );
}
