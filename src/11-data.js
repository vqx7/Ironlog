/* ---------- reference data ---------- */
// skip: the filter in use, so a list filtered to Most common does not say it on every row.
const exTags=(e,skip)=>`${isCommon(e)&&skip!=='common'?'<span class="tag common">Most common</span>':''}${e.rare&&skip!=='rare'?'<span class="tag rare">Less common</span>':''}`;
