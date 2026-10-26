Drafts for PENDING 351 (normalize typed end to end), not built and not part of any release. norm_top.ts replaces
keepExtra, cleanCardio and cleanSess in src/app/normalize.ts (cleanCardio splits into cleanCardio and
cleanDraftCardio); norm_parts.ts adds cleanSettings, cleanExercise and cleanRoutine; norm_main.ts replaces
normalize() itself. Still to write: cleanDraft (the old in-place rebuild as one Object.assign in the same order,
with date included so the result is typed). Then update the callers (sync.ts norm, workfinish.ts and workout.ts
drop their casts), lower ARCHITECTURE.md's cast count, and prove the output unchanged (PENDING 354).
