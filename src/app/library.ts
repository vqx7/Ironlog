/* The reference data about exercises and the body: muscles and their weekly
   bands, joints, equipment, cardio and tape kinds, the exercise library, and
   the rules read from an exercise alone (its movement pattern, whether it is a
   compound lift, its load meaning, its share of bodyweight). Phase 2, r50;
   moved unchanged from the legacy script, tests/moved.js holds it to r49's
   code. Nothing here reads the log or the settings. */

import type { Exercise, LibRow, LoadMode, MuscleKey } from './types';

/* ---------- muscles ---------- */

/* Serratus anterior and the rotator cuff (the external rotators) joined in v5.
   Neither is covered by any other entry: the serratus protracts and upwardly
   rotates the shoulder blade, the cuff externally rotates and steadies the
   humerus. Both get most of their work indirectly (presses and push-ups,
   face pulls and rear-delt work), so their bands are small, like the neck's
   and tibialis'. No study sets a hypertrophy dose for either. */
/** Every muscle the app counts, in display order: key and name. */
export const MUSCLES: readonly (readonly [MuscleKey, string])[] = [['chest', 'Chest'], ['serratus', 'Serratus'], ['lats', 'Lats'], ['upperBack', 'Upper back'], ['traps', 'Traps'], ['lowerBack', 'Lower back'], ['frontDelts', 'Front delts'], ['sideDelts', 'Side delts'], ['rearDelts', 'Rear delts'], ['rotatorCuff', 'Rotator cuff'], ['biceps', 'Biceps'], ['triceps', 'Triceps'], ['forearms', 'Forearms'], ['abs', 'Abs'], ['obliques', 'Obliques'], ['neck', 'Neck'], ['quads', 'Quads'], ['hamstrings', 'Hamstrings'], ['glutes', 'Glutes'], ['adductors', 'Adductors'], ['abductors', 'Abductors'], ['calves', 'Calves'], ['tibialis', 'Tibialis']];

/** The muscle keys, in display order. */
export const MK = MUSCLES.map(m => m[0]);

/** A muscle's name by key. */
export const ML = Object.fromEntries(MUSCLES);

/** The muscles added in state schema v5: the migration adds them to saved
    library exercises whose library entry now lists them. */
export const NEW_MUSCLES_V5: readonly MuscleKey[] = ['serratus', 'rotatorCuff'];

/* Tracked only: sets are counted and shown, but these never read as under
   or over target, never drive advice, and are drawn in neutral grey. Their
   bands have no dose-response data behind them. Neck and tibialis joined in
   r29 (V): no ready-made routine trains them directly, and as targets they
   made every routine read as short. A convention, said so in the Guide. */
export const TRACK_ONLY: ReadonlySet<string> = new Set(['serratus', 'rotatorCuff', 'neck', 'tibialis']);

/** The default weekly hard-set band for each muscle, [minimum, maximum]
    (CLAUDE.md, Evidence base: 10 to 20 for the major muscles is typical, not
    a ceiling). The type requires a band for every muscle. */
export const BANDS: Readonly<Record<MuscleKey, readonly [number, number]>> = { chest: [10, 20], serratus: [2, 8], lats: [10, 20], upperBack: [10, 20], traps: [6, 16], lowerBack: [3, 10], frontDelts: [4, 12], sideDelts: [10, 20], rearDelts: [8, 16], rotatorCuff: [2, 8], biceps: [10, 20], triceps: [10, 20], forearms: [4, 12], abs: [6, 16], obliques: [3, 10], neck: [2, 10], quads: [10, 20], hamstrings: [10, 20], glutes: [8, 16], adductors: [4, 12], abductors: [4, 12], calves: [8, 16], tibialis: [2, 8] };

// Twenty-three spokes is unreadable on a phone, so the balance radar groups
// them into eight regions. Every muscle belongs to exactly one region; the
// serratus and rotator cuff sit with the shoulders because they move and
// steady the shoulder blade and joint.
export const REGIONS: readonly (readonly [string, readonly MuscleKey[]])[] = [
  ['Chest', ['chest']],
  ['Back', ['lats', 'upperBack', 'traps', 'lowerBack']],
  ['Shoulders', ['frontDelts', 'sideDelts', 'rearDelts', 'rotatorCuff', 'serratus']],
  ['Arms', ['biceps', 'triceps', 'forearms']],
  ['Core', ['abs', 'obliques', 'neck']],
  ['Quads', ['quads', 'adductors']],
  ['Posterior', ['hamstrings', 'glutes', 'abductors']],
  ['Calves', ['calves', 'tibialis']]
];

/* ---------- joints ---------- */

/* Joints (r30, from the review: only muscles could be flagged, so a sore
   knee or elbow had no flag). A joint flag marks the exercises that load it,
   by movement pattern and main muscle, the same way a muscle flag does:
   targets pause, loads cap at last time, 3 or more reps in reserve. Which
   exercises load which joint is a judgment, stated in the sheet. The muscle
   lists (weekly targets, Pick for me) are unchanged by a joint flag. */
