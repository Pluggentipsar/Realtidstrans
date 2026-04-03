import { TranscriptionSession, VoiceEnrollment } from '@/lib/azure-speech';
import { Speaker } from '@/types';
import { generateId } from '@/lib/utils';
import { SPEAKER_COLORS } from '@/types';

// Manages transcription lifecycle and voice enrollment for sessions
export class TranscriptionManager {
  private activeSessions: Map<string, TranscriptionSession> = new Map();
  private voiceEnrollment: VoiceEnrollment | null = null;

  getActiveSession(sessionId: string): TranscriptionSession | undefined {
    return this.activeSessions.get(sessionId);
  }

  setActiveSession(sessionId: string, session: TranscriptionSession): void {
    this.activeSessions.set(sessionId, session);
  }

  removeActiveSession(sessionId: string): void {
    this.activeSessions.delete(sessionId);
  }

  private getVoiceEnrollment(): VoiceEnrollment {
    if (!this.voiceEnrollment) {
      this.voiceEnrollment = new VoiceEnrollment();
    }
    return this.voiceEnrollment;
  }

  async enrollSpeaker(
    name: string,
    role: Speaker['role'],
    audioData: ArrayBuffer
  ): Promise<Speaker> {
    const enrollment = this.getVoiceEnrollment();
    const voiceProfileId = await enrollment.createVoiceProfile();
    await enrollment.enrollAudioChunk(voiceProfileId, audioData);

    return {
      id: generateId(),
      name,
      role,
      voiceProfileId,
      color: SPEAKER_COLORS[Math.floor(Math.random() * SPEAKER_COLORS.length)],
    };
  }
}

export const transcriptionManager = new TranscriptionManager();
