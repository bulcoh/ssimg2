// 오늘의 루틴 + 최근 14일 운동시간 그래프를 1080x2160 배경화면으로 만든다.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const KO = { Mon: "월", Tue: "화", Wed: "수", Thu: "목", Fri: "금", Sat: "토", Sun: "일" };
const DAY_MS = 86400000;
const BOTTOM_SAFE = 190; // 하단 독(앱 아이콘) 영역(px, 540x1080 기준)
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ---------- 날짜 계산 (전부 UTC 자정 기준 숫자로 처리) ----------
const parseDate = (s) => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
const fmt = (ms) => new Date(ms).toISOString().slice(0, 10);
const todayStr = process.env.TODAY || new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
const today = parseDate(todayStr);
const dow = (ms) => (new Date(ms).getUTCDay() + 6) % 7; // 월=0
const mondayOf = (ms) => ms - dow(ms) * DAY_MS;

// ---------- 설정/루틴/로그 읽기 ----------
const cfg = JSON.parse(readFileSync("ppl/config.json", "utf8").replace(/^\uFEFF/, ""));
const routine = JSON.parse(readFileSync("ppl/" + cfg.routine, "utf8"));
const weekKeys = Object.keys(routine);

const log = new Map();
if (existsSync("log.txt")) {
  for (const line of readFileSync("log.txt", "utf8").split(/\r?\n/)) {
    const [d, a, c] = line.trim().split(",");
    if (d) log.set(d, [Number(a) || 0, Number(c) || 0]);
  }
}

// ---------- 오늘이 몇 주차인지 ----------
function resolveWeek() {
  const startMon = mondayOf(parseDate(cfg.start_date));
  const curMon = mondayOf(today);
  if (curMon < startMon) return { kind: "before" };
  const skips = [...new Set((cfg.skip_weeks || []).map((s) => mondayOf(parseDate(s))))];
  if (skips.includes(curMon)) return { kind: "skip" };
  const skipped = skips.filter((m) => m >= startMon && m < curMon).length;
  const n = Math.round((curMon - startMon) / (7 * DAY_MS)) - skipped + 1;
  if (n > weekKeys.length) return { kind: "done" };
  return { kind: "ok", n, weekKey: weekKeys[n - 1] };
}
const st = resolveWeek();
const dayName = DAYS[dow(today)];

// ---------- 본문(루틴) ----------
function routineHtml() {
  if (st.kind === "before") return msg("아직 시작 전이에요", `시작일 ${esc(cfg.start_date)}`);
  if (st.kind === "skip") return msg("이번 주는 디로드·휴식 주", "푹 쉬어요");
  if (st.kind === "done") return msg("루틴이 끝났어요", "ppl/config.json에서 다음 루틴을 정해 주세요");
  const day = routine[st.weekKey]?.[dayName];
  if (!day || !day.exercises.length) return msg(`${esc(st.weekKey)} · ${KO[dayName]}요일`, "오늘은 휴식일");
  const rows = day.exercises.map((e) => {
    const subs = [e.sub1, e.sub2].filter(Boolean).map(esc).join('<i></i>');
    const f = (label, v, cls) => (v ? `<span class="${cls}">${label}[ ${esc(v)} ]</span>` : "");
    return `<div class="ex">
      <div class="nm"><b>${esc(e.name)}</b>${subs ? `<span class="sub">${subs}</span>` : ""}</div>
      <div class="meta">${f("W", e.w, "y")}${f("Sets ", e.sets, "c")}${f("Reps ", e.reps, "w")}${f("Rpe ", e.rpe, "w")}${f("Rest ", e.rest, "g")}</div>
      ${e.note ? `<div class="note">${esc(e.note)}</div>` : ""}
    </div>`;
  }).join("");
  return `<h1>${esc(st.weekKey)} ${esc(day.title)}</h1>${rows}`;
}
function msg(big, small) {
  return `<div class="msg"><div>${big}</div><small>${small}</small></div>`;
}

// ---------- 최근 14일 그래프 ----------
function chartHtml() {
  const days = Array.from({ length: 14 }, (_, i) => today - (13 - i) * DAY_MS);
  const totals = days.map((ms) => (log.get(fmt(ms)) || [0, 0]).reduce((a, b) => a + b, 0));
  const max = Math.max(120, ...totals) + 5;
  const H = 100;
  const px = (v) => ((v / max) * H).toFixed(1);
  const grid = [30, 60, 90].map((v) => `<u style="bottom:${px(v)}px"></u>`).join("");
  const cols = days.map((ms, i) => {
    const [a, c] = log.get(fmt(ms)) || [0, 0];
    const d = new Date(ms);
    const w = dow(ms);
    const cls = w === 5 ? "sat" : w === 6 ? "sun" : "";
    const bars = a + c
      ? `<s class="a" style="height:${px(a)}px"></s><s class="c" style="bottom:${px(a)}px;height:${px(c)}px"></s><em style="bottom:${(Number(px(a + c)) + 2).toFixed(1)}px">${a + c}</em>`
      : "";
    return `<div class="col ${cls} ${ms === today ? "today" : ""}">
      <p>${d.getUTCDate()}<br>${KO[DAYS[w]]}</p><div class="bars" style="height:${H}px">${bars}</div></div>`;
  }).join("");
  return `<div id="chart"><div class="grid" style="height:${H}px">${grid}</div>${cols}</div>`;
}