export const JOINTS: readonly (readonly [string, string])[] = [['j_knee', 'Knee'], ['j_hip', 'Hip'], ['j_shoulder', 'Shoulder'], ['j_elbow', 'Elbow'], ['j_wrist', 'Wrist']];

/** The joint keys, and a joint's name by key. */
export const JK = JOINTS.map(j => j[0]);
export const JL = Object.fromEntries(JOINTS);

/** The name of an injury flag: a muscle's or a joint's, else the key itself. */
export const injLabel = (k: string): string => ML[k] || JL[k] || k;

/** The joints an exercise loads, by its movement pattern, main muscle and name. */
export function exJoints(e: Pick<Exercise, 'name' | 'primary' | 'equip'>): string[] {
  const p = patternOf(e), n = String(e.name || '').toLowerCase(), m = e.primary, out: string[] = [];
  if (p === 'squat' || m === 'quads' || /leg curl|nordic|lunge|step-up|split squat/.test(n)) out.push('j_knee');
  if (p === 'hinge' || p === 'squat' || ['glutes', 'adductors', 'abductors'].includes(m) || /thrust|bridge/.test(n)) out.push('j_hip');
  if (['press', 'fly', 'raise', 'vpull', 'pullover', 'rearfly'].includes(p as string) && !['quads', 'hamstrings', 'glutes', 'calves', 'abs', 'obliques'].includes(m) || ['chest', 'frontDelts', 'sideDelts', 'rearDelts', 'rotatorCuff'].includes(m) || /\bdips?\b|face pull|upright/.test(n)) out.push('j_shoulder');
  if ((['ext', 'vpull', 'row'].includes(p as string) || (p === 'curl' && m !== 'hamstrings')) && m !== 'quads' || ['biceps', 'triceps', 'forearms'].includes(m) || /\bdips?\b|close.grip|skull/.test(n)) out.push('j_elbow');
  if (m === 'forearms' || (p === 'curl' && m === 'biceps') || /push-up|front squat|\bdips?\b|wrist/.test(n) || (p === 'press' && ['barbell', 'dumbbell'].includes(e.equip))) out.push('j_wrist');
  return out;
}

/* ---------- equipment, cardio and the tape ---------- */

export const EQUIP: readonly (readonly [string, string])[] = [['barbell', 'Barbell'], ['dumbbell', 'Dumbbell'], ['cable', 'Cable'], ['machine', 'Machine'], ['smith', 'Smith machine'], ['landmine', 'Landmine'], ['bodyweight', 'Bodyweight'], ['other', 'Other']];
export const EQL = Object.fromEntries(EQUIP);

// Plate-loaded machines in the built-in library. Selectorized versions exist,
// so this is only the default; the exercise editor can change it.
export const PLATE_SIDE_IDS: readonly string[] = ['hackSquat', 'pendulum', 'legPress', 'legPressCalf', 'beltSquat', 'machHipThrust'];

/** Cardio and mobility kinds, and when they were done against the lifting. */
export const CARDIO: readonly (readonly [string, string])[] = [['walk', 'Treadmill walk'], ['incline', 'Incline walk'], ['elliptical', 'Elliptical'], ['bike', 'Bike'], ['stairs', 'Stair climber'], ['rower', 'Rower'], ['run', 'Run'], ['hiit', 'HIIT'], ['mobility', 'Mobility / stretching'], ['other', 'Other']];
export const CARDIOL = Object.fromEntries(CARDIO);
export const CWHEN: readonly (readonly [string, string])[] = [['pre', 'Before lifting'], ['post', 'After lifting'], ['solo', 'On its own']];
export const CWHENL = Object.fromEntries(CWHEN);

/** The tape measurements, key and name. */
export const MEAS: readonly (readonly [string, string])[] = [['arm', 'Arm'], ['forearm', 'Forearm'], ['chest', 'Chest'], ['waist', 'Waist'], ['thigh', 'Thigh'], ['calf', 'Calf'], ['neck', 'Neck']];

/* ---------- the exercise library ---------- */

