/* The services the build's account script provides (scripts/cloud-supabase.js):
   accounts and sync (window.ironlogAuth) and problem reports
   (window.ironlogFeedback). Moved unchanged from the legacy script in r53,
   with the Guide that reads them. */

declare global {
  interface Window {
    ironlogAuth?: { user?: unknown } | undefined;
    ironlogFeedback?: { send?: unknown } | undefined;
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
