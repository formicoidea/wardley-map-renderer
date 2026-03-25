import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import { createRoot } from 'react-dom/client';
import {
  MapView,
  MapStyles,
  Defaults,
  UnifiedConverter,
  useUnifiedMapState,
  FeatureSwitchesProvider,
  createEmptyMap,
  useFeatureSwitches,
} from 'wmlandscape';

// Compatibility for dependencies compiled against classic JSX runtime.
(window as Window & { React?: typeof React }).React = React;

// ── OWM injection ──────────────────────────────────────────────────────
function getInitialOwmText(): string {
  // 1. window.__OWM_TEXT__ (programmatic injection by Claude or host)
  if (typeof (window as any).__OWM_TEXT__ === 'string') {
    return (window as any).__OWM_TEXT__;
  }
  // 2. <script type="application/x-owm"> embedded in HTML
  const el = document.getElementById('owm-source');
  if (el?.textContent?.trim()) {
    return el.textContent.trim();
  }
  return '';
}

// ── complete() callback ────────────────────────────────────────────────
// Expose a global complete() for the host (e.g. Claude artifact) to retrieve
// the current OWM DSL text after WYSIWYG editing.
let _currentMapText = '';
(window as any).complete = () => _currentMapText;

// Also wire up window.claude.complete() for Claude artifact integration.
// We keep a reference to our default so DoneButton can detect if the host overrode it.
const _defaultClaudeComplete = (text: string) => {
  // Default no-op; Claude artifact runtime overrides this.
  console.log('[owm-artifact] complete() called with OWM text:', text);
};
if (!(window as any).claude) (window as any).claude = {};
if (typeof (window as any).claude.complete !== 'function') {
  (window as any).claude.complete = _defaultClaudeComplete;
}

// ── Add Component Dialog ───────────────────────────────────────────────
// Inline modal for naming a new component on double-click.
const dialogOverlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 10000,
  background: 'rgba(0,0,0,0.35)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};
const dialogBoxStyle: React.CSSProperties = {
  background: '#fff', borderRadius: 8, padding: '20px 24px',
  boxShadow: '0 4px 24px rgba(0,0,0,0.18)', minWidth: 300, maxWidth: 400,
  fontFamily: 'system-ui, -apple-system, sans-serif',
};
const dialogInputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '8px 10px',
  fontSize: 14, border: '1px solid #ccc', borderRadius: 4, marginTop: 8,
};
const dialogBtnRow: React.CSSProperties = {
  display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16,
};
const btnBase: React.CSSProperties = {
  padding: '6px 16px', fontSize: 13, borderRadius: 4, cursor: 'pointer', border: 'none',
};

interface AddComponentDialogProps {
  coords: { x: string; y: string };
  onConfirm: (name: string) => void;
  onCancel: () => void;
}