// ---------- 하단 주차 표시 ----------
const weeksHtml = weekKeys.map((k, i) => `<span class="${st.kind === "ok" && st.n === i + 1 ? "on" : ""}">W${i + 1}</span>`).join("");

// ---------- 배경 ----------
let bg = "linear-gradient(#1b1f26,#0e1014)";
for (const f of ["assets/bg.jpg", "assets/bg.jpeg", "assets/bg.png"]) {
  if (existsSync(f)) {
    const mime = f.endsWith("png") ? "image/png" : "image/jpeg";
    bg = `url(data:${mime};base64,${readFileSync(f).toString("base64")})`;
    break;
  }
}

const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:540px;height:1080px;overflow:hidden}
body{font-family:"Noto Sans CJK KR","Noto Sans KR","Apple SD Gothic Neo",sans-serif;color:#f1f3f6;
  background:linear-gradient(rgba(0,0,0,.45),rgba(0,0,0,.45)),${bg} center/cover no-repeat}
#page{height:1080px;display:flex;flex-direction:column;padding:34px 14px ${BOTTOM_SAFE}px}
#chart{position:relative;display:flex;gap:2px;padding:0 6px;margin-bottom:12px}
#chart .grid{position:absolute;left:0;right:0;bottom:0;pointer-events:none}
#chart .grid u{position:absolute;left:0;right:0;border-top:1px solid #d9962b}
.col{flex:1;text-align:center;position:relative;border-radius:4px}
.col.today{background:rgba(255,255,255,.1)}
.col p{font-size:12px;line-height:1.25;font-weight:700;margin-bottom:3px;color:#e8ecf2}
.col.sat p{color:#5b9bff}.col.sun p{color:#ff6b6b}
.bars{position:relative;margin:0 5px}
.bars s{position:absolute;left:0;right:0;border-radius:2px;text-decoration:none}
.bars .a{bottom:0;background:#2f6bd6}
.bars .c{background:#8db8f5}
.bars em{position:absolute;left:-6px;right:-6px;font-style:normal;font-size:10px;color:#cfd8e6}
#content{flex:1;overflow:hidden;min-height:0}
#inner{font-size:14px;line-height:1.35}
h1{font-size:1.5em;font-style:italic;font-weight:800;margin-bottom:.3em}
.ex{margin-bottom:.8em}
.nm b{font-size:1.2em;font-weight:600;margin-right:.6em}
.sub{font-size:.8em;color:#aeb7c4}.sub i{margin:0 .35em}
.meta{font-size:.95em;font-weight:600;display:flex;gap:.9em;flex-wrap:wrap}
.y{color:#ffd23c}.c{color:#3fb5ff}.w{color:#f1f3f6}.g{color:#aeb7c4}
.note{font-size:.8em;color:#dfe5ee;margin-top:.15em}
.msg{height:100%;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;font-size:1.6em;font-weight:700;gap:.4em}
.msg small{font-size:.55em;font-weight:500;color:#aeb7c4}
#weeks{display:flex;justify-content:space-between;font-size:13px;font-weight:700;color:#8f98a6;padding:10px 4px 0}
#weeks .on{color:#fff}
</style></head><body><div id="page">
${chartHtml()}
<div id="content"><div id="inner">${routineHtml()}</div></div>
<div id="weeks">${weeksHtml}</div>
</div></body></html>`;

mkdirSync("site", { recursive: true });

if (process.env.DRY) {
  writeFileSync("site/preview.html", html);
  console.log("DRY: site/preview.html 작성 /", todayStr, dayName, JSON.stringify(st));
  process.exit(0);
}

// ---------- 이미지로 저장 ----------
const { default: puppeteer } = await import("puppeteer-core");
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});
const page = await browser.newPage();
await page.setViewport({ width: 540, height: 1080, deviceScaleFactor: 2 });
await page.setContent(html, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
// 종목이 많아 넘치면 글자 크기를 줄여서 맞춘다.
await page.evaluate(() => {
  const box = document.getElementById("content");
  const inner = document.getElementById("inner");
  let size = 14;
  while (inner.scrollHeight > box.clientHeight && size > 8) {
    size -= 0.5;
    inner.style.fontSize = size + "px";
  }
});
await page.screenshot({ path: "site/today.jpg", type: "jpeg", quality: 88 });
await browser.close();
console.log("완료: site/today.jpg", todayStr, dayName, JSON.stringify(st));
