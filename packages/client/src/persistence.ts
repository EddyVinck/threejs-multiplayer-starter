import { displayNameSchema } from "@gamejam/shared";

const DEFAULT_STORAGE_KEY = "gamejam.client-settings";
const LEGACY_STORAGE_KEYS = ["gamejam.settings"] as const;
const CURRENT_SETTINGS_VERSION = 1;

export type ClientSettings = {
  displayName: string | null;
  audio: {
    volume: number;
    muted: boolean;
  };
  /** When true, show FPS, transport, and other lightweight runtime diagnostics. */
  debugDiagnostics: boolean;
};

export type ClientSettingsPatch = {
  displayName?: string | null;
  audio?: {
    volume?: number;
    muted?: boolean;
  };
  debugDiagnostics?: boolean;
};

export type ClientSettingsStore = {
  getSettings(): ClientSettings;
  replaceSettings(nextSettings: ClientSettings): ClientSettings;
  patchSettings(patch: ClientSettingsPatch): ClientSettings;
  resetSettings(): ClientSettings;
};

export type ClientSettingsStoreOptions = {
  defaultSettings?: Partial<ClientSettings>;
  legacyStorageKeys?: readonly string[];
  onError?: (error: unknown) => void;
  storage?: StorageLike;
  storageKey?: string;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type PersistedSettingsRecord = {
  version: typeof CURRENT_SETTINGS_VERSION;
  settings: ClientSettings;
};

const DEFAULT_SETTINGS: ClientSettings = Object.freeze({
  displayName: null,
  audio: Object.freeze({
    volume: 1,
    muted: false
  }),
  debugDiagnostics: false
});

export function createClientSettingsStore(
  options: ClientSettingsStoreOptions = {}
): ClientSettingsStore {
  const onError = options.onError ?? (() => {});
  const storage = options.storage ?? resolveBrowserStorage();
  const storageKey = options.storageKey ?? DEFAULT_STORAGE_KEY;
  const legacyStorageKeys = options.legacyStorageKeys ?? LEGACY_STORAGE_KEYS;
  const defaultSettings = normalizeClientSettings({
    ...DEFAULT_SETTINGS,
    ...options.defaultSettings,
    audio: {
      ...DEFAULT_SETTINGS.audio,
      ...options.defaultSettings?.audio
    }
  });

  let currentSettings = loadInitialSettings({
    defaultSettings,
    legacyStorageKeys,
    onError,
    storage,
    storageKey
  });

  const replaceSettings = (nextSettings: ClientSettings): ClientSettings => {
    currentSettings = normalizeClientSettings(nextSettings, defaultSettings);
    persistSettingsRecord({
      onError,
      settings: currentSettings,
      storage,
      storageKey
    });
    return cloneClientSettings(currentSettings);
  };

  return {
    getSettings() {
      return cloneClientSettings(currentSettings);
    },

    replaceSettings,

    patchSettings(patch) {
      return replaceSettings({
        ...currentSettings,
        ...(patch.displayName === undefined
          ? {}
          : { displayName: patch.displayName }),
        ...(patch.debugDiagnostics === undefined
          ? {}
          : { debugDiagnostics: patch.debugDiagnostics }),
        audio: {
          ...currentSettings.audio,
          ...patch.audio
        }
      });
    },

    resetSettings() {
      currentSettings = cloneClientSettings(defaultSettings);
      persistSettingsRecord({
        onError,
        settings: currentSettings,
        storage,
        storageKey
      });
      return cloneClientSettings(currentSettings);
    }
  };
}

function loadInitialSettings(options: {
  defaultSettings: ClientSettings;
  legacyStorageKeys: readonly string[];
  onError: (error: unknown) => void;
  storage: StorageLike | null;
  storageKey: string;
}): ClientSettings {
  const { defaultSettings, legacyStorageKeys, onError, storage, storageKey } =
    options;
  if (storage === null) {
    return cloneClientSettings(defaultSettings);
  }

  const invalidCandidateKeys: string[] = [];

  for (const candidateKey of [storageKey, ...legacyStorageKeys]) {
    let rawValue: string | null;
    try {
      rawValue = storage.getItem(candidateKey);
    } catch (error) {
      onError(error);
      continue;
    }

    if (rawValue === null) {
      continue;
    }

    const decodedSettings = decodePersistedSettings(rawValue, defaultSettings);
    if (decodedSettings === null) {
      invalidCandidateKeys.push(candidateKey);
      continue;
    }

    persistSettingsRecord({
      onError,
      settings: decodedSettings,
      storage,
      storageKey
    });
    for (const invalidCandidateKey of invalidCandidateKeys) {
      if (invalidCandidateKey !== storageKey) {
        safelyRemoveItem(storage, invalidCandidateKey, onError);
      }
    }
    if (candidateKey !== storageKey) {
      safelyRemoveItem(storage, candidateKey, onError);
    }
    return decodedSettings;
  }

  if (invalidCandidateKeys.length > 0) {
    persistSettingsRecord({
      onError,
      settings: defaultSettings,
      storage,
      storageKey
    });
    for (const invalidCandidateKey of invalidCandidateKeys) {
      if (invalidCandidateKey !== storageKey) {
        safelyRemoveItem(storage, invalidCandidateKey, onError);
      }
    }
  }

  return cloneClientSettings(defaultSettings);
}

function decodePersistedSettings(
  rawValue: string,
  defaultSettings: ClientSettings
): ClientSettings | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawValue);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) {
    return null;
  }

  if (parsed.version === CURRENT_SETTINGS_VERSION) {
    return normalizeClientSettings(
      isRecord(parsed.settings) ? parsed.settings : null,
      defaultSettings
    );
  }

  return migrateLegacySettings(parsed, defaultSettings);
}

