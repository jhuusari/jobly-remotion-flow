import React, {useEffect, useMemo, useState} from 'react';
import {Player} from '@remotion/player';
import {AdVideo} from '@root/remotion/src/AdVideo';
import type {ArtifactDetail, ArtifactListItem, EditorDraft} from './types';

const COMPOSITION = {
  width: 1080,
  height: 1920,
  fps: 30,
  durationInFrames: 180
};

const DEFAULT_THEME = {
  primary: '#ED2D26',
  secondary: '#F4817D',
  text: '#FFFFFF',
  logo_bg: '#FFFFFF'
};

export const App: React.FC = () => {
  const [artifacts, setArtifacts] = useState<ArtifactListItem[]>([]);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [detail, setDetail] = useState<ArtifactDetail | null>(null);
  const [draft, setDraft] = useState<EditorDraft | null>(null);
  const [themeInputs, setThemeInputs] = useState<EditorDraft['theme'] | null>(null);
  const [status, setStatus] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{
    running: boolean;
    total: number;
    completed: number;
    startedAt: number;
    durations: number[];
  } | null>(null);

  useEffect(() => {
    fetchArtifacts();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return artifacts;
    return artifacts.filter((item) => {
      return [item.job_id, item.company, item.title].some((field) =>
        String(field ?? '').toLowerCase().includes(q)
      );
    });
  }, [artifacts, search]);

  async function fetchArtifacts() {
    const res = await fetch('/api/artifacts');
    const data = await res.json();
    setArtifacts(data.items ?? []);
    if (!selectedId && data.items?.length) {
      selectArtifact(data.items[0].id);
    }
  }

  async function selectArtifact(id: string) {
    setSelectedId(id);
    setStatus('');
    const res = await fetch(`/api/artifacts/${id}`);
    const data = (await res.json()) as ArtifactDetail;
    setDetail(data);
    const nextDraft = buildDraft(data);
    setDraft(nextDraft);
    setThemeInputs(nextDraft.theme);
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }

  function selectAllFiltered() {
    setSelectedIds(filtered.map((item) => item.id));
  }

  function clearSelected() {
    setSelectedIds([]);
  }

  function buildDraft(data: ArtifactDetail): EditorDraft {
    const extracted = data.extracted ?? {};
    const bubbles = data.bubbles ?? {};
    const overrides = data.overrides ?? {};

    const expects = (overrides.expects ?? bubbles.expects ?? [])
      .map((b: any) => (typeof b === 'string' ? b : b?.text))
      .filter(Boolean) as string[];
    const offers = (overrides.offers ?? bubbles.offers ?? [])
      .map((b: any) => (typeof b === 'string' ? b : b?.text))
      .filter(Boolean) as string[];

    return {
      company: overrides.company ?? extracted.company ?? '',
      title: overrides.title ?? extracted.title ?? '',
      location: overrides.location ?? extracted.location ?? '',
      expects: expects.length ? expects : [''],
      offers: offers.length ? offers : [''],
      theme: {
        primary: overrides?.theme?.primary ?? extracted.brand_colors?.primary ?? DEFAULT_THEME.primary,
        secondary: overrides?.theme?.secondary ?? extracted.brand_colors?.secondary ?? DEFAULT_THEME.secondary,
        text: overrides?.theme?.text ?? extracted.brand_colors?.text ?? DEFAULT_THEME.text,
        logo_bg: overrides?.theme?.logo_bg ?? extracted.brand_colors?.logo_bg ?? DEFAULT_THEME.logo_bg
      },
      jingle: overrides?.jingle ?? 'random',
      showGuides: false
    };
  }

  function updateDraft<K extends keyof EditorDraft>(key: K, value: EditorDraft[K]) {
    setDraft((prev) => (prev ? {...prev, [key]: value} : prev));
  }

  function updateBubble(kind: 'expects' | 'offers', index: number, value: string) {
    setDraft((prev) => {
      if (!prev) return prev;
      const list = [...prev[kind]];
      list[index] = value;
      return {...prev, [kind]: list};
    });
  }

  function addBubble(kind: 'expects' | 'offers') {
    setDraft((prev) => {
      if (!prev) return prev;
      return {...prev, [kind]: [...prev[kind], '']};
    });
  }

  function removeBubble(kind: 'expects' | 'offers', index: number) {
    setDraft((prev) => {
      if (!prev) return prev;
      const list = prev[kind].filter((_, i) => i !== index);
      return {...prev, [kind]: list.length ? list : ['']};
    });
  }

  async function regenerate() {
    if (!selectedId || !draft) return;
    setLoading(true);
    setStatus('Rendering...');
    try {
      const res = await fetch(`/api/artifacts/${selectedId}/regenerate`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          overrides: {
            company: draft.company,
            title: draft.title,
            location: draft.location,
            expects: draft.expects,
            offers: draft.offers,
            theme: draft.theme,
            jingle: draft.jingle
          }
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Render failed');
      setStatus('Regenerated successfully.');
      await fetchArtifacts();
      if (selectedId) {
        await selectArtifact(selectedId);
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Render failed');
    } finally {
      setLoading(false);
    }
  }

  async function resetDraft() {
    if (!selectedId) return;
    if (!window.confirm('Reset overrides for this artefact?')) return;
    setLoading(true);
    setStatus('Resetting...');
    try {
      const res = await fetch(`/api/artifacts/${selectedId}/reset`, {method: 'POST'});
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Reset failed');
      setStatus('Overrides cleared.');
      setDetail(null);
      setDraft(null);
      await fetchArtifacts();
      if (selectedId) {
        await selectArtifact(selectedId);
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setLoading(false);
    }
  }

  async function applyBulkTheme() {
    if (!draft || selectedIds.length === 0) return;
    setLoading(true);
    setStatus('Applying theme to selected...');
    try {
      const theme = ensureThemeValid(draft.theme);
      if (!theme) {
        setStatus('Fix theme colors (use valid hex like #AABBCC).');
        setLoading(false);
        return;
      }
      const res = await fetch('/api/artifacts/bulk-overrides', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          ids: selectedIds,
          overrides: {
            theme,
            jingle: draft.jingle
          }
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Bulk update failed');
      setStatus(`Applied theme to ${data.updated?.length ?? 0} artefacts.`);
      await fetchArtifacts();
      if (selectedId) {
        await selectArtifact(selectedId);
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Bulk update failed');
    } finally {
      setLoading(false);
    }
  }

  async function bulkRegenerateSelected() {
    if (!draft || selectedIds.length === 0) return;
    const theme = ensureThemeValid(draft.theme);
    if (!theme) {
      setStatus('Fix theme colors (use valid hex like #AABBCC).');
      return;
    }

    const total = selectedIds.length;
    setBulkProgress({running: true, total, completed: 0, startedAt: Date.now(), durations: []});
    setLoading(true);
    setStatus(`Rendering 0/${total}...`);

    for (let i = 0; i < selectedIds.length; i += 1) {
      const id = selectedIds[i];
      const started = Date.now();
      try {
        const res = await fetch(`/api/artifacts/${id}/regenerate`, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            overrides: {
              theme,
              jingle: draft.jingle
            }
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Render failed');
        const elapsed = Date.now() - started;
        setBulkProgress((prev) => {
          if (!prev) return prev;
          const durations = [...prev.durations, elapsed];
          const completed = prev.completed + 1;
          return {...prev, completed, durations};
        });
        setStatus(`Rendering ${i + 1}/${total}...`);
      } catch (err) {
        setStatus(err instanceof Error ? err.message : 'Render failed');
        break;
      }
    }

    setBulkProgress((prev) => (prev ? {...prev, running: false} : prev));
    setLoading(false);
    await fetchArtifacts();
    if (selectedId) {
      await selectArtifact(selectedId);
    }
    setStatus('Bulk render complete.');
  }

  function selectSameCompany() {
    if (!detail) return;
    const company = (detail.overrides?.company ?? detail.extracted?.company ?? '').trim().toLowerCase();
    if (!company) return;
    const ids = artifacts
      .filter((item) => String(item.company ?? '').trim().toLowerCase() === company)
      .map((item) => item.id);
    setSelectedIds(ids);
  }

  const previewProps = useMemo(() => {
    if (!detail || !draft) return null;
    const logoSrc = detail.assets?.logo_url ?? undefined;
    const audioSrc = draft.jingle && draft.jingle !== 'random' ? `/assets/jingles/${draft.jingle}` : undefined;
    const lang = detail.extracted?.language ?? 'fi';
    return {
      company: draft.company,
      title: draft.title,
      location: draft.location || undefined,
      offers: draft.offers.filter(Boolean),
      expects: draft.expects.filter(Boolean),
      theme: draft.theme,
      logoSrc,
      audioSrc,
      lang,
      showGuides: draft.showGuides,
      showLogoDebug: false
    };
  }, [detail, draft]);

  const videoDownloadUrl = useMemo(() => {
    if (!detail?.assets?.video_url) return null;
    const version = detail.assets.video_version;
    return version ? `${detail.assets.video_url}?v=${encodeURIComponent(version)}` : detail.assets.video_url;
  }, [detail]);

  const thumbnailDownloadUrl = useMemo(() => {
    if (!detail?.assets?.thumbnail_url) return null;
    const version = detail.assets.thumbnail_version;
    return version ? `${detail.assets.thumbnail_url}?v=${encodeURIComponent(version)}` : detail.assets.thumbnail_url;
  }, [detail]);

  return (
    <div className="app">
      <div className="layout">
        <aside className="sidebar">
          <div className="sidebar-header">
            <input
              className="search"
              placeholder="Filter by job id, company, title"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="count">{filtered.length} artefacts</div>
            <div className="bulk-actions">
              <button className="ghost" onClick={selectAllFiltered} disabled={filtered.length === 0}>
                Select all
              </button>
              <button className="ghost" onClick={selectSameCompany} disabled={!detail}>
                Select same company
              </button>
              <button className="ghost" onClick={clearSelected} disabled={selectedIds.length === 0}>
                Clear
              </button>
              <button className="bulk-primary" onClick={applyBulkTheme} disabled={!draft || selectedIds.length === 0 || loading}>
                Apply theme + jingle ({selectedIds.length})
              </button>
              <button className="bulk-primary" onClick={bulkRegenerateSelected} disabled={!draft || selectedIds.length === 0 || loading}>
                Bulk regenerate ({selectedIds.length})
              </button>
            </div>
            {bulkProgress ? <BulkProgress progress={bulkProgress} /> : null}
            {status ? <div className="status-inline">{status}</div> : null}
          </div>
          <div className="list">
            {filtered.map((item) => (
              <button
                key={item.id}
                className={`list-item ${item.id === selectedId ? 'active' : ''}`}
                onClick={() => selectArtifact(item.id)}
              >
                <label
                  className="select-toggle"
                  onClick={(event) => {
                    event.stopPropagation();
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(item.id)}
                    onChange={() => toggleSelected(item.id)}
                  />
                  <span>Pick</span>
                </label>
                {item.thumbnail_url ? (
                  <img className="thumb" src={item.thumbnail_url} alt="thumbnail" />
                ) : (
                  <div className="thumb placeholder">No thumbnail</div>
                )}
                <div className="list-jobid">
                  Job ID {item.job_id}
                  {item.has_overrides ? <span className="badge">Edited</span> : null}
                </div>
                <div className="list-company">{item.company || 'Unknown company'}</div>
                <div className="list-title">{item.title || 'Untitled role'}</div>
              </button>
            ))}
          </div>
        </aside>

        <main className="main">
          {!detail || !draft ? (
            <div className="empty">Select an artefact to begin.</div>
          ) : (
            <div className="content">
              <section className="editor">
                <div className="panel-title">Editor</div>

                <label className="field">
                  <span>Company</span>
                  <input value={draft.company} onChange={(e) => updateDraft('company', e.target.value)} />
                </label>

                <label className="field">
                  <span>Title</span>
                  <input value={draft.title} onChange={(e) => updateDraft('title', e.target.value)} />
                </label>

                <label className="field">
                  <span>Location</span>
                  <input value={draft.location} onChange={(e) => updateDraft('location', e.target.value)} />
                </label>

                <div className="field-group">
                  <div className="field-group-title">Expect Bubbles</div>
                  {draft.expects.map((text, idx) => (
                    <div key={`exp-${idx}`} className="bubble-row">
                      <input
                        value={text}
                        onChange={(e) => updateBubble('expects', idx, e.target.value)}
                      />
                      <button className="ghost" onClick={() => removeBubble('expects', idx)}>
                        Remove
                      </button>
                    </div>
                  ))}
                  <button className="ghost" onClick={() => addBubble('expects')}>
                    Add Bubble
                  </button>
                </div>

                <div className="field-group">
                  <div className="field-group-title">Offer Bubbles</div>
                  {draft.offers.map((text, idx) => (
                    <div key={`off-${idx}`} className="bubble-row">
                      <input value={text} onChange={(e) => updateBubble('offers', idx, e.target.value)} />
                      <button className="ghost" onClick={() => removeBubble('offers', idx)}>
                        Remove
                      </button>
                    </div>
                  ))}
                  <button className="ghost" onClick={() => addBubble('offers')}>
                    Add Bubble
                  </button>
                </div>

                <div className="field-group">
                  <div className="field-group-title">Theme</div>
                  <div className="color-grid">
                    <ColorField
                      label="Primary"
                      value={draft.theme.primary}
                      inputValue={themeInputs?.primary ?? draft.theme.primary}
                      onChange={(value) => {
                        setThemeInputs((prev) => (prev ? {...prev, primary: value} : prev));
                        updateDraft('theme', {...draft.theme, primary: value});
                      }}
                      onInputChange={(raw) => {
                        setThemeInputs((prev) => (prev ? {...prev, primary: raw} : prev));
                        const normalized = normalizeHex(raw);
                        if (normalized) {
                          updateDraft('theme', {...draft.theme, primary: normalized});
                        }
                      }}
                      onInputBlur={() => {
                        setThemeInputs((prev) => (prev ? {...prev, primary: draft.theme.primary} : prev));
                      }}
                    />
                    <ColorField
                      label="Secondary"
                      value={draft.theme.secondary}
                      inputValue={themeInputs?.secondary ?? draft.theme.secondary}
                      onChange={(value) => {
                        setThemeInputs((prev) => (prev ? {...prev, secondary: value} : prev));
                        updateDraft('theme', {...draft.theme, secondary: value});
                      }}
                      onInputChange={(raw) => {
                        setThemeInputs((prev) => (prev ? {...prev, secondary: raw} : prev));
                        const normalized = normalizeHex(raw);
                        if (normalized) {
                          updateDraft('theme', {...draft.theme, secondary: normalized});
                        }
                      }}
                      onInputBlur={() => {
                        setThemeInputs((prev) => (prev ? {...prev, secondary: draft.theme.secondary} : prev));
                      }}
                    />
                    <ColorField
                      label="Text"
                      value={draft.theme.text}
                      inputValue={themeInputs?.text ?? draft.theme.text}
                      onChange={(value) => {
                        setThemeInputs((prev) => (prev ? {...prev, text: value} : prev));
                        updateDraft('theme', {...draft.theme, text: value});
                      }}
                      onInputChange={(raw) => {
                        setThemeInputs((prev) => (prev ? {...prev, text: raw} : prev));
                        const normalized = normalizeHex(raw);
                        if (normalized) {
                          updateDraft('theme', {...draft.theme, text: normalized});
                        }
                      }}
                      onInputBlur={() => {
                        setThemeInputs((prev) => (prev ? {...prev, text: draft.theme.text} : prev));
                      }}
                    />
                    <ColorField
                      label="Logo BG"
                      value={draft.theme.logo_bg}
                      inputValue={themeInputs?.logo_bg ?? draft.theme.logo_bg}
                      onChange={(value) => {
                        setThemeInputs((prev) => (prev ? {...prev, logo_bg: value} : prev));
                        updateDraft('theme', {...draft.theme, logo_bg: value});
                      }}
                      onInputChange={(raw) => {
                        setThemeInputs((prev) => (prev ? {...prev, logo_bg: raw} : prev));
                        const normalized = normalizeHex(raw);
                        if (normalized) {
                          updateDraft('theme', {...draft.theme, logo_bg: normalized});
                        }
                      }}
                      onInputBlur={() => {
                        setThemeInputs((prev) => (prev ? {...prev, logo_bg: draft.theme.logo_bg} : prev));
                      }}
                    />
                  </div>
                </div>

                <label className="field">
                  <span>Jingle</span>
                  <select value={draft.jingle} onChange={(e) => updateDraft('jingle', e.target.value)}>
                    <option value="random">Random</option>
                    {detail.jingles.map((jingle) => (
                      <option key={jingle} value={jingle}>
                        {jingle}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={draft.showGuides}
                    onChange={(e) => updateDraft('showGuides', e.target.checked)}
                  />
                  <span>Show safe-zone guides</span>
                </label>

                <div className="actions">
                  <div className="button-row">
                    <button className="ghost" onClick={resetDraft} disabled={loading}>
                      Reset to Original
                    </button>
                    {videoDownloadUrl ? (
                      <a className="ghost-link" href={videoDownloadUrl} download>
                        Download MP4
                      </a>
                    ) : null}
                    {thumbnailDownloadUrl ? (
                      <a className="ghost-link" href={thumbnailDownloadUrl} download>
                        Download Thumbnail
                      </a>
                    ) : null}
                  </div>
                  <button className="primary" onClick={regenerate} disabled={loading}>
                    {loading ? 'Rendering…' : 'Regenerate MP4 + Thumbnail'}
                  </button>
                  <div className="muted small">
                    Output writes to the artefact folder and updates the partner feed.
                  </div>
                </div>
              </section>

              <section className="preview">
                <div className="panel-title">Live Preview</div>
                <div className="preview-card">
                  {previewProps ? (
                    <div className="preview-player">
                      <Player
                        component={AdVideo}
                        inputProps={previewProps}
                        durationInFrames={COMPOSITION.durationInFrames}
                        fps={COMPOSITION.fps}
                        compositionWidth={COMPOSITION.width}
                        compositionHeight={COMPOSITION.height}
                        loop
                        autoPlay
                        controls
                        style={{width: '100%', borderRadius: 18}}
                      />
                    </div>
                  ) : (
                    <div className="empty">Loading preview…</div>
                  )}
                </div>
              </section>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

const ColorField: React.FC<{
  label: string;
  value: string;
  inputValue: string;
  onChange: (value: string) => void;
  onInputChange: (value: string) => void;
  onInputBlur: () => void;
}> = ({label, value, inputValue, onChange, onInputChange, onInputBlur}) => {
  return (
    <label className="color-field">
      <span>{label}</span>
      <div className="color-input">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
        <input value={inputValue} onChange={(e) => onInputChange(e.target.value)} onBlur={onInputBlur} />
      </div>
    </label>
  );
};

function normalizeHex(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const match = trimmed.replace('#', '');
  if (!/^[0-9a-fA-F]{3}$/.test(match) && !/^[0-9a-fA-F]{6}$/.test(match)) return null;
  if (match.length === 3) {
    const expanded = match.split('').map((c) => `${c}${c}`).join('');
    return `#${expanded.toUpperCase()}`;
  }
  return `#${match.toUpperCase()}`;
}

function ensureThemeValid(theme: EditorDraft['theme']): EditorDraft['theme'] | null {
  const primary = normalizeHex(theme.primary);
  const secondary = normalizeHex(theme.secondary);
  const text = normalizeHex(theme.text);
  const logo_bg = normalizeHex(theme.logo_bg);
  if (!primary || !secondary || !text || !logo_bg) return null;
  return {primary, secondary, text, logo_bg};
}

const BulkProgress: React.FC<{
  progress: {running: boolean; total: number; completed: number; startedAt: number; durations: number[]};
}> = ({progress}) => {
  if (progress.total === 0) return null;
  const elapsedMs = Date.now() - progress.startedAt;
  const avg = progress.durations.length
    ? progress.durations.reduce((sum, value) => sum + value, 0) / progress.durations.length
    : null;
  const remainingMs = avg ? avg * Math.max(0, progress.total - progress.completed) : null;
  const percent = Math.min(100, Math.round((progress.completed / progress.total) * 100));

  return (
    <div className="bulk-progress">
      <div className="bulk-progress-row">
        <span>
          {progress.completed}/{progress.total} rendered
        </span>
        <span>{percent}%</span>
      </div>
      <div className="bulk-progress-bar">
        <div className="bulk-progress-fill" style={{width: `${percent}%`}} />
      </div>
      <div className="bulk-progress-row small">
        <span>Elapsed: {formatDuration(elapsedMs)}</span>
        <span>ETA: {remainingMs ? formatDuration(remainingMs) : '—'}</span>
      </div>
      {progress.running ? <div className="bulk-progress-note">Rendering in background…</div> : null}
    </div>
  );
};

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}
