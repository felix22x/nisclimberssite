(() => {
const T = window.I18N;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const root = document.documentElement;
let lang = 'ru';
let introDone = false;

// ---------- easing ----------
function bez(x1, y1, x2, y2){
  const cx = 3*x1, bx = 3*(x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3*y1, by = 3*(y2 - y1) - cy, ay = 1 - cy - by;
  const X = t => ((ax*t + bx)*t + cx)*t, Y = t => ((ay*t + by)*t + cy)*t, dX = t => (3*ax*t + 2*bx)*t + cx;
  return x => { if (x <= 0) return 0; if (x >= 1) return 1; let t = x;
    for (let i = 0; i < 6; i++){ const d = dX(t); if (Math.abs(d) < 1e-6) break; t -= (X(t) - x) / d; }
    return Y(Math.min(Math.max(t, 0), 1)); };
}
const EASE = 'cubic-bezier(.25,.6,.3,1)';
const unit = () => parseFloat(getComputedStyle(root).getPropertyValue('--u')) ||
  Math.min(innerWidth / 1440, innerHeight / 956);
const U = () => innerWidth <= 820 ? innerWidth / 390 : Math.min(innerWidth / 1440, innerHeight / 956);

function fade(el, dur = 550, delay = 0, easing = EASE){
  if (!el) return;
  el.animate([{opacity: 0}, {opacity: 1}], {duration: reduced ? 0 : dur, delay: reduced ? 0 : delay, easing, fill: 'both'});
}

// strip reveal: mask with bands growing downward
function strip(el, dur, pitch, phase, ease){
  if (reduced) return;
  const f = bez(...ease); const t0 = performance.now();
  el.style.webkitMaskSize = el.style.maskSize = `100% ${pitch}px`;
  el.style.webkitMaskPosition = el.style.maskPosition = `0 ${phase % pitch}px`;
  (function step(now){
    const k = Math.min((now - t0) / dur, 1);
    const a = Math.max(.6, f(k) * pitch);
    const g = `linear-gradient(180deg,#000 0 ${a}px,transparent ${a}px ${pitch}px)`;
    el.style.webkitMaskImage = el.style.maskImage = g;
    if (k < 1) requestAnimationFrame(step);
    else { el.style.webkitMaskImage = el.style.maskImage = ''; }
  })(t0);
}

// ---------- stencil letters ----------
function cut(ch){
  const c = ch.toUpperCase();
  if (/[!?.,·\s]/.test(c)) return null;
  if ('TТГ'.includes(c)) return ['h', 21];
  if ('IІ'.includes(c)) return ['h', 52];
  if ('AАЛДЖХXYУҮҰ'.includes(c)) return ['h', 60];
  if ('OОCСSЗЭЮQGФШЩӨ'.includes(c)) return ['v', 50];
  if ('KК'.includes(c)) return ['v', 27];
  return ['v', 29];
}
function letters(text, stencil, cls = 'ch'){
  return [...text].map(ch => {
    if (ch === ' ') return `<span class="${cls}"> </span>`;
    const c = stencil && cut(ch);
    return c ? `<span class="${cls} ${c[0]}" style="--c:${c[1]}%">${ch}</span>` : `<span class="${cls}">${ch}</span>`;
  }).join('');
}
function split(el){
  const text = T[lang][el.dataset.split];
  const st = el.hasAttribute('data-stencil');
  if (el.classList.contains('h2')) {
    el.innerHTML = text.split(' ').map(w => `<span class="ln">${letters(w, st)}</span>`).join(' ');
  } else el.innerHTML = letters(text, st);
}
function wipe(el, step, delay = 0){
  const chs = $$('.ch', el);
  chs.forEach((c, i) => c.animate(
    [{clipPath: 'inset(0 0 100% 0)', opacity: .35}, {clipPath: 'inset(0 0 0 0)', opacity: 1}],
    {duration: reduced ? 0 : 110, delay: reduced ? 0 : delay + i*step, easing: 'cubic-bezier(.3,.6,.4,1)', fill: 'both'}));
  return delay + chs.length*step + 110;
}
const showNow = el => $$('.ch', el).forEach(c => c.animate([{clipPath: 'inset(0)', opacity: 1}], {duration: 0, fill: 'both'}));

// ---------- dynamic content (placeholders) ----------
const TEAM = [['А', 'r_coach'], ['Д', 'r_cap'], ['М', 'r_org'], ['Е', 'r_team']];
const ACH = [['2026', 'm1', 'p1', 'db'], ['2025', 'm2', 'p2', 'dl'], ['2025', 'm3', 'p3', 'ds'], ['2024', 'm1', 'p1', 'db']];
const NEWS = [['nw1', '01.09'], ['nw2', '14.10'], ['nw3', '08.11']];
const tileArt = (i) => {
  const s = (i * 37) % 60;
  return `<svg viewBox="0 0 300 200" preserveAspectRatio="xMidYMid slice">
    <rect width="300" height="200" fill="${['#13204f','#0a1438','#1e2f6b','#0f1a45','#13204f'][i % 5]}"/>
    <path fill="#0a1438" opacity=".7" d="M0 200V${120 + s/3}l${60 + s} -${60 + s/2} 50 40 ${70 - s/2} -${70 + s/3} 120 ${110}V200Z"/>
    <path fill="#f8f6f4" d="M${60 + s} ${60 + s*1.4 - s/2}l-18 22 12-3 6 12 9-15 11 4Z" opacity=".9"/>
    <path fill="#050b2a" d="M0 200l${90 + s} -${40 + s/4} 70 30 140 -50V200Z"/></svg>`;
};
function build(){
  const t = T[lang];
  $('#members').innerHTML = TEAM.map(([i, r]) =>
    `<article class="member glass fadein"><i>${i}</i><div><h3>${t.name}</h3><p>${t[r]}</p></div></article>`).join('');
  $('#achList').innerHTML = ACH.map(([y, m, p, d]) =>
    `<div class="ach-row"><span class="yr">${y}</span><span class="medal ${m}">${p[1]}</span><h3>${t.comp}<small>${t[p]}</small></h3><span class="dsc">${t[d]}</span></div>`).join('');
  $('#tiles').innerHTML = [0,1,2,3,4].map(i =>
    `<div class="tile${i === 0 ? ' big' : ''}">${tileArt(i)}<span>${t.ph} 0${i + 1}</span></div>`).join('');
  $('#news').innerHTML = NEWS.map(([k, d]) =>
    `<a href="#" class="post glass fadein"><div><time>${d}.2026</time><h3>${t[k]}</h3></div><span class="arr">↗</span></a>`).join('');
  // marquee rows
  const rep = (s) => Array(6).fill(0).map(() => letters(s.toUpperCase(), true, 'lt').replace(/<span class="lt"> <\/span>/g, '<span class="sp"></span>') + '<span class="sp"></span>').join('');
  $('#row1').innerHTML = rep(t.rows[0] + ' ·');
  $('#row2').innerHTML = rep(t.rows[1] + ' ·');
  $$('[data-i]').forEach(el => { const v = t[el.dataset.i]; if (typeof v === 'string') el.textContent = v; });
  $$('[data-split]').forEach(split);
  fitOutline();
  // re-show things that were already revealed
  if (introDone) { $$('.hero [data-split]').forEach(showNow); }
  $$('.sec').forEach(s => { if (s.dataset.shown) { $$('[data-split]', s).forEach(showNow); $$('.fadein', s).forEach(e => e.style.opacity = 1); } });
}
function setLang(l){
  lang = T[l] ? l : 'ru';
  root.lang = lang;
  $$('[data-lang]').forEach(b => b.setAttribute('aria-pressed', b.dataset.lang === lang));
  try { localStorage.setItem('lang', lang); } catch(e) {}
  build();
  if (introDone) $$('.hero [data-split]').forEach(el => wipe(el, 18));
  const ok = $('#formOk'); if (ok.textContent) ok.textContent = T[lang].f_ok;
}
$$('[data-lang]').forEach(b => b.addEventListener('click', () => setLang(b.dataset.lang)));
$$('.row').forEach(r => r.classList.add('sten'));

// outlined word spans the width
function fitOutline(){
  const el = $('#outline'); if (!el) return;
  el.style.letterSpacing = '0px';
  const avail = el.clientWidth, nat = el.scrollWidth, n = Math.max(el.textContent.length - 1, 1);
  el.style.letterSpacing = ((avail - nat) / n) + 'px';
}

let saved = null; try { saved = localStorage.getItem('lang'); } catch(e) {}
setLang(saved || 'ru');
$('#yr').textContent = new Date().getFullYear();

// ---------- intro timeline ----------
function intro(){
  if (introDone) return; introDone = true;
  clearTimeout(failsafe);
  window.dispatchEvent(new Event('nis:intro'));
  $$('.nav').forEach(n => fade(n, 550, 0));
  fade($('.alti'), 600, 1100);
  fade($('.goal'), 550, 1130);
  fade($('.hero__bl'), 350, 1240);
  fade($('.cta'), 500, 1370);
  const l1 = $('[data-split="h_l1"]'), l2a = $('[data-split="h_l2"]'), l2b = $('[data-split="h_l2s"]');
  wipe(l1, 18, 1540);
  const n2a = $$('.ch', l2a).length;
  wipe(l2a, 40, 1570);
  const end = wipe(l2b, 40, 1570 + n2a*40);
  if (reduced) return;
  // once: backspace the stencil word to its first 3 letters and retype it
  setTimeout(() => {
    const chs = $$('.ch', l2b); const keep = Math.min(3, chs.length);
    let i = chs.length - 1, tt = 0;
    for (; i >= keep; i--, tt += 45) { const c = chs[i]; setTimeout(() => c.style.visibility = 'hidden', tt); }
    tt += 450;
    for (let j = keep; j < chs.length; j++, tt += 50) { const c = chs[j]; setTimeout(() => c.style.visibility = '', tt); }
  }, end + 150);
}
const failsafe = setTimeout(() => { $$('.hid').forEach(e => e.style.opacity = 1); intro(); }, 6000);
const ready = Promise.all([
  document.fonts ? document.fonts.ready : Promise.resolve(),
  new Promise(r => { window.addEventListener('nis:gl-ready', r, {once: true}); setTimeout(r, 2500); })
]);
ready.then(() => { fitOutline(); intro(); });

// ---------- section reveals ----------
const io = new IntersectionObserver(es => es.forEach(e => {
  if (!e.isIntersecting) return;
  const s = e.target; if (s.dataset.shown) return; s.dataset.shown = 1;
  let d = 0;
  $$('[data-split]', s).forEach(el => { d = Math.max(d, wipe(el, el.closest('.card') ? 30 : 22, 120)); });
  $$('.fadein', s).forEach((el, i) => fade(el, 500, 200 + i*80, 'cubic-bezier(.45,0,.35,1)'));
  $$('.tag', s).forEach(el => fade(el, 150));
  $$('.tile', s).forEach((el, i) => setTimeout(() => strip(el, 470, 40*U(), 0, [.3, 0, .2, 1]), 250 + i*90));
  if (s.id === 'ach') setTimeout(() => marqDrift = true, d + 400);
}), {threshold: .28});
$$('.sec').forEach(s => io.observe(s));

// ---------- smooth wheel scroll ----------
let cur = scrollY, target = scrollY, animating = false, last = 0;
const maxY = () => document.documentElement.scrollHeight - innerHeight;
function tick(now){
  const dt = Math.min(now - last, 64); last = now;
  cur += (target - cur) * (1 - Math.pow(.9, dt / 16.67));
  if (Math.abs(target - cur) < .5) { cur = target; animating = false; }
  scrollTo(0, cur);
  if (animating) requestAnimationFrame(tick);
}
function glide(y){
  target = Math.max(0, Math.min(y, maxY()));
  if (reduced) { scrollTo(0, target); cur = target; return; }
  if (!animating) { animating = true; cur = scrollY; last = performance.now(); requestAnimationFrame(tick); }
}
addEventListener('wheel', e => {
  if (e.ctrlKey) return;
  e.preventDefault();
  const k = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? innerHeight : 1;
  if (!animating) target = scrollY;
  glide(target + e.deltaY * k);
}, {passive: false});
addEventListener('scroll', () => { if (!animating) { cur = target = scrollY; } }, {passive: true});
document.addEventListener('click', e => {
  const a = e.target.closest('a[href^="#"]'); if (!a) return;
  e.preventDefault();
  const id = a.getAttribute('href');
  if (id === '#') return;
  const el = id === '#top' ? document.body : $(id);
  if (el) glide(el.getBoundingClientRect().top + scrollY);
});

// ---------- per-frame: marquee + altimeter ----------
let marqDrift = false, drift = 0, lastF = performance.now();
const marq = $('#ach'), row1 = $('#row1'), row2 = $('#row2');
const altiVal = $('#altiVal'), altiMark = $('#altiMark');
const mod = (a, n) => ((a % n) + n) % n;
function frame(now){
  const dt = now - lastF; lastF = now;
  if (marqDrift && !reduced) drift += .05 * U() * dt;
  const top = marq.getBoundingClientRect().top;
  const d = -top * .45 + drift, o = -6 * U();
  const w = row1.scrollWidth / 6 || 1, w2 = row2.scrollWidth / 6 || 1;
  row1.style.transform = `translate3d(${mod(d, w) - w + o}px,0,0)`;
  row2.style.transform = `translate3d(${o - mod(d, w2)}px,0,0)`;
  const p = Math.min(Math.max(scrollY / Math.max(maxY(), 1), 0), 1);
  altiVal.textContent = Math.round(5364 + (8848 - 5364) * p).toLocaleString('ru-RU');
  altiMark.style.bottom = `calc(${p * 100}% - 6px)`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
addEventListener('resize', fitOutline);

// ---------- form (no backend yet) ----------
$('#form').addEventListener('submit', e => {
  e.preventDefault();
  $('#formOk').textContent = T[lang].f_ok;
  e.target.reset();
});
})();
