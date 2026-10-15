import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { draftKey } from '../lib/draft';
import { api, audioUrl, type Clip, type Prefs, type Studio as StudioInfo, type Voice } from '../lib/api';
import { Button, Card, ErrorNote, fmtDate, fmtNum, inputCls } from '../components/ui';

// One-tap voices next to the dropdown. Library voices are matched by name, so they
// light up once added to the ElevenLabs account (Voice Library → Add).
const QUICK: { label: string; hint: string; match: (v: Voice, myId: string | null) => boolean }[] = [
  { label: 'Digital Dan', hint: 'Set "Your voice" in Settings', match: (v, myId) => v.voice_id === myId },
  { label: 'Quentin', hint: 'Add "Quentin – Narrator and Educator" to My Voices on ElevenLabs', match: (v) => /quentin/i.test(v.name) && /narrat/i.test(v.name) },
  { label: 'Eryn', hint: 'Add an "Eryn" voice to My Voices on ElevenLabs', match: (v) => /\beryn\b/i.test(v.name) },
];

export default function Studio() {
  const [info, setInfo] = useState<StudioInfo | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const { user } = useAuth();
  const key = draftKey(user!.id);
  const [text, setText] = useState(() => { try { return localStorage.getItem(key) || ''; } catch { return ''; } });
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [latest, setLatest] = useState<string | null>(null);
  const latestRef = useRef<HTMLAudioElement>(null);

  const refresh = () => {
    api.studio().then((s) => { setInfo(s); setPrefs((p) => p ?? s.prefs); }).catch((e) => setError(e.message));
    api.clips().then(setClips).catch(() => {});
  };
  useEffect(refresh, []);
  useEffect(() => { api.voices().then(setVoices).catch(() => {}); }, []);

  const chooseVoice = (voice_id: string) => {
    setPrefs((p) => (p ? { ...p, voice_id } : p));
    api.savePrefs({ voice_id }).catch((e) => setError(e.message));
  };
  const voiceName = (id: string) => voices.find((v) => v.voice_id === id)?.name;
  const voiceKnown = Boolean(prefs && voices.some((v) => v.voice_id === prefs.voice_id));
  useEffect(() => { try { localStorage.setItem(key, text); } catch { /* ignore */ } }, [key, text]);
  useEffect(() => { if (latest) latestRef.current?.play().catch(() => {}); }, [latest]);

  const max = info?.max_chars_per_clip ?? 5000;
  const cap = info?.usage.cap ?? null;
  const used = info?.usage.used ?? 0;
  const over = text.length > max || (cap !== null && used + text.length > cap);

  async function generate() {
    setError('');
    setBusy(true);
    try {
      const clip = await api.generate(text.trim(), prefs!);
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
          Not connected to ElevenLabs yet: the API key still needs to be added to the server.
        </div>
      )}

      <Card title="Script" right={
        <span className="flex items-center gap-2 text-xs text-ink/50">
          <label htmlFor="voice">Voice</label>
          <select id="voice" value={voiceKnown ? prefs!.voice_id : ''} onChange={(e) => chooseVoice(e.target.value)}
            className={`${inputCls} w-auto max-w-52 py-1 text-xs`} disabled={!voices.length}>
            {!voiceKnown && <option value="">{voices.length ? '— choose —' : 'Loading…'}</option>}
            {voices.map((v) => (
              <option key={v.voice_id} value={v.voice_id}>
                {v.name}{v.voice_id === info?.my_voice_id ? ' (yours)' : ''}
              </option>
            ))}
          </select>
        </span>
      }>
        <div className="mb-3 flex flex-wrap gap-2">
          {QUICK.map((q) => {
            const v = voices.find((x) => q.match(x, info?.my_voice_id ?? null));
            const active = Boolean(v && prefs?.voice_id === v.voice_id);
            return (
              <button key={q.label} type="button" disabled={!v} onClick={() => v && chooseVoice(v.voice_id)}
                title={v ? v.name : q.hint}
                className={`rounded-full px-3 py-1 text-xs font-medium ring-1 transition disabled:cursor-not-allowed disabled:opacity-40 ${
                  active ? 'bg-accent text-black ring-accent' : 'text-ink/80 ring-ink/20 hover:bg-ink/5'}`}>
                {q.label}
              </button>
            );
          })}
        </div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8}
          placeholder="Type or paste what you want said…"
          className={`${inputCls} resize-y text-base leading-relaxed`} />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-ink/50">
          <span className={text.length > max ? 'text-red-400' : ''}>{fmtNum(text.length)} / {fmtNum(max)} characters</span>
          <span>
            This month: {fmtNum(used)}{cap !== null ? ` of ${fmtNum(cap)}` : ''} characters
          </span>
        </div>

        <Link to="/settings" className="mt-3 inline-block text-xs text-ink/50 hover:text-ink">Voice settings →</Link>

        <div className="mt-4 flex items-center gap-3">
          <Button onClick={generate} disabled={busy || !text.trim() || over || !info?.ready || !voiceKnown}>
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
                  {voiceName(c.voice_id) && <span>{voiceName(c.voice_id)}</span>}
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
