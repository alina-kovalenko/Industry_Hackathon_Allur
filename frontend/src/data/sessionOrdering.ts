export type EpochDecision = "same" | "new" | "stale";

export function sessionEpochDecision(
  activeSessionId: string,
  activeEpochRequest: number,
  responseSessionId: string,
  requestSequence: number,
): EpochDecision {
  if (responseSessionId === activeSessionId) return "same";
  return !activeSessionId || requestSequence >= activeEpochRequest ? "new" : "stale";
}

export function shouldAcceptHistory(
  historySessionId: string,
  activeSessionId: string,
  historyRevision: number,
  currentRevision: number,
): boolean {
  return historySessionId === activeSessionId && historyRevision >= currentRevision;
}
