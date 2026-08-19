import type { Attempt } from "../domain/types";

const DATABASE_NAME = "neet-pg-377";
const DATABASE_VERSION = 1;
const FALLBACK_KEY = "neet-pg-377-attempts";
const FALLBACK_EXPOSURE_KEY = "neet-pg-377-exposure";

function canUseIndexedDb(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("attempts")) {
        database.createObjectStore("attempts", { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains("meta")) {
        database.createObjectStore("meta");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open IndexedDB."));
  });
}

async function withStore<T>(
  storeName: "attempts" | "meta",
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    const request = operation(transaction.objectStore(storeName));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed."));
  });
}

function readFallbackAttempts(): Attempt[] {
  if (typeof localStorage === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(FALLBACK_KEY) ?? "[]") as Attempt[];
  } catch {
    return [];
  }
}

export async function saveAttempt(attempt: Attempt): Promise<void> {
  if (canUseIndexedDb()) {
    await withStore("attempts", "readwrite", (store) => store.put(attempt));
    return;
  }
  const attempts = readFallbackAttempts().filter((candidate) => candidate.id !== attempt.id);
  attempts.push(attempt);
  localStorage.setItem(FALLBACK_KEY, JSON.stringify(attempts));
}

export async function listAttempts(): Promise<Attempt[]> {
  if (canUseIndexedDb()) {
    const attempts = await withStore<Attempt[]>("attempts", "readonly", (store) =>
      store.getAll(),
    );
    return attempts.sort((left, right) => right.updatedAt - left.updatedAt);
  }
  return readFallbackAttempts().sort((left, right) => right.updatedAt - left.updatedAt);
}

export async function deleteAttempt(attemptId: string): Promise<void> {
  if (canUseIndexedDb()) {
    await withStore("attempts", "readwrite", (store) => store.delete(attemptId));
    return;
  }
  localStorage.setItem(
    FALLBACK_KEY,
    JSON.stringify(readFallbackAttempts().filter((attempt) => attempt.id !== attemptId)),
  );
}

export async function getExposureCounts(): Promise<Record<string, number>> {
  if (canUseIndexedDb()) {
    return (
      (await withStore<Record<string, number> | undefined>("meta", "readonly", (store) =>
        store.get("exposure"),
      )) ?? {}
    );
  }
  try {
    return JSON.parse(localStorage.getItem(FALLBACK_EXPOSURE_KEY) ?? "{}") as Record<
      string,
      number
    >;
  } catch {
    return {};
  }
}

export async function recordExposure(questionIds: string[]): Promise<void> {
  const exposure = await getExposureCounts();
  for (const questionId of questionIds) exposure[questionId] = (exposure[questionId] ?? 0) + 1;
  if (canUseIndexedDb()) {
    await withStore("meta", "readwrite", (store) => store.put(exposure, "exposure"));
    return;
  }
  localStorage.setItem(FALLBACK_EXPOSURE_KEY, JSON.stringify(exposure));
}

export async function clearLocalData(): Promise<void> {
  if (canUseIndexedDb()) {
    await Promise.all([
      withStore("attempts", "readwrite", (store) => store.clear()),
      withStore("meta", "readwrite", (store) => store.clear()),
    ]);
    return;
  }
  localStorage.removeItem(FALLBACK_KEY);
  localStorage.removeItem(FALLBACK_EXPOSURE_KEY);
}