const AddComponentDialog: React.FC<AddComponentDialogProps> = ({ coords, onConfirm, onCancel }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSubmit = useCallback(() => {
    const trimmed = name.trim();
    if (trimmed) onConfirm(trimmed);
  }, [name, onConfirm]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handleSubmit(); }
    if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
  }, [handleSubmit, onCancel]);

  return (
    <div style={dialogOverlayStyle} onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div style={dialogBoxStyle}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Add Component</div>
        <div style={{ fontSize: 12, color: '#666' }}>
          Position: visibility {coords.y}, evolution {coords.x}
        </div>
        <input
          ref={inputRef}
          style={dialogInputStyle}
          placeholder="Component name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div style={dialogBtnRow}>
          <button style={{ ...btnBase, background: '#e5e5e5', color: '#333' }} onClick={onCancel}>
            Cancel
          </button>
          <button
            style={{ ...btnBase, background: '#2563eb', color: '#fff', opacity: name.trim() ? 1 : 0.5 }}
            onClick={handleSubmit}
            disabled={!name.trim()}
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Delete Component helpers ──────────────────────────────────────────
/**
 * Remove a component and all its references (edges, evolves, pipelines) from OWM text.
 * This operates purely on OWM DSL text lines.
 */
function removeComponentFromOwm(mapText: string, componentName: string): string {
  const lines = mapText.split('\n');
  const escaped = componentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Patterns that reference this component and should be removed entirely
  const removePatterns = [
    // component definition line: component Name [y, x]
    new RegExp(`^\\s*(component|anchor)\\s+${escaped}\\s*\\[`, 'i'),
    // evolve line referencing this component: evolve Name -> ...  or evolve ... -> Name
    new RegExp(`^\\s*evolve\\s+${escaped}\\s`, 'i'),
    new RegExp(`^\\s*evolve\\s+.*->\\s*${escaped}\\s`, 'i'),
    // link lines: Name->Other or Other->Name
    new RegExp(`^\\s*${escaped}\\s*->`, 'i'),
    new RegExp(`->\\s*${escaped}\\s*(;|$)`, 'i'),
    // flow lines: flow Name->Other or flow Other->Name (with optional labels)
    new RegExp(`^\\s*flow\\s+${escaped}\\s*->`, 'i'),
    new RegExp(`^\\s*flow\\s+.*->\\s*${escaped}\\s`, 'i'),
  ];

  const kept = lines.filter(line => {
    const trimmed = line.trim();
    if (!trimmed) return true; // keep blank lines
    return !removePatterns.some(p => p.test(trimmed));
  });

  return kept.join('\n');
}

// ── Floating Delete Button ──────────────────────────────────────────
// Monitors the DOM for wmlandscape component selection and shows a delete button.
const DeleteActionButton: React.FC<{ mapText: string; onDelete: (name: string) => void }> = ({ mapText, onDelete }) => {
  const [selectedName, setSelectedName] = useState<string | null>(null);

  useEffect(() => {
    // wmlandscape applies stroke-width changes and selection styling to selected components.
    // We observe clicks on SVG elements with data-testid="map-component-*" to detect selection.
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Element;
      if (!target) return;

      // Walk up to find a group with data-testid matching a component
      let el: Element | null = target;
      for (let i = 0; i < 8 && el; i++) {
        const testId = el.getAttribute('data-testid');
        if (testId?.startsWith('map-component-')) {
          const name = testId.replace('map-component-', '');
          if (name) {
            setSelectedName(name);
            return;
          }
        }
        el = el.parentElement;
      }

      // Check if click is on the SVG background (deselect)
      const svgEl = target.closest('svg');
      if (svgEl && !target.closest('[data-testid]')) {
        setSelectedName(null);
      }
    };

    // Listen for keyboard delete (to sync our UI state after wmlandscape handles it)
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedName) {
        // wmlandscape handles the actual deletion via its own handler;
        // we just clear our selection tracking
        setTimeout(() => setSelectedName(null), 100);
      }
      if (e.key === 'Escape') {
        setSelectedName(null);
      }
    };

    document.addEventListener('click', handleClick, true);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('click', handleClick, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [selectedName]);

  if (!selectedName) return null;

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(selectedName);
    setSelectedName(null);
  };

  return (
    <div style={{
      position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)',
      zIndex: 9999, display: 'flex', alignItems: 'center', gap: 12,
      background: '#fff', border: '1px solid #e1e5e9', borderRadius: 8,
      boxShadow: '0 2px 12px rgba(0,0,0,0.12)', padding: '8px 16px',
      fontFamily: 'system-ui, -apple-system, sans-serif', fontSize: 13,
    }}>
      <span style={{ color: '#555', whiteSpace: 'nowrap' }}>
        Selected: <strong style={{ color: '#1a1a1a' }}>{selectedName}</strong>
      </span>
      <button
        onClick={handleDeleteClick}
        title="Delete component and its edges (Del)"
        style={{
          padding: '5px 14px', fontSize: 13, borderRadius: 4, cursor: 'pointer',
          border: 'none', background: '#e53e3e', color: '#fff', fontWeight: 500,
          display: 'flex', alignItems: 'center', gap: 4,
        }}
      >
        <span style={{ fontSize: 15, lineHeight: 1 }}>&#x2715;</span> Delete
      </button>
      <span style={{ color: '#999', fontSize: 11 }}>or press Del</span>
    </div>
  );
};

