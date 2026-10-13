/* ---------- reference data ---------- */
/* Serratus anterior and the rotator cuff (the external rotators) joined in v5.
   Neither is covered by any other entry: the serratus protracts and upwardly
   rotates the shoulder blade, the cuff externally rotates and steadies the
   humerus. Both get most of their work indirectly (presses and push-ups,
   face pulls and rear-delt work), so their bands are small, like the neck's
   and tibialis'. No study sets a hypertrophy dose for either. */
const MUSCLES=[['chest','Chest'],['serratus','Serratus'],['lats','Lats'],['upperBack','Upper back'],['traps','Traps'],['lowerBack','Lower back'],['frontDelts','Front delts'],['sideDelts','Side delts'],['rearDelts','Rear delts'],['rotatorCuff','Rotator cuff'],['biceps','Biceps'],['triceps','Triceps'],['forearms','Forearms'],['abs','Abs'],['obliques','Obliques'],['neck','Neck'],['quads','Quads'],['hamstrings','Hamstrings'],['glutes','Glutes'],['adductors','Adductors'],['abductors','Abductors'],['calves','Calves'],['tibialis','Tibialis']];
const MK=MUSCLES.map(m=>m[0]);
const ML=Object.fromEntries(MUSCLES);
const NEW_MUSCLES_V5=['serratus','rotatorCuff'];
/* Tracked only: sets are counted and shown, but these never read as under
   or over target, never drive advice, and are drawn in neutral grey. Their
   bands have no dose-response data behind them. Neck and tibialis joined in
   r29 (V): no ready-made routine trains them directly, and as targets they
   made every routine read as short. A convention, said so in the Guide. */
const TRACK_ONLY=new Set(['serratus','rotatorCuff','neck','tibialis']);
const BANDS={chest:[10,20],serratus:[2,8],lats:[10,20],upperBack:[10,20],traps:[6,16],lowerBack:[3,10],frontDelts:[4,12],sideDelts:[10,20],rearDelts:[8,16],rotatorCuff:[2,8],biceps:[10,20],triceps:[10,20],forearms:[4,12],abs:[6,16],obliques:[3,10],neck:[2,10],quads:[10,20],hamstrings:[10,20],glutes:[8,16],adductors:[4,12],abductors:[4,12],calves:[8,16],tibialis:[2,8]};
/* The profile (r44): its choices, read by normalize while the save loads. */
const PROF_GOALS=[['size','Size'],['strength','Strength'],['both','Both']];
const PROF_EXP=[['new','Under 1'],['mid','1 to 3'],['adv','Over 3']];
const PROF_DAYS=[2,3,4,5,6];
const FOCUS_MAX=2;
/* Focus muscles (item 43): weekly targets about 30% higher, the other major
   muscles at maintenance, a third of the usual minimum. More weekly sets
   grow a muscle more (Pelland 2025, the dose-response meta-regression the
   targets rest on); 30% is a convention, not a measured dose. Size and
   strength were kept for months on a third of the volume when load stayed
   up (Bickel 2011; Spiering 2021 review). */
