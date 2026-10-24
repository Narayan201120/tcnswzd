import { useCallback } from "react";
import { api } from "../api/client";
import { ErrorState, LoadingSkeleton } from "../components/States";
import { useApi } from "../hooks/useApi";
import { DEFAULT_CUTOFF, SCOPE_END, SCOPE_START } from "../lib/derive";
import { buildBuyingNotes } from "../lib/notes";

export function BuyingNotesView() {
  const summary = useApi(
    useCallback(() => api.accuracySummary(SCOPE_START, SCOPE_END, DEFAULT_CUTOFF), []),
  );
  const byLead = useApi(useCallback(() => api.accuracyByLeadTime(SCOPE_START, SCOPE_END), []));

  const loading = summary.loading || byLead.loading;
  const error = summary.error ?? byLead.error;
  const notes =
    summary.data !== null && byLead.data !== null
      ? buildBuyingNotes(summary.data, byLead.data.buckets)
      : null;

  return (
    <div className="view">
      <div className="notes-card">
        <h2>What this means for buying</h2>
        <p className="how-to-read">
          Based on the {DEFAULT_CUTOFF} Europe/London cutoff and the January 2026 delivery days.
        </p>
        {loading ? <LoadingSkeleton label="the buying notes" /> : null}
        {error !== null && !loading ? (
          <ErrorState
            error={error}
            onRetry={() => {
              summary.retry();
              byLead.retry();
            }}
          />
        ) : null}
        {notes !== null ? (
          <>
            {notes.sentences.map((sentence) => (
              <p className="note-sentence" key={sentence.slice(0, 32)}>
                {sentence}
              </p>
            ))}
            <h3>Limitations</h3>
            <ul className="limitations">
              {notes.limitations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </div>
  );
}
