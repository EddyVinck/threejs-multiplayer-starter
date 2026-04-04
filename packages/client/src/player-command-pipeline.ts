import {
  DEFAULT_SIMULATION_TICK_RATE,
  playerCommandSchema,
  type PlayerCommand
} from "@gamejam/shared";

const DEFAULT_MOUSE_SENSITIVITY = 0.01;
const MAX_LOOK_PITCH = Math.PI / 2 - 0.05;

type IntervalHandle = ReturnType<typeof globalThis.setInterval>;

export type PlayerCommandPipelineOptions = {
  captureElement: HTMLElement;
  submitCommand: (command: PlayerCommand) => void;
  clock?: () => number;
  sampleRateHz?: number;
  mouseSensitivity?: number;
};

export type PlayerCommandPipeline = {
  getLatestCommand(): PlayerCommand;
  start(): void;
  stop(): void;
  isRunning(): boolean;
};

export function createPlayerCommandPipeline(
  options: PlayerCommandPipelineOptions
): PlayerCommandPipeline {
  const clock = options.clock ?? defaultClock;
  const sampleRateHz = Math.max(
    1,
    Math.round(options.sampleRateHz ?? DEFAULT_SIMULATION_TICK_RATE)
  );
  const sampleIntervalMs = Math.max(1, Math.round(1000 / sampleRateHz));
  const mouseSensitivity = options.mouseSensitivity ?? DEFAULT_MOUSE_SENSITIVITY;
  const keyboardTarget = resolveKeyboardTarget(options.captureElement);
  const pointerTarget = options.captureElement;

  let intervalHandle: IntervalHandle | null = null;
  let sequence = 0;
  let yaw = 0;
  let pitch = 0;
  let lastSampleAt = clock();
  const pressedKeys = new Set<string>();
  const pressedButtons = new Set<number>();

  const latestCommand = playerCommandSchema.parse({
    sequence,
    deltaMs: 0,
    move: { x: 0, y: 0, z: 0 },
    look: { yaw, pitch },
    actions: {
      jump: false,
      primary: false,
      secondary: false
    }
  });

  function focusCaptureSurface(): void {
    if (pointerTarget.tabIndex < 0) {
      pointerTarget.tabIndex = 0;
    }

    pointerTarget.focus({
      preventScroll: true
    });
  }

  function clearTransientInputState(): void {
    pressedKeys.clear();
    pressedButtons.clear();
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }

    pressedKeys.add(event.code);
    if (isCapturedControlKey(event.code)) {
      event.preventDefault();
    }
  }

  function handleKeyUp(event: KeyboardEvent): void {
    pressedKeys.delete(event.code);
    if (isCapturedControlKey(event.code)) {
      event.preventDefault();
    }
  }

  function handleMouseDown(event: MouseEvent): void {
    focusCaptureSurface();
    pressedButtons.add(event.button);
    if (event.button === 0 || event.button === 2) {
      event.preventDefault();
    }
  }

  function handleMouseUp(event: MouseEvent): void {
    pressedButtons.delete(event.button);
  }

  function handleMouseMove(event: MouseEvent): void {
    yaw = wrapAngle(yaw - event.movementX * mouseSensitivity);
    pitch = clamp(pitch - event.movementY * mouseSensitivity, -MAX_LOOK_PITCH, MAX_LOOK_PITCH);
  }

  function handleWindowBlur(): void {
    clearTransientInputState();
  }

  function emitCommandSample(): void {
    const sampledAt = clock();
    const nextCommand = playerCommandSchema.parse({
      sequence,
      deltaMs: Math.max(0, Math.round(sampledAt - lastSampleAt)),
      move: sampleMoveInput(pressedKeys),
      look: {
        yaw,
        pitch
      },
      actions: {
        jump: pressedKeys.has("Space"),
        primary: pressedButtons.has(0),
        secondary: pressedButtons.has(2)
      }
    });

    lastSampleAt = sampledAt;
    sequence += 1;
    latestCommand.sequence = nextCommand.sequence;
    latestCommand.deltaMs = nextCommand.deltaMs;
    latestCommand.move = nextCommand.move;
    latestCommand.look = nextCommand.look;
    latestCommand.actions = nextCommand.actions;
    options.submitCommand(nextCommand);
  }

  function start(): void {
    if (intervalHandle !== null) {
      return;
    }

    focusCaptureSurface();
    lastSampleAt = clock();
    pointerTarget.addEventListener("mousedown", handleMouseDown);
    pointerTarget.addEventListener("contextmenu", preventContextMenu);
    keyboardTarget.addEventListener("keydown", handleKeyDown);
    keyboardTarget.addEventListener("keyup", handleKeyUp);
    keyboardTarget.addEventListener("mousemove", handleMouseMove);
    keyboardTarget.addEventListener("mouseup", handleMouseUp);
    keyboardTarget.addEventListener("blur", handleWindowBlur);
    intervalHandle = globalThis.setInterval(emitCommandSample, sampleIntervalMs);
  }

  function stop(): void {
    if (intervalHandle === null) {
      return;
    }

    globalThis.clearInterval(intervalHandle);
    intervalHandle = null;
    pointerTarget.removeEventListener("mousedown", handleMouseDown);
    pointerTarget.removeEventListener("contextmenu", preventContextMenu);
    keyboardTarget.removeEventListener("keydown", handleKeyDown);
    keyboardTarget.removeEventListener("keyup", handleKeyUp);
    keyboardTarget.removeEventListener("mousemove", handleMouseMove);
    keyboardTarget.removeEventListener("mouseup", handleMouseUp);
    keyboardTarget.removeEventListener("blur", handleWindowBlur);
    clearTransientInputState();
  }

  return {
    getLatestCommand() {
      return structuredClone(latestCommand);
    },
    start,
    stop,
    isRunning() {
      return intervalHandle !== null;
    }
  };
}

function resolveKeyboardTarget(captureElement: HTMLElement): Window {
  if (captureElement.ownerDocument?.defaultView) {
    return captureElement.ownerDocument.defaultView;
  }

  if (typeof window !== "undefined") {
    return window;
  }

  throw new Error("player command pipeline requires a window target");
}

function preventContextMenu(event: Event): void {
  event.preventDefault();
}

function sampleMoveInput(pressedKeys: ReadonlySet<string>): PlayerCommand["move"] {
  return {
    x: sampleAxis(pressedKeys, ["KeyD", "ArrowRight"], ["KeyA", "ArrowLeft"]),
    y: sampleAxis(pressedKeys, ["Space"], ["ShiftLeft", "ShiftRight"]),
    z: sampleAxis(pressedKeys, ["KeyS", "ArrowDown"], ["KeyW", "ArrowUp"])
  };
}

function sampleAxis(
  pressedKeys: ReadonlySet<string>,
  positiveCodes: readonly string[],
  negativeCodes: readonly string[]
): -1 | 0 | 1 {
  const positive = positiveCodes.some((code) => pressedKeys.has(code));
  const negative = negativeCodes.some((code) => pressedKeys.has(code));

  if (positive === negative) {
    return 0;
  }

  return positive ? 1 : -1;
}

function isCapturedControlKey(code: string): boolean {
  return (
    code === "Space" ||
    code === "ShiftLeft" ||
    code === "ShiftRight" ||
    code === "KeyW" ||
    code === "KeyA" ||
    code === "KeyS" ||
    code === "KeyD" ||
    code.startsWith("Arrow")
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function wrapAngle(value: number): number {
  const wrapped = ((value + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
  return wrapped - Math.PI;
}

function defaultClock(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