// id, name, primary, secondary, equipment, flags (b = bodyweight plus added load, r = less common), note
// (also s = one side at a time, t = timed, a = assisted; the type checks that each row's main muscle
// is a muscle key, not the helper muscles, which are one string)
export const LIB: readonly LibRow[] = [
['bench','Barbell Bench Press','chest','frontDelts triceps','barbell','',''],
['pauseBench','Paused Bench Press','chest','frontDelts triceps','barbell','r','A full stop on the chest, as in a meet, then press.'],
['floorPress','Floor Press','chest','triceps frontDelts','barbell','r','Lying on the floor: the upper arms stop on it, so the range is shorter.'],
['incBench','Incline Barbell Bench Press','chest','frontDelts triceps','barbell','','Low incline (about 30°) keeps the chest as the prime mover.'],
['dbBench','DB Bench Press','chest','frontDelts triceps','dumbbell','',''],
['incDb','Incline DB Press','chest','frontDelts triceps','dumbbell','',''],
['smithInc','Smith Incline Press','chest','frontDelts triceps','smith','',''],
['machPress','Machine Chest Press','chest','frontDelts triceps','machine','',''],
['dips','Dips (chest lean)','chest','triceps frontDelts','bodyweight','b','Log added load only. Bodyweight is added automatically for trends.'],
['pecDeck','Pec Deck Fly','chest','frontDelts','machine','',''],
['cableFly','Cable Fly','chest','frontDelts','cable','',''],
['lowHighFly','Low-to-High Cable Fly','chest','frontDelts','cable','r','Arcs upward from hip height. Biases the upper (clavicular) chest.'],
['highLowFly','High-to-Low Cable Fly','chest','','cable','r','Arcs downward. Biases the lower (sternal) chest.'],
['dbFly','DB Fly','chest','frontDelts','dumbbell','',''],
['pushup','Push-up','chest','triceps frontDelts serratus','bodyweight','b',''],
['deficitPushup','Deficit Push-up','chest','triceps frontDelts serratus','bodyweight','br','Hands on handles or plates so the chest drops below hand level.'],
['declinePushup','Decline Push-up (feet raised)','chest','frontDelts triceps serratus','bodyweight','b','Feet on a bench: about 70% of bodyweight, against 64% for a floor push-up (Ebben 2011).'],
['pullup','Pull-up','lats','biceps upperBack','bodyweight','b','Log added load only. Bodyweight is added automatically for trends.'],
['chinup','Chin-up','lats','biceps upperBack','bodyweight','b',''],
['assistPullup','Assisted Pull-up (machine)','lats','biceps upperBack','machine','ba','Type the help the machine gives. Less help is progress.'],
['assistDip','Assisted Dip (machine)','chest','triceps frontDelts','machine','ba','Type the help the machine gives. Less help is progress.'],
['latPulldown','Lat Pulldown','lats','biceps upperBack','cable','',''],
['singlePulldown','Single-Arm Cable Pulldown','lats','biceps','cable','rs','Kneeling. Drive the elbow toward the hip with a long stretch at the top.'],
['straightArm','Straight-Arm Cable Pulldown','lats','','cable','',''],
['dbPullover','DB Pullover','lats','chest serratus','dumbbell','',''],
['landmineRow','Landmine T-Bar Row','upperBack','lats biceps rearDelts','landmine','',''],
['meadowsRow','Meadows Row','lats','upperBack biceps rearDelts','landmine','rs','Single-arm landmine row from a staggered stance. Big stretch.'],
['cableRow','Seated Cable Row','upperBack','lats biceps rearDelts','cable','',''],
['bbRow','Barbell Row','upperBack','lats biceps rearDelts lowerBack','barbell','',''],
['dbRow','One-Arm DB Row','lats','upperBack biceps','dumbbell','s',''],
['krocRow','Kroc Row','lats','upperBack biceps forearms','dumbbell','rs','Heavy, high-rep one-arm DB row with controlled body english. Trains grip hard.'],
['sealRow','Seal Row','upperBack','lats rearDelts biceps','barbell','r','Face down on a raised bench. Takes the lower back out of rowing.'],
['machRow','Chest-Supported Machine Row','upperBack','lats biceps rearDelts','machine','',''],
['invertedRow','Inverted Row','upperBack','lats biceps','bodyweight','b',''],
['rackPull','Rack Pull','upperBack','traps lowerBack glutes forearms','barbell','',''],
['kelsoShrug','Kelso Shrug','upperBack','traps','other','r','Chest-supported. Pinch the shoulder blades together without bending the arms. Mid traps and rhomboids.'],
['bbShrug','Barbell Shrug','traps','forearms','barbell','',''],
['dbShrug','DB Shrug','traps','forearms','dumbbell','',''],
['hyperext','45° Hyperextension','lowerBack','glutes hamstrings','bodyweight','b','Rounding the upper back slightly shifts work toward the glutes.'],
['reverseHyper','Reverse Hyperextension','glutes','lowerBack hamstrings','machine','r','Torso fixed, legs swing up. Hip extension with low spinal compression.'],
['goodMorning','Good Morning','hamstrings','lowerBack glutes','barbell','',''],
['seatedDbPress','Seated DB Shoulder Press','frontDelts','sideDelts triceps serratus','dumbbell','',''],
['ohp','Standing Overhead Press','frontDelts','sideDelts triceps serratus','barbell','',''],
['machShoulder','Machine Shoulder Press','frontDelts','sideDelts triceps serratus','machine','',''],
['landminePress','Half-Kneeling Landmine Press','frontDelts','chest triceps serratus','landmine','rs','Arced pressing path that many cranky shoulders tolerate well.'],
['zPress','Z Press','frontDelts','sideDelts triceps abs serratus','barbell','r','Seated on the floor, legs straight, no back support. Exposes core and upper-back weak links.'],
['dbLateral','DB Lateral Raise','sideDelts','','dumbbell','',''],
['cableLateral','Cable Lateral Raise','sideDelts','','cable','',''],
['leanAwayLat','Lean-Away Lateral Raise','sideDelts','','dumbbell','rs','Hold a post and lean away. Loads the bottom range that standard raises miss.'],
['machLateral','Machine Lateral Raise','sideDelts','','machine','',''],
['cableY','Cable Y-Raise','sideDelts','traps','cable','r','Arms travel up and out in a Y. Side delts plus lower traps.'],
['luRaise','Lu Raise','sideDelts','frontDelts traps serratus','dumbbell','r','Light plates or DBs raised to overhead with straight arms.'],
['uprightRow','Wide-Grip Cable Upright Row','sideDelts','traps','cable','',''],
['reversePecDeck','Reverse Pec Deck','rearDelts','upperBack rotatorCuff','machine','',''],
['facePull','Face Pull','rearDelts','upperBack traps rotatorCuff','cable','',''],
['cableRearFly','Cross-Body Cable Rear Delt Fly','rearDelts','upperBack rotatorCuff','cable','s',''],
['ohCableExt','Overhead Cable Triceps Extension','triceps','','cable','','Long head at long length. Grew the triceps more than pushdowns in a 2023 study (Maeo et al.).'],
['pressdown','Triceps Pressdown','triceps','','cable','',''],
['skull','EZ-Bar Skull Crusher','triceps','','barbell','',''],
['jmPress','JM Press','triceps','chest','barbell','r','Hybrid of close-grip bench and skull crusher. The Smith version is easier to learn.'],
['cgBench','Close-Grip Bench Press','triceps','chest frontDelts','barbell','',''],
['katana','Katana Triceps Extension','triceps','','cable','rs','Single arm from a low cable, extending overhead across the body.'],
['tatePress','Tate Press','triceps','','dumbbell','r','Elbows flare out as the DBs lower toward the chest.'],
['triDips','Dips (upright, triceps focus)','triceps','chest frontDelts','bodyweight','b',''],
['inclineCurl','Incline DB Curl','biceps','','dumbbell','','Shoulder extended, so the long head works at long length.'],
['bayesianCurl','Bayesian Cable Curl','biceps','','cable','r','Face away from a low cable with the arm behind the torso. Tension at long length.'],
['preacher','Preacher Curl','biceps','','machine','',''],
['spiderCurl','Spider Curl','biceps','','dumbbell','r','Chest on an incline bench, arms hanging. Tension at short length.'],
['bbCurl','Barbell Curl','biceps','forearms','barbell','',''],
['cableCurl','Cable Curl','biceps','','cable','',''],
['hammer','Hammer Curl','biceps','forearms','dumbbell','',''],
['dragCurl','Drag Curl','biceps','','barbell','r','The bar stays against the torso while the elbows travel back.'],
['zottman','Zottman Curl','biceps','forearms','dumbbell','r','Palms up on the way up, palms down on the way down.'],
['reverseCurl','Reverse EZ Curl','forearms','biceps','barbell','',''],
['wristCurl','Wrist Curl','forearms','','barbell','',''],
['revWristCurl','Reverse Wrist Curl','forearms','','barbell','',''],
['wristRoller','Wrist Roller','forearms','','other','r','Log one full roll up and down as one rep.'],
['cableCrunch','Cable Crunch','abs','','cable','',''],
['hangingLegRaise','Hanging Leg Raise','abs','','bodyweight','b','Curl the pelvis up. Swinging the legs only trains the hip flexors.'],
['abWheel','Ab Wheel Rollout','abs','lats','bodyweight','b',''],
['dragonFlag','Dragon Flag','abs','','bodyweight','br','Lower slowly as one rigid unit. Use negatives until full reps are possible.'],
['declineCrunch','Weighted Decline Crunch','abs','','other','',''],
['woodchop','Cable Woodchop','obliques','abs','cable','s','Log reps per side.'],
['pallof','Pallof Press','obliques','abs','cable','rs','Anti-rotation press. Log reps per side.'],
['sideBend','DB Side Bend','obliques','','dumbbell','s',''],
['neckCurl','Neck Flexion (plate or harness)','neck','','other','r','Start light and progress slowly.'],
['neckExt','Neck Extension (harness)','neck','traps','other','r','Start light and progress slowly.'],
['neckBridge','Neck Bridge','neck','','bodyweight','br','Controlled range. Build tolerance gradually.'],
['hackSquat','Hack Squat','quads','glutes adductors','machine','',''],
['pendulum','Pendulum Squat','quads','glutes adductors','machine','',''],
['legPress','Leg Press','quads','glutes adductors','machine','',''],
['beltSquat','Belt Squat','quads','glutes adductors','machine','r','Loads the legs with no spinal compression.'],
['backSquat','Barbell Back Squat','quads','glutes adductors lowerBack','barbell','',''],
['pauseSquat','Pause Squat','quads','glutes adductors lowerBack','barbell','r','A full stop of about 2 seconds at the bottom, then up.'],
['frontSquat','Front Squat','quads','glutes adductors','barbell','',''],
['smithSquat','Smith Squat','quads','glutes adductors','smith','',''],
['bss','Bulgarian Split Squat','quads','glutes adductors','dumbbell','s',''],
['walkingLunge','Walking Lunge','quads','glutes adductors','dumbbell','',''],
['legExt','Leg Extension','quads','','machine','',''],
['sissy','Sissy Squat','quads','','bodyweight','br','Knees travel forward while the hips stay extended. Rectus femoris at long length.'],
['revNordic','Reverse Nordic','quads','','bodyweight','br','Kneeling lean-back. Start with a short range.'],
['cossack','Cossack Squat','adductors','quads glutes','other','rs','Deep side-to-side squat. Adductors at long length.'],
['adductor','Hip Adductor Machine','adductors','','machine','',''],
['abductor','Hip Abductor Machine','abductors','glutes','machine','',''],
['sldl','Stiff-Leg Deadlift','hamstrings','glutes lowerBack','barbell','',''],
['rdl','Romanian Deadlift','hamstrings','glutes lowerBack','barbell','',''],
['dbRdl','DB Romanian Deadlift','hamstrings','glutes lowerBack','dumbbell','',''],
['deadlift','Conventional Deadlift','glutes','hamstrings lowerBack quads traps forearms','barbell','',''],
['sumoDl','Sumo Deadlift','glutes','quads adductors hamstrings lowerBack traps forearms','barbell','','Wide stance, hands inside the knees.'],
['powerClean','Power Clean','glutes','hamstrings quads traps upperBack','barbell','r','The bar from the floor to the shoulders in one fast pull. Add load only while the bar stays fast.'],
['kbSwing','Kettlebell Swing','glutes','hamstrings lowerBack','other','','A hip snap, not a squat: the arms only guide the bell. Enter the bell\'s weight.'],
['seatedCurl','Seated Leg Curl','hamstrings','','machine','','Grew the hamstrings more than lying curls in a 2021 study (Maeo et al.).'],
['lyingCurl','Lying Leg Curl','hamstrings','','machine','',''],
['nordic','Nordic Hamstring Curl','hamstrings','','bodyweight','br','Very demanding eccentric. Use a band or partial range until full reps are possible.'],
['ghr','Glute-Ham Raise','hamstrings','glutes','bodyweight','br',''],
['hipThrust','Barbell Hip Thrust','glutes','hamstrings','barbell','',''],
['pullThrough','Cable Pull-Through','glutes','hamstrings','cable','r','Hip hinge facing away from a low cable.'],
['kickback','Cable Glute Kickback','glutes','','cable','s',''],
['standCalf','Standing Calf Raise','calves','','machine','','Full stretch at the bottom with a pause.'],
['seatedCalf','Seated Calf Raise','calves','','machine','','Bent knee shifts the work to the soleus.'],
['legPressCalf','Leg Press Calf Raise','calves','','machine','',''],
['tibRaise','Tibialis Raise','tibialis','','other','r','Back against a wall, heels down, raise the toes. The shin muscle is rarely trained.'],
// v5 additions. The first library leaned on less common, evidence-flagged
// variations and left out staples, the plain dumbbell curl among them. These
// fill every muscle's everyday options, plus direct work for the two new
// muscles.
['dbCurl','DB Curl','biceps','forearms','dumbbell','','Standing or seated, both arms or alternating.'],
['ezCurl','EZ-Bar Curl','biceps','forearms','barbell','','The angled grip is easier on the wrists than a straight bar.'],
['concCurl','Concentration Curl','biceps','','dumbbell','s',''],
['machCurl','Machine Biceps Curl','biceps','','machine','',''],
['declineBench','Decline Barbell Bench Press','chest','triceps frontDelts','barbell','','Biases the lower (sternal) chest.'],
['smithBench','Smith Machine Bench Press','chest','frontDelts triceps','smith','',''],
['incMachPress','Incline Machine Press','chest','frontDelts triceps','machine','',''],
['incDbFly','Incline DB Fly','chest','frontDelts','dumbbell','','Upper chest at a long length.'],
['ngPulldown','Close-Grip Neutral Pulldown','lats','biceps upperBack','cable','',''],
['machHighRow','Machine High Row','lats','upperBack biceps','machine','',''],
['machPullover','Machine Pullover','lats','','machine','r','Lats through a full arc with no biceps limit.'],
['csDbRow','Chest-Supported DB Row','upperBack','lats rearDelts biceps','dumbbell','','Face down on an incline bench, so the lower back stays out of it.'],
['pendlayRow','Pendlay Row','upperBack','lats biceps rearDelts lowerBack','barbell','r','Each rep starts dead on the floor.'],
['trapBarDl','Trap Bar Deadlift','glutes','quads hamstrings lowerBack traps forearms','barbell','','More upright and easier on the lower back than a straight bar.'],
['arnold','Arnold Press','frontDelts','sideDelts triceps serratus','dumbbell','',''],
['smithOhp','Smith Machine Shoulder Press','frontDelts','sideDelts triceps serratus','smith','',''],
['dbFrontRaise','DB Front Raise','frontDelts','','dumbbell','',''],
['cableFrontRaise','Cable Front Raise','frontDelts','','cable','',''],
['dbRearFly','Bent-Over DB Rear Delt Fly','rearDelts','upperBack rotatorCuff','dumbbell','',''],
['ohDbExt','Overhead DB Triceps Extension','triceps','','dumbbell','','One dumbbell, both hands. Long head at a long length.'],
['ropePressdown','Rope Triceps Pressdown','triceps','','cable','',''],
['triKickback','Triceps Kickback','triceps','','cable','s','Cable keeps tension at lockout; a dumbbell works too.'],
['machDip','Seated Dip Machine','triceps','chest frontDelts','machine','',''],
['machCrunch','Machine Crunch','abs','','machine','',''],
['kneeRaise',"Captain's Chair Knee Raise",'abs','','bodyweight','b','Curl the pelvis up at the top, not just the knees.'],
['reverseCrunch','Reverse Crunch','abs','','bodyweight','b',''],
['crunch','Crunch','abs','','bodyweight','b',''],
['russianTwist','Russian Twist','obliques','abs','bodyweight','b','Log reps per side or total, the same way each time.'],
['neckLat','Neck Lateral Flexion (plate or band)','neck','','other','rs','Start light and progress slowly.'],
['neckMachine','4-Way Neck Machine','neck','traps','machine','r','Start light. Note which direction in the exercise note.'],
['goblet','Goblet Squat','quads','glutes adductors','dumbbell','',''],
['revLunge','Reverse Lunge','quads','glutes adductors','dumbbell','s','Stepping back is easier on the knees than a forward lunge.'],
['stepUp','Step-Up','quads','glutes','dumbbell','s',''],
['standCurl','Standing Single-Leg Curl','hamstrings','','machine','s',''],
['slRdl','Single-Leg RDL','hamstrings','glutes','dumbbell','rs',''],
['gluteBridge','Barbell Glute Bridge','glutes','hamstrings','barbell','',''],
['machHipThrust','Machine Hip Thrust','glutes','hamstrings','machine','',''],
['cableAbduction','Cable Hip Abduction','abductors','glutes','cable','s',''],
['slCalf','Single-Leg DB Calf Raise','calves','','dumbbell','s','Full stretch at the bottom with a pause.'],
['donkeyCalf','Donkey Calf Raise','calves','','machine','r','Hips bent, so the calves work at a longer length.'],
['pushupPlus','Push-up Plus','serratus','chest triceps','bodyweight','b','At the top, keep pushing the floor away so the shoulder blades wrap forward.'],
['serratusPunch','Cable Serratus Punch','serratus','','cable','rs','Arm straight. Reach forward past lockout by moving only the shoulder blade.'],
['cableER','Cable External Rotation','rotatorCuff','','cable','s','Elbow at your side, forearm rotates out. Light and slow.'],
['sideLyingER','Side-Lying DB External Rotation','rotatorCuff','rearDelts','dumbbell','s','Light and slow; stop well short of any pinch.'],
['platePinch','Plate Pinch Hold','forearms','','other','rt','Timed: pinch plates smooth side out. Log seconds and the total plate weight.'],
['copenhagen','Copenhagen Plank','adductors','obliques','bodyweight','brts','Timed side plank with the top leg on a bench, per side. Start with the knee on the bench.'],
// Timed holds (flag t): the reps column holds seconds. No e1RM is estimated from them.
['plank','Plank','abs','obliques','bodyweight','bt','Timed hold: log seconds. Add a plate on your back once the top of the range is easy.'],
['sidePlank','Side Plank','obliques','abs','bodyweight','bts','Timed hold, per side: log seconds.'],
['deadHang','Dead Hang','forearms','lats','bodyweight','bt','Timed hang from a bar: log seconds. Builds grip endurance.'],
['neckBridgeHold','Neck Bridge Hold','neck','','bodyweight','brt','Timed isometric: log seconds. Build tolerance gradually.'],
['wallSit','Wall Sit','quads','','bodyweight','brt','Timed hold with thighs parallel: log seconds.'],
['farmerHold','Farmer Carry or Hold','forearms','traps upperBack','dumbbell','rt','Timed: log seconds and the load in each hand.'],
];

