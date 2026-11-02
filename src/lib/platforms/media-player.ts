/** The playback surface used by native video elements and embedded players. */
export interface MediaPlayer extends EventTarget {
  currentTime: number;
  readonly duration: number;
  readonly readyState: number;
  readonly ended: boolean;
  readonly seeking?: boolean;
  readonly isConnected: boolean;
  seekTo?(
    seconds: number,
    signal: AbortSignal,
    startPlayback: boolean,
  ): Promise<void>;
  play(signal?: AbortSignal): Promise<void>;
  pause(): void;
}
