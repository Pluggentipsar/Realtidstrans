import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import { TranscriptSegment, Speaker } from '@/types';
import { generateId } from '@/lib/utils';

export interface TranscriptionCallbacks {
  onPartialResult: (segment: TranscriptSegment) => void;
  onFinalResult: (segment: TranscriptSegment) => void;
  onError: (error: Error) => void;
  onSpeakerIdentified: (speaker: Speaker) => void;
}

export class TranscriptionSession {
  private recognizer: sdk.ConversationTranscriber | null = null;
  private speechConfig: sdk.SpeechConfig;
  private audioConfig: sdk.AudioConfig | null = null;
  private pushStream: sdk.PushAudioInputStream | null = null;
  private sessionId: string;
  private callbacks: TranscriptionCallbacks;
  private speakers: Map<string, Speaker> = new Map();
  private sessionStartTime: number = 0;
  private speakerColorIndex: number = 0;
  private enrolledProfiles: Map<string, string> = new Map(); // voiceProfileId -> speakerName

  private static readonly SPEAKER_COLORS = [
    '#3B82F6', '#EF4444', '#10B981', '#F59E0B',
    '#8B5CF6', '#EC4899', '#06B6D4', '#F97316',
  ];

  constructor(sessionId: string, callbacks: TranscriptionCallbacks, language = 'sv-SE') {
    this.sessionId = sessionId;
    this.callbacks = callbacks;

    this.speechConfig = sdk.SpeechConfig.fromSubscription(
      process.env.AZURE_SPEECH_KEY!,
      process.env.AZURE_SPEECH_REGION!
    );
    this.speechConfig.speechRecognitionLanguage = language;
    this.speechConfig.setProperty(
      sdk.PropertyId.SpeechServiceConnection_LanguageIdMode,
      'Continuous'
    );

    // Enable automatic punctuation and formatting
    this.speechConfig.setProperty(
      sdk.PropertyId.SpeechServiceResponse_PostProcessingOption,
      'TrueText'
    );
    // Enable word-level timestamps
    this.speechConfig.requestWordLevelTimestamps();
  }

  registerEnrolledSpeaker(voiceProfileId: string, speakerName: string): void {
    this.enrolledProfiles.set(voiceProfileId, speakerName);
  }

  async start(): Promise<void> {
    this.pushStream = sdk.AudioInputStream.createPushStream(
      sdk.AudioStreamFormat.getWaveFormatPCM(16000, 16, 1)
    );
    this.audioConfig = sdk.AudioConfig.fromStreamInput(this.pushStream);

    this.recognizer = new sdk.ConversationTranscriber(this.speechConfig, this.audioConfig);
    this.sessionStartTime = Date.now();

    this.recognizer.transcribing = (_s, e) => {
      if (e.result.reason === sdk.ResultReason.RecognizingSpeech) {
        const speaker = this.getOrCreateSpeaker(e.result.speakerId);
        this.callbacks.onPartialResult({
          id: generateId(),
          sessionId: this.sessionId,
          speakerId: speaker.id,
          speakerName: speaker.name,
          text: e.result.text,
          timestamp: Date.now() - this.sessionStartTime,
          isFinal: false,
          confidence: 0,
        });
      }
    };

    this.recognizer.transcribed = (_s, e) => {
      if (e.result.reason === sdk.ResultReason.RecognizedSpeech && e.result.text) {
        const speaker = this.getOrCreateSpeaker(e.result.speakerId);
        this.callbacks.onFinalResult({
          id: generateId(),
          sessionId: this.sessionId,
          speakerId: speaker.id,
          speakerName: speaker.name,
          text: e.result.text,
          timestamp: Date.now() - this.sessionStartTime,
          isFinal: true,
          confidence: 1,
        });
      }
    };

    this.recognizer.canceled = (_s, e) => {
      if (e.reason === sdk.CancellationReason.Error) {
        this.callbacks.onError(new Error(`Transcription error: ${e.errorDetails}`));
      }
    };

    await new Promise<void>((resolve, reject) => {
      this.recognizer!.startTranscribingAsync(
        () => resolve(),
        (err) => reject(new Error(err))
      );
    });
  }

  pushAudioChunk(chunk: ArrayBuffer): void {
    if (this.pushStream) {
      this.pushStream.write(chunk);
    }
  }