// ── Done Button Overlay ─────────────────────────────────────────────────
// Fixed overlay button that finalises editing and sends OWM text back to the host.
const DoneButton: React.FC<{ getOwmText: () => string }> = ({ getOwmText }) => {
  const [status, setStatus] = useState<'idle' | 'sent' | 'copied' | 'error'>('idle');

  const handleDone = useCallback(async () => {
    const text = getOwmText();
    const hasClaude = typeof (window as any).claude?.complete === 'function'
      && (window as any).claude.complete !== _defaultClaudeComplete;

    // 1. Try window.claude.complete() if the host (Claude artifact runtime) provides it
    if (hasClaude) {
      try {
        (window as any).claude.complete(text);
        setStatus('sent');
        setTimeout(() => setStatus('idle'), 1500);
        return;
      } catch (err) {
        console.warn('[owm-artifact] claude.complete() failed, falling back to clipboard', err);
      }
    }

    // 2. Fallback: copy OWM text to clipboard (browser testing without Claude runtime)
    try {
      await navigator.clipboard.writeText(text);
      setStatus('copied');
      console.log('[owm-artifact] OWM text copied to clipboard (%d chars)', text.length);
    } catch (clipErr) {
      // 3. Last resort: prompt-based fallback for contexts where clipboard API is blocked
      console.warn('[owm-artifact] clipboard.writeText() failed', clipErr);
      try {
        // Use a textarea-based copy as a synchronous fallback
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        setStatus('copied');
        console.log('[owm-artifact] OWM text copied via execCommand fallback (%d chars)', text.length);
      } catch (fallbackErr) {
        console.error('[owm-artifact] all copy methods failed', fallbackErr);
        setStatus('error');
      }
    }
    setTimeout(() => setStatus('idle'), 2000);
  }, [getOwmText]);

  const label = status === 'sent' ? '✓ Sent'
    : status === 'copied' ? '✓ Copied to clipboard'
    : status === 'error' ? '✗ Copy failed'
    : 'Done';

  const bg = status === 'sent' || status === 'copied' ? '#16a34a'
    : status === 'error' ? '#dc2626'
    : '#2563eb';

  return (
    <button
      onClick={handleDone}
      title="Finish editing and return OWM text (copies to clipboard if not in Claude)"
      style={{
        position: 'fixed',
        top: 12,
        right: 12,
        zIndex: 10001,
        padding: '8px 20px',
        fontSize: 14,
        fontWeight: 600,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        borderRadius: 6,
        border: 'none',
        cursor: status !== 'idle' ? 'default' : 'pointer',
        background: bg,
        color: '#fff',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        transition: 'background 0.2s',
        userSelect: 'none',
      }}
    >
      {label}
    </button>
  );
};

// ── OWM coordinate clamping ─────────────────────────────────────────────
/**
 * Clamp a numeric string to [0, 1] range, preserving decimal precision.
 */
function clampCoord(s: string): string {
  const n = parseFloat(s);
  if (isNaN(n)) return s;
  const clamped = Math.max(0, Math.min(1, n));
  // Preserve original precision (number of decimal places)
  const dotIdx = s.indexOf('.');
  const decimals = dotIdx >= 0 ? s.length - dotIdx - 1 : 0;
  return clamped.toFixed(Math.max(decimals, 2));
}

/**
 * Clamp all coordinate values inside `[...]` brackets in OWM DSL component,
 * pipeline, anchor, and evolve lines to the valid [0, 1] range.
 *
 * Handles both two-coordinate `[vis, evo]` (regular components) and
 * single-coordinate `[maturity]` (pipeline sub-components) forms.
 */
