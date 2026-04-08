'use client';

import { useCallback } from 'react';

interface ExportPanelProps {
  sessionId: string;
  sessionTitle: string;
  transcript: string;
  summaries: Array<{ content: string; type: string; topicLabel?: string }>;
  aiQuestions: Array<{ question: string; category: string; context: string; targetSpeaker?: string }>;
  quotes: Array<{ quote: string; speakerName: string; context: string }>;
  audienceQuestions: Array<{ text: string; votes: number; authorName?: string }>;
  agendaItems?: Array<{ id: string; title: string; description: string; status: string; order: number }>;
  preparedQuestions?: Array<{ id: string; question: string; targetSpeaker?: string; priority: string; status: string }>;
  hostName?: string;
}

export function ExportPanel({
  sessionTitle,
  transcript,
  summaries,
  aiQuestions,
  quotes,
  audienceQuestions,
  agendaItems,
  preparedQuestions,
  hostName,
}: ExportPanelProps) {
  const buildMarkdown = useCallback(() => {
    const parts: string[] = [];
    parts.push(`# ${sessionTitle}\n`);
    parts.push(`Exporterad: ${new Date().toLocaleString('sv-SE')}\n`);

    if (summaries.length > 0) {
      parts.push('## Sammanfattningar\n');
      for (const s of summaries) {
        if (s.topicLabel) parts.push(`### ${s.topicLabel}\n`);
        parts.push(s.content + '\n');
      }
    }

    if (quotes.length > 0) {
      parts.push('## Citat\n');
      for (const q of quotes) {
        parts.push(`> "${q.quote}"\n> — ${q.speakerName}\n`);
        parts.push(`_${q.context}_\n`);
      }
    }

    if (aiQuestions.length > 0) {
      parts.push('## AI-genererade frågor\n');
      for (const q of aiQuestions) {
        parts.push(`- **${q.question}**`);
        if (q.targetSpeaker) parts.push(`  _(till ${q.targetSpeaker})_`);
        parts.push(`  ${q.context}\n`);
      }
    }

    if (audienceQuestions.length > 0) {
      parts.push('## Publikfrågor\n');
      const sorted = [...audienceQuestions].sort((a, b) => b.votes - a.votes);
      for (const q of sorted) {
        parts.push(`- [${q.votes} röster] ${q.text}${q.authorName ? ` — ${q.authorName}` : ''}`);
      }
      parts.push('');
    }

    if (transcript) {
      parts.push('## Fullständig transkribering\n');
      parts.push(transcript);
    }

    return parts.join('\n');
  }, [sessionTitle, transcript, summaries, aiQuestions, quotes, audienceQuestions]);

  const copyToClipboard = useCallback(async (text: string) => {
    await navigator.clipboard.writeText(text);
  }, []);

  const downloadFile = useCallback((content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const buildMeetingNotes = (): string => {
    const date = new Date().toLocaleDateString('sv-SE');
    let md = `# Mötesanteckningar: ${sessionTitle}\n`;
    md += `Datum: ${date}${hostName ? ` · Moderator: ${hostName}` : ''}\n\n`;

    if (agendaItems && agendaItems.length > 0) {
      md += `## Dagordning & Sammanfattning\n\n`;
      for (const item of agendaItems.sort((a, b) => a.order - b.order)) {
        const icon = item.status === 'done' ? '✅' : item.status === 'in_progress' ? '🔄' : '⬜';
        md += `### ${item.order}. ${item.title} ${icon}\n`;
        md += item.description ? `${item.description}\n\n` : '\n';
      }
    }

    if (summaries.length > 0) {
      md += `## Sammanfattningar\n\n`;
      for (const s of summaries) {
        if (s.topicLabel) md += `**${s.topicLabel}**\n`;
        md += `${s.content}\n\n---\n\n`;
      }
    }

    if (preparedQuestions && preparedQuestions.length > 0) {
      md += `## Förberedda frågor\n\n`;
      for (const q of preparedQuestions) {
        const icon = q.status === 'asked' ? '✅' : q.status === 'skipped' ? '⏭️' : q.priority === 'must_ask' ? '⚠️' : '⬜';
        md += `- ${icon} "${q.question}"${q.targetSpeaker ? ` (till ${q.targetSpeaker})` : ''} — *${q.status === 'asked' ? 'ställd' : q.status === 'skipped' ? 'hoppades över' : 'ej ställd'}*\n`;
      }
      md += '\n';
    }

    if (quotes.length > 0) {
      md += `## Nyckelcitat\n\n`;
      for (const q of quotes) {
        md += `> "${q.quote}" — ${q.speakerName}\n\n`;
      }
    }

    if (aiQuestions.length > 0) {
      md += `## AI-genererade frågor\n\n`;
      for (const q of aiQuestions.slice(0, 10)) {
        md += `- ${q.question}\n`;
      }
      md += '\n';
    }

    if (audienceQuestions.length > 0) {
      md += `## Publikfrågor\n\n`;
      for (const q of [...audienceQuestions].sort((a, b) => b.votes - a.votes).slice(0, 10)) {
        md += `- (${q.votes} röster) ${q.text}\n`;
      }
      md += '\n';
    }

    if (transcript) {
      md += `## Fullständig transkribering\n\n${transcript}\n`;
    }

    return md;
  };

  const safeName = sessionTitle.replace(/[^a-zA-Z0-9\u00C0-\u00FF -]/g, '').slice(0, 40);

  return (
    <div className="card space-y-3">
      <h3 className="text-sm font-bold" style={{ color: 'var(--color-text-secondary)' }}>EXPORTERA</h3>

      <button
        onClick={() => {
          const md = buildMeetingNotes();
          const blob = new Blob([md], { type: 'text/markdown' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `motesanteckningar-${sessionTitle.toLowerCase().replace(/\s+/g, '-')}.md`;
          a.click();
          URL.revokeObjectURL(url);
        }}
        className="btn-primary w-full text-xs py-2 mb-2"
      >
        📋 Ladda ned mötesanteckningar
      </button>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => copyToClipboard(buildMarkdown())}
          className="btn-secondary text-xs py-2"
        >
          &#x1F4CB; Kopiera allt
        </button>
        <button
          onClick={() => downloadFile(buildMarkdown(), `${safeName}.md`, 'text/markdown')}
          className="btn-secondary text-xs py-2"
        >
          &#x1F4E5; Ladda ner .md
        </button>
        <button
          onClick={() => {
            if (!transcript) return;
            copyToClipboard(transcript);
          }}
          className="btn-ghost text-xs py-2"
        >
          Kopiera transkript
        </button>
        <button
          onClick={() => {
            const quotesText = quotes.map((q) => `"${q.quote}" — ${q.speakerName}`).join('\n\n');
            if (quotesText) copyToClipboard(quotesText);
          }}
          className="btn-ghost text-xs py-2"
        >
          Kopiera citat
        </button>
      </div>

      {summaries.filter((s) => s.type?.startsWith('final_')).length > 0 && (
        <button
          onClick={() => {
            const final = summaries.filter((s) => s.type?.startsWith('final_'));
            copyToClipboard(final.map((s) => s.content).join('\n\n---\n\n'));
          }}
          className="btn-ghost text-xs py-2 w-full"
        >
          Kopiera slutsammanfattning
        </button>
      )}
    </div>
  );
}