  async stop(): Promise<void> {
    if (this.pushStream) {
      this.pushStream.close();
    }
    if (this.recognizer) {
      await new Promise<void>((resolve) => {
        this.recognizer!.stopTranscribingAsync(
          () => resolve(),
          () => resolve()
        );
      });
      this.recognizer.close();
      this.recognizer = null;
    }
  }

  private getOrCreateSpeaker(speakerId: string): Speaker {
    if (this.speakers.has(speakerId)) {
      return this.speakers.get(speakerId)!;
    }

    // Check if this matches an enrolled profile
    const enrolledName = this.enrolledProfiles.get(speakerId);

    const speaker: Speaker = {
      id: speakerId,
      name: enrolledName || `Talare ${this.speakers.size + 1}`,
      role: enrolledName ? 'guest' : 'unknown',
      voiceProfileId: speakerId,
      color: TranscriptionSession.SPEAKER_COLORS[
        this.speakerColorIndex++ % TranscriptionSession.SPEAKER_COLORS.length
      ],
    };

    this.speakers.set(speakerId, speaker);
    this.callbacks.onSpeakerIdentified(speaker);
    return speaker;
  }

  getSpeakers(): Speaker[] {
    return Array.from(this.speakers.values());
  }
}

// Voice enrollment for speaker identification (sound check)
// Note: VoiceProfileClient types may not be fully exported in all SDK versions.
// Using dynamic access pattern for forward compatibility.
export class VoiceEnrollment {
  private speechConfig: sdk.SpeechConfig;

  constructor() {
    this.speechConfig = sdk.SpeechConfig.fromSubscription(
      process.env.AZURE_SPEECH_KEY!,
      process.env.AZURE_SPEECH_REGION!
    );
  }

  async createVoiceProfile(): Promise<string> {
    // VoiceProfileClient may not be available in all SDK builds
    const SdkAny = sdk as Record<string, unknown>;
    const VoiceProfileClient = SdkAny.VoiceProfileClient as new (
      config: sdk.SpeechConfig
    ) => {
      createProfileAsync: (
        type: unknown,
        lang: string,
        resolve: (result: { profileId: string }) => void,
        reject: (err: string) => void
      ) => void;
      close: () => void;
    };
    const VoiceProfileType = SdkAny.VoiceProfileType as {
      TextIndependentIdentification: unknown;
    };

    const client = new VoiceProfileClient(this.speechConfig);
    const profile = await new Promise<{ profileId: string }>((resolve, reject) => {
      client.createProfileAsync(
        VoiceProfileType.TextIndependentIdentification,
        'sv-SE',
        (result: { profileId: string }) => resolve(result),
        (err: string) => reject(new Error(err))
      );
    });
    client.close();
    return profile.profileId;
  }

  async enrollAudioChunk(profileId: string, audioData: ArrayBuffer): Promise<boolean> {
    const SdkAny = sdk as Record<string, unknown>;
    const VoiceProfileClient = SdkAny.VoiceProfileClient as new (
      config: sdk.SpeechConfig
    ) => {
      enrollProfileAsync: (
        profile: unknown,
        audio: sdk.AudioConfig,
        resolve: (result: { enrollmentsCount: number }) => void,
        reject: (err: string) => void
      ) => void;
      close: () => void;
    };
    const VoiceProfile = SdkAny.VoiceProfile as new (id: string, type: unknown) => unknown;
    const VoiceProfileType = SdkAny.VoiceProfileType as {
      TextIndependentIdentification: unknown;
    };

    const pushStream = sdk.AudioInputStream.createPushStream(
      sdk.AudioStreamFormat.getWaveFormatPCM(16000, 16, 1)
    );
    pushStream.write(audioData);
    pushStream.close();

    const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);
    const profile = new VoiceProfile(
      profileId,
      VoiceProfileType.TextIndependentIdentification
    );

    const client = new VoiceProfileClient(this.speechConfig);
    const result = await new Promise<{ enrollmentsCount: number }>((resolve, reject) => {
      client.enrollProfileAsync(
        profile,
        audioConfig,
        (res: { enrollmentsCount: number }) => resolve(res),
        (err: string) => reject(new Error(err))
      );
    });

    client.close();
    return result.enrollmentsCount > 0;
  }
}