/* Most common (r33, V: 53 marked Common was too many to help). The lifts
   in the top 25 of logged sets, overall or for men or women, in StrengthLog's
   data from over 700,000 users (2025): measured, not picked. Shown as a Most
   common tag, first in the exercise picker, and a filter in the library.
   Nothing stored: it follows the library id, and an exercise someone marks
   as less common is not called most common. */
export const COMMON: ReadonlySet<string> = new Set(['bench', 'backSquat', 'deadlift', 'latPulldown', 'ohp', 'bbRow', 'dbLateral', 'legExt', 'legPress', 'bbCurl', 'pressdown', 'incDb', 'dbCurl', 'pullup', 'cableRow', 'ropePressdown', 'lyingCurl', 'dbRow', 'seatedDbPress', 'rdl', 'seatedCurl', 'hammer', 'cableFly', 'dbBench', 'facePull', 'cgBench', 'hipThrust', 'bss', 'sldl', 'abductor']);

export const isCommon = (e: Pick<Exercise, 'id' | 'custom' | 'rare'> | null | undefined): boolean => !!e && !e.custom && !e.rare && COMMON.has(e.id);

/** The library as exercise records, fresh objects on every call. */
export function libExercises(): Exercise[] {
  return LIB.map(([id, name, primary, sec, equip, flags, note]) => { const o: Exercise = { id, name, primary, secondary: sec ? sec.split(' ') : [], equip, bw: flags.includes('b'), rare: flags.includes('r'), perSide: flags.includes('s'), note, custom: false, archived: false }; if (flags.includes('t')) o.timed = true; if (flags.includes('a')) o.assist = true; return o; });
}

