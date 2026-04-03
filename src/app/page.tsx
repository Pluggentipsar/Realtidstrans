export default function Home() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-20">
      {/* Hero */}
      <div className="text-center mb-20">
        <h1 className="text-5xl font-bold mb-6">
          Realtids<span className="text-blue-400">trans</span>
        </h1>
        <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-8">
          AI-drivet stöd för intervjuer, panelsamtal och föreläsningar.
          Realtidstranskribering, smarta sammanfattningar och fördjupande frågor
          — allt i realtid.
        </p>
        <div className="flex gap-4 justify-center">
          <a href="/session/new" className="btn-primary text-lg">
            Skapa session
          </a>
          <a href="/join" className="btn-secondary text-lg">
            Gå med som publik
          </a>
        </div>
      </div>

      {/* Features */}
      <div className="grid md:grid-cols-3 gap-8 mb-20">
        <div className="card">
          <div className="text-3xl mb-4">🎙️</div>
          <h3 className="text-lg font-semibold mb-2">Realtidstranskribering</h3>
          <p className="text-gray-400 text-sm">
            Tal omvandlas till text i realtid med automatisk talaridentifiering.
            Gör ett ljudprov så vet systemet vem som säger vad.
          </p>
        </div>
        <div className="card">
          <div className="text-3xl mb-4">🧠</div>
          <h3 className="text-lg font-semibold mb-2">AI-insikter</h3>
          <p className="text-gray-400 text-sm">
            Löpande sammanfattningar och fördjupande frågor. Djävulens advokat,
            blinda fläckar och nya perspektiv — AI:n hjälper dig utmana samtalet.
          </p>
        </div>
        <div className="card">
          <div className="text-3xl mb-4">👥</div>
          <h3 className="text-lg font-semibold mb-2">Publikinteraktion</h3>
          <p className="text-gray-400 text-sm">
            Publiken kopplar upp sig med en sessionskod och kan ställa frågor.
            AI:n grupperar och rangordnar de mest relevanta frågorna.
          </p>
        </div>
      </div>

      {/* How it works */}
      <div className="card mb-20">
        <h2 className="text-2xl font-bold mb-8 text-center">Så fungerar det</h2>
        <div className="grid md:grid-cols-4 gap-6">
          <div className="text-center">
            <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center mx-auto mb-3 font-bold">
              1
            </div>
            <h4 className="font-medium mb-1">Skapa session</h4>
            <p className="text-sm text-gray-400">
              Ange titel, ämne och kontext. Konfigurera AI-inställningar.
            </p>
          </div>
          <div className="text-center">
            <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center mx-auto mb-3 font-bold">
              2
            </div>
            <h4 className="font-medium mb-1">Ljudprov</h4>
            <p className="text-sm text-gray-400">
              Talare gör ett kort ljudprov för identifiering.
            </p>
          </div>
          <div className="text-center">
            <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center mx-auto mb-3 font-bold">
              3
            </div>
            <h4 className="font-medium mb-1">Kör live</h4>
            <p className="text-sm text-gray-400">
              Starta sessionen. Transkribering och AI-analys sker automatiskt.
            </p>
          </div>
          <div className="text-center">
            <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center mx-auto mb-3 font-bold">
              4
            </div>
            <h4 className="font-medium mb-1">Sammanfatta</h4>
            <p className="text-sm text-gray-400">
              Avsluta och få en komplett AI-sammanfattning av hela samtalet.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
