import {
  DISPLAY_NAME_MAX_LENGTH,
  displayNameSchema,
  normalizeRoomCode,
  ROOM_CODE_LENGTH,
  roomCodeSchema,
  type RoomSnapshot,
  type SessionJoined
} from "@gamejam/shared";

import {
  describeInitialBootStatus,
  type BootStatusViewModel
} from "./boot-status.js";
import type { AudioManager } from "./audio-manager.js";
import { buildInGameHudViewModel } from "./in-game-hud.js";
import type { ClientSettingsStore } from "./persistence.js";
import { resolveRenderCanvasSize } from "./render-budget.js";
import type { SessionEntryResolution } from "./session-entry.js";
import type { SessionStartRequest } from "./session-orchestrator.js";

export type ClientBootShell = {
  canvas: HTMLCanvasElement;
  overlayRoot: HTMLDivElement;
  setStatus(status: BootStatusViewModel): void;
  setPreGameVisible(visible: boolean): void;
  setPendingSessionStart(mode: SessionStartRequest["mode"] | null): void;
  setInGameHudVisible(visible: boolean): void;
  updateInGameHud(
    joined: SessionJoined,
    snapshot: RoomSnapshot | null
  ): void;
  dispose(): void;
};

export function mountClientBootShell(options: {
  appRoot: HTMLElement;
  resolution: SessionEntryResolution;
  settingsStore: ClientSettingsStore;
  /** When set, volume/mute changes update the running Web Audio graph and UI can play cues. */
  audioManager?: Pick<
    AudioManager,
    "applyAudioSettings" | "dispose" | "play"
  >;
  onStartSession?: (request: SessionStartRequest) => void;
}): ClientBootShell {
  const { appRoot, audioManager, onStartSession, resolution, settingsStore } =
    options;
  const shell = document.createElement("div");
  shell.className = "client-shell";

  const backdropCanvas = document.createElement("canvas");
  backdropCanvas.className = "boot-backdrop";
  backdropCanvas.setAttribute("aria-hidden", "true");

  const canvas = document.createElement("canvas");
  canvas.className = "game-canvas";
  canvas.id = "game-canvas";
  canvas.setAttribute("aria-label", "Game render surface");

  const overlayRoot = document.createElement("div");
  overlayRoot.className = "overlay-root";
  overlayRoot.id = "overlay-root";

  const inGameHud = document.createElement("section");
  inGameHud.className = "ingame-hud";
  inGameHud.setAttribute("aria-label", "In-game status");
  inGameHud.hidden = true;

  const inGameHudScore = document.createElement("p");
  inGameHudScore.className = "ingame-hud-line ingame-hud-score";

  const inGameHudTimer = document.createElement("p");
  inGameHudTimer.className = "ingame-hud-line ingame-hud-timer";

  const inGameHudRoom = document.createElement("p");
  inGameHudRoom.className = "ingame-hud-line ingame-hud-room";

  inGameHud.append(inGameHudScore, inGameHudTimer, inGameHudRoom);

  const overlayChrome = document.createElement("div");
  overlayChrome.className = "overlay-chrome";

  const preGamePanel = document.createElement("section");
  preGamePanel.className = "pregame-panel";

  const preGameEyebrow = document.createElement("p");
  preGameEyebrow.className = "pregame-eyebrow";
  preGameEyebrow.textContent = "Game Jam Boilerplate";

  const preGameTitle = document.createElement("h1");
  preGameTitle.className = "pregame-title";
  preGameTitle.textContent = "Start fast, keep multiplayer close";

  const preGameDetail = document.createElement("p");
  preGameDetail.className = "pregame-detail";
  preGameDetail.textContent =
    "Jump into solo play immediately, while the room-based multiplayer path stays visible from the same screen.";

  const settingsSection = document.createElement("section");
  settingsSection.className = "pregame-settings";
  settingsSection.setAttribute("aria-label", "Player and audio settings");

  const settingsHeading = document.createElement("h2");
  settingsHeading.className = "pregame-settings-heading";
  settingsHeading.textContent = "Player & audio";

  const displayNameLabel = document.createElement("label");
  displayNameLabel.className = "pregame-settings-label";
  displayNameLabel.htmlFor = "pregame-display-name";
  displayNameLabel.textContent = "Display name";

  const displayNameInput = document.createElement("input");
  displayNameInput.id = "pregame-display-name";
  displayNameInput.className = "pregame-settings-input";
  displayNameInput.type = "text";
  displayNameInput.autocomplete = "off";
  displayNameInput.spellcheck = false;
  displayNameInput.maxLength = DISPLAY_NAME_MAX_LENGTH;
  displayNameInput.placeholder = "Optional — shown in multiplayer";
  displayNameInput.setAttribute(
    "aria-describedby",
    "pregame-display-name-hint"
  );

  const displayNameHint = document.createElement("p");
  displayNameHint.id = "pregame-display-name-hint";
  displayNameHint.className = "pregame-settings-hint";
  displayNameHint.textContent = `Up to ${DISPLAY_NAME_MAX_LENGTH} characters. Saved locally on this device.`;

  const displayNameField = document.createElement("div");
  displayNameField.className = "pregame-settings-field";
  displayNameField.append(displayNameLabel, displayNameInput, displayNameHint);

  const volumeLabel = document.createElement("label");
  volumeLabel.className = "pregame-settings-label";
  volumeLabel.htmlFor = "pregame-volume";
  volumeLabel.textContent = "Volume";

  const volumeInput = document.createElement("input");
  volumeInput.id = "pregame-volume";
  volumeInput.className = "pregame-settings-volume";
  volumeInput.type = "range";
  volumeInput.min = "0";
  volumeInput.max = "100";
  volumeInput.step = "1";

  const muteCheckbox = document.createElement("input");
  muteCheckbox.id = "pregame-mute";
  muteCheckbox.className = "pregame-settings-mute";
  muteCheckbox.type = "checkbox";

  const muteLabel = document.createElement("label");
  muteLabel.className = "pregame-settings-mute-label";
  muteLabel.append(muteCheckbox, document.createTextNode(" Mute"));

  const audioRow = document.createElement("div");
  audioRow.className = "pregame-settings-audio-row";
  audioRow.append(volumeLabel, volumeInput, muteLabel);

  const syncSettingsInputsFromStore = () => {
    const settings = settingsStore.getSettings();
    displayNameInput.value = settings.displayName ?? "";
    volumeInput.value = String(Math.round(settings.audio.volume * 100));
    muteCheckbox.checked = settings.audio.muted;
  };

  syncSettingsInputsFromStore();

  displayNameInput.addEventListener("input", () => {
    if (displayNameInput.value.length > DISPLAY_NAME_MAX_LENGTH) {
      displayNameInput.value = displayNameInput.value.slice(
        0,
        DISPLAY_NAME_MAX_LENGTH
      );
    }
  });

  displayNameInput.addEventListener("blur", () => {
    const trimmed = displayNameInput.value.trim();
    if (trimmed === "") {
      settingsStore.patchSettings({ displayName: null });
      displayNameInput.value = "";
      return;
    }

    const parsed = displayNameSchema.safeParse(trimmed);
    if (parsed.success) {
      settingsStore.patchSettings({ displayName: parsed.data });
      displayNameInput.value = parsed.data;
      return;
    }

    syncSettingsInputsFromStore();
  });

  volumeInput.addEventListener("input", () => {
    const raw = Number(volumeInput.value);
    const nextVolume = Number.isFinite(raw)
      ? Math.max(0, Math.min(1, raw / 100))
      : 0;
    settingsStore.patchSettings({ audio: { volume: nextVolume } });
    audioManager?.applyAudioSettings(settingsStore.getSettings().audio);
  });

  muteCheckbox.addEventListener("change", () => {
    audioManager?.play("menuNavigate");
    settingsStore.patchSettings({ audio: { muted: muteCheckbox.checked } });
    audioManager?.applyAudioSettings(settingsStore.getSettings().audio);
  });

  settingsSection.append(settingsHeading, displayNameField, audioRow);

  const actionGroup = document.createElement("div");
  actionGroup.className = "pregame-actions";

  const primaryAction = document.createElement("button");
  primaryAction.className = "pregame-action pregame-action-primary";
  primaryAction.type = "button";
  primaryAction.textContent = "Play Solo";
  primaryAction.addEventListener("click", () => {
    if (primaryAction.disabled) {
      return;
    }

    audioManager?.play("uiTap");
    onStartSession?.({
      mode: "single-player"
    });
  });

  const quickJoinAction = createSecondaryAction({
    label: "Quick Join",
    detail: "Drop into the next available public room."
  });
  quickJoinAction.button.addEventListener("click", () => {
    if (quickJoinAction.button.disabled) {
      return;
    }

    audioManager?.play("menuNavigate");
    onStartSession?.({
      mode: "quick-join"
    });
  });

  const createRoomAction = createSecondaryAction({
    label: "Create Room",
    detail: "Spin up a private room and get a shareable code."
  });
  createRoomAction.button.addEventListener("click", () => {
    if (createRoomAction.button.disabled) {
      return;
    }

    audioManager?.play("menuNavigate");
    onStartSession?.({
      mode: "create-room",
      visibility: "private",
      lateJoinAllowed: true
    });
  });

  const joinByCodePanel = document.createElement("form");
  joinByCodePanel.className = "pregame-join-panel";

  const joinByCodeHeader = document.createElement("div");
  joinByCodeHeader.className = "pregame-join-header";

  const joinByCodeTitle = document.createElement("span");
  joinByCodeTitle.className = "pregame-action-label";
  joinByCodeTitle.textContent = "Join by Code";

  const joinByCodeDetail = document.createElement("span");
  joinByCodeDetail.className = "pregame-action-detail";
  joinByCodeDetail.textContent =
    "Enter a short invite code or use the room code already present in the URL.";

  joinByCodeHeader.append(joinByCodeTitle, joinByCodeDetail);

  const joinByCodeControls = document.createElement("div");
  joinByCodeControls.className = "pregame-join-controls";

  const joinCodeInput = document.createElement("input");
  joinCodeInput.className = "pregame-code-input";
  joinCodeInput.type = "text";
  joinCodeInput.name = "roomCode";
  joinCodeInput.autocomplete = "off";
  joinCodeInput.spellcheck = false;
  joinCodeInput.maxLength = ROOM_CODE_LENGTH + 4;
  joinCodeInput.placeholder = "AB12CD";
  joinCodeInput.value = getInitialJoinCode(resolution);
  joinCodeInput.setAttribute("aria-label", "Room code");
  joinCodeInput.addEventListener("input", () => {
    joinCodeInput.value = normalizeRoomCode(joinCodeInput.value);
    joinCodeError.textContent = "";
    joinCodeInput.removeAttribute("aria-invalid");
  });

  const joinByCodeAction = document.createElement("button");
  joinByCodeAction.className = "pregame-action pregame-join-action";
  joinByCodeAction.type = "submit";
  joinByCodeAction.textContent = "Join Room";

  joinByCodeControls.append(joinCodeInput, joinByCodeAction);

  const joinCodeError = document.createElement("p");
  joinCodeError.className = "pregame-code-error";
  joinCodeError.setAttribute("aria-live", "polite");

  joinByCodePanel.addEventListener("submit", (event) => {
    event.preventDefault();
    if (joinByCodeAction.disabled) {
      return;
    }

    const parsedRoomCode = roomCodeSchema.safeParse(joinCodeInput.value);
    if (!parsedRoomCode.success) {
      joinCodeError.textContent = `Enter a valid ${ROOM_CODE_LENGTH}-character room code.`;
      joinCodeInput.setAttribute("aria-invalid", "true");
      joinCodeInput.focus();
      return;
    }

    joinCodeInput.value = parsedRoomCode.data;
    joinCodeError.textContent = "";
    joinCodeInput.removeAttribute("aria-invalid");
    audioManager?.play("uiTap");
    onStartSession?.({
      mode: "join-by-code",
      roomCode: parsedRoomCode.data
    });
  });

  joinByCodePanel.append(joinByCodeHeader, joinByCodeControls, joinCodeError);

  actionGroup.append(primaryAction);
  actionGroup.append(quickJoinAction.button, createRoomAction.button, joinByCodePanel);

  const preGameFooter = document.createElement("p");
  preGameFooter.className = "pregame-footer";
  preGameFooter.textContent = describePreGameFooter(resolution);

  const bootPanel = document.createElement("section");
  bootPanel.className = "boot-panel";
  bootPanel.setAttribute("aria-live", "polite");

  const badge = document.createElement("p");
  badge.className = "boot-badge";

  const title = document.createElement("h1");
  title.className = "boot-title";

  const detail = document.createElement("p");
  detail.className = "boot-detail";

  preGamePanel.append(
    preGameEyebrow,
    preGameTitle,
    preGameDetail,
    settingsSection,
    actionGroup,
    preGameFooter
  );
  bootPanel.append(badge, title, detail);
  overlayChrome.append(preGamePanel, bootPanel);
  overlayRoot.append(inGameHud, overlayChrome);
  shell.append(backdropCanvas, canvas, overlayRoot);
  appRoot.replaceChildren(shell);

  const resizeCanvases = () => {
    const nextSize = resolveRenderCanvasSize({
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio || 1
    });

    if (canvas.width !== nextSize.width || canvas.height !== nextSize.height) {
      canvas.width = nextSize.width;
      canvas.height = nextSize.height;
    }

    if (
      backdropCanvas.width !== nextSize.width ||
      backdropCanvas.height !== nextSize.height
    ) {
      backdropCanvas.width = nextSize.width;
      backdropCanvas.height = nextSize.height;
    }

    paintBootBackdrop(backdropCanvas);
  };

  const setStatus = (status: BootStatusViewModel) => {
    badge.textContent = status.badge;
    title.textContent = status.title;
    detail.textContent = status.detail;
  };

  const setPreGameVisible = (visible: boolean) => {
    preGamePanel.hidden = !visible;
  };

  const setInGameHudVisible = (visible: boolean) => {
    inGameHud.hidden = !visible;
    bootPanel.hidden = visible;
  };

  const updateInGameHud = (
    joined: SessionJoined,
    snapshot: RoomSnapshot | null
  ) => {
    const vm = buildInGameHudViewModel(joined, snapshot);
    inGameHudScore.textContent = vm.scoreLine;
    inGameHudTimer.textContent = vm.timerLine;
    inGameHudRoom.textContent = vm.roomLine;
  };

  const setPendingSessionStart = (mode: SessionStartRequest["mode"] | null) => {
    const hasPendingStart = mode !== null;

    primaryAction.disabled = hasPendingStart;
    primaryAction.textContent = mode === "single-player" ? "Starting Solo..." : "Play Solo";

    quickJoinAction.button.disabled = hasPendingStart;
    quickJoinAction.detail.textContent =
      mode === "quick-join"
        ? "Connecting to the next available public room..."
        : quickJoinAction.defaultDetail;

    createRoomAction.button.disabled = hasPendingStart;
    createRoomAction.detail.textContent =
      mode === "create-room"
        ? "Creating a fresh private room..."
        : createRoomAction.defaultDetail;

    joinCodeInput.disabled = hasPendingStart;
    joinByCodeAction.disabled = hasPendingStart;
    joinByCodeAction.textContent =
      mode === "join-by-code" ? "Joining..." : "Join Room";

    displayNameInput.disabled = hasPendingStart;
    volumeInput.disabled = hasPendingStart;
    muteCheckbox.disabled = hasPendingStart;
  };

  resizeCanvases();
  window.addEventListener("resize", resizeCanvases);
  setStatus(describeInitialBootStatus(resolution));
  setPreGameVisible(resolution.source !== "room-link");
  setPendingSessionStart(null);

  return {
    canvas,
    overlayRoot,
    setStatus,
    setPreGameVisible,
    setPendingSessionStart,
    setInGameHudVisible,
    updateInGameHud,
    dispose() {
      window.removeEventListener("resize", resizeCanvases);
      audioManager?.dispose();
    }
  };
}

