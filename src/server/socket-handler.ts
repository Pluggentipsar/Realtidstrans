import { Server as SocketIOServer } from 'socket.io';
import {
  ClientToServerEvents,
  ServerToClientEvents,
  AudienceQuestion,
  AudioDevice,
} from '@/types';
import { sessionStore } from './session-store';
import { TranscriptionSession } from '@/lib/azure-speech';
import { AIProcessor } from './ai-processor';
import { generateParticipantStatement } from '@/lib/claude-ai';
import { buildSessionContext } from '@/lib/prompts/system';
import { EngagementTracker } from './engagement-tracker';
import { generateId } from '@/lib/utils';

type TypedServer = SocketIOServer<ClientToServerEvents, ServerToClientEvents>;

const transcriptionSessions = new Map<string, TranscriptionSession>();
const aiProcessors = new Map<string, AIProcessor>();
const engagementTrackers = new Map<string, EngagementTracker>();

// Track which session each socket is in (for cleanup)
const socketSessions = new Map<string, { sessionId: string; role: string }>();

export function setupSocketHandlers(io: TypedServer): void {
  io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    // ===== Session Join/Leave =====

    socket.on('session:join', ({ sessionId, role }) => {
      socket.join(sessionId);
      socketSessions.set(socket.id, { sessionId, role });
      const session = sessionStore.getSession(sessionId);
      if (session) {
        sessionStore.addActiveUser(sessionId, socket.id);

        // Send existing data to the joining client so they don't miss anything
        const summaries = sessionStore.getSummaries(sessionId);
        const aiQuestions = sessionStore.getAIQuestions(sessionId);
        const quotes = sessionStore.getQuotableMoments(sessionId);
        const transcripts = sessionStore.getFinalTranscriptSince(sessionId, 0);
        const audienceQuestions = sessionStore.getAudienceQuestions(sessionId);

        if (summaries.length) summaries.forEach((s) => socket.emit('ai:summary', s));
        if (aiQuestions.length) socket.emit('ai:questions', aiQuestions);
        if (quotes.length) socket.emit('ai:quotes', quotes);
        if (transcripts.length) transcripts.forEach((t) => socket.emit('transcript:final', t));
        if (audienceQuestions.length) audienceQuestions.forEach((q) => socket.emit('audience:question_added', q));
      }
      console.log(`${role} joined session ${sessionId}`);
    });

    socket.on('session:leave', (sessionId) => {
      socket.leave(sessionId);
      socketSessions.delete(socket.id);
      sessionStore.removeActiveUser(sessionId, socket.id);
    });

    // ===== Transcription Control =====

    socket.on('transcription:start', async (sessionId) => {
      console.log(`[transcription:start] Requested for session ${sessionId}`);
      let session = sessionStore.getSession(sessionId);
      if (!session) {
        console.log(`[transcription:start] Session not in socket store, fetching via HTTP...`);
        try {
          const port = process.env.PORT || '3000';
          const res = await fetch(`http://localhost:${port}/api/sessions/${sessionId}`);
          if (res.ok) {
            session = await res.json();
            console.log(`[transcription:start] Fetched session via HTTP: ${session?.title}`);
            // Import into socket handler's store so AI processor can find it
            if (session) {
              sessionStore.importSession(session);
              console.log(`[transcription:start] Imported session into local store`);
            }
          } else {
            console.log(`[transcription:start] HTTP fetch failed: ${res.status}`);
          }
        } catch (e) {
          console.error(`[transcription:start] HTTP fetch error:`, e);
        }
      }
      if (!session) {
        console.log(`[transcription:start] Session not found anywhere`);
        socket.emit('session:error', { message: 'Session hittades inte', code: 'SESSION_NOT_FOUND' });
        return;
      }
      console.log(`[transcription:start] Got session "${session.title}", language: ${session.settings?.language}`);

      if (transcriptionSessions.has(sessionId)) {
        socket.emit('session:error', { message: 'Transkribering redan aktiv', code: 'ALREADY_ACTIVE' });
        return;
      }

      const transcriptionSession = new TranscriptionSession(sessionId, {
        onPartialResult: (segment) => {
          sessionStore.addTranscriptSegment(segment);
          io.to(sessionId).emit('transcript:partial', segment);
        },
        onFinalResult: (segment) => {
          sessionStore.addTranscriptSegment(segment);
          io.to(sessionId).emit('transcript:final', segment);
        },
        onError: (error) => {
          console.error(`Transcription error for session ${sessionId}:`, error);
          io.to(sessionId).emit('session:error', {
            message: `Transkribieringsfel: ${error.message || error}`,
            code: 'TRANSCRIPTION_ERROR',
          });
        },
        onSpeakerIdentified: (speaker) => {
          sessionStore.addSpeaker(sessionId, speaker);
          io.to(sessionId).emit('session:speaker_identified', speaker);
        },
      }, session.settings.language);

      // Register enrolled speakers
      for (const speaker of session.speakers) {
        if (speaker.voiceProfileId) {
          transcriptionSession.registerEnrolledSpeaker(speaker.voiceProfileId, speaker.name);
        }
      }

      // Set session live immediately so all clients know — even if transcription takes a moment
      sessionStore.updateSessionStatus(sessionId, 'live');
      io.to(sessionId).emit('session:status_changed', 'live');

      console.log(`[transcription:start] Starting Azure Speech transcription...`);
      transcriptionSession.start().then(() => {
        console.log(`[transcription:start] Azure Speech started successfully!`);
        transcriptionSessions.set(sessionId, transcriptionSession);

        // Start AI processor with configured mode
        const intervalMs = (session.settings?.summaryIntervalSeconds || 60) * 1000;
        const mode = session.settings?.summaryMode || 'auto';
        console.log(`[transcription:start] Starting AI processor (interval: ${intervalMs}ms, mode: ${mode})`);
        const aiProcessor = new AIProcessor(sessionId, {
          onSummary: (summary) => { console.log(`[ai] Summary generated for ${sessionId}`); io.to(sessionId).emit('ai:summary', summary); },
          onQuestions: (questions) => { console.log(`[ai] ${questions.length} questions generated`); io.to(sessionId).emit('ai:questions', questions); },
          onClusters: (clusters) => io.to(sessionId).emit('audience:clusters_updated', clusters),
          onQuotes: (quotes) => { console.log(`[ai] ${quotes.length} quotes extracted`); io.to(sessionId).emit('ai:quotes', quotes); },
          onTopicShift: (data) => io.to(sessionId).emit('ai:topic_shift', data),
          onAgendaDetected: (data) => {
            console.log(`[ai] Agenda item detected: ${data.itemId} (confidence: ${data.confidence})`);
            io.to(sessionId).emit('agenda:current_detected', data);
            io.to(sessionId).emit('agenda:item_updated', { itemId: data.itemId, status: 'in_progress', detectedByAi: true });
          },
          onQuestionSuggestion: (data) => {
            console.log(`[ai] Question suggestion: ${data.suggestedQuestionId} (confidence: ${data.confidence})`);
            io.to(sessionId).emit('ai:question_suggestion', data);
          },
        });
        aiProcessor.start(intervalMs, mode);
        aiProcessors.set(sessionId, aiProcessor);

        // Start engagement tracker
        const engagementTracker = new EngagementTracker(sessionId, {
          onUpdate: (snapshot) => io.to(sessionId).emit('engagement:update', snapshot),
          onReactionBurst: (burst) => io.to(sessionId).emit('reaction:burst', burst),
          onSpeakerAnalytics: (analytics) => io.to(sessionId).emit('speakers:analytics', analytics),
        });
        engagementTracker.start();
        engagementTrackers.set(sessionId, engagementTracker);
      }).catch((error) => {
        console.error('[transcription:start] FAILED:', error?.message || error);
        socket.emit('session:error', {
          message: `Transkribering kunde inte startas: ${error?.message || 'Okänt fel'}. Kontrollera AZURE_SPEECH_KEY och AZURE_SPEECH_REGION.`,
          code: 'START_FAILED',
        });
      });
    });

    socket.on('transcription:stop', (sessionId) => {
      const transcriptionSession = transcriptionSessions.get(sessionId);
      if (transcriptionSession) {
        transcriptionSession.stop();
        transcriptionSessions.delete(sessionId);
      }

      const aiProcessor = aiProcessors.get(sessionId);
      if (aiProcessor) {
        aiProcessor.stop();
        aiProcessors.delete(sessionId);
      }

      const engagementTracker = engagementTrackers.get(sessionId);
      if (engagementTracker) {
        engagementTracker.stop();
        engagementTrackers.delete(sessionId);
      }

      sessionStore.updateSessionStatus(sessionId, 'ended');
      io.to(sessionId).emit('session:status_changed', 'ended');
    });

    // ===== Audio =====

    socket.on('audio:chunk', ({ sessionId, chunk }) => {
      const transcriptionSession = transcriptionSessions.get(sessionId);
      if (transcriptionSession) {
        transcriptionSession.pushAudioChunk(chunk);
      }
    });

    socket.on('audio:join_as_mic', ({ sessionId, deviceName, speakerId }) => {
      const device: AudioDevice = {
        id: generateId(),
        sessionId,
        deviceName,
        speakerId,
        isActive: true,
        joinedAt: new Date(),
      };
      sessionStore.addAudioDevice(device);
      io.to(sessionId).emit('audio:device_joined', device);
    });

    socket.on('audio:leave_as_mic', ({ sessionId, deviceId }) => {
      sessionStore.removeAudioDevice(sessionId, deviceId);
      io.to(sessionId).emit('audio:device_left', deviceId);
    });

    // ===== Audience Questions =====

    socket.on('audience:submit_question', ({ sessionId, text, authorName }) => {
      const session = sessionStore.getSession(sessionId);
      if (!session || session.status !== 'live') return;

      const question: AudienceQuestion = {
        id: generateId(),
        sessionId,
        text,
        authorName,
        votes: 0,
        status: 'pending',
        submittedAt: new Date(),
      };

      sessionStore.addAudienceQuestion(question);
      io.to(sessionId).emit('audience:question_added', question);
    });

    socket.on('audience:vote_question', ({ sessionId, questionId }) => {
      const votes = sessionStore.voteQuestion(sessionId, questionId);
      io.to(sessionId).emit('audience:question_voted', { questionId, votes });
    });

    // ===== Reactions =====

    socket.on('audience:react', ({ sessionId, type }) => {
      sessionStore.addReaction(sessionId, type);
      // Reactions are batched and emitted via EngagementTracker
    });

    // ===== Polls =====

    socket.on('poll:create', ({ sessionId, question, options }) => {
      const session = sessionStore.getSession(sessionId);
      if (!session) return;

      const poll = sessionStore.createPoll(sessionId, question, options);
      io.to(sessionId).emit('poll:created', poll);
    });

    socket.on('poll:vote', ({ sessionId, pollId, optionId }) => {
      const poll = sessionStore.votePoll(pollId, optionId, socket.id);
      if (poll) {
        io.to(sessionId).emit('poll:updated', poll);
      }
    });

    socket.on('poll:close', ({ sessionId, pollId }) => {
      const poll = sessionStore.closePoll(sessionId, pollId);
      if (poll) {
        io.to(sessionId).emit('poll:closed', poll);
      }
    });

    // ===== Settings =====

    socket.on('settings:update_question_focus', ({ sessionId, focus, count }) => {
      const session = sessionStore.getSession(sessionId);
      if (!session) return;
      sessionStore.updateSessionSettings(sessionId, {
        questionFocus: focus,
        ...(count !== undefined ? { questionCount: count } : {}),
      });
      console.log(`[settings] Question focus changed to "${focus}" (count: ${count || session.settings.questionCount})`);
    });

    socket.on('settings:update_question_target', ({ sessionId, target, specificSpeaker }) => {
      const session = sessionStore.getSession(sessionId);
      if (!session) return;
      sessionStore.updateSessionSettings(sessionId, { questionTarget: target });
      console.log(`[settings] Question target changed to "${target}"${specificSpeaker ? ` (${specificSpeaker})` : ''}`);
    });

    // ===== Moderator Actions =====

    socket.on('moderator:highlight_question', ({ sessionId, questionId, source }) => {
      // Update question status in store
      if (source === 'audience') {
        const questions = sessionStore.getAudienceQuestions(sessionId);
        const q = questions.find((q) => q.id === questionId);
        if (q) q.status = 'highlighted';
      }
      // Broadcast to all clients (including projector view)
      io.to(sessionId).emit('moderator:question_highlighted', { questionId, source });
    });

    socket.on('moderator:dismiss_question', ({ sessionId, questionId, source }) => {
      if (source === 'audience') {
        const questions = sessionStore.getAudienceQuestions(sessionId);
        const q = questions.find((q) => q.id === questionId);
        if (q) q.status = 'answered';
      }
      io.to(sessionId).emit('moderator:question_dismissed', { questionId, source });
    });

    socket.on('moderator:update_agenda_item', ({ sessionId, itemId, status }) => {
      sessionStore.updateAgendaItemStatus(sessionId, itemId, status);
      io.to(sessionId).emit('agenda:item_updated', { itemId, status, detectedByAi: false });
    });

    socket.on('moderator:set_projector_view', ({ sessionId, view, secondary, content }) => {
      io.to(sessionId).emit('projector:set_view', { view, secondary, content });
    });

    // ===== AI Participant =====

    socket.on('ai_participant:request', async ({ sessionId, persona, customPrompt }) => {
      const session = sessionStore.getSession(sessionId);
      if (!session) return;

      io.to(sessionId).emit('ai_participant:generating', { persona });

      try {
        const sessionContext = buildSessionContext(session.title, session.description, session.context, session.briefing);

        // Build rich context: summaries for breadth + raw transcript for specifics
        const summaries = sessionStore.getSummaries(sessionId);
        const recentTranscript = sessionStore.getRecentFinalTranscript(sessionId, 5 * 60 * 1000)
          .map((s) => `${s.speakerName}: ${s.text}`)
          .join('\n');

        if (!recentTranscript) {
          socket.emit('session:error', { message: 'Inget transkript att basera inlagg pa', code: 'NO_TRANSCRIPT' });
          return;
        }

        // Combine: previous summaries (compressed history) + recent raw transcript (specifics)
        let fullContext = '';
        if (summaries.length > 0) {
          const summaryText = summaries
            .slice(-5) // Last 5 summaries
            .map((s) => s.content)
            .join('\n\n');
          fullContext = `SAMMANFATTNING AV SAMTALET HITTILLS:\n${summaryText}\n\n---\n\nSENASTE AVSNITTET (ordagrant):\n${recentTranscript}`;
        } else {
          fullContext = recentTranscript;
        }

        const statement = await generateParticipantStatement(
          sessionId, sessionContext, fullContext, persona, customPrompt
        );

        // Send draft to moderator only
        socket.emit('ai_participant:draft', statement);
      } catch (e) {
        console.error('[ai-participant] Generation failed:', e);
        socket.emit('session:error', { message: 'Kunde inte generera AI-inlagg', code: 'AI_PARTICIPANT_FAILED' });
      }
    });

    socket.on('ai_participant:approve', ({ sessionId, statement, displayMode }) => {
      // Broadcast approved statement to all clients (including projector)
      io.to(sessionId).emit('ai_participant:shown', {
        statement: { ...statement, status: 'shown' },
        displayMode: displayMode || 'fullscreen',
      });
    });

    // ===== Disconnect =====

    socket.on('disconnect', () => {
      const sessionInfo = socketSessions.get(socket.id);
      if (sessionInfo) {
        sessionStore.removeActiveUser(sessionInfo.sessionId, socket.id);
        socketSessions.delete(socket.id);
      }
      console.log(`Client disconnected: ${socket.id}`);
    });
  });
}
