/* The save of the log on this phone: its write, what runs after it, and whether another tab wrote first. Below
   both ways the account is kept (the documents in sync.ts, the rows in rows.ts), which each call it. */

import { storedJson } from './merge';
import { fx, state } from './store';
import { KEY, device, keepStorage, log } from './storage';

/** What runs after each write of the log to this device succeeds (onSaved). */
const savedHooks: (() => void)[] = [];
/* A copy kept elsewhere on the phone until the log holding it is written (park.ts's set-aside workout) is let
   go here, once a write succeeds: until then the log lives in memory alone. */
/** Runs `f` after each write of the log to this device succeeds. */
export function onSaved(f: () => void): void {
  savedHooks.push(f);
}
/** Writes the log's text to this device and notes it as the last saved, the base another tab's write is merged against (onStorage); throws as setItem does. */
export function writeLocal(j: string): void {
  localStorage.setItem(KEY, j);
  device.lastSaved = j;
  keepStorage();
  for (const f of savedHooks)
    try {
      f();
    } catch (e) {
      // The write itself succeeded; what follows it is said in the error log, never taken as a failed save.
      log('storage', e);
    }
}
/* Whether another tab wrote the log since this one last saved or heard it:
   the save there is not yet heard here (a storage event comes a task later),
   so writing now would replace it (a tick in one tab and a load typed in
   another, each tab saving what it had, lost one of them). A log never saved or read here has nothing to compare. */
export function storedElsewhere(): string | null {
  if (!device.boot || device.lastSaved == null) return null;
  try {
    const cur = localStorage.getItem(KEY);
    return cur != null && cur !== device.lastSaved ? cur : null;
  } catch (e) {
    // Storage that cannot be read now cannot be written either; the save below says so.
    log('storage', e);
    return null;
  }
}
/* The log taken in from the account (a pull, or a flush that merged the
   account's copy) is written to this device before the sync notes say it
   agrees with the account: the notes describe the log on this device, so
   notes written ahead of a refused write read, on the next start, the
   records taken in as deleted here, and that deletion was sent to the
   account and the other phone. A refused write
   marks the save failed, which keeps the notes as they were (saveMeta) and
   says Not saving; a save that later succeeds (saveNow) clears it. A save
   that could not be read at start is never written over (device.boot). */
/** Writes the log just taken in from the account to this device, and says whether it is saved. */
export function writeTakenIn(): boolean {
  if (!device.boot) return false;
  try {
    writeLocal(storedJson(state));
    device.ok = true;
  } catch (e) {
    device.ok = false;
    log('storage', e);
  }
  fx.setSaveState();
  return device.ok;
}