function createSecondaryAction(copy: {
  label: string;
  detail: string;
}): {
  button: HTMLButtonElement;
  detail: HTMLSpanElement;
  defaultDetail: string;
} {
  const button = document.createElement("button");
  button.className = "pregame-action pregame-action-secondary";
  button.type = "button";

  const label = document.createElement("span");
  label.className = "pregame-action-label";
  label.textContent = copy.label;

  const detail = document.createElement("span");
  detail.className = "pregame-action-detail";
  detail.textContent = copy.detail;

  button.append(label, detail);

  return {
    button,
    detail,
    defaultDetail: copy.detail
  };
}

function getInitialJoinCode(resolution: SessionEntryResolution): string {
  if (resolution.source === "room-link") {
    return resolution.roomCode;
  }

  if (resolution.source === "invalid-room-link") {
    return normalizeRoomCode(resolution.invalidRoomCode);
  }

  return "";
}

function describePreGameFooter(resolution: SessionEntryResolution): string {
  if (resolution.source === "room-link") {
    return `Invite link detected for room ${resolution.roomCode}. If the auto-join fails, the code stays ready to retry below.`;
  }

  if (resolution.source === "invalid-room-link") {
    return `Invite link code "${resolution.invalidRoomCode}" was invalid. You can correct it and retry from the room-code form above.`;
  }

  return "Room invite links still auto-connect when a valid room code is present in the URL.";
}

