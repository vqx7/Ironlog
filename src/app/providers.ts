/* The services the build's account script provides (scripts/cloud-supabase.js):
   accounts and sync (window.ironlogAuth) and problem reports
   (window.ironlogFeedback). Moved unchanged from the legacy script in r53,
   with the Guide that reads them. */

import type { CloudDb } from './store';

/** `window.claude.use`, where the page runs inside Claude (retired): the artifact's database, and the viewer. The sync suites inject a stand-in db through it. */
export interface ClaudeUse {
  (what: 'db'): Promise<CloudDb | null | undefined>;
  (what: 'user'): Promise<{ id(): Promise<unknown> } | null | undefined>;
}

declare global {
  interface Window {
    /** The account service: who is signed in, and signing out (the rest of its calls are the account flow's, phase 5). */
    ironlogAuth?: { user?: unknown; signOut: () => Promise<unknown> } | undefined;
    ironlogFeedback?: { send?: unknown } | undefined;
    /** Claude's artifact services, where the page runs inside Claude (retired, OWNER.md); the sync suites use them as their stand-in cloud. */
    claude?: { use?: ClaudeUse | undefined } | undefined;
    /** The account backend's handle for the sync (scripts/cloud-supabase.js): the document store and who is signed in. */
    ironlogCloud?:
      | (() => Promise<{ db?: CloudDb | null | undefined; userId?: unknown } | null | undefined>)
      | undefined;
  }
}

/* The build's cloud script defines window.ironlogAuth when a backend is
   configured; inside Claude and in the plain source file there is none, and
   nothing below shows. An account is optional: without one the app keeps
   working on this device exactly as before. */
/** The account service, or null where there is none. */
export const AUTH = () =>
  window.ironlogAuth && typeof window.ironlogAuth.user === 'function' ? window.ironlogAuth : null;

/** The report service, or null where there is none (the plain source file copies a report as text instead). */
export const FB = () =>
  window.ironlogFeedback && typeof window.ironlogFeedback.send === 'function' ? window.ironlogFeedback : null;