/* ---------- what an exercise is ---------- */

/* Movement pattern from the name, so a fly is replaced by a fly rather than a
   press that happens to share helper muscles. Checked in order. */
export const PATTERNS: readonly (readonly [string, RegExp])[] = [['calf', /calf raise/], ['hinge', /hyperextension/], ['squat', /leg press|hack squat|pendulum/], ['rearfly', /rear delt|reverse pec/], ['pullover', /pullover/], ['fly', /\bfly|flye|pec deck/], ['ext', /pressdown|extension|kickback|skull|tate press|jm press/], ['vpull', /pulldown|pull-up|chin-up|high row/], ['row', /\brow\b/], ['curl', /curl/], ['press', /press|push-up|\bdips?\b|bench/], ['squat', /squat|lunge|step-up/], ['hinge', /deadlift|rdl|rack pull|good morning|pull-through|hip thrust|bridge|hyperextension|power clean|swing/], ['raise', /raise/], ['core', /crunch|rollout|dragon|plank|twist/], ['shrug', /shrug/]];

export function patternOf(e: { name?: string } | null | undefined): string | null {
  const n = String(e && e.name || '').toLowerCase();
  for (const [k, re] of PATTERNS) if (re.test(n)) return k;
  return null;
}

/* Compound: a press, row, pull, squat or hinge for a main muscle. Used to
   split RIR calibration, size load steps, spot warm-ups and budget time. */
