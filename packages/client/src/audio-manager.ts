/**
 * Web Audio–based output with gesture unlock, master gain, and lightweight
 * procedural cues (no bundled sample assets).
 */

export const AUDIO_MANAGER_SOUND_IDS = [
  "uiTap",
  "pickup",
  "roundTransition",
  "menuNavigate"
] as const;

export type AudioManagerSoundId = (typeof AUDIO_MANAGER_SOUND_IDS)[number];

export type AudioManagerAudioSettings = {
  volume: number;
  muted: boolean;
};

export type AudioManager = {
  /** True after the AudioContext has entered the running state (user gesture). */
  readonly isUnlocked: () => boolean;
  applyAudioSettings(settings: AudioManagerAudioSettings): void;
  /**
   * Attaches one-shot listeners so the first user gesture resumes audio.
   * Safe to call multiple times; duplicate installs are ignored.
   */
  installGestureUnlock(): void;
  play(soundId: AudioManagerSoundId): void;
  dispose(): void;
};

export type CreateAudioManagerOptions = {
  /** In tests, inject a mock or shared AudioContext. */
  createAudioContext?: () => AudioContext;
  /** Where to listen for unlock gestures (defaults to `document`). */
  unlockRoot?: EventTarget | null;
};

export function createAudioManager(
  options: CreateAudioManagerOptions = {}
): AudioManager {
  const createContext =
    options.createAudioContext ??
    ((): AudioContext => new AudioContext({ latencyHint: "interactive" }));

  const unlockRoot = options.unlockRoot ?? (typeof document !== "undefined" ? document : null);

  let context: AudioContext | null = null;
  let masterGain: GainNode | null = null;
  let volume = 1;
  let muted = false;

  let gestureUnlockInstalled = false;
  const gestureUnlockHandler = (): void => {
    void resumeContext();
  };

  const ensureGraph = (): { context: AudioContext; masterGain: GainNode } => {
    if (context !== null && masterGain !== null) {
      return { context, masterGain };
    }

    const nextContext = createContext();
    const nextMaster = nextContext.createGain();
    nextMaster.gain.value = effectiveGain(volume, muted);
    nextMaster.connect(nextContext.destination);
    context = nextContext;
    masterGain = nextMaster;
    return { context: nextContext, masterGain: nextMaster };
  };

  const resumeContext = async (): Promise<void> => {
    const { context: ctx } = ensureGraph();
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        // Ignore; user may have blocked audio or context may be invalid.
      }
    }
  };

  const applyAudioSettings = (settings: AudioManagerAudioSettings): void => {
    volume = clamp01(settings.volume);
    muted = settings.muted;
    const { masterGain: mg } = ensureGraph();
    mg.gain.value = effectiveGain(volume, muted);
  };

  const installGestureUnlock = (): void => {
    if (gestureUnlockInstalled || unlockRoot === null) {
      return;
    }
    gestureUnlockInstalled = true;
    const opts: AddEventListenerOptions = { capture: true, passive: true };
    unlockRoot.addEventListener("pointerdown", gestureUnlockHandler, opts);
    unlockRoot.addEventListener("keydown", gestureUnlockHandler, opts);
    unlockRoot.addEventListener("touchstart", gestureUnlockHandler, opts);
  };

  const removeGestureUnlock = (): void => {
    if (!gestureUnlockInstalled || unlockRoot === null) {
      return;
    }
    gestureUnlockInstalled = false;
    const opts: AddEventListenerOptions = { capture: true, passive: true };
    unlockRoot.removeEventListener("pointerdown", gestureUnlockHandler, opts);
    unlockRoot.removeEventListener("keydown", gestureUnlockHandler, opts);
    unlockRoot.removeEventListener("touchstart", gestureUnlockHandler, opts);
  };

  const isUnlocked = (): boolean => context !== null && context.state === "running";

  const play = (soundId: AudioManagerSoundId): void => {
    if (context === null || masterGain === null) {
      return;
    }
    if (context.state !== "running") {
      return;
    }

    const now = context.currentTime;
    const destination = masterGain;

    switch (soundId) {
      case "uiTap":
        playOneShot(context, destination, now, {
          duration: 0.04,
          frequency: 880,
          type: "sine",
          peak: 0.12
        });
        break;
      case "menuNavigate":
        playOneShot(context, destination, now, {
          duration: 0.05,
          frequency: 660,
          type: "triangle",
          peak: 0.08
        });
        break;
      case "pickup":
        playSweep(context, destination, now, {
          duration: 0.12,
          startFreq: 520,
          endFreq: 980,
          peak: 0.14
        });
        break;
      case "roundTransition":
        playOneShot(context, destination, now, {
          duration: 0.22,
          frequency: 220,
          type: "sine",
          peak: 0.1
        });
        break;
    }
  };

  const dispose = (): void => {
    removeGestureUnlock();
    if (context !== null) {
      try {
        context.close();
      } catch {
        // ignore
      }
    }
    context = null;
    masterGain = null;
  };

  return {
    isUnlocked,
    applyAudioSettings,
    installGestureUnlock,
    play,
    dispose
  };
}

function effectiveGain(volumeValue: number, isMuted: boolean): number {
  if (isMuted) {
    return 0;
  }
  return clamp01(volumeValue);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

function playOneShot(
  ctx: AudioContext,
  destination: AudioNode,
  startTime: number,
  options: {
    duration: number;
    frequency: number;
    type: OscillatorType;
    peak: number;
  }
): void {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  const { duration, frequency, peak, type } = options;
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, startTime);
  env.gain.setValueAtTime(0, startTime);
  env.gain.linearRampToValueAtTime(peak, startTime + 0.008);
  env.gain.exponentialRampToValueAtTime(
    Math.max(0.0001, peak * 0.01),
    startTime + duration
  );
  osc.connect(env);
  env.connect(destination);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.02);
}

function playSweep(
  ctx: AudioContext,
  destination: AudioNode,
  startTime: number,
  options: {
    duration: number;
    startFreq: number;
    endFreq: number;
    peak: number;
  }
): void {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  const { duration, startFreq, endFreq, peak } = options;
  osc.type = "sine";
  osc.frequency.setValueAtTime(startFreq, startTime);
  osc.frequency.exponentialRampToValueAtTime(
    Math.max(20, endFreq),
    startTime + duration * 0.85
  );
  env.gain.setValueAtTime(0, startTime);
  env.gain.linearRampToValueAtTime(peak, startTime + 0.01);
  env.gain.exponentialRampToValueAtTime(
    Math.max(0.0001, peak * 0.02),
    startTime + duration
  );
  osc.connect(env);
  env.connect(destination);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.02);
}