function migrateLegacySettings(
  candidate: Record<string, unknown>,
  defaultSettings: ClientSettings
): ClientSettings | null {
  const audioCandidate = isRecord(candidate.audio) ? candidate.audio : null;
  const nextDisplayNameCandidate =
    candidate.displayName ?? candidate.playerName ?? candidate.name ?? null;
  const nextVolumeCandidate = audioCandidate?.volume ?? candidate.volume;
  const nextMutedCandidate =
    audioCandidate?.muted ?? candidate.muted ?? candidate.mute;

  const hasLegacySettingsFields =
    nextDisplayNameCandidate !== null ||
    nextVolumeCandidate !== undefined ||
    nextMutedCandidate !== undefined;
  if (!hasLegacySettingsFields) {
    return null;
  }

  return normalizeClientSettings(
    {
      displayName: nextDisplayNameCandidate,
      audio: {
        volume: nextVolumeCandidate,
        muted: nextMutedCandidate
      }
    },
    defaultSettings
  );
}

function normalizeClientSettings(
  candidate: unknown,
  defaultSettings: ClientSettings = DEFAULT_SETTINGS
): ClientSettings {
  const settingsRecord = isRecord(candidate) ? candidate : {};
  const audioRecord = isRecord(settingsRecord.audio) ? settingsRecord.audio : {};

  return {
    displayName: normalizeDisplayName(
      settingsRecord.displayName,
      defaultSettings.displayName
    ),
    audio: {
      volume: normalizeVolume(audioRecord.volume, defaultSettings.audio.volume),
      muted: normalizeBoolean(audioRecord.muted, defaultSettings.audio.muted)
    },
    debugDiagnostics: normalizeBoolean(
      settingsRecord.debugDiagnostics,
      defaultSettings.debugDiagnostics
    )
  };
}

function normalizeDisplayName(
  value: unknown,
  fallbackValue: string | null
): string | null {
  if (value === undefined) {
    return fallbackValue;
  }

  if (value === null || value === "") {
    return null;
  }

  const parsed = displayNameSchema.safeParse(value);
  return parsed.success ? parsed.data : fallbackValue;
}

function normalizeVolume(value: unknown, fallbackValue: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallbackValue;
  }

  return clamp(value, 0, 1);
}

function normalizeBoolean(value: unknown, fallbackValue: boolean): boolean {
  return typeof value === "boolean" ? value : fallbackValue;
}

function persistSettingsRecord(options: {
  onError: (error: unknown) => void;
  settings: ClientSettings;
  storage: StorageLike | null;
  storageKey: string;
}): void {
  const { onError, settings, storage, storageKey } = options;
  if (storage === null) {
    return;
  }

  const record: PersistedSettingsRecord = {
    version: CURRENT_SETTINGS_VERSION,
    settings: cloneClientSettings(settings)
  };

  try {
    storage.setItem(storageKey, JSON.stringify(record));
  } catch (error) {
    onError(error);
  }
}

function safelyRemoveItem(
  storage: StorageLike,
  key: string,
  onError: (error: unknown) => void
): void {
  try {
    storage.removeItem(key);
  } catch (error) {
    onError(error);
  }
}

function resolveBrowserStorage(): StorageLike | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function cloneClientSettings(settings: ClientSettings): ClientSettings {
  return {
    displayName: settings.displayName,
    audio: {
      volume: settings.audio.volume,
      muted: settings.audio.muted
    },
    debugDiagnostics: settings.debugDiagnostics
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