export const NON_COMPOUND_PRIMARY: ReadonlySet<string> = new Set(['abs', 'obliques', 'neck', 'forearms', 'serratus', 'rotatorCuff', 'calves', 'tibialis']);

type Kinded = Pick<Exercise, 'name' | 'primary' | 'timed' | 'kind'>;

/* A custom exercise's name may not say what it is ("Hammer Strength Chest"),
   so the editor can set it (ex.kind, r27): compound or isolation; absent
   reads it from the name as before. */
export function autoCompound(ex: Kinded | null | undefined): boolean {
  return !!ex && !ex.timed && !NON_COMPOUND_PRIMARY.has(ex.primary) && ['press', 'row', 'vpull', 'squat', 'hinge'].includes(patternOf(ex) as string);
}

export function isCompound(ex: Kinded | null | undefined): boolean {
  if (ex && ex.kind === 'compound') return !ex.timed;
  if (ex && ex.kind === 'iso') return false;
  return autoCompound(ex);
}

/* Bodyweight lifts that turn about a joint (leg raises, crunches, Nordics,
   sissy squats): the share of bodyweight is kept for display, but torque, not
   mass moved, sets how hard they are, so they get no 1RM estimate and no
   tonnage. Progress on them reads from reps and added load. */
export const NO_E1: ReadonlySet<string> = new Set(['hangingLegRaise', 'kneeRaise', 'reverseCrunch', 'crunch', 'dragonFlag', 'abWheel', 'russianTwist', 'neckBridge', 'nordic', 'ghr', 'revNordic', 'sissy']);

