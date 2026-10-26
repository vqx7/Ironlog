/* The open sheet (r63): one type for every sheet the page can show, each kind
   with the fields its sheet draws and its actions read and write. Before r63
   the open sheet was `unknown` to the typed modules, since the legacy script
   wrote it with whatever fields it liked; the actions that write it are
   typed now, so each kind says what it holds, and an action reads a sheet's
   fields only after checking its kind. */

import type { DraftBlock, Exercise } from './types';
import type { RoutineUpdate } from './plans';
import type { ImpMap, ImpRead } from './importing';

/** What any sheet may carry: something typed in it that a tap outside must not throw away, and More options opened by hand. */
interface SheetBase {
  dirty?: boolean | undefined;
  moreOpen?: boolean | undefined;
}

/** A question: what it asks, its answer, and a second answer when it has one. */
export interface ConfirmSheet {
  title: string;
  body: string;
  okLabel: string;
  danger?: boolean | undefined;
  alt?: { label: string; quiet?: boolean | undefined; only?: boolean | undefined } | null | undefined;
}

/** A question as it is open: what its answers do, and what closing it without one does (a question the sync asked reads that as Cancel, r56.1). */
export interface ConfirmModal extends SheetBase, ConfirmSheet {
  kind: 'confirm';
  fn: () => void;
  alt?: { label: string; fn: () => void; quiet?: boolean | undefined; only?: boolean | undefined } | null | undefined;
  onClose?: (() => void) | undefined;
  answered?: boolean | undefined;
}

/** A block of text to copy (a backup, a report) or to paste (an import). */
export interface TextSheet {
  title: string;
  help: string;
  text?: string | undefined;
  readonly?: boolean | undefined;
}

/** The picker as it is open: what it adds to or swaps, its search and muscle, and its title. */
export interface PickerSheet {
  mode: string;
  title: string;
  q?: string | undefined;
  m?: string | undefined;
  /** The day of the routine shown in Plan (addDay). */
  day?: number | undefined;
  /** The routine item swapped (swapItem). */
  uid?: string | undefined;
  /** The session's exercise swapped (swapBlock). */
  b?: number | undefined;
}

/** The picker, with the answer to "Every set is logged": move the sets to the new exercise, or add it after. */
export interface PickerModal extends SheetBase, PickerSheet {
  kind: 'picker';
  all?: 'move' | 'add' | undefined;
}

/** An exercise in the editor: the saved fields, and the number fields as typed, which Save reads (numIn). The kind,
    load, timed and assisted fields hold as typed (a select writes its option's value, '' or 'auto' for the
    default; a checkbox writes true or false). */
export interface ExEdit extends Omit<Exercise, 'kind' | 'load' | 'timed' | 'assist'> {
  kind?: Exercise['kind'] | '' | undefined;
  load?: Exercise['load'] | 'auto' | undefined;
  timed?: boolean | undefined;
  assist?: boolean | undefined;
  incRaw?: string | undefined;
  maxRaw?: string | undefined;
  barRaw?: string | undefined;
  bwfRaw?: string | undefined;
}

/** The editor sheet: new from the library or a picker, or a saved exercise. */
export interface ExEditSheet {
  isNew: boolean;
  e: ExEdit;
  /** The picker it was opened from, which Back returns to and Save adds to. */
  back?: PickerModal | null | undefined;
  /** More options opened or closed by hand. */
  moreOpen?: boolean | undefined;
}

/** What the recap after Finish shows: its lines, the PRs, a note, and the routine's update when the session changed the day. */
export interface RecapSheet {
  title: string;
  lines: readonly string[];
  prs?: readonly { name: string; what: string; was?: string | undefined }[] | undefined;
  note?: string | undefined;
  upd?: RoutineUpdate | null | undefined;
}

/** The account sheet's pages: sign in, create an account, a reset link, a new password, a message, waiting for the confirmation, and where the app is used. */
export type AcctMode = 'signin' | 'signup' | 'forgot' | 'newpw' | 'sent' | 'wait' | 'where';

/** The account sheet: its page, the fields as typed, its error and whether a request is out, the code field once a sign-in asks for it, a message page's words, and the sheet it goes back to. */
export interface AccountModal extends SheetBase {
  kind: 'account';
  mode: AcctMode;
  email?: string | undefined;
  pw?: string | undefined;
  code?: string | undefined;
  err?: string | undefined;
  busy?: boolean | undefined;
  needCode?: boolean | undefined;
  title?: string | undefined;
  msg?: string | undefined;
  /** A problem report it was opened from: signing in goes back to it, with what was typed (r55). */
  back?: FeedbackModal | undefined;
  /** Where do you use Ironlog? was answered (closing it unanswered signs this browser out). */
  answered?: boolean | undefined;
}

