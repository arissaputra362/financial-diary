export type ThemePreference = "system" | "light" | "dark";

const THEME_STORAGE_KEY = "financial-diary-theme";
const THEME_CHANGE_EVENT = "financial-diary:theme-change";

export function readThemePreference(): ThemePreference {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (value === "light" || value === "dark") return value;
  } catch {
    // The system preference remains available when browser storage is blocked.
  }
  return "system";
}

export function subscribeThemePreference(listener: () => void): () => void {
  const onPreferenceChange = () => listener();
  const onStorageChange = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY || event.key === null) listener();
  };

  window.addEventListener(THEME_CHANGE_EVENT, onPreferenceChange);
  window.addEventListener("storage", onStorageChange);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, onPreferenceChange);
    window.removeEventListener("storage", onStorageChange);
  };
}

export function getServerThemePreference(): ThemePreference {
  return "system";
}

export function setThemePreference(preference: ThemePreference): void {
  try {
    if (preference === "system") window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // The event still applies the choice for the current page session.
  }

  window.dispatchEvent(
    new CustomEvent<ThemePreference>(THEME_CHANGE_EVENT, { detail: preference }),
  );
}