function paintBootBackdrop(canvas: HTMLCanvasElement): void {
  const context = canvas.getContext("2d");
  if (context === null) {
    return;
  }

  const width = canvas.width;
  const height = canvas.height;
  const horizonY = Math.floor(height * 0.58);

  const skyGradient = context.createLinearGradient(0, 0, 0, height);
  skyGradient.addColorStop(0, "#162647");
  skyGradient.addColorStop(0.58, "#0b1220");
  skyGradient.addColorStop(1, "#05070d");

  context.fillStyle = skyGradient;
  context.fillRect(0, 0, width, height);

  context.fillStyle = "rgba(109, 170, 255, 0.1)";
  for (let index = 0; index < 3; index += 1) {
    const size = Math.max(40, Math.floor(width * (0.06 + index * 0.03)));
    const x = Math.floor(width * (0.16 + index * 0.2));
    const y = Math.floor(horizonY - size * 0.65);
    context.fillRect(x, y, size, size * 0.65);
  }

  context.strokeStyle = "rgba(146, 188, 255, 0.16)";
  context.lineWidth = Math.max(1, Math.floor(width / 900));
  for (let row = 0; row < 7; row += 1) {
    const y = horizonY + row * Math.max(24, Math.floor(height * 0.045));
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }

  const pickupColor = "rgba(137, 243, 181, 0.9)";
  const pickupSize = Math.max(6, Math.floor(width / 240));
  const pickupPositions = [0.26, 0.49, 0.72];
  context.fillStyle = pickupColor;
  for (const xRatio of pickupPositions) {
    context.fillRect(
      Math.floor(width * xRatio),
      Math.floor(horizonY + height * 0.09),
      pickupSize,
      pickupSize
    );
  }
}
