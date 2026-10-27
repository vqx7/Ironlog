/* The services the build's account script provides (scripts/cloud-supabase.js):
   accounts and sync (window.ironlogAuth) and problem reports
   (window.ironlogFeedback). Moved unchanged from the legacy script in r53,
   with the Guide that reads them. */

import type { AcctUser, CloudDb } from './store';
import type { FbItem } from './modals';

/** The account service (window.ironlogAuth, scripts/cloud-supabase.js): who is signed in, the ways to sign in or out, the confirmation code, the password, deleting the account, and what an emailed link opened the page with. */
interface AuthService {
  /** What an emailed link opened the page with: an error, or its kind (a sign-up's confirmation, a password reset). */
  landing?: { error?: string | undefined; type?: string | undefined } | null | undefined;
  user(): Promise<AcctUser | null>;
  signIn(email: string, password: string): Promise<AcctUser | null>;
  /** confirm: the email must be confirmed before the account can sign in. */
  signUp(email: string, password: string): Promise<{ confirm: boolean; user: AcctUser | null }>;
  verifyCode?: ((email: string, code: string) => Promise<AcctUser | null>) | undefined;
  resendCode?: ((email: string) => Promise<unknown>) | undefined;
  signOut(): Promise<unknown>;
  resetPassword(email: string): Promise<unknown>;
  updatePassword(password: string): Promise<unknown>;
  /** Absent in the preview, where the app offers no Delete my account. */
  deleteAccount?: (() => Promise<unknown>) | undefined;
  /** This browser is where the app is used: let it sync. */
  release?: (() => void) | undefined;
  /** Calls back on every sign-in change: the event's name and who is signed in after it. */
  onChange(cb: (ev: string, user: AcctUser | null) => void): void;
}

/** A problem report as the report service sends it, with the key made on the phone that lets the table refuse it sent twice (r63, PENDING 306). */
export interface Report {
  category: string;
  message: string;
  reply_to: string | null;
  screenshot: string | null;
  context: unknown;
  client_id: string;
}

/** The report service (window.ironlogFeedback): sending a report, whether this account reads them, and the owner's inbox. */
interface ReportService {
  send(fb: Report): Promise<unknown>;
  isReader?: (() => Promise<boolean>) | undefined;
  inbox?: ((limit: number) => Promise<FbItem[]>) | undefined;
}

/* The codes the errors of the services carry and the app reads: the
   account's (scripts/cloud-supabase.js, its friendly() and its own throws,
   with Supabase's email_not_confirmed passed through as Supabase names it),
   the sync's (the sync's reader of a refused write, cloudFail, and its own
   timeout and too_big), and a save the downloads service declined. One
   list, so a code the app compares against is one a service gives (r63,
   PENDING 307). */
/** Every error code the app reads. */
export const SERVICE_CODES = [
  'bad_code',
  'breached',
  'capability_disabled',
  'capability_removed',
  'declined',
  'denied',
  'email_not_confirmed',
  'error',
  'gone',
  'limit',
  'no_code',
  'not_deployed',
  'not_granted',
  'not_set_up',
  'quota_exceeded',
  'revoked',
  'signin',
  'timeout',
  'too_big',
  'wait'
] as const;
/** An error code the app reads. */
type ServiceCode = (typeof SERVICE_CODES)[number];
const KNOWN: ReadonlySet<string> = new Set(SERVICE_CODES);
/** An error's code when it is one the app reads, else null (a code no service listed gives, or no code). */
export function codeOf(e: unknown): ServiceCode | null {
  const c = e && typeof e === 'object' && 'code' in e ? e.code : null;
  return typeof c === 'string' && KNOWN.has(c) ? SERVICE_CODES.find(k => k === c) || null : null;
}
/** An error's message, or the words given when it has none. */
export function said(e: unknown, or: string): string {
  const m = e && typeof e === 'object' && 'message' in e ? e.message : null;
  return typeof m === 'string' && m ? m : or;
}

/** `window.claude.use`, where the page runs inside Claude (retired): the artifact's database, and the viewer. The sync suites inject a stand-in db through it. */
interface ClaudeUse {
  (what: 'db'): Promise<CloudDb | null | undefined>;
  (what: 'user'): Promise<{ id(): Promise<unknown> } | null | undefined>;
  /** The artifact's downloads: a saved file, confirmed (the export's). */
  (what: 'downloads'): Promise<{ save(o: { filename: string; data: string }): Promise<unknown> } | null | undefined>;
}

declare global {
  interface Window {
    /** The account service, where the build has one. */
    ironlogAuth?: AuthService | undefined;
    /** The report service, where the build has one. */
    ironlogFeedback?: ReportService | undefined;
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
