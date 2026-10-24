// 오늘의 루틴 + 최근 14일 운동시간 그래프를 1080x2160 배경화면으로 만든다.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const KO = { Mon: "월", Tue: "화", Wed: "수", Thu: "목", Fri: "금", Sat: "토", Sun: "일" };
const KANJI = { Mon: "月", Tue: "火", Wed: "水", Thu: "木", Fri: "金", Sat: "土", Sun: "日" };
const DAY_MS = 86400000;
// 단위는 모두 px(540x1080 기준). 폰이 배경화면을 약 8% 확대해서 가장자리(좌우 약 20, 상하 약 40)가 잘린다.
const SIDE_SAFE = 46;    // 좌우 여백: 잘리는 폭보다 넓게
const TOP_SAFE = 100;    // 위 여백: 잘림(약 40) + 상태표시줄(시계/아이콘) 아래로 내려오도록
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

// ---------- 타이틀 (맨 위 가운데) ----------
function titleHtml() {
  if (st.kind !== "ok") return "";
  const day = routine[st.weekKey]?.[dayName];
  if (!day || !day.exercises.length) return "";
  return `<h1>${esc(st.weekKey)} ${esc(day.title)}</h1>`;
}

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
  return rows;
}
function msg(big, small) {
  return `<div class="msg"><div>${big}</div><small>${small}</small></div>`;
}

// ---------- 최근 14일 그래프 (플랫 캡슐 통 + 빈틈없이 채워지는 내용물) ----------
const UNIT = 26;   // 30분 한 칸의 높이(px)
const CAP = 110;   // 통의 상한(분). 이보다 길게 운동한 날은 통이 가득 찬 모양으로 표시되고 숫자는 실제 시간이 나온다.
const BOX_W = 24;  // 통 폭(px). 양 끝이 둥근 캡슐 모양
const VALLEY = 72; // 가운데 캡슐이 아래로 내려앉는 깊이(px). 중앙 상단의 시계(날짜 글자)를 피하는 계곡 모양
function chartHtml() {
  const days = Array.from({ length: 14 }, (_, i) => today - (13 - i) * DAY_MS);
  const hC = (CAP / 30) * UNIT;          // 통 높이
  // 30·60·90분 눈금선은 통 안쪽에만 그린다. (통 안 맨 아래 = 0분이라 0분선은 따로 없다)
  const lines = [30, 60, 90].map((v) => `<i style="bottom:${(v / 30) * UNIT - 1}px"></i>`).join("");
  const cols = days.map((ms, i) => {
    const [a, c] = log.get(fmt(ms)) || [0, 0];
    const t = a + c;
    const w = dow(ms);
    const cls = w === 5 ? "sat" : w === 6 ? "sun" : "";
    // 양 끝은 위로, 가운데로 갈수록 아래로 내려앉는 포물선(계곡)
    const u = (i - 6.5) / 6.5;
    const off = (VALLEY * (1 - u * u)).toFixed(1);
    // 내용물은 통 안쪽을 빈틈없이 채운다. 통이 둥글게 잘라 주기 때문에 막대 두 개가 겹쳐 보이지 않는다.
    // 아래쪽 진한색 = 무산소, 위쪽 연한색 = 유산소
    const fillH = Math.max(0, Math.min((Math.min(t, CAP) / 30) * UNIT - 1, hC - 2));
    const aH = Math.max(0, Math.min((a / 30) * UNIT - 1, fillH));
    const numColor = a || fillH < 17 ? "#8db8f5" : "#0b2a66";
    const inner = t
      ? `<s style="height:${fillH.toFixed(1)}px;--a:${aH.toFixed(1)}px"></s><em style="color:${numColor}">${t}</em>`
      : "";
    return `<div class="col ${cls} ${ms === today ? "today" : ""}" style="margin-top:${off}px">
      <p><span>${KANJI[DAYS[w]]}</span></p><div class="bars" style="height:${hC}px"><k>${inner}${lines}</k></div></div>`;
  }).join("");
  return `<div id="chart">${cols}</div>`;
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
  background:${bg} center/cover no-repeat}
#page{height:1080px;display:flex;flex-direction:column;padding:${TOP_SAFE}px ${SIDE_SAFE}px ${BOTTOM_SAFE}px}
h1{font-size:21px;line-height:1.35;font-style:italic;font-weight:800;text-align:center;margin-bottom:6px}
#chart{position:relative;display:flex;align-items:flex-start;gap:2px;padding:0 6px;margin-bottom:12px}
.col{flex:1;text-align:center;position:relative}
.col p{font-family:var(--dfont);line-height:1.15;padding:2px 0 3px;margin-bottom:2px;color:#e8ecf2;font-weight:800}
.col.today p{border-bottom:2px solid #fff}
.col p span{font-size:19px}
.col.sat p{color:#5b9bff}.col.sun p{color:#ff6b6b}
.bars{position:relative}
.bars k{position:absolute;left:50%;margin-left:-${BOX_W/2}px;width:${BOX_W}px;height:100%;bottom:0;border:1px solid rgba(255,255,255,.24);border-radius:${BOX_W/2}px;background:rgba(255,255,255,.05);overflow:hidden;z-index:2}
.col.today .bars k{border-color:rgba(255,255,255,.7)}
.bars s{position:absolute;left:0;right:0;bottom:0;background:#8db8f5;text-decoration:none}
.bars s::before{content:"";position:absolute;left:0;right:0;bottom:0;height:var(--a);background:#2f6bd6}
.bars i{position:absolute;left:0;right:0;height:0;border-top:1px solid rgba(224,160,48,.85);z-index:2}
.bars em{position:absolute;left:0;right:0;bottom:7px;text-align:center;font-family:var(--dfont);font-weight:800;font-style:normal;font-size:11px;line-height:1;z-index:3}
#content{flex:1;overflow:hidden;min-height:0}
#inner{font-size:14px;line-height:1.35}
.ex{margin-bottom:.8em}
.nm b{font-size:1.2em;font-weight:600;margin-right:.6em}
.sub{font-size:.8em;color:#aeb7c4}.sub i{margin:0 .35em}
.meta{font-size:.95em;font-weight:600;display:flex;gap:.9em;flex-wrap:wrap}
.y{color:#ffd23c}.c{color:#3fb5ff}.w{color:#f1f3f6}.g{color:#aeb7c4}
.note{font-size:.8em;color:#dfe5ee;margin-top:.15em}
.msg{height:100%;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;font-size:1.6em;font-weight:700;gap:.4em}
.msg small{font-size:.55em;font-weight:500;color:#aeb7c4}
</style></head><body><div id="page">
${titleHtml()}
${chartHtml()}
<div id="content"><div id="inner">${routineHtml()}</div></div>
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