export const noE1 = (ex: Pick<Exercise, 'id' | 'timed'> | null | undefined): boolean => !!ex && (!!ex.timed || NO_E1.has(ex.id));

/* Lifts that add recovery time: heavy lengthened hamstring and hinge work,
   walking lunges (Pareja-Blanco 2020; eccentric-heavy damage). */
export const SLOW_RECOVERY: ReadonlySet<string> = new Set(['deadlift', 'sumoDl', 'trapBarDl', 'rdl', 'sldl', 'dbRdl', 'slRdl', 'goodMorning', 'nordic', 'ghr', 'walkingLunge']);

/* Share of bodyweight an exercise actually moves. Only push-ups are measured
   (force plates, Ebben 2011: 64% on the floor, about 70% feet on a 30 cm
   box). A deficit adds depth, not load, so it stays at 64%. Pull-ups and dips
   use the whole body (the hands and forearms barely move; about 95% by
   segment tables). The rest are estimates from segment masses (de Leva 1996)
   and are editable per exercise. Only a user edit is stored. */
export const BWF: Readonly<Record<string, number>> = { assistPullup: 1, assistDip: 1, pullup: 1, chinup: 1, dips: 1, triDips: 1, pushup: .64, deficitPushup: .64, declinePushup: .7, invertedRow: .6, hyperext: .6, hangingLegRaise: .35, abWheel: .5, dragonFlag: .7, neckBridge: .3, sissy: .85, revNordic: .85, nordic: .85, ghr: .85, plank: .65, sidePlank: .6, deadHang: 1, neckBridgeHold: .3, wallSit: .7, pushupPlus: .64, kneeRaise: .3, reverseCrunch: .3, crunch: .3, russianTwist: .4, copenhagen: .5 };

