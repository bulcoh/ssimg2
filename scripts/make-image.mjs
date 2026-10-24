// 오늘의 루틴 + 최근 14일 운동시간 그래프를 1080x2160 배경화면으로 만든다.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const KO = { Mon: "월", Tue: "화", Wed: "수", Thu: "목", Fri: "금", Sat: "토", Sun: "일" };
const KANJI = { Mon: "月", Tue: "火", Wed: "水", Thu: "木", Fri: "金", Sat: "土", Sun: "日" };
const DAY_MS = 86400000;
// 단위는 모두 px(540x1080 기준). 폰이 배경화면을 약 8% 확대해서 가장자리(좌우 약 20, 상하 약 40)가 잘린다.
const SIDE_SAFE = 26;    // 좌우 여백: 잘리는 폭보다 넓게
const TOP_SAFE = 84;     // 위 여백: 잘림(약 40) + 상태표시줄(시계/아이콘) 아래로 내려오도록
const BOTTOM_SAFE = 190; // 하단 독(앱 아이콘) 영역
// 픽셀롬이 배경화면을 약 8% 확대해서 가장자리가 잘린다(좌우 약 20px, 상하 약 40px, 540x1080 기준).
// 그래서 위쪽 46px, 좌우 26px 안쪽에만 내용을 둔다.
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
  const UNIT = 26; // 30분 한 칸의 높이(px). 숫자를 키우면 그래프가 커진다.
  const top = Math.max(90, Math.ceil(Math.max(...totals) / 30) * 30); // 30분 단위로 맞춘 그래프 높이
  const H = (top / 30) * UNIT;
  const px = (v) => ((v / 30) * UNIT).toFixed(1);
  // 0, 30, 60, 90분 눈금선 4줄 (막대 위에 그려진다)
  const grid = [0, 30, 60, 90].map((v) => `<u style="bottom:${(v / 30) * UNIT}px"></u>`).join("");
  const cols = days.map((ms) => {
    const [a, c] = log.get(fmt(ms)) || [0, 0];
    const w = dow(ms);
    const cls = w === 5 ? "sat" : w === 6 ? "sun" : "";
    // 연한 막대는 (무산소+유산소) 전체 높이, 그 위에 진한 무산소 막대를 겹친다.
    const bars = a + c
      ? `<s class="l" style="height:${px(a + c)}px"></s><s class="d${c ? "" : " r"}" style="height:${px(a)}px"></s><em style="color:${a ? "#8db8f5" : "#1d3f8c"}">${a + c}</em>`
      : "";
    return `<div class="col ${cls} ${ms === today ? "today" : ""}">
      <p><b>${new Date(ms).getUTCDate()}</b><br><span>${KANJI[DAYS[w]]}</span></p><div class="bars" style="height:${H}px">${bars}</div></div>`;
  }).join("");
  return `<div id="chart"><div class="grid" style="height:${H}px">${grid}</div>${cols}</div>`;
}

// ---------- 배경 ----------
let bg = "linear-gradient(#1b1f26,#0e1014)";
for (const f of ["assets/bg.jpg", "assets/bg.jpeg", "assets/bg.png"]) {
  if (existsSync(f)) {
    const mime = f.endsWith("png") ? "image/png" : "image/jpeg";
    bg = `url(data:${mime};base64,${readFileSync(f).toString("base64")})`;
    break;
  }
}

const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@800&text=0123456789%E6%9C%88%E7%81%AB%E6%B0%B4%E6%9C%A8%E9%87%91%E5%9C%9F%E6%97%A5&display=block"><style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:540px;height:1080px;overflow:hidden}
body{--dfont:"Noto Sans TC","Noto Sans CJK TC","Noto Sans CJK KR",sans-serif;font-family:"Noto Sans CJK KR","Noto Sans KR","Apple SD Gothic Neo",sans-serif;color:#f1f3f6;
  background:linear-gradient(rgba(0,0,0,.45),rgba(0,0,0,.45)),${bg} center/cover no-repeat}
#page{height:1080px;display:flex;flex-direction:column;padding:${TOP_SAFE}px ${SIDE_SAFE}px ${BOTTOM_SAFE}px}
#chart{position:relative;display:flex;gap:2px;padding:0 6px;margin-bottom:12px}
#chart .grid{position:absolute;left:0;right:0;bottom:0;pointer-events:none;z-index:3}
#chart .grid u{position:absolute;left:0;right:0;height:0;border-top:1px solid #e0a030}
.col{flex:1;text-align:center;position:relative;border-radius:4px}
.col.today{background:rgba(255,255,255,.1)}
.col p{font-family:var(--dfont);line-height:1.15;margin-bottom:5px;color:#e8ecf2;font-weight:800}
.col p b{font-size:16px;font-weight:800}
.col p span{font-size:19px}
.col.sat p{color:#5b9bff}.col.sun p{color:#ff6b6b}
.bars{position:relative;margin:0 1px}
.bars s{position:absolute;left:0;right:0;bottom:0;text-decoration:none}
.bars .l{background:#8db8f5;border-radius:3px 3px 0 0}
.bars .d{background:#2f6bd6}
.bars .d.r{border-radius:3px 3px 0 0}
.bars em{position:absolute;left:0;right:0;bottom:3px;text-align:center;font-family:var(--dfont);font-weight:800;font-style:normal;font-size:11px;z-index:4}
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
</style></head><body><div id="page">
${chartHtml()}
<div id="content"><div id="inner">${routineHtml()}</div></div>
</div></body></html>`;

mkdirSync("site", { recursive: true });

// ---------- KWGT용 가벼운 JSON: 오늘 루틴과 14일 기록만 담는다 ----------
{
  const day = st.kind === "ok" ? routine[st.weekKey]?.[dayName] : null;
  const logDays = Array.from({ length: 14 }, (_, i) => {
    const ms = today - (13 - i) * DAY_MS;
    const [a, c] = log.get(fmt(ms)) || [0, 0];
    return { date: fmt(ms), day: KANJI[DAYS[dow(ms)]], a, c, t: a + c };
  });
  const out = {
    date: todayStr,
    weekday: dayName,
    status: st.kind, // ok / before / skip / done
    week: st.kind === "ok" ? st.n : null,
    week_key: st.kind === "ok" ? st.weekKey : null,
    total_weeks: weekKeys.length,
    title: day?.title || "",
    rest_day: st.kind === "ok" && !(day && day.exercises.length),
    exercises: day?.exercises || [],
    log: logDays,
  };
  writeFileSync("site/today.json", JSON.stringify(out) + "\n");
}

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
try {
  await page.setContent(html, { waitUntil: "networkidle0", timeout: 30000 });
} catch {
  await page.setContent(html, { waitUntil: "load" }); // 구글 폰트가 안 불러와지면 기본 폰트로
}
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
