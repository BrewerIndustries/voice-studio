import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, audioUrl, type Clip, type Studio as StudioInfo } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Button, Card, ErrorNote, fmtDate, fmtNum, inputCls } from '../components/ui';

type Settings = { stability: number; similarity: number; style: number; speed: number };
const DEFAULTS: Settings = { stability: 0.5, similarity: 0.75, style: 0, speed: 1 };

function loadSettings(): Settings {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('vs_settings') || '{}') }; } catch { return DEFAULTS; }
}

function Slider({ label, hint, value, min = 0, max = 1, step = 0.05, onChange }: {
  label: string; hint: string; value: number; min?: number; max?: number; step?: number; onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <div className="mb-1 flex justify-between text-xs">
        <span className="font-medium text-ink/70">{label}</span>
        <span className="tabular-nums text-ink/50">{value.toFixed(2)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))} className="w-full" />
      <p className="mt-0.5 text-[11px] text-ink/40">{hint}</p>
    </label>
  );
}

export default function Studio() {
  const { user } = useAuth();
  const [info, setInfo] = useState<StudioInfo | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [text, setText] = useState(() => { try { return localStorage.getItem('vs_draft') || ''; } catch { return ''; } });
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [latest, setLatest] = useState<string | null>(null);
  const latestRef = useRef<HTMLAudioElement>(null);

  const refresh = () => {
    api.studio().then(setInfo).catch((e) => setError(e.message));
    api.clips().then(setClips).catch(() => {});
  };
  useEffect(refresh, []);
  useEffect(() => { try { localStorage.setItem('vs_draft', text); } catch { /* ignore */ } }, [text]);
  useEffect(() => { try { localStorage.setItem('vs_settings', JSON.stringify(settings)); } catch { /* ignore */ } }, [settings]);
  useEffect(() => { if (latest) latestRef.current?.play().catch(() => {}); }, [latest]);

  const max = info?.max_chars_per_clip ?? 5000;
  const cap = info?.usage.cap ?? null;
  const used = info?.usage.used ?? 0;
  const over = text.length > max || (cap !== null && used + text.length > cap);
  const set = (k: keyof Settings) => (v: number) => setSettings((s) => ({ ...s, [k]: v }));

  async function generate() {
    setError('');
    setBusy(true);
    try {
      const clip = await api.generate(text.trim(), settings);
      setClips((cs) => [clip, ...cs]);
      setLatest(clip.id);
      refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this clip?')) return;
    await api.deleteClip(id).catch((e) => setError(e.message));
    setClips((cs) => cs.filter((c) => c.id !== id));
    if (latest === id) setLatest(null);
    refresh();
  }

  return (
    <div className="space-y-5">
      {info && !info.ready && (
        <div className="rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-300 ring-1 ring-amber-500/30">
          {!info.has_api_key
            ? 'Not connected to ElevenLabs yet: the API key still needs to be added to the server.'
            : 'No voice selected yet. '}
          {info.has_api_key && user?.role === 'admin' && <Link to="/admin" className="underline">Pick your voice in Admin.</Link>}
        </div>
      )}

      <Card title="Script" right={info?.voice_name && <span className="text-xs text-ink/50">Voice: <span className="text-ink/80">{info.voice_name}</span></span>}>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8}
          placeholder="Type or paste what you want said…"
          className={`${inputCls} resize-y text-base leading-relaxed`} />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-ink/50">
          <span className={text.length > max ? 'text-red-400' : ''}>{fmtNum(text.length)} / {fmtNum(max)} characters</span>
          <span>
            This month: {fmtNum(used)}{cap !== null ? ` of ${fmtNum(cap)}` : ''} characters
          </span>
        </div>

        <button onClick={() => setShowSettings((s) => !s)} className="mt-3 text-xs text-ink/60 hover:text-ink">
          {showSettings ? '▾' : '▸'} Voice settings
        </button>
        {showSettings && (
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Slider label="Stability" hint="Lower = more expressive, higher = more consistent" value={settings.stability} onChange={set('stability')} />
            <Slider label="Similarity" hint="How closely to stick to your voice" value={settings.similarity} onChange={set('similarity')} />
            <Slider label="Style" hint="Exaggerates delivery; 0 is most natural" value={settings.style} onChange={set('style')} />
            <Slider label="Speed" hint="0.7 slower — 1.2 faster" value={settings.speed} min={0.7} max={1.2} step={0.05} onChange={set('speed')} />
            <button onClick={() => setSettings(DEFAULTS)} className="justify-self-start text-xs text-ink/50 hover:text-ink">Reset to defaults</button>
          </div>
        )}

        <div className="mt-4 flex items-center gap-3">
          <Button onClick={generate} disabled={busy || !text.trim() || over || !info?.ready}>
            {busy ? 'Generating…' : 'Generate voice-over'}
          </Button>
          {busy && <span className="text-xs text-ink/50">Usually a few seconds; longer scripts take longer.</span>}
        </div>
        <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>
        {latest && (
          <div className="mt-4">
            <audio ref={latestRef} controls src={audioUrl(latest)} />
          </div>
        )}
      </Card>

      <Card title="History">
        {clips.length === 0 ? (
          <p className="text-sm text-ink/50">Your generated clips will appear here.</p>
        ) : (
          <ul className="divide-y divide-ink/10">
            {clips.map((c) => (
              <li key={c.id} className="py-3">
                <p className="line-clamp-3 whitespace-pre-wrap text-sm text-ink/90">{c.text}</p>
                <div className="mt-2"><audio controls preload="none" src={audioUrl(c.id)} /></div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink/50">
                  <span>{fmtDate(c.created_at)}</span>
                  <span>{fmtNum(c.chars)} chars</span>
                  <span className="ml-auto flex gap-3">
                    <a href={audioUrl(c.id, true)} className="hover:text-ink">Download</a>
                    <button onClick={() => setText(c.text)} className="hover:text-ink">Reuse text</button>
                    <button onClick={() => remove(c.id)} className="text-red-400/80 hover:text-red-400">Delete</button>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