/** The share of bodyweight an exercise moves: the lifter's own figure, else
    the table's, else all of it. */
export function bwShare(ex: Pick<Exercise, 'id' | 'bwf'> | null | undefined): number {
  return ex && ex.bwf != null ? ex.bwf : (ex && BWF[ex.id] != null ? (BWF[ex.id] as number) : 1);
}

/** Dumbbell lifts done with one dumbbell, so the number typed is the total. */
export const ONE_DB: ReadonlySet<string> = new Set(['dbRow', 'krocRow', 'dbPullover', 'ohDbExt', 'concCurl', 'sideBend', 'goblet', 'slCalf', 'leanAwayLat', 'sideLyingER', 'slRdl']);

/** What the load number on an exercise means: per dumbbell, the total on the
    implement, plates on one side, a stack setting, or bodyweight plus added
    load. A bodyweight lift is always the last; otherwise the lifter's choice
    (ex.load) wins, and without one it follows the equipment. */
export function loadMode(ex: Pick<Exercise, 'id' | 'bw' | 'load' | 'equip'> | null | undefined): LoadMode {
  if (!ex) return 'total';
  if (ex.bw) return 'bw';
  if ((['each', 'total', 'side', 'stack'] as (string | undefined)[]).includes(ex.load)) return ex.load as LoadMode;
  if (ex.equip === 'dumbbell') return ONE_DB.has(ex.id) ? 'total' : 'each';
  if (ex.equip === 'cable' || (ex.equip === 'machine' && !PLATE_SIDE_IDS.includes(ex.id))) return 'stack';
  return 'total';
}

// One leg or arm at a time, by name: a lunge is not a squat at 90% of its load.
// (Read by the engine's kinOf: a close variation's first session, r32.1.)
export const KIN_UNI = /lunge|split squat|step-up|single[- ]|one[- ]arm|1-arm|pistol|bulgarian|cossack|unilateral/i;

/** The spacings dumbbell and kettlebell racks come in, per unit, largest
    first (r32). The engine's rackStep picks the largest one every load logged
    on a lift fits. */
export const RACK: Readonly<Record<'dumbbell' | 'kettlebell', { readonly kg: readonly number[]; readonly lb: readonly number[] }>> = { dumbbell: { kg: [2.5, 2, 1, 0.5], lb: [5, 2.5, 1] }, kettlebell: { kg: [4, 2, 1], lb: [5, 2.5] } };

// The library files kettlebell lifts under Other equipment, so they are found by name.
export function rackKind(ex: Pick<Exercise, 'equip'> & { name?: string }): 'dumbbell' | 'kettlebell' | null {
  return ex.equip === 'dumbbell' ? 'dumbbell' : ex.equip === 'kettlebell' || /kettlebell/i.test(ex.name || '') ? 'kettlebell' : null;
}

/* Two-joint muscles trained at a long length. Trials in untrained people:
   seated over lying leg curls (Maeo 2021), overhead over pushdown triceps work
   (Maeo 2023), standing over seated calf raises for the gastrocnemius
   (Kinoshita 2023). Incline and Bayesian curls rest on mechanics only. A small
   tie-breaking nudge, never more. */
/** The lifts with a trial behind the long-length bonus. */
export const LONG_TRIAL: ReadonlySet<string> = new Set(['seatedCurl', 'ohCableExt', 'ohDbExt', 'standCalf']);
/** Those, and the lifts that get it from mechanics alone. */
export const LONG_IDS: ReadonlySet<string> = new Set([...LONG_TRIAL, 'katana', 'inclineCurl', 'bayesianCurl', 'rdl', 'sldl', 'dbRdl', 'slRdl', 'donkeyCalf', 'sissy']);

/* Exercises most people cannot do for sets of 8 to 15 when they start (r30,
   from the review: a seated leg curl became Nordic curls for 3 x 10-15, and
   a lat pulldown became pull-ups). A judgment, not a measurement. */
export const HARD_EX: ReadonlySet<string> = new Set(['nordic', 'revNordic', 'ghr', 'sissy', 'dragonFlag', 'pullup', 'chinup', 'dips', 'triDips', 'hangingLegRaise']);

/* The heavy compounds a Strength or Both goal moves: barbell, Smith and
   machine compounds with a strength estimate, as the copy says (the r44
   review: `estInLoad` took goblet squats and single-dumbbell rows and left
   out selectorized machine presses and rows). */
export const PROF_EQUIP: ReadonlySet<string> = new Set(['barbell', 'smith', 'machine']);
// Hip and back accessories on a bar or a machine, not lifts trained heavy for strength (a judgment, the r44 review).
export const PROF_NOT_HEAVY: ReadonlySet<string> = new Set(['reverseHyper', 'goodMorning', 'gluteBridge']);

export function profHeavy(ex: Pick<Exercise, 'id' | 'name' | 'primary' | 'equip' | 'bw' | 'timed' | 'kind'> | null | undefined): boolean {
  return !!ex && !ex.timed && !ex.bw && isCompound(ex) && !noE1(ex) && PROF_EQUIP.has(ex.equip) && !PROF_NOT_HEAVY.has(ex.id);
}