const FOCUS_UP=1.3,MAINT_SHARE=1/3;
const EQUIP=[['barbell','Barbell'],['dumbbell','Dumbbell'],['cable','Cable'],['machine','Machine'],['smith','Smith machine'],['landmine','Landmine'],['bodyweight','Bodyweight'],['other','Other']];
// Twenty-three spokes is unreadable on a phone, so the balance radar groups
// them into eight regions. Every muscle belongs to exactly one region; the
// serratus and rotator cuff sit with the shoulders because they move and
// steady the shoulder blade and joint.
const REGIONS=[
  ['Chest',['chest']],
  ['Back',['lats','upperBack','traps','lowerBack']],
  ['Shoulders',['frontDelts','sideDelts','rearDelts','rotatorCuff','serratus']],
  ['Arms',['biceps','triceps','forearms']],
  ['Core',['abs','obliques','neck']],
  ['Quads',['quads','adductors']],
  ['Posterior',['hamstrings','glutes','abductors']],
  ['Calves',['calves','tibialis']]
];
const EQL=Object.fromEntries(EQUIP);
// Dashboard sections, in display order. Keys are what the jump strip targets.
const DSECS=[['volume','Volume'],['exercise','Lifts'],['weak','Muscles'],['consistency','Consistency'],['body','Body']];
const DSEC_KEYS=DSECS.map(x=>x[0]);
const SEC_TABS=['today','program','dash','history','settings'];
// Legacy: older builds saved folds here. Kept only so old saves normalize; unused.
const DSEC_FOLDED=['consistency','body'];
// Old section keys still arrive from tiles, summary rows and the coach. They
// land on the section that absorbed them, opening the matching fold inside it.
const DSEC_ALIAS={stalls:'exercise',prs:'exercise',bests:'exercise',rank:'weak',svol:'volume'};
const CARDIO=[['walk','Treadmill walk'],['incline','Incline walk'],['elliptical','Elliptical'],['bike','Bike'],['stairs','Stair climber'],['rower','Rower'],['run','Run'],['hiit','HIIT'],['mobility','Mobility / stretching'],['other','Other']];
const CARDIOL=Object.fromEntries(CARDIO);
const CWHEN=[['pre','Before lifting'],['post','After lifting'],['solo','On its own']];
const CWHENL=Object.fromEntries(CWHEN);
/* Deleted sessions, cardio entries and routines are kept for 30 days so a
   mistaken delete can be restored after the tab is closed. Their ids also act
   as tombstones: a second device that still holds a deleted session cannot
   merge it back in while the entry is here. Capped so the core cloud document
   never approaches its size limit. */
const TRASH_DAYS=30,TRASH_MAX=20,TRASH_BYTES=60000;
// Plate-loaded machines in the built-in library. Selectorized versions exist,
// so this is only the default; the exercise editor can change it.
const PLATE_SIDE_IDS=['hackSquat','pendulum','legPress','legPressCalf','beltSquat','machHipThrust'];
/* What Volume on Stats can show. Planned left Stats in r29 (V: Stats is what
   you did); the plan against the targets is Weekly volume on Plan. */
const VOL_MODES=[['region','By region'],['week','This week'],['avg','Recent average'],['trend','Weekly trend'],['load','Load']];
const PLATE_MODES=[['auto','Automatic'],['bar','Barbell: bar plus plates per side'],['side','Plates per side, no bar'],['sleeve','One sleeve (landmine)'],['none','None']];
/* Sections that can be hidden from Settings > Layout, as tab:key. Hidden
   sections are simply not shown; nothing stops being tracked. The routine
   days, the session list and Settings itself are never hideable, so there is
   always a way back. */
const HIDEABLE=[
  ['today','week','This week'],['today','tiles','At a glance'],['today','coach','Coach'],['today','injuries','Injuries'],['today','map','Muscle map'],['today','session','Workout preview'],['today','body','Body'],
  ['program','library','Add exercises'],['program','schedule','Schedule'],['program','pvol','Weekly volume'],
  ['dash','volume','Volume'],['dash','exercise','Lifts'],['dash','weak','Muscles'],['dash','consistency','Consistency'],['dash','body','Body'],
  ['history','cardio','Cardio and mobility'],['history','trash','Recently deleted'],
  ['settings','timer','Rest timer and logging'],['settings','rir','Effort (RIR)'],['settings','prio','Priority muscles'],['settings','bands','Weekly set targets'],['settings','more','More']
];
const HIDEABLE_KEYS=new Set(HIDEABLE.map(([t,k])=>t+':'+k));
const HIDE_TABS=[['today','Today'],['program','Plan'],['dash','Stats'],['history','History'],['settings','Settings']];
/* The layout a new install starts with (V, r28): every section folded,
   the extras hidden, and a line at the bottom of each tab that adds them
   back in one tap. Existing logs keep their own layout: these only seed a
   fresh state, and Settings > Layout's "Default layout" and "Reset section
   order" go back to them. Today leads with what a session needs (the
   workout, then the muscle map, then the week); Stats leads with Lifts. */
