import { Server as SocketIOServer } from 'socket.io';
import {
  ClientToServerEvents,
  ServerToClientEvents,
  AudienceQuestion,
} from '@/types';
import { sessionStore } from './session-store';
import { TranscriptionSession } from '@/lib/azure-speech';
import { AIProcessor } from './ai-processor';
import { generateId } from '@/lib/utils';

type TypedServer = SocketIOServer<ClientToServerEvents, ServerToClientEvents>;

// Active transcription sessions and AI processors
const transcriptionSessions = new Map<string, TranscriptionSession>();
const aiProcessors = new Map<string, AIProcessor>();

export function setupSocketHandlers(io: TypedServer): void {
  io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    socket.on('session:join', ({ sessionId, role }) => {
      const session = sessionStore.getSession(sessionId);
      if (!session) {
        socket.emit('error', { message: 'Session hittades inte', code: 'SESSION_NOT_FOUND' });
        return;
      }
      socket.join(sessionId);
      console.log(`${role} joined session ${sessionId}`);
    });

    socket.on('session:leave', (sessionId) => {
      socket.leave(sessionId);
    });

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

      // Register any enrolled speakers
      for (const speaker of session.speakers) {
        if (speaker.voiceProfileId) {
          transcriptionSession.registerEnrolledSpeaker(speaker.voiceProfileId, speaker.name);
        }
      }

      transcriptionSession.start().then(() => {
        transcriptionSessions.set(sessionId, transcriptionSession);
        sessionStore.updateSessionStatus(sessionId, 'live');
        io.to(sessionId).emit('session:status_changed', 'live');

        // Start AI processor
        const aiProcessor = new AIProcessor(sessionId, {
          onSummary: (summary) => io.to(sessionId).emit('ai:summary', summary),
          onQuestions: (questions) => io.to(sessionId).emit('ai:questions', questions),
          onClusters: (clusters) => io.to(sessionId).emit('audience:clusters_updated', clusters),
        });
        aiProcessor.start(session.settings.summaryIntervalSeconds * 1000);
        aiProcessors.set(sessionId, aiProcessor);
      }).catch((error) => {
        console.error('Failed to start transcription:', error);
        socket.emit('error', {
          message: 'Kunde inte starta transkribering',
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

      sessionStore.updateSessionStatus(sessionId, 'ended');
      io.to(sessionId).emit('session:status_changed', 'ended');
    });

    socket.on('audio:chunk', ({ sessionId, chunk }) => {
      const transcriptionSession = transcriptionSessions.get(sessionId);
      if (transcriptionSession) {
        transcriptionSession.pushAudioChunk(chunk);
      }
    });

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

    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
    });
  });
}