/** A problem report: its kind, the text and screenshot, where it was opened from, and the sending. */
export interface FeedbackModal extends SheetBase {
  kind: 'feedback';
  cat: string;
  msg: string;
  shot: string | null;
  from: string;
  ex?: string | null | undefined;
  crash?: boolean | undefined;
  sent?: boolean | undefined;
  copied?: boolean | undefined;
  busy?: boolean | undefined;
  err?: string | undefined;
}

/** One report in the owner's inbox, as the table returns it. */
export interface FbItem {
  id?: unknown;
  created_at?: string | null | undefined;
  category: string;
  message: string;
  reply_to?: string | null | undefined;
  context?: unknown;
  screenshot?: string | null | undefined;
  issue_url?: string | null | undefined;
}

/** The import sheet, before anything is read: the pasted text and what went wrong. */
export interface ImpInputModal extends SheetBase {
  kind: 'imp';
  step: 'input';
  text: string;
  err: string;
}

/** A table's rows and the column chosen for each field. */
export interface ImpTable {
  rows: string[][];
  map: ImpMap;
}

/** The import preview: what was read, the table it came from, each name's exercise (an id, or 'new') and a new one's guessed muscle and equipment, the unit, and the date for sessions with none. */
export interface ImpPreviewModal extends SheetBase {
  kind: 'imp';
  step: 'preview';
  res: ImpRead;
  tab: ImpTable | null;
  pick: Record<string, string>;
  guess: Record<string, { primary: string; equip: string; assist?: true | undefined }>;
  unit: 'kg' | 'lb';
  unitKnown: boolean;
  date: string;
  showAll: boolean;
}

/** Every sheet, by its kind. */
export type Modal =
  | AccountModal
  | FeedbackModal
  | ConfirmModal
  | PickerModal
  | ImpInputModal
  | ImpPreviewModal
  | (SheetBase & { kind: 'install'; how?: string | undefined })
  | (SheetBase & { kind: 'icon' | 'menu' | 'restwk' | 'injury' | 'routineNew' | 'cardio' | 'pickToday' | 'pickEx' })
  | (SheetBase & { kind: 'guide'; open?: string | undefined })
  | (SheetBase & { kind: 'calendar'; ym: string })
  | (SheetBase & { kind: 'past' | 'daypick'; date: string })
  | (SheetBase & { kind: 'fbInbox'; items: FbItem[] | null; err?: string | undefined })
  | (SheetBase & ExEditSheet & { kind: 'exEdit' })
  | (SheetBase & { kind: 'exhist' | 'exMus' | 'goal'; exId: string })
  | (SheetBase & { kind: 'bmenu'; b: number })
  | (SheetBase & RecapSheet & { kind: 'recap'; sid?: string | undefined })
  | (SheetBase & { kind: 'templates'; from?: string | undefined; imported?: boolean | undefined })
  | (SheetBase & { kind: 'inc'; exId: string; plan?: DraftBlock['plan'] | undefined; typed?: boolean | undefined })
  | (SheetBase & { kind: 'quick'; b: number; text?: string | undefined; err?: string | undefined })
  | (SheetBase & { kind: 'max'; exId: string; b?: number | undefined })
  | (SheetBase & {
      kind: 'cal';
      b: number;
      w?: string | undefined;
      at?: string | undefined;
      pred?: number | undefined;
      total?: string | undefined;
      err?: string | undefined;
    })
  | (SheetBase & {
      kind: 'short';
      mins?: number | null | undefined;
      temp?: string | undefined;
      applied?: boolean | undefined;
    })
  | (SheetBase & { kind: 'note'; bi: number; title: string; text?: string | undefined })
  | (SheetBase & { kind: 'startAlt'; di?: number | undefined; free?: boolean | undefined })
  | (SheetBase & { kind: 'eq'; day: number; equip: string[] })
  | (SheetBase & TextSheet & { kind: 'text' });

/** A sheet's kind. */
export type ModalKind = Modal['kind'];

/** The sheet of one kind. */
export type ModalOf<K extends ModalKind> = Extract<Modal, { kind: K }>;