function clampOwmCoordinates(mapText: string): string {
  return mapText.split('\n').map(line => {
    const trimmed = line.trimStart();
    // Only process lines that define positions:
    // component, anchor, pipeline, evolve, and pipeline sub-components inside { }
    if (
      /^(component|anchor|pipeline)\s/i.test(trimmed) ||
      /^evolve\s/i.test(trimmed)
    ) {
      // Replace coordinate brackets: [val] or [val, val]
      return line.replace(/\[([^\[\]]+)\]/g, (_match, inner: string) => {
        const parts = inner.split(',').map(p => p.trim());
        if (parts.length === 2) {
          // [visibility, maturity] or [maturity1, maturity2]
          return `[${clampCoord(parts[0])}, ${clampCoord(parts[1])}]`;
        }
        if (parts.length === 1 && /^-?\d/.test(parts[0])) {
          // [maturity] — pipeline sub-component
          return `[${clampCoord(parts[0])}]`;
        }
        return _match; // leave non-numeric brackets alone (e.g. label offsets)
      });
    }
    return line;
  }).join('\n');
}

// ── OWM text helpers ───────────────────────────────────────────────────
/** Append a `component` line to OWM text, placing it after existing components. */
function insertComponentLine(mapText: string, name: string, visibility: string, evolution: string): string {
  const newLine = `component ${name} [${visibility}, ${evolution}]`;
  if (!mapText.trim()) return newLine + '\n';

  const lines = mapText.split('\n');
  // Find last component/anchor line to group new component with existing ones
  let insertIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i].trimStart();
    if (/^(component|anchor)\s/i.test(l)) { insertIdx = i + 1; break; }
  }
  if (insertIdx === -1) {
    // No existing components — append at end
    insertIdx = lines.length;
  }
  lines.splice(insertIdx, 0, newLine);
  return lines.join('\n');
}

// ── App ────────────────────────────────────────────────────────────────
const CANVAS_GUTTER_X = 78;
const CANVAS_GUTTER_Y = 30;

