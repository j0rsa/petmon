import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { catsApi } from '../api/cats';
import { importsApi } from '../api/imports';
import { CATEGORY_LABELS } from '../types';
import type { ImportPreview } from '../types';

export default function ImportsPage() {
  const queryClient = useQueryClient();
  const [sourceName, setSourceName] = useState('manual-import');
  const [catId, setCatId] = useState('');
  const [rawText, setRawText] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);

  const catsQuery = useQuery({ queryKey: ['cats'], queryFn: catsApi.list });
  const importsQuery = useQuery({ queryKey: ['imports'], queryFn: importsApi.list });
  const catNames = useMemo(() => new Map((catsQuery.data ?? []).map((cat) => [cat.id, cat.name])), [catsQuery.data]);

  const previewMutation = useMutation({
    mutationFn: () => importsApi.preview({ source_name: sourceName, raw_text: rawText, cat_id: catId }),
    onSuccess: (data) => setPreview(data),
  });

  const commitMutation = useMutation({
    mutationFn: () => importsApi.commit({ source_name: sourceName, raw_text: rawText, cat_id: catId }),
    onSuccess: async () => {
      setPreview(null);
      setRawText('');
      await queryClient.invalidateQueries({ queryKey: ['imports'] });
    },
  });

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <p className="eyebrow">Imports</p>
          <h2>Preview and commit raw intake logs</h2>
          <p className="muted-text">Paste text from notes, preview the parser output, then commit the batch.</p>
        </div>
      </section>

      <section className="panel">
        <div className="form-grid">
          <div className="form-row">
            <label htmlFor="import-source">Source name</label>
            <input id="import-source" value={sourceName} onChange={(event) => setSourceName(event.target.value)} />
          </div>
          <div className="form-row">
            <label htmlFor="import-cat">Cat</label>
            <select id="import-cat" value={catId} onChange={(event) => setCatId(event.target.value)} required>
              <option value="">Select a cat</option>
              {(catsQuery.data ?? []).map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-row form-row-full">
            <label htmlFor="import-text">Raw text</label>
            <textarea id="import-text" rows={10} value={rawText} onChange={(event) => setRawText(event.target.value)} placeholder="08:00 wet_food 85 g\n13:00 water 50 ml" />
          </div>
          <div className="button-row form-row-full">
            <button className="button" type="button" disabled={!catId || !rawText.trim() || previewMutation.isPending} onClick={() => previewMutation.mutate()}>
              {previewMutation.isPending ? 'Previewing…' : 'Preview import'}
            </button>
            <button className="button button-secondary" type="button" disabled={!preview || commitMutation.isPending} onClick={() => commitMutation.mutate()}>
              {commitMutation.isPending ? 'Committing…' : 'Commit import'}
            </button>
          </div>
        </div>
        {previewMutation.isError && <div className="error-state">{previewMutation.error instanceof Error ? previewMutation.error.message : 'Unable to preview import.'}</div>}
        {commitMutation.isError && <div className="error-state">{commitMutation.error instanceof Error ? commitMutation.error.message : 'Unable to commit import.'}</div>}
      </section>

      {preview && (
        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Preview</p>
              <h3>
                {preview.parsed_count} parsed • {preview.warning_count} warnings • {preview.error_count} errors
              </h3>
            </div>
          </div>
          <div className="preview-list">
            {preview.lines.map((line) => (
              <article
                key={line.line_number}
                className={`preview-line${line.error ? ' preview-line-error' : line.warning ? ' preview-line-warning' : ' preview-line-success'}`}
              >
                <strong>Line {line.line_number}</strong>
                <code>{line.raw}</code>
                {line.parsed && (
                  <span>
                    Parsed as {CATEGORY_LABELS[line.parsed.category] ?? line.parsed.category} • {line.parsed.amount} {line.parsed.unit ?? ''}
                  </span>
                )}
                {line.warning && <span>{line.warning}</span>}
                {line.error && <span>{line.error}</span>}
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">History</p>
            <h3>Past import batches</h3>
          </div>
        </div>
        {importsQuery.isLoading ? (
          <div className="loading-state">Loading imports…</div>
        ) : importsQuery.isError ? (
          <div className="error-state">{importsQuery.error instanceof Error ? importsQuery.error.message : 'Unable to load imports.'}</div>
        ) : (importsQuery.data ?? []).length === 0 ? (
          <div className="empty-state">No import batches yet.</div>
        ) : (
          <div className="card-grid">
            {(importsQuery.data ?? []).map((batch) => (
              <article key={batch.id} className="panel import-card">
                <div className="entry-card-header">
                  <div>
                    <h3>{batch.source_name}</h3>
                    <p className="muted-text">Created {new Date(batch.created_at).toLocaleString()}</p>
                  </div>
                  <span className={`status-pill${batch.committed_at ? ' active' : ''}`}>{batch.committed_at ? 'Committed' : 'Preview only'}</span>
                </div>
                <p className="muted-text">{catNames.get(catId) ?? 'Cat from batch context not provided by API response'}</p>
                <pre className="code-block">{batch.parse_summary_json}</pre>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
