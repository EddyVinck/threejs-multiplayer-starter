/** @vitest-environment happy-dom */

import { describe, expect, it } from "vitest";

import type { AudioManagerSoundId } from "./audio-manager.js";
import { createClientSettingsStore } from "./persistence.js";
import { mountClientBootShell } from "./boot-shell.js";

class MemoryStorage implements Storage {
  get length(): number {
    return this.store.size;
  }

  private readonly store = new Map<string, string>();

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

describe("boot shell settings", () => {
  it("reflects hydrated settings from the persistence store on mount", () => {
    const storage = new MemoryStorage();
    const settingsStore = createClientSettingsStore({
      storage,
      defaultSettings: {
        displayName: "Jammer",
        audio: { volume: 0.5, muted: true }
      }
    });

    const appRoot = document.createElement("div");
    const shell = mountClientBootShell({
      appRoot,
      resolution: {
        source: "default-single-player",
        request: { mode: "single-player" }
      },
      settingsStore
    });

    const nameInput = appRoot.querySelector<HTMLInputElement>(
      "#pregame-display-name"
    );
    const volumeInput =
      appRoot.querySelector<HTMLInputElement>("#pregame-volume");
    const muteInput = appRoot.querySelector<HTMLInputElement>("#pregame-mute");

    expect(nameInput?.value).toBe("Jammer");
    expect(volumeInput?.value).toBe("50");
    expect(muteInput?.checked).toBe(true);

    shell.dispose();
  });

  it("persists display name on blur when valid", () => {
    const storage = new MemoryStorage();
    const settingsStore = createClientSettingsStore({ storage });

    const appRoot = document.createElement("div");
    const shell = mountClientBootShell({
      appRoot,
      resolution: {
        source: "default-single-player",
        request: { mode: "single-player" }
      },
      settingsStore
    });

    const nameInput = appRoot.querySelector<HTMLInputElement>(
      "#pregame-display-name"
    );
    expect(nameInput).not.toBeNull();
    nameInput!.value = "ValidName";
    nameInput!.dispatchEvent(new Event("blur", { bubbles: true }));

    expect(settingsStore.getSettings().displayName).toBe("ValidName");

    shell.dispose();
  });

  it("clears display name when the field is emptied on blur", () => {
    const storage = new MemoryStorage();
    const settingsStore = createClientSettingsStore({
      storage,
      defaultSettings: { displayName: "Old" }
    });

    const appRoot = document.createElement("div");
    const shell = mountClientBootShell({
      appRoot,
      resolution: {
        source: "default-single-player",
        request: { mode: "single-player" }
      },
      settingsStore
    });

    const nameInput = appRoot.querySelector<HTMLInputElement>(
      "#pregame-display-name"
    );
    nameInput!.value = "   ";
    nameInput!.dispatchEvent(new Event("blur", { bubbles: true }));

    expect(settingsStore.getSettings().displayName).toBeNull();

    shell.dispose();
  });

  it("updates volume and mute in the store from controls", () => {
    const storage = new MemoryStorage();
    const settingsStore = createClientSettingsStore({ storage });

    const appRoot = document.createElement("div");
    const shell = mountClientBootShell({
      appRoot,
      resolution: {
        source: "default-single-player",
        request: { mode: "single-player" }
      },
      settingsStore
    });

    const volumeInput =
      appRoot.querySelector<HTMLInputElement>("#pregame-volume");
    const muteInput = appRoot.querySelector<HTMLInputElement>("#pregame-mute");

    volumeInput!.value = "25";
    volumeInput!.dispatchEvent(new Event("input", { bubbles: true }));
    expect(settingsStore.getSettings().audio.volume).toBe(0.25);

    muteInput!.checked = true;
    muteInput!.dispatchEvent(new Event("change", { bubbles: true }));
    expect(settingsStore.getSettings().audio.muted).toBe(true);

    shell.dispose();
  });

  it("disables settings controls while a session start is pending", () => {
    const storage = new MemoryStorage();
    const settingsStore = createClientSettingsStore({ storage });

    const appRoot = document.createElement("div");
    const shell = mountClientBootShell({
      appRoot,
      resolution: {
        source: "default-single-player",
        request: { mode: "single-player" }
      },
      settingsStore
    });

    shell.syncView({
      status: {
        badge: "Connecting",
        title: "Quick Join",
        detail: "Joining the next room."
      },
      preGameVisible: false,
      pendingSessionStart: "quick-join",
      inGameHud: null
    });

    const nameInput = appRoot.querySelector<HTMLInputElement>(
      "#pregame-display-name"
    );
    const volumeInput =
      appRoot.querySelector<HTMLInputElement>("#pregame-volume");
    const muteInput = appRoot.querySelector<HTMLInputElement>("#pregame-mute");

    expect(nameInput?.disabled).toBe(true);
    expect(volumeInput?.disabled).toBe(true);
    expect(muteInput?.disabled).toBe(true);

    shell.syncView({
      status: {
        badge: "Ready",
        title: "Back",
        detail: "Controls re-enabled."
      },
      preGameVisible: true,
      pendingSessionStart: null,
      inGameHud: null
    });

    expect(nameInput?.disabled).toBe(false);
    expect(volumeInput?.disabled).toBe(false);
    expect(muteInput?.disabled).toBe(false);

    shell.dispose();
  });

  it("plays lightweight UI cues when primary actions and mute are used", () => {
    const storage = new MemoryStorage();
    const settingsStore = createClientSettingsStore({ storage });
    const played: AudioManagerSoundId[] = [];
    const audioManager = {
      applyAudioSettings: () => {},
      dispose: () => {},
      play: (id: AudioManagerSoundId) => {
        played.push(id);
      }
    };

    const appRoot = document.createElement("div");
    const shell = mountClientBootShell({
      appRoot,
      resolution: {
        source: "default-single-player",
        request: { mode: "single-player" }
      },
      settingsStore,
      audioManager
    });

    appRoot
      .querySelector<HTMLButtonElement>(".pregame-action-primary")
      ?.click();
    appRoot
      .querySelectorAll<HTMLButtonElement>(".pregame-action-secondary")[0]
      ?.click();
    const muteInput = appRoot.querySelector<HTMLInputElement>("#pregame-mute");
    expect(muteInput).not.toBeNull();
    muteInput!.checked = true;
    muteInput!.dispatchEvent(new Event("change", { bubbles: true }));

    expect(played).toEqual(["uiTap", "menuNavigate", "menuNavigate"]);

    shell.dispose();
  });
});
