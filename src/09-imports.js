/* The legacy script's imports from the typed modules in src/app/ (r49).
   scripts/join.js puts this part first, outside the legacy wrapper, and the
   legacy parts (10 to 29) read these names as they read their own. Each phase
   of ARCHITECTURE.md moves more code into src/app/ and out of those parts. */
import { STORAGE_ID, APP_NAME, FILE_PREFIX, PREVIEW_NAME, WORDMARK, DISPLAY_VERSION, APP_VERSION, VERSION_LINE, SITE_HOST, SITE_DIR_FALLBACK, THREE_URLS } from './app/config';
