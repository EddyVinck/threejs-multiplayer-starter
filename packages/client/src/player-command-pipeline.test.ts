import { afterEach, describe, expect, it, vi } from "vitest";

import { createPlayerCommandPipeline } from "./player-command-pipeline.js";

type Listener = (event: unknown) => void;

class FakeListenerTarget {
  private listeners = new Map<string, Set<Listener>>();

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const wrapped = normalizeListener(listener);
    const listeners = this.listeners.get(type) ?? new Set<Listener>();
    listeners.add(wrapped);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const wrapped = normalizeListener(listener);
    const listeners = this.listeners.get(type);
    listeners?.delete(wrapped);
    if (listeners?.size === 0) {
      this.listeners.delete(type);
    }
  }

  dispatch(type: string, event: unknown): void {
    const listeners = [...(this.listeners.get(type) ?? [])];
    for (const listener of listeners) {
      listener(event);
    }
  }
}

class FakeWindow extends FakeListenerTarget {}

class FakeCaptureElement extends FakeListenerTarget {
  tabIndex = -1;
  focusCalls = 0;

  readonly ownerDocument: {
    defaultView: Window;
  };

  constructor(defaultView: Window) {
    super();
    this.ownerDocument = {
      defaultView
    };
  }

  focus(): void {
    this.focusCalls += 1;
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe("player command pipeline", () => {
  it("normalizes keyboard and mouse input into sampled commands", () => {
    vi.useFakeTimers();

    let now = 0;
    const fakeWindow = new FakeWindow();
    const captureElement = new FakeCaptureElement(fakeWindow as unknown as Window);
    const submittedCommands: ReturnType<
      ReturnType<typeof createPlayerCommandPipeline>["getLatestCommand"]
    >[] = [];

    const pipeline = createPlayerCommandPipeline({
      captureElement: captureElement as unknown as HTMLElement,
      submitCommand(command) {
        submittedCommands.push(command);
      },
      clock: () => now,
      sampleRateHz: 20
    });

    pipeline.start();

    expect(pipeline.isRunning()).toBe(true);
    expect(captureElement.tabIndex).toBe(0);
    expect(captureElement.focusCalls).toBe(1);

    fakeWindow.dispatch("keydown", createKeyboardEvent("KeyD"));
    fakeWindow.dispatch("keydown", createKeyboardEvent("KeyW"));
    fakeWindow.dispatch("keydown", createKeyboardEvent("Space"));
    captureElement.dispatch("mousedown", createMouseButtonEvent(0));
    fakeWindow.dispatch("mousemove", createMouseMoveEvent(-50, -25));

    now = 50;
    vi.advanceTimersByTime(50);

    expect(submittedCommands).toHaveLength(1);
    expect(submittedCommands[0]).toEqual({
      sequence: 0,
      deltaMs: 50,
      move: {
        x: 1,
        y: 1,
        z: -1
      },
      look: {
        yaw: -0.5,
        pitch: 0.25
      },
      actions: {
        jump: true,
        primary: true,
        secondary: false
      }
    });
    expect(pipeline.getLatestCommand()).toEqual(submittedCommands[0]);
  });

  it("ignores repeated or modified key presses and clears transient state on blur", () => {
    vi.useFakeTimers();

    let now = 0;
    const fakeWindow = new FakeWindow();
    const captureElement = new FakeCaptureElement(fakeWindow as unknown as Window);
    const submittedCommands: ReturnType<
      ReturnType<typeof createPlayerCommandPipeline>["getLatestCommand"]
    >[] = [];

    const pipeline = createPlayerCommandPipeline({
      captureElement: captureElement as unknown as HTMLElement,
      submitCommand(command) {
        submittedCommands.push(command);
      },
      clock: () => now,
      sampleRateHz: 10
    });

    pipeline.start();

    fakeWindow.dispatch("keydown", createKeyboardEvent("KeyA", { repeat: true }));
    fakeWindow.dispatch("keydown", createKeyboardEvent("KeyD", { ctrlKey: true }));
    fakeWindow.dispatch("keydown", createKeyboardEvent("KeyW"));
    fakeWindow.dispatch("keydown", createKeyboardEvent("ArrowUp"));
    fakeWindow.dispatch("blur", {});

    now = 100;
    vi.advanceTimersByTime(100);

    expect(submittedCommands).toHaveLength(1);
    expect(submittedCommands[0]).toMatchObject({
      sequence: 0,
      deltaMs: 100,
      move: {
        x: 0,
        y: 0,
        z: 0
      },
      actions: {
        jump: false,
        primary: false,
        secondary: false
      }
    });
  });

  it("stops emitting samples after stop is called", () => {
    vi.useFakeTimers();

    let now = 0;
    const fakeWindow = new FakeWindow();
    const captureElement = new FakeCaptureElement(fakeWindow as unknown as Window);
    const submittedCommands: ReturnType<
      ReturnType<typeof createPlayerCommandPipeline>["getLatestCommand"]
    >[] = [];

    const pipeline = createPlayerCommandPipeline({
      captureElement: captureElement as unknown as HTMLElement,
      submitCommand(command) {
        submittedCommands.push(command);
      },
      clock: () => now,
      sampleRateHz: 5
    });

    pipeline.start();
    fakeWindow.dispatch("keydown", createKeyboardEvent("KeyD"));

    now = 200;
    vi.advanceTimersByTime(200);
    pipeline.stop();
    expect(pipeline.isRunning()).toBe(false);

    now = 400;
    vi.advanceTimersByTime(200);

    expect(submittedCommands).toHaveLength(1);
    expect(submittedCommands[0]).toMatchObject({
      move: {
        x: 1,
        y: 0,
        z: 0
      }
    });
  });
});

function normalizeListener(listener: EventListenerOrEventListenerObject): Listener {
  if (typeof listener === "function") {
    return listener as Listener;
  }

  return listener.handleEvent.bind(listener) as Listener;
}

function createKeyboardEvent(
  code: string,
  options: {
    repeat?: boolean;
    metaKey?: boolean;
    ctrlKey?: boolean;
    altKey?: boolean;
  } = {}
): KeyboardEvent {
  return {
    code,
    repeat: options.repeat ?? false,
    metaKey: options.metaKey ?? false,
    ctrlKey: options.ctrlKey ?? false,
    altKey: options.altKey ?? false,
    preventDefault() {}
  } as KeyboardEvent;
}

function createMouseButtonEvent(button: number): MouseEvent {
  return {
    button,
    preventDefault() {}
  } as MouseEvent;
}

function createMouseMoveEvent(movementX: number, movementY: number): MouseEvent {
  return {
    movementX,
    movementY,
    preventDefault() {}
  } as MouseEvent;
}
