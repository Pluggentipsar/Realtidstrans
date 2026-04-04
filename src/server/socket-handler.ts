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
      const session = sessionStore.getSession(sessionId);
      if (!session) {
        socket.emit('error', { message: 'Session hittades inte', code: 'SESSION_NOT_FOUND' });
        return;
      }
      socket.join(sessionId);
      socketSessions.set(socket.id, { sessionId, role });
      sessionStore.addActiveUser(sessionId, socket.id);
      console.log(`${role} joined session ${sessionId}`);
    });

    socket.on('session:leave', (sessionId) => {
      socket.leave(sessionId);
      socketSessions.delete(socket.id);
      sessionStore.removeActiveUser(sessionId, socket.id);
    });

    // ===== Transcription Control =====

    socket.on('transcription:start', (sessionId) => {
      const session = sessionStore.getSession(sessionId);
      if (!session) return;

      if (transcriptionSessions.has(sessionId)) {
        socket.emit('error', { message: 'Transkribering redan aktiv', code: 'ALREADY_ACTIVE' });
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
          io.to(sessionId).emit('error', {
            message: 'Transkribieringsfel',
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

      transcriptionSession.start().then(() => {
        transcriptionSessions.set(sessionId, transcriptionSession);

        // Start AI processor with configured mode
        const aiProcessor = new AIProcessor(sessionId, {
          onSummary: (summary) => io.to(sessionId).emit('ai:summary', summary),
          onQuestions: (questions) => io.to(sessionId).emit('ai:questions', questions),
          onClusters: (clusters) => io.to(sessionId).emit('audience:clusters_updated', clusters),
          onQuotes: (quotes) => io.to(sessionId).emit('ai:quotes', quotes),
          onTopicShift: (data) => io.to(sessionId).emit('ai:topic_shift', data),
        });
        aiProcessor.start(
          session.settings.summaryIntervalSeconds * 1000,
          session.settings.summaryMode
        );
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
        console.error('Failed to start transcription:', error);
        // Session stays live — moderator can still use it, just without auto-transcription
        socket.emit('error', {
          message: 'Transkribering kunde inte startas (kontrollera API-nycklar). Sessionen är aktiv men utan automatisk transkribering.',
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

    socket.on('moderator:set_projector_view', ({ sessionId, view, secondary, content }) => {
      io.to(sessionId).emit('projector:set_view', { view, secondary, content });
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
