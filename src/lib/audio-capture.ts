'use client';

export class AudioCapture {
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private onChunk: ((chunk: ArrayBuffer) => void) | null = null;

  // Offline buffering
  private offlineBuffer: ArrayBuffer[] = [];
  private isBuffering: boolean = false;
  private maxBufferSize: number = 1000; // ~250 seconds at 4096 samples/16kHz

  // Raw audio recording
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private isRecording: boolean = false;

  async start(onChunk: (chunk: ArrayBuffer) => void): Promise<void> {
    this.onChunk = onChunk;

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    this.audioContext = new AudioContext({ sampleRate: 16000 });
    this.source = this.audioContext.createMediaStreamSource(this.stream);

    // Use ScriptProcessorNode for broad compatibility
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

    this.processor.onaudioprocess = (event) => {
      const inputData = event.inputBuffer.getChannelData(0);
      // Convert float32 to int16 PCM
      const pcmData = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        const s = Math.max(-1, Math.min(1, inputData[i]));
        pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }

      const buffer = pcmData.buffer;

      if (this.isBuffering) {
        // Offline: buffer locally
        if (this.offlineBuffer.length < this.maxBufferSize) {
          this.offlineBuffer.push(buffer.slice(0));
        }
      } else {
        this.onChunk?.(buffer);
      }
    };

    this.source.connect(this.processor);
    this.processor.connect(this.audioContext.destination);
  }

  stop(): void {
    this.stopRecording();
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    this.onChunk = null;
  }

  // --- Offline Buffering ---

  startBuffering(): void {
    this.isBuffering = true;
    this.offlineBuffer = [];
  }

  stopBuffering(): void {
    this.isBuffering = false;
  }

  getBufferedChunks(): ArrayBuffer[] {
    return this.offlineBuffer;
  }

  flushBuffer(): ArrayBuffer[] {
    const chunks = [...this.offlineBuffer];
    this.offlineBuffer = [];
    return chunks;
  }

  getBufferSize(): number {
    return this.offlineBuffer.length;
  }

  isOfflineBuffering(): boolean {
    return this.isBuffering;
  }

  // --- Raw Audio Recording (backup) ---

  startRecording(): void {
    if (!this.stream || this.isRecording) return;

    this.recordedChunks = [];
    this.mediaRecorder = new MediaRecorder(this.stream, {
      mimeType: 'audio/webm;codecs=opus',
    });

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.recordedChunks.push(event.data);
      }
    };

    this.mediaRecorder.start(1000); // Chunk every second
    this.isRecording = true;
  }

  stopRecording(): void {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
      this.isRecording = false;
    }
  }

  getRecordingBlob(): Blob | null {
    if (this.recordedChunks.length === 0) return null;
    return new Blob(this.recordedChunks, { type: 'audio/webm;codecs=opus' });
  }

  downloadRecording(filename: string = 'session-recording.webm'): void {
    const blob = this.getRecordingBlob();
    if (!blob) return;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  isCurrentlyRecording(): boolean {
    return this.isRecording;
  }

  getStream(): MediaStream | null {
    return this.stream;
  }
}
