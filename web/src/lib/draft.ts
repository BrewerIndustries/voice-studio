// The unsent script is kept in localStorage so a reload doesn't lose it. It is
// keyed per user and wiped on sign-out, so a shared browser never shows one
// person's draft to the next.
const PREFIX = 'vs_draft:';

export const draftKey = (userId: string) => PREFIX + userId;

export function clearDrafts() {
  try {
    for (const k of Object.keys(localStorage)) {
      if (k === 'vs_draft' || k.startsWith(PREFIX)) localStorage.removeItem(k);
    }
  } catch { /* ignore */ }
}