const DEFAULT_HIDDEN=['today:tiles','today:coach','today:body','program:schedule','program:pvol'];
const DEFAULT_ORDER={today:['session','map','week','injuries','coach','tiles','body'],dash:['exercise','volume','weak','consistency','body']};
const defaultOrder=()=>JSON.parse(JSON.stringify(DEFAULT_ORDER));
// Only History opens a section by itself: Sessions is that tab's content.
const MAIN_FIXED={history:'sessions'};
const MEAS=[['arm','Arm'],['forearm','Forearm'],['chest','Chest'],['waist','Waist'],['thigh','Thigh'],['calf','Calf'],['neck','Neck']];

// id, name, primary, secondary, equipment, flags (b = bodyweight plus added load, r = less common), note
const LIB=[
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
const COMMON=new Set(['bench','backSquat','deadlift','latPulldown','ohp','bbRow','dbLateral','legExt','legPress','bbCurl','pressdown','incDb','dbCurl','pullup','cableRow','ropePressdown','lyingCurl','dbRow','seatedDbPress','rdl','seatedCurl','hammer','cableFly','dbBench','facePull','cgBench','hipThrust','bss','sldl','abductor']);
const isCommon=e=>!!e&&!e.custom&&!e.rare&&COMMON.has(e.id);
const JUMP_TIP='When every set reaches the top of the rep range, the load goes up by about this share, in whole load steps and at least one step. Blank: 2.5% on compound lifts, 5% on isolation lifts, a convention. 0: one step every time. Until then the target is to beat last time\'s total reps at the same load. When the step is large for the load, a few more reps come first, so the new load starts inside the range.';
const RIR_TGT_TIP='Target RIR is 1 unless you change it, a convention: muscle growth improves as sets end closer to failure (Robinson 2024), but going all the way to failure grew muscle no more than stopping 1 to 2 reps short (Refalo 2024) and costs more fatigue. Some lifts in the ready-made routines use 0 or 2.';
const COMMON_TIP='Most common: the lifts in the top 25 by sets logged, overall, for men, or for women, among over 700,000 StrengthLog users (2025). Less common: useful lifts many gyms or programs skip, a judgment.';
// skip: the filter in use, so a list filtered to Most common does not say it on every row.
const exTags=(e,skip)=>`${isCommon(e)&&skip!=='common'?'<span class="tag common">Most common</span>':''}${e.rare&&skip!=='rare'?'<span class="tag rare">Less common</span>':''}`;
function libExercises(){
  return LIB.map(([id,name,primary,sec,equip,flags,note])=>{const o={id,name,primary,secondary:sec?sec.split(' '):[],equip,bw:flags.includes('b'),rare:flags.includes('r'),perSide:flags.includes('s'),note,custom:false,archived:false};if(flags.includes('t'))o.timed=true;if(flags.includes('a'))o.assist=true;return o;});
}
/* Movement pattern from the name, so a fly is replaced by a fly rather than a
   press that happens to share helper muscles. Checked in order. */
const PATTERNS=[['calf',/calf raise/],['hinge',/hyperextension/],['squat',/leg press|hack squat|pendulum/],['rearfly',/rear delt|reverse pec/],['pullover',/pullover/],['fly',/\bfly|flye|pec deck/],['ext',/pressdown|extension|kickback|skull|tate press|jm press/],['vpull',/pulldown|pull-up|chin-up|high row/],['row',/\brow\b/],['curl',/curl/],['press',/press|push-up|\bdips?\b|bench/],['squat',/squat|lunge|step-up/],['hinge',/deadlift|rdl|rack pull|good morning|pull-through|hip thrust|bridge|hyperextension|power clean|swing/],['raise',/raise/],['core',/crunch|rollout|dragon|plank|twist/],['shrug',/shrug/]];
function patternOf(e){const n=String(e&&e.name||'').toLowerCase();for(const [k,re] of PATTERNS)if(re.test(n))return k;return null;}
/* Compound: a press, row, pull, squat or hinge for a main muscle. Used to
   split RIR calibration, size load steps, spot warm-ups and budget time. */
const NON_COMPOUND_PRIMARY=new Set(['abs','obliques','neck','forearms','serratus','rotatorCuff','calves','tibialis']);
/* A custom exercise's name may not say what it is ("Hammer Strength Chest"),
   so the editor can set it (ex.kind, r27): compound or isolation; absent
   reads it from the name as before. */
function autoCompound(ex){return !!ex&&!ex.timed&&!NON_COMPOUND_PRIMARY.has(ex.primary)&&['press','row','vpull','squat','hinge'].includes(patternOf(ex));}
function isCompound(ex){if(ex&&ex.kind==='compound')return !ex.timed;if(ex&&ex.kind==='iso')return false;return autoCompound(ex);}
/* Bodyweight lifts that turn about a joint (leg raises, crunches, Nordics,
   sissy squats): the share of bodyweight is kept for display, but torque, not
   mass moved, sets how hard they are, so they get no 1RM estimate and no
   tonnage. Progress on them reads from reps and added load. */
const NO_E1=new Set(['hangingLegRaise','kneeRaise','reverseCrunch','crunch','dragonFlag','abWheel','russianTwist','neckBridge','nordic','ghr','revNordic','sissy']);
const noE1=ex=>!!ex&&(!!ex.timed||NO_E1.has(ex.id));
/* Lifts that add recovery time: heavy lengthened hamstring and hinge work,
   walking lunges (Pareja-Blanco 2020; eccentric-heavy damage). */
const SLOW_RECOVERY=new Set(['deadlift','sumoDl','trapBarDl','rdl','sldl','dbRdl','slRdl','goodMorning','nordic','ghr','walkingLunge']);
function defaultRoutine(){
  const I=(exId,sets,repMin,repMax,rir,rest)=>({uid:uid(),exId,sets,repMin,repMax,rir,rest,inc:5*LB});
  const D=(name,items,rest)=>({id:uid(),name,rest:!!rest,items});
  return {id:uid(),name:'One muscle a day, high volume',schedule:'cycle',days:[
    D('Chest',[I('incBench',4,6,10,1,180),I('bench',3,6,10,1,180),I('dips',3,8,12,1,120),I('lowHighFly',3,10,15,0,90),I('pecDeck',2,12,15,0,75),I('deficitPushup',2,10,25,0,75),I('cableCrunch',3,10,15,1,60)]),
    D('Back',[I('pullup',4,6,10,1,150),I('landmineRow',3,8,12,1,120),I('cableRow',3,8,12,1,120),I('dbPullover',3,10,15,1,90),I('kelsoShrug',3,10,15,1,90),I('rackPull',3,5,8,2,180)]),
    D('Legs A: quads',[I('hackSquat',4,6,12,1,180),I('legPress',3,10,15,1,150),I('bss',3,8,12,1,120),I('legExt',3,10,15,0,90),I('sissy',2,8,15,1,90),I('adductor',3,10,15,1,75),I('standCalf',4,8,12,0,60),I('tibRaise',2,15,25,1,45)]),
    D('Shoulders',[I('seatedDbPress',3,6,10,1,150),I('cableLateral',4,10,20,0,60),I('leanAwayLat',3,10,15,0,60),I('cableY',2,12,20,0,60),I('reversePecDeck',4,12,20,0,60),I('facePull',2,12,20,0,60),I('dbShrug',3,8,12,1,75),I('hangingLegRaise',3,10,15,1,60),I('neckCurl',2,15,20,2,45),I('neckExt',2,15,20,2,45)]),
    D('Legs B: posterior',[I('sldl',4,6,10,2,180),I('seatedCurl',4,8,12,0,90),I('nordic',3,3,8,1,120),I('hyperext',3,10,15,1,75),I('abductor',4,12,20,0,60),I('seatedCalf',4,10,15,0,60),I('abWheel',3,8,15,1,60)]),
    D('Arms',[I('ohCableExt',4,8,12,0,75),I('jmPress',3,6,10,1,120),I('pressdown',3,10,15,0,60),I('inclineCurl',4,8,12,0,75),I('bayesianCurl',3,10,15,0,60),I('preacher',3,8,12,0,60),I('hammer',2,10,12,1,60),I('wristCurl',2,12,20,0,45),I('revWristCurl',2,12,20,0,45),I('woodchop',3,10,15,1,45)]),
    D('Rest',[],true)
  ]};
}
/* Ready-made routines, so nobody has to build one from scratch. Most land
   near 10 to 20 hard sets a week for the major muscles (the beginner,
   two-day, strength and dumbbell ones are lighter on purpose), trains most of them
   twice a week where the days allow it (Schoenfeld 2016 and later reviews:
   frequency matters mainly as a way to spread volume), and keeps sessions
   near an hour. Rep ranges and RIR follow the same conventions as the rest of
   the app. They are starting points: everything is editable in Plan. */
const TEMPLATES=(()=>{
  const I=(exId,sets,repMin,repMax,rir,rest)=>({exId,sets,repMin,repMax,rir,rest});
  const D=(name,items)=>({name,items}),R=()=>({name:'Rest',items:[],rest:true});
  return [
    /* New to lifting (r30, from the review: 7 exercises, about 19 sets and
       over an hour, with incline curls and hack squats, was not a first
       routine). Five exercises a day on machines and dumbbells, 2 to 3 sets,
       3 reps in reserve (easy to judge: stop when a rep slows down), about
       45 minutes. Weekly sets sit under the usual 10 on purpose; add a set as
       it gets easy. */
    {key:'full3',name:'Full body, 3 days',who:'New to lifting: five exercises a day, machines and dumbbells, stopping well short of failure. Add a set once it feels easy',meta:'3 days a week',days:[
      D('Full body A',[I('legPress',3,8,12,3,120),I('machPress',3,8,12,3,120),I('latPulldown',3,8,12,3,120),I('seatedCurl',2,10,15,2,75),I('dbLateral',2,10,15,2,60)]),R(),
      D('Full body B',[I('goblet',3,8,12,3,120),I('incDb',3,8,12,3,120),I('cableRow',3,8,12,3,120),I('dbRdl',3,8,12,3,120),I('pressdown',2,10,15,2,60)]),R(),
      D('Full body C',[I('legPress',3,8,12,3,120),I('dbBench',3,8,12,3,120),I('machRow',3,8,12,3,120),I('lyingCurl',2,10,15,2,75),I('dbCurl',2,10,15,2,60)]),R(),R()]},
    /* Two days a week (r30): the whole body each day, about an hour. */
    {key:'full2',name:'Full body, 2 days',who:'Two sessions a week: the whole body each time',meta:'2 days a week',days:[
      D('Full body A',[I('backSquat',3,6,10,2,180),I('bench',3,6,10,2,150),I('cableRow',3,8,12,2,120),I('seatedCurl',3,10,15,1,75),I('dbLateral',3,10,20,1,60),I('inclineCurl',2,10,15,1,60)]),R(),R(),
      D('Full body B',[I('rdl',3,6,10,2,150),I('incDb',3,8,12,2,120),I('latPulldown',3,8,12,2,120),I('legPress',3,10,15,1,120),I('cableLateral',3,10,20,1,60),I('ohCableExt',2,10,15,1,60),I('standCalf',3,10,15,1,60)]),R(),R(),R()]},
    {key:'ul4',name:'Upper / lower, 4 days',who:'The common all-round choice',meta:'4 days a week',days:[
      D('Upper A',[I('bench',4,6,10,2,150),I('bbRow',3,6,10,2,150),I('latPulldown',4,8,12,1,120),I('cableFly',2,10,15,1,75),I('dbLateral',5,10,20,1,60),I('facePull',2,12,20,1,60),I('pressdown',3,10,15,1,60),I('inclineCurl',3,10,15,1,60)]),
      D('Lower A',[I('backSquat',3,6,10,2,180),I('rdl',3,6,10,2,150),I('legExt',3,10,15,1,75),I('seatedCurl',3,10,15,1,75),I('standCalf',4,10,15,1,60),I('cableCrunch',3,10,15,1,60)]),R(),
      D('Upper B',[I('incDb',4,8,12,2,120),I('cableRow',4,8,12,1,120),I('pullup',3,6,10,2,150),I('cableLateral',5,10,20,1,60),I('reversePecDeck',3,12,20,1,60),I('ohCableExt',3,10,15,1,60),I('hammer',3,10,15,1,60)]),
      D('Lower B',[I('hackSquat',3,8,12,1,150),I('hipThrust',3,8,12,1,120),I('lyingCurl',3,10,15,1,75),I('bss',2,8,12,1,90),I('seatedCalf',4,10,15,1,60),I('hangingLegRaise',3,10,15,1,60)]),R(),R()]},
    {key:'ppl6',name:'Push / pull / legs, 6 days',who:'Training most days, wants more volume',meta:'6 days a week',days:[
      D('Push A',[I('bench',3,6,10,2,150),I('seatedDbPress',3,8,12,1,120),I('cableFly',3,10,15,1,75),I('cableLateral',4,10,20,1,60),I('ohCableExt',3,10,15,1,60)]),
      D('Pull A',[I('pullup',4,6,10,1,150),I('bbRow',3,6,10,2,150),I('facePull',3,12,20,1,60),I('inclineCurl',3,10,15,1,60),I('hammer',2,10,15,1,60)]),
      D('Legs A',[I('backSquat',3,6,10,2,180),I('rdl',3,6,10,2,150),I('legExt',3,10,15,1,75),I('seatedCurl',3,10,15,1,75),I('standCalf',4,10,15,1,60),I('cableCrunch',3,10,15,1,60)]),
      D('Push B',[I('incBench',3,6,10,2,150),I('machShoulder',3,8,12,1,120),I('pecDeck',3,10,15,0,75),I('dbLateral',4,12,20,0,60),I('pressdown',3,10,15,1,60)]),
      D('Pull B',[I('latPulldown',4,8,12,1,120),I('machRow',3,8,12,1,120),I('reversePecDeck',3,12,20,0,60),I('bayesianCurl',3,10,15,0,60),I('reverseCurl',2,10,15,1,60)]),
      D('Legs B',[I('hackSquat',3,8,12,1,150),I('hipThrust',3,8,12,1,120),I('lyingCurl',3,10,15,1,75),I('bss',2,8,12,1,90),I('seatedCalf',4,10,15,1,60),I('hangingLegRaise',3,10,15,1,60)]),R()]},
    {key:'split5',name:'Body-part split, 5 days',who:'The classic gym split, one or two muscles a day',meta:'5 days a week',days:[
      D('Chest',[I('bench',3,6,10,2,150),I('incDb',3,8,12,1,120),I('cableFly',3,10,15,1,75),I('dips',2,8,12,1,120),I('cableCrunch',3,10,15,1,60)]),
      D('Back',[I('pullup',4,6,10,1,150),I('bbRow',3,6,10,2,150),I('cableRow',3,8,12,1,120),I('latPulldown',3,8,12,1,120),I('reversePecDeck',3,12,20,0,60)]),
      D('Legs',[I('backSquat',3,6,10,2,180),I('rdl',3,6,10,2,150),I('legPress',3,10,15,1,120),I('legExt',3,10,15,1,75),I('seatedCurl',4,10,15,1,75),I('hipThrust',3,8,12,1,120),I('standCalf',4,10,15,1,60)]),
      // Lateral raises split over two days (r30): nine sets in one session added little past the first five or six.
      D('Shoulders',[I('ohp',3,6,10,2,150),I('cableLateral',5,10,20,1,60),I('facePull',3,12,20,1,60),I('dbShrug',3,10,15,1,60),I('seatedCalf',4,10,15,1,60),I('hangingLegRaise',3,10,15,1,60)]),
      D('Arms and legs',[I('inclineCurl',4,8,12,1,75),I('ohCableExt',4,8,12,1,75),I('hammer',3,10,12,1,60),I('pressdown',3,10,15,1,60),I('dbLateral',4,12,20,1,60),I('bss',3,8,12,1,90),I('lyingCurl',3,10,15,1,75)]),R(),R()]},
    /* Strength (r30, from the review: nothing for someone after a stronger
       squat, bench and deadlift). The classic five sets of five, alternating
       two days: when all five sets reach 5, the load goes up a step; two
       sessions short of 5 bring it down to what the estimate says fits.
       Fewer sets per muscle than the weekly targets, on purpose. */
    {key:'str5',name:'Strength, 5 x 5',who:'Stronger squat, bench, press, row, and deadlift: five sets of five, a step more each time all five reach 5',meta:'every other day',days:[
      D('Strength A',[I('backSquat',5,5,5,2,180),I('bench',5,5,5,2,180),I('bbRow',5,5,5,2,150)]),R(),
      D('Strength B',[I('backSquat',5,5,5,2,180),I('ohp',5,5,5,2,180),I('deadlift',1,5,5,2,240)]),R()]},
    {key:'db3',name:'Dumbbells only, 3 days',who:'Home or hotel gym: dumbbells and a bench. A lighter start, like full body: fewer sets a week than the targets, so add a set as it gets easy',meta:'3 days a week',days:[
      D('Dumbbell A',[I('goblet',3,8,15,2,120),I('dbBench',3,8,12,2,120),I('dbRow',3,8,12,2,90),I('dbLateral',3,12,20,1,60),I('dbRearFly',3,12,20,1,60),I('dbCurl',3,10,15,1,60),I('slCalf',3,10,15,1,45)]),R(),
      D('Dumbbell B',[I('dbRdl',3,8,12,2,120),I('seatedDbPress',3,8,12,2,120),I('csDbRow',3,8,12,1,90),I('revLunge',3,8,12,2,90),I('dbLateral',3,12,20,1,60),I('ohDbExt',3,10,15,1,60),I('reverseCrunch',2,10,15,1,60)]),R(),
      D('Dumbbell C',[I('bss',3,8,12,2,90),I('incDb',3,8,12,2,120),I('dbPullover',3,10,15,1,75),I('slRdl',3,8,12,1,75),I('dbRearFly',2,12,20,1,60),I('hammer',3,10,15,1,60),I('slCalf',3,10,15,1,45)]),R(),R()]},
    /* High volume, trimmed (r30, from the review: 17 chest sets in one
       session, mostly to failure, and a neck circuit on shoulder day). At
       most 11 sets for one muscle in a session (the app's per-session line),
       isolation lifts at 1 RIR with a few at 0, no neck work (tracked only).
       Installs before r30 keep their copy; Plan changes it. */
    {key:'onemuscle',name:'One muscle a day, high volume',who:'Experienced, six days a week. Long sessions with many sets for one muscle, up to 11',meta:'6 days a week',days:[
      D('Chest',[I('incBench',4,6,10,1,180),I('bench',3,6,10,1,180),I('lowHighFly',2,10,15,1,90),I('pecDeck',2,12,15,0,75),I('cableCrunch',3,10,15,1,60)]),
      D('Back',[I('pullup',4,6,10,1,150),I('landmineRow',3,8,12,1,120),I('cableRow',2,8,12,1,120),I('dbPullover',3,10,15,1,90),I('kelsoShrug',2,10,15,1,90),I('rackPull',2,5,8,2,180)]),
      D('Legs A: quads',[I('hackSquat',4,6,12,1,180),I('legPress',3,10,15,1,150),I('legExt',2,10,15,0,90),I('bss',2,8,12,1,120),I('adductor',3,10,15,1,75),I('standCalf',4,8,12,1,60),I('tibRaise',2,15,25,1,45)]),
      D('Shoulders',[I('seatedDbPress',3,6,10,1,150),I('cableLateral',5,10,20,1,60),I('leanAwayLat',4,10,15,1,60),I('reversePecDeck',4,12,20,1,60),I('facePull',2,12,20,1,60),I('dbShrug',3,8,12,1,75),I('hangingLegRaise',3,10,15,1,60)]),
      D('Legs B: posterior',[I('sldl',4,6,10,2,180),I('seatedCurl',3,8,12,1,90),I('nordic',2,3,8,1,120),I('hyperext',3,10,15,1,75),I('abductor',4,12,20,1,60),I('seatedCalf',4,10,15,0,60),I('abWheel',3,8,15,1,60)]),
      D('Arms',[I('ohCableExt',4,8,12,1,75),I('jmPress',3,6,10,1,120),I('pressdown',3,10,15,0,60),I('inclineCurl',4,8,12,1,75),I('bayesianCurl',3,10,15,1,60),I('preacher',3,8,12,0,60),I('wristCurl',2,12,20,1,45),I('revWristCurl',2,12,20,1,45),I('woodchop',3,10,15,1,45)]),
      R()]},
    // The routine installs started with before r29, kept for the suites written on it (tests/h.js) and to recognise it; never offered.
    {key:'legacy',hidden:true,name:'One muscle a day, high volume',who:'',meta:'',build:()=>defaultRoutine()}
  ];
})();
/* The routine a new install starts with (V, decision 114, r29): Upper /
   lower, 4 days, the all-round choice, so someone who taps Log a workout now
   or Import instead of picking is not dropped into the six-day high-volume
   split. Saves that already have routines keep theirs. */
// The suites built on the routine installs started with before r29 run with
// IRONLOG_STARTER set to it (tests/h.js); nothing else sets it.
/* "Eight plans, 2 to 6 days a week", counted from the list (r30: the line
   said six after two were added). Every other day counts as about 3.5. */
function tplCountLine(){const T=TEMPLATES.filter(t=>!t.hidden);const n=T.map(t=>{const r=routineFromTemplate(t.key);return r.days.filter(d=>!d.rest).length*7/r.days.length;});
  const W=['No','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve'];return `${W[T.length]||T.length} plans, ${Math.floor(Math.min(...n))} to ${Math.round(Math.max(...n))} days a week`;}
function starterRoutine(){const k=window.IRONLOG_STARTER;return routineFromTemplate(k&&TEMPLATES.some(t=>t.key===k)?k:'ul4');}
/* An untouched starter, the current one or the one installs began with
   before r29, is replaced when a ready-made routine is picked on a first run. */
function starterSigs(){return [routineSig(starterRoutine()),routineSig(defaultRoutine())];}
/* A routine from a template, with its own ids so it is independent of the template. */
function routineFromTemplate(key){
  const t=TEMPLATES.find(x=>x.key===key);if(!t)return null;
  if(t.build)return t.build();
  return {id:uid(),name:t.name,schedule:'cycle',days:t.days.map(d=>({id:uid(),name:d.name,rest:!!d.rest,items:d.items.map(it=>({uid:uid(),...it,inc:5*LB}))}))};
}
function freshState(){
  const r=starterRoutine();
  return {version:STATE_VERSION,settings:{unit:'lb',theme:'dark',bands:JSON.parse(JSON.stringify(BANDS)),priorities:[],dashFolded:DSEC_FOLDED.slice(),lastExport:null,barKg:null,bwGoalPct:null,removedLib:[],timerMode:'auto',timerSound:true,timerCompact:false,autoDone:true,homeFolded:[],wakeLock:false,timeBudget:null,rirMode:'on',hidden:DEFAULT_HIDDEN.slice(),onboarded:false,calSnooze:null},
    exercises:libExercises(),routines:[r],activeRoutineId:r.id,sessions:[],bodyweights:[],measurements:[],draft:null,deloadWeek:null,injuries:[],cardio:[],trash:[]};
}

