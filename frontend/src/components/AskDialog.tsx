import { useEffect, useState } from 'react';
import { AlertTriangle, FileText, Sparkles } from 'lucide-react';
import type { AskResult, LibraryDocument } from '@/types';
import { api } from '@/lib/gasClient';
import { displayPath, monthLabel } from '@/lib/categories';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/Callout';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ButtonSpinner } from '@/components/ui/Spinner';

/**
 * Opt-in natural-language search. It reasons over document metadata only — titles, categories,
 * years, tags, remarks — never the contents of the PDFs, and the panel says so, because otherwise
 * "what does CMO 01 require?" looks like a broken feature rather than an out-of-scope question.
 *
 * When the provider has no key or its quota trips, this hands the question to the ordinary keyword
 * search and shows a one-line notice — falling back invisibly would leave the user unable to tell
 * an answer from a string match.
 */
export function AskDialog({
  open,
  onOpenChange,
  documents,
  onFallbackToSearch,
  onOpenDocument,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documents: LibraryDocument[];
  onFallbackToSearch: (question: string) => void;
  onOpenDocument: (doc: LibraryDocument) => void;
}) {
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [result, setResult] = useState<AskResult | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setQuestion('');
    setResult(null);
    setError('');
    setAsking(false);
  }, [open]);

  async function ask() {
    const asked = question.trim();
    if (!asked) return;
    setAsking(true);
    setError('');
    setResult(null);
    try {
      const answer = await api.askLibrary(asked);
      setResult(answer);
      if (!answer.ok) {
        // Hand the question to keyword search so the user still gets results, not a dead end.
        onFallbackToSearch(asked);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ask failed.');
    } finally {
      setAsking(false);
    }
  }

  const cited = result?.ok
    ? result.document_ids
        .map((id) => documents.find((doc) => doc.document_id === id))
        .filter((doc): doc is LibraryDocument => !!doc)
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Ask the E-Library"
        description="Answers come from document details only — title, category, year, tags, and remarks. The contents of the files are not read."
        className="w-[min(96vw,680px)]"
      >
        <div className="space-y-4 p-6">
          <div className="flex gap-2">
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !asking) void ask(); }}
              placeholder="e.g. What issuances on student organizations came out in 2026?"
              disabled={asking}
              autoFocus
            />
            <Button type="button" onClick={ask} disabled={asking || !question.trim()} className="shrink-0">
              {asking ? <ButtonSpinner label="Asking..." /> : <><Sparkles className="h-4 w-4" /> Ask</>}
            </Button>
          </div>

          {error ? <Callout tone="error">{error}</Callout> : null}

          {result && !result.ok ? (
            <Callout tone="warning" icon={AlertTriangle}>
              <span>
                {result.reason === 'NO_KEY'
                  ? 'The AI assistant is not configured, so this was run as a keyword search instead.'
                  : result.reason === 'RATE_LIMITED'
                  // The server's message names the limit and window, so show it verbatim.
                  ? result.message
                  // The server's UNAVAILABLE messages already distinguish the cases (out of quota vs
                  // an unreadable reply) and carry no key or endpoint detail, so show them rather than
                  // flattening every failure into one message nobody can act on.
                  : `The AI assistant is unavailable right now, so this was run as a keyword search instead.${
                      result.message ? ` (${result.message})` : ''
                    }`}
                {' '}Close this panel to see the results.
              </span>
            </Callout>
          ) : null}

          {result?.ok ? (
            <div className="space-y-3">
              <div className="rounded-md border border-border bg-muted p-4 text-sm leading-6 text-foreground">
                {result.answer || 'No answer was returned.'}
              </div>

              {cited.length ? (
                <div>
                  <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Documents referred to
                  </div>
                  <div className="divide-y divide-border rounded-md border border-border">
                    {cited.map((doc) => (
                      <button
                        key={doc.document_id}
                        type="button"
                        onClick={() => { onOpenDocument(doc); onOpenChange(false); }}
                        className="flex w-full items-start gap-2 p-3 text-left transition hover:bg-muted"
                      >
                        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-foreground">{doc.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            {displayPath(doc.category_path)} · {doc.year}
                            {doc.month ? ` · ${monthLabel(doc.month)}` : ''}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Only attribute the answer when a provider actually produced it — some replies
                  (an empty library) are generated locally and must not look AI-answered. */}
              {result.provider !== 'none' ? (
                <p className="text-xs text-muted-foreground">
                  Answered by {result.provider} from document details only. Always open the document to confirm.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-border bg-muted p-4">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
