import { describe, expect, it } from "vitest";

import { createClientSettingsStore } from "./persistence.js";

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

describe("client settings persistence", () => {
  it("saves versioned settings and loads them back from storage", () => {
    const storage = new MemoryStorage();
    const firstStore = createClientSettingsStore({ storage });

    const savedSettings = firstStore.patchSettings({
      displayName: "Eddy",
      audio: {
        volume: 0.4,
        muted: true
      }
    });

    expect(savedSettings).toEqual({
      displayName: "Eddy",
      audio: {
        volume: 0.4,
        muted: true
      },
      debugDiagnostics: false
    });
    expect(JSON.parse(storage.getItem("gamejam.client-settings") ?? "null")).toEqual({
      version: 1,
      settings: {
        displayName: "Eddy",
        audio: {
          volume: 0.4,
          muted: true
        },
        debugDiagnostics: false
      }
    });

    const secondStore = createClientSettingsStore({ storage });

    expect(secondStore.getSettings()).toEqual({
      displayName: "Eddy",
      audio: {
        volume: 0.4,
        muted: true
      },
      debugDiagnostics: false
    });
  });

  it("migrates legacy settings from a fallback key into the current record", () => {
    const storage = new MemoryStorage();

    storage.setItem(
      "gamejam.settings",
      JSON.stringify({
        playerName: "Legacy Player",
        volume: 0.25,
        mute: true
      })
    );

    const store = createClientSettingsStore({ storage });

    expect(store.getSettings()).toEqual({
      displayName: "Legacy Player",
      audio: {
        volume: 0.25,
        muted: true
      },
      debugDiagnostics: false
    });
    expect(JSON.parse(storage.getItem("gamejam.client-settings") ?? "null")).toEqual({
      version: 1,
      settings: {
        displayName: "Legacy Player",
        audio: {
          volume: 0.25,
          muted: true
        },
        debugDiagnostics: false
      }
    });
    expect(storage.getItem("gamejam.settings")).toBeNull();
  });

  it("falls back to defaults and rewrites the current record when persisted data is corrupt", () => {
    const storage = new MemoryStorage();

    storage.setItem("gamejam.client-settings", "{not-json");

    const store = createClientSettingsStore({ storage });

    expect(store.getSettings()).toEqual({
      displayName: null,
      audio: {
        volume: 1,
        muted: false
      },
      debugDiagnostics: false
    });
    expect(JSON.parse(storage.getItem("gamejam.client-settings") ?? "null")).toEqual({
      version: 1,
      settings: {
        displayName: null,
        audio: {
          volume: 1,
          muted: false
        },
        debugDiagnostics: false
      }
    });
  });

  it("restores invalid persisted fields back to defaults during load", () => {
    const storage = new MemoryStorage();

    storage.setItem(
      "gamejam.client-settings",
      JSON.stringify({
        version: 1,
        settings: {
          displayName: "x".repeat(40),
          audio: {
            volume: "loud",
            muted: "nope"
          }
        }
      })
    );

    const store = createClientSettingsStore({
      storage,
      defaultSettings: {
        displayName: "Pilot",
        audio: {
          volume: 0.75,
          muted: true
        }
      }
    });

    expect(store.getSettings()).toEqual({
      displayName: "Pilot",
      audio: {
        volume: 0.75,
        muted: true
      },
      debugDiagnostics: false
    });
    expect(JSON.parse(storage.getItem("gamejam.client-settings") ?? "null")).toEqual({
      version: 1,
      settings: {
        displayName: "Pilot",
        audio: {
          volume: 0.75,
          muted: true
        },
        debugDiagnostics: false
      }
    });
  });

  it("resets settings back to defaults and persists the restored values", () => {
    const storage = new MemoryStorage();
    const store = createClientSettingsStore({
      storage,
      defaultSettings: {
        displayName: "Default Player",
        audio: {
          volume: 0.6,
          muted: false
        }
      }
    });

    store.patchSettings({
      displayName: "Custom Player",
      audio: {
        volume: 0.2,
        muted: true
      }
    });

    expect(store.resetSettings()).toEqual({
      displayName: "Default Player",
      audio: {
        volume: 0.6,
        muted: false
      },
      debugDiagnostics: false
    });
    expect(JSON.parse(storage.getItem("gamejam.client-settings") ?? "null")).toEqual({
      version: 1,
      settings: {
        displayName: "Default Player",
        audio: {
          volume: 0.6,
          muted: false
        },
        debugDiagnostics: false
      }
    });
  });
});
