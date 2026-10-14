import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, type Config, type Prefs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Button, Card, ErrorNote, fmtDate, fmtNum, Input, inputCls } from '../components/ui';

const DEFAULTS = { stability: 0.5, similarity: 0.75, style: 0, speed: 1 };

type Quota = { tier: string | null; used: number | null; limit: number | null; resets_at: number | null };

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

// Your delivery sliders, saved to your account (debounced) so every device uses them.
function VoiceSettings() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [status, setStatus] = useState('');
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => { api.studio().then((s) => setPrefs(s.prefs)).catch((e) => setStatus(e.message)); }, []);

  const update = (patch: Partial<Prefs>) => {
    setPrefs((p) => (p ? { ...p, ...patch } : p));
    setStatus('Saving…');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      api.savePrefs(patch).then(() => setStatus('Saved')).catch((e) => setStatus(e.message));
    }, 400);
  };

  if (!prefs) return <Card title="Voice"><p className="text-sm text-ink/50">{status || 'Loading…'}</p></Card>;
  const set = (k: keyof typeof DEFAULTS) => (v: number) => update({ [k]: v });

  return (
    <Card title="Voice" right={<span className="text-xs text-ink/50">{status}</span>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Slider label="Stability" hint="Lower = more expressive, higher = more consistent" value={prefs.stability} onChange={set('stability')} />
        <Slider label="Similarity" hint="How closely to stick to the voice" value={prefs.similarity} onChange={set('similarity')} />
        <Slider label="Style" hint="Exaggerates delivery; 0 is most natural" value={prefs.style} onChange={set('style')} />
        <Slider label="Speed" hint="0.7 slower — 1.2 faster" value={prefs.speed} min={0.7} max={1.2} onChange={set('speed')} />
      </div>
      <button onClick={() => update(DEFAULTS)} className="mt-4 text-xs text-ink/50 hover:text-ink">Reset to defaults</button>
    </Card>
  );
}

// Admin: which ElevenLabs model, clip length, and the account's quota.
function EngineSettings() {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [hasKey, setHasKey] = useState(false);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.adminSettings().then((r) => {
      setCfg(r.config);
      setModels(r.models);
      setHasKey(r.has_api_key);
      if (r.has_api_key) api.quota().then(setQuota).catch(() => {});
    }).catch((e) => setError(e.message));
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!cfg) return;
    setError('');
    try {
      setCfg(await api.saveSettings({ model_id: cfg.model_id, max_chars_per_clip: cfg.max_chars_per_clip }));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <>
      <Card title="ElevenLabs">
        {!hasKey ? (
          <p className="text-sm text-amber-300">
            No API key on the server yet. Run <code className="rounded bg-ink/10 px-1">npx wrangler secret put ELEVENLABS_API_KEY</code> in <code className="rounded bg-ink/10 px-1">api/</code>.
          </p>
        ) : quota && quota.limit !== null ? (
          <div className="text-sm">
            <div className="mb-1 flex flex-wrap justify-between gap-2 text-ink/70">
              <span>{quota.tier ? `${quota.tier} plan` : 'Plan'}: {fmtNum(quota.used ?? 0)} of {fmtNum(quota.limit)} characters</span>
              {quota.resets_at && <span className="text-ink/50">resets {fmtDate(quota.resets_at)}</span>}
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-ink/10">
              <div className="h-full bg-accent" style={{ width: `${Math.min(100, ((quota.used ?? 0) / Math.max(1, quota.limit)) * 100)}%` }} />
            </div>
          </div>
        ) : (
          <p className="text-sm text-ink/60">Connected.</p>
        )}
      </Card>

      {cfg && (
        <Card title="Engine (admin)">
          <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink/60">Model</span>
              <select className={inputCls} value={cfg.model_id} onChange={(e) => setCfg({ ...cfg, model_id: e.target.value })}>
                {[...new Set([cfg.model_id, ...models])].map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink/60">Max characters per clip</span>
              <Input type="number" min={100} max={10000} value={cfg.max_chars_per_clip}
                onChange={(e) => setCfg({ ...cfg, max_chars_per_clip: Number(e.target.value) })} />
            </label>
            <div className="flex items-center gap-3 sm:col-span-2">
              <Button type="submit">Save</Button>
              {saved && <span className="text-sm text-emerald-400">Saved</span>}
            </div>
          </form>
          <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>
        </Card>
      )}
    </>
  );
}

export default function Settings() {
  const { user } = useAuth();
  return (
    <div className="space-y-5">
      <VoiceSettings />
      {user?.role === 'admin' && <EngineSettings />}
    </div>
  );
}
