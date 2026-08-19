type AnalysisStatusState = "queued" | "running" | "completed" | "failed";

interface AnalysisStatusRecord {
  requestId: string;
  state: AnalysisStatusState;
  message: string;
  updatedAtMs: number;
}

const statusStore = new Map<string, AnalysisStatusRecord>();
const MAX_RETENTION_MS = 5 * 60 * 1000;

function upsert(record: AnalysisStatusRecord) {
  statusStore.set(record.requestId, record);
  purgeExpired();
}

function nowMs() {
  return Date.now();
}

function purgeExpired() {
  const cutoff = nowMs() - MAX_RETENTION_MS;
  for (const [requestId, record] of statusStore.entries()) {
    if (record.updatedAtMs < cutoff) {
      statusStore.delete(requestId);
    }
  }
}

export function initAnalysisStatus(requestId: string, message = "Queued analysis request...") {
  upsert({
    requestId,
    state: "queued",
    message,
    updatedAtMs: nowMs()
  });
}

export function updateAnalysisStatus(requestId: string, message: string) {
  const existing = statusStore.get(requestId);
  upsert({
    ...existing,
    requestId,
    state: "running",
    message,
    updatedAtMs: nowMs()
  });
}

export function completeAnalysisStatus(requestId: string, message = "Chart analysis ready.") {
  upsert({
    requestId,
    state: "completed",
    message,
    updatedAtMs: nowMs()
  });
}

export function failAnalysisStatus(requestId: string, message: string) {
  upsert({
    requestId,
    state: "failed",
    message,
    updatedAtMs: nowMs()
  });
}

export function getAnalysisStatus(requestId: string) {
  purgeExpired();
  return statusStore.get(requestId);
}
