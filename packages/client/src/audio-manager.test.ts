/** @vitest-environment happy-dom */

import { describe, expect, it, vi } from "vitest";

import { createAudioManager } from "./audio-manager.js";

function mockGainNode() {
  const gain = {
    value: 1,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn()
  };
  return { gain, connect: vi.fn() };
}

describe("audio manager", () => {
  it("drives master gain on the created graph", () => {
    const gains: { value: number }[] = [];

    const manager = createAudioManager({
      createAudioContext: () => {
        const ctx = {
          state: "suspended" as AudioContextState,
          currentTime: 0,
          destination: {} as AudioDestinationNode,
          resume: vi.fn(async () => {
            ctx.state = "running";
          }),
          close: vi.fn(),
          createGain: () => {
            const node = mockGainNode();
            gains.push(node.gain);
            return node;
          },
          createOscillator: () => ({
            type: "sine",
            frequency: { setValueAtTime: vi.fn(), value: 440 },
            connect: vi.fn(),
            start: vi.fn(),
            stop: vi.fn()
          })
        };
        return ctx as unknown as AudioContext;
      },
      unlockRoot: null
    });

    manager.applyAudioSettings({ volume: 0.4, muted: false });
    expect(gains[0]?.value).toBeCloseTo(0.4, 5);

    manager.applyAudioSettings({ volume: 0.9, muted: true });
    expect(gains[0]?.value).toBe(0);
  });

  it("resumes the audio context on the first gesture after installGestureUnlock", async () => {
    const unlockRoot = new EventTarget();

    const ctx = {
      state: "suspended" as AudioContextState,
      currentTime: 0,
      destination: {} as AudioDestinationNode,
      resume: vi.fn(),
      close: vi.fn(),
      createGain: () => mockGainNode(),
      createOscillator: () => ({
        type: "sine",
        frequency: { setValueAtTime: vi.fn(), value: 440 },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn()
      })
    };
    ctx.resume = vi.fn(async () => {
      ctx.state = "running";
    });

    const audioContext = ctx as unknown as AudioContext;

    const manager = createAudioManager({
      createAudioContext: () => audioContext,
      unlockRoot
    });

    manager.applyAudioSettings({ volume: 1, muted: false });
    expect(manager.isUnlocked()).toBe(false);

    manager.installGestureUnlock();
    unlockRoot.dispatchEvent(new Event("pointerdown"));

    await vi.waitFor(() => {
      expect(ctx.resume).toHaveBeenCalled();
    });
    expect(manager.isUnlocked()).toBe(true);
  });

  it("plays procedural cues only while the context is running", async () => {
    const unlockRoot = new EventTarget();
    const oscillators: { start: ReturnType<typeof vi.fn> }[] = [];

    const ctx = {
      state: "suspended" as AudioContextState,
      currentTime: 0,
      destination: {} as AudioDestinationNode,
      resume: vi.fn(),
      close: vi.fn(),
      createGain: () => mockGainNode(),
      createOscillator: () => {
        const o = {
          type: "sine",
          frequency: { setValueAtTime: vi.fn(), value: 440 },
          connect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn()
        };
        oscillators.push(o);
        return o;
      }
    };
    ctx.resume = vi.fn(async () => {
      ctx.state = "running";
    });

    const manager = createAudioManager({
      createAudioContext: () => ctx as unknown as AudioContext,
      unlockRoot
    });

    manager.applyAudioSettings({ volume: 1, muted: false });
    manager.play("pickup");
    expect(oscillators).toHaveLength(0);

    manager.installGestureUnlock();
    unlockRoot.dispatchEvent(new Event("keydown"));
    await vi.waitFor(() => expect(ctx.state).toBe("running"));

    manager.play("uiTap");
    expect(oscillators.length).toBeGreaterThan(0);
    expect(oscillators[0]?.start).toHaveBeenCalled();
  });

  it("dispose closes the context and removes gesture listeners", () => {
    const unlockRoot = new EventTarget();
    const removeSpy = vi.spyOn(unlockRoot, "removeEventListener");

    const close = vi.fn(async () => {});

    const manager = createAudioManager({
      createAudioContext: () =>
        ({
          state: "suspended",
          currentTime: 0,
          destination: {} as AudioDestinationNode,
          resume: vi.fn(),
          close,
          createGain: () => mockGainNode(),
          createOscillator: () => ({
            type: "sine",
            frequency: { setValueAtTime: vi.fn(), value: 440 },
            connect: vi.fn(),
            start: vi.fn(),
            stop: vi.fn()
          })
        }) as unknown as AudioContext,
      unlockRoot
    });

    manager.applyAudioSettings({ volume: 1, muted: false });
    manager.installGestureUnlock();
    manager.dispose();

    expect(close).toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalled();
  });
});