const App: React.FC = () => {
  const defaultFeatureSwitches = useFeatureSwitches();
  const featureSwitches = useMemo(
    () => ({
      ...defaultFeatureSwitches,
      showToggleFullscreen: false,
      enableQuickAdd: false,
      showMapToolbar: false,
      showMiniMap: false,
      allowMapZoomMouseWheel: false,
      enableNewPipelines: true,
    }),
    [defaultFeatureSwitches],
  );

  const [mapText, setMapText] = useState(() => getInitialOwmText());
  const mapState = useUnifiedMapState();
  const wardleyMap = mapState.state.map;
  const setWardleyMap = mapState.actions.setMap;

  useEffect(() => {
    if (!wardleyMap || !wardleyMap.components) {
      setWardleyMap(createEmptyMap());
    }
  }, [wardleyMap, setWardleyMap]);

  const [mapDimensions, setMapDimensions] = useState({ width: 800, height: 600 });
  const [mapCanvasDimensions, setMapCanvasDimensions] = useState({ width: 800, height: 600 });
  const [mapSize, setMapSize] = useState({ width: 0, height: 0 });
  const [mapStyle, setMapStyle] = useState('plain');
  const [mapStyleDefs, setMapStyleDefs] = useState((MapStyles as any).Plain);
  const [highlightLine, setHighlightLine] = useState(0);
  const mapRef = useRef<HTMLDivElement>(null);

  // ── Double-click Add Component state ──
  const [newComponentContext, setNewComponentContext] = useState<{ x: string; y: string } | null>(null);

  // Keep global reference in sync
  useEffect(() => { _currentMapText = mapText; }, [mapText]);

  const getHeight = useCallback(() => {
    return Math.max(320, (window.innerHeight || document.documentElement.clientHeight) - CANVAS_GUTTER_Y);
  }, []);
  const getWidth = useCallback(() => {
    return Math.max(480, (window.innerWidth || document.documentElement.clientWidth) - CANVAS_GUTTER_X);
  }, []);

  // Resize handling
  useEffect(() => {
    const onResize = () => {
      const w = getWidth();
      const h = getHeight();
      setMapDimensions({ width: Math.max(mapSize.width || 0, w), height: Math.max(mapSize.height || 0, h) });
      setMapCanvasDimensions({ width: w, height: h });
    };
    window.addEventListener('resize', onResize);
    onResize();
    return () => window.removeEventListener('resize', onResize);
  }, [mapSize, getWidth, getHeight]);

  // Parse OWM text → wardley map object
  useEffect(() => {
    try {
      if (!mapText.trim()) {
        setWardleyMap(createEmptyMap());
        setMapSize({ width: 0, height: 0 });
        setMapStyle('plain');
        return;
      }
      const converter = new UnifiedConverter(featureSwitches);
      const parsed = converter.parse(mapText);
      if (parsed?.components) {
        setWardleyMap(parsed);
        setMapSize(parsed.presentation?.size || { width: 0, height: 0 });
        setMapStyle(parsed.presentation?.style || 'plain');
      } else {
        setWardleyMap(createEmptyMap());
      }
    } catch (err) {
      console.warn('OWM parse error', err);
      setWardleyMap(createEmptyMap());
    }
  }, [mapText, setWardleyMap, featureSwitches]);

  // Map style switching
  useEffect(() => {
    const S = MapStyles as any;
    switch (mapStyle) {
      case 'colour': case 'color': setMapStyleDefs(S.Colour); break;
      case 'wardley': setMapStyleDefs(S.Wardley); break;
      case 'handwritten': setMapStyleDefs(S.Handwritten); break;
      default: setMapStyleDefs(S.Plain);
    }
  }, [mapStyle]);

  const mutateMapText = useCallback((newText: string) => {
    // Clamp all OWM coordinates to [0, 1] after any WYSIWYG edit (drag, resize, etc.)
    setMapText(clampOwmCoordinates(newText));
  }, []);

  // ── Double-click Add Component handlers ──
  const handleAddComponentConfirm = useCallback((name: string) => {
    if (!newComponentContext) return;
    const updated = insertComponentLine(mapText, name, newComponentContext.y, newComponentContext.x);
    setMapText(updated);
    setNewComponentContext(null);
  }, [newComponentContext, mapText]);

  const handleAddComponentCancel = useCallback(() => {
    setNewComponentContext(null);
  }, []);

  // ── Delete Component handler (OWM text-level) ──
  const handleDeleteComponent = useCallback((componentName: string) => {
    const updated = removeComponentFromOwm(mapText, componentName);
    if (updated !== mapText) {
      setMapText(updated);
    }
  }, [mapText]);

  // Stable ref for Done button (avoids re-renders)
  const getOwmText = useCallback(() => mapText, [mapText]);

  return (
    <FeatureSwitchesProvider value={featureSwitches}>
      <DoneButton getOwmText={getOwmText} />
      <MapView
        wardleyMap={wardleyMap?.components ? wardleyMap : createEmptyMap()}
        mapOnlyView={false}
        toolbarSnapped={true}
        showWysiwygToolbar={true}
        launchUrl={() => {}}
        mapStyleDefs={mapStyleDefs}
        mapDimensions={mapDimensions}
        mapCanvasDimensions={mapCanvasDimensions}
        mapEvolutionStates={Defaults.EvolutionStages}
        mapRef={mapRef}
        mapText={mapText}
        mutateMapText={mutateMapText}
        setMetaText={() => {}}
        metaText={() => {}}
        evolutionOffsets={Defaults.EvoOffsets}
        setHighlightLine={setHighlightLine}
        setNewComponentContext={setNewComponentContext}
        showLinkedEvolved={false}
        mapAnnotationsPresentation={
          wardleyMap?.presentation?.annotations || { visibility: 0.5, maturity: 0.5 }
        }
      />
      <DeleteActionButton mapText={mapText} onDelete={handleDeleteComponent} />
      {newComponentContext && (
        <AddComponentDialog
          coords={newComponentContext}
          onConfirm={handleAddComponentConfirm}
          onCancel={handleAddComponentCancel}
        />
      )}
    </FeatureSwitchesProvider>
  );
};

// ── Mount ──────────────────────────────────────────────────────────────
const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');
createRoot(container).render(<App />);
