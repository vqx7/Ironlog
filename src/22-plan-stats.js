/* ---------- HEIGHT ----------
   Plan and Stats are drawn by src/app/plan.ts and src/app/stats.ts since r58;
   the height field of Today's tape measurements stays here until Today moves. */
/* Height parses 5'10, 5 10, 70 (inches) or 5.9 (feet) in lb mode, and cm or
   metres in kg mode. Stored in cm. */
function parseHeight(v){
  const t=String(v||'').trim().toLowerCase().replace(/["”]|in(ches)?|cm/g,'').trim();if(!t)return null;
  let cm=null;
  if(U()==='lb'){
    const m=t.match(/^(\d+(?:\.\d+)?)\s*(?:'|’|ft|feet|\s)\s*(\d+(?:\.\d+)?)?$/);
    if(m)cm=(+m[1]*12+(m[2]?+m[2]:0))*IN;else{const n=numIn(t);if(n!=null)cm=(n<=8?n*12:n)*IN;}
  }else{const n=numIn(t);if(n!=null)cm=n<3?n*100:n;}
  return cm!=null&&cm>=100&&cm<=250?Math.round(cm*10)/10:null;
}
function heightField(){return `<label class="field"><span class="hastip" data-tip="Set once. With a waist measurement it gives waist to height.">Height</span><input type="text" data-bind="height" value="${esc(heightTxt(state.settings.heightCm))}" placeholder="${U()==='lb'?'e.g. 5\'10':'e.g. 178'}" autocomplete="off"></label>`;}

