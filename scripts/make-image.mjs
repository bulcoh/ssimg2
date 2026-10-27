// 오늘의 루틴 + 최근 14일 운동시간 그래프를 기기별 배경화면(폰 1080x2160, Fire 1024x600)으로 만든다.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const KO = { Mon: "월", Tue: "화", Wed: "수", Thu: "목", Fri: "금", Sat: "토", Sun: "일" };
const KANJI = { Mon: "月", Tue: "火", Wed: "水", Thu: "木", Fri: "金", Sat: "土", Sun: "日" };
const DAY_MS = 86400000;
// ---------- 기기별 설정 ----------
// w,h = 기기 화면 크기(CSS 픽셀), scale = 배율 (실제 이미지 크기 = (w+bleedX*2)*scale x (h+bleedY*2)*scale)
// bleedX/bleedY = 기기 화면 바깥으로 더 키우는 여백(한쪽 기준). 기기가 배경화면을 확대해서 잘리는 만큼을 이미지가 미리 더 크게 가지고 있게 한다.
// side/top/bottom = 기기 화면 가장자리에서 안쪽으로 둘 안전 여백(px). 상태표시줄이 덮는 영역 등을 피한다. (bleed는 따로 더해진다)
// boxW = 통 폭, unit = 30분 한 칸의 높이, cols = 루틴 목록 단 수, base = 기본 글자 크기
// grid = 눈금선을 그을 분(分) 값들. CAP(110)이 통 꼭대기라서 값이 클수록 위로 올라간다.
// valley = 가운데 캡슐이 아래로 내려앉는 깊이(px), 0이면 직선. 폰은 중앙 상단 시계(날짜 글자)를 피하려고 계곡 모양.
// titleTop = true면 타이틀(WEEK1 Legs #2)을 맨 위 가운데에 두고, false면 루틴 목록 맨 앞에 둔다. titleDrop = 타이틀만 아래로 내리는 양(px)
// 새 기기를 추가하려면 아래에 한 줄을 더 쓰면 된다. 결과 파일은 file 이름으로 image 브랜치에 올라간다.
const PROFILES = {
  // Mi Max 3 (픽셀롬): 배경화면이 약 8% 확대되어 좌우 약 20, 상하 약 40이 잘린다. (540x1080 기준)
  phone: { file: "today.jpg", w: 540, h: 1080, scale: 2, bleedX: 0, bleedY: 0, side: 46, top: 100, bottom: 190, boxW: 24, unit: 26, cols: 1, base: 14, valley: 72, titleTop: true, titleDrop: 10, grid: [30, 60, 90] },
  // Fire 7 (2022): 600x1024 세로 화면. 배경화면이 약 8% 확대되어 한쪽당 가로 약 24, 세로 약 41이 잘린다.
  // 그래서 이미지를 가로 +60, 세로 +104 더 크게(660x1128) 만들고, 안전 여백은 그 바깥 여백(bleed) 안쪽부터 잰다.
  // 그래프는 좁은 화면에 맞춰 계곡 없이 직선, 높이는 폰의 80%(unit 26 -> 20.8), 눈금선은 2줄(50, 100분).
  fire: { file: "today-fire.jpg", w: 600, h: 1024, scale: 2, bleedX: 0, bleedY: 0, side: 5, top: 5, bottom: 5, boxW: 24, unit: 20.8, cols: 1, base: 17, valley: 0, titleTop: false, titleDrop: 0, grid: [50, 100] },
};
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

// ---------- 타이틀 / 본문(루틴) ----------
// 오늘 운동이 있는 날이면 { title, exercises }, 아니면 null
function todayPlan() {
  if (st.kind !== "ok") return null;
  const day = routine[st.weekKey]?.[dayName];
  if (!day || !day.exercises.length) return null;
  return { title: `${esc(st.weekKey)} ${esc(day.title)}`, exercises: day.exercises };
}
// titleTop 기기: 맨 위 가운데에 놓는 타이틀
function titleHtml(P) {
  const plan = todayPlan();
  if (!P.titleTop || !plan) return "";
  return `<h1 class="ttl">${plan.title}</h1>`;
}
function routineHtml(P) {
  if (st.kind === "before") return msg("아직 시작 전이에요", `시작일 ${esc(cfg.start_date)}`);
  if (st.kind === "skip") return msg("이번 주는 디로드·휴식 주", "푹 쉬어요");
  if (st.kind === "done") return msg("루틴이 끝났어요", "ppl/config.json에서 다음 루틴을 정해 주세요");
  const plan = todayPlan();
  if (!plan) return msg(`${esc(st.weekKey)} · ${KO[dayName]}요일`, "오늘은 휴식일");
  const rows = plan.exercises.map((e) => {
    const subs = [e.sub1, e.sub2].filter(Boolean).map(esc).join('<i></i>');
    const f = (label, v, cls) => (v ? `<span class="${cls}">${label}[ ${esc(v)} ]</span>` : "");
    return `<div class="ex">
      <div class="nm"><b>${esc(e.name)}</b>${subs ? `<span class="sub">${subs}</span>` : ""}</div>
      <div class="meta">${f("W", e.w, "y")}${f("Sets ", e.sets, "c")}${f("Reps ", e.reps, "w")}${f("Rpe ", e.rpe, "w")}${f("Rest ", e.rest, "g")}</div>
      ${e.note ? `<div class="note">${esc(e.note)}</div>` : ""}
    </div>`;
  }).join("");
  return `${P.titleTop ? "" : `<h1>${plan.title}</h1>`}<div class="cols">${rows}</div>`;
}
function msg(big, small) {
  return `<div class="msg"><div>${big}</div><small>${small}</small></div>`;
}

// ---------- 최근 14일 그래프 (플랫 캡슐 통 + 빈틈없이 채워지는 내용물) ----------
const CAP = 110;   // 통의 상한(분). 이보다 길게 운동한 날은 통이 가득 찬 모양으로 표시되고 숫자는 실제 시간이 나온다.
function chartHtml(P) {
  const UNIT = P.unit;
  const days = Array.from({ length: 14 }, (_, i) => today - (13 - i) * DAY_MS);
  const hC = (CAP / 30) * UNIT;          // 통 높이
  // 눈금선은 통 안쪽에만 그린다. (통 안 맨 아래 = 0분이라 0분선은 따로 없다)
  const lines = P.grid.map((v) => `<i style="bottom:${((v / 30) * UNIT - 1).toFixed(1)}px"></i>`).join("");
  const cols = days.map((ms, i) => {
    const [a, c] = log.get(fmt(ms)) || [0, 0];
    const t = a + c;
    const w = dow(ms);
    const cls = w === 5 ? "sat" : w === 6 ? "sun" : "";
    // 양 끝은 위로, 가운데로 갈수록 아래로 내려앉는 포물선(계곡). valley가 0이면 직선.
    const u = (i - 6.5) / 6.5;
    const off = (P.valley * (1 - u * u)).toFixed(1);
    // 내용물은 통 안쪽을 빈틈없이 채운다. 통이 둥글게 잘라 주기 때문에 막대 두 개가 겹쳐 보이지 않는다.
    // 아래쪽 진한색 = 무산소, 위쪽 연한색 = 유산소
    const fillH = Math.max(0, Math.min((Math.min(t, CAP) / 30) * UNIT - 1, hC - 2));
    const aH = Math.max(0, Math.min((a / 30) * UNIT - 1, fillH));
    const numColor = a || fillH < 17 ? "#8db8f5" : "#0b2a66";
    const inner = t
      ? `<s style="height:${fillH.toFixed(1)}px;--a:${aH.toFixed(1)}px"></s><em style="color:${numColor}">${t}</em>`
      : "";
    return `<div class="col ${cls} ${ms === today ? "today" : ""}" style="margin-top:${off}px">
      <p><span>${KANJI[DAYS[w]]}</span></p><div class="bars" style="height:${hC.toFixed(1)}px"><k>${inner}${lines}</k></div></div>`;
  }).join("");
  return `<div id="chart">${cols}</div>`;
}

// ---------- 배경 ----------
// assets/bg-기기이름.jpg 가 있으면 그것을, 없으면 assets/bg.jpg 를 쓴다. 둘 다 없으면 어두운 단색.
function bgFor(name) {
  for (const f of [`assets/bg-${name}.jpg`, "assets/bg.jpg", "assets/bg.jpeg", "assets/bg.png"]) {
    if (existsSync(f)) {
      const mime = f.endsWith("png") ? "image/png" : "image/jpeg";
      return `url(data:${mime};base64,${readFileSync(f).toString("base64")})`;
    }
  }
  return "linear-gradient(#1b1f26,#0e1014)";
}

function buildHtml(name, P) {
  const BOX_W = P.boxW;
  const W = P.w + P.bleedX * 2; // 실제로 그리는 캔버스 크기 (기기 화면 + 잘릴 여백)
  const H = P.h + P.bleedY * 2;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@800&text=0123456789%E6%9C%88%E7%81%AB%E6%B0%B4%E6%9C%A8%E9%87%91%E5%9C%9F%E6%97%A5&display=block"><style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${W}px;height:${H}px;overflow:hidden}
body{--dfont:"Noto Sans TC","Noto Sans CJK TC","Noto Sans CJK KR",sans-serif;font-family:"Noto Sans CJK KR","Noto Sans KR","Apple SD Gothic Neo",sans-serif;color:#f1f3f6;
  background:${bgFor(name)} center/cover no-repeat}
#page{height:${H}px;display:flex;flex-direction:column;padding:${P.bleedY + P.top}px ${P.bleedX + P.side}px ${P.bleedY + P.bottom}px}
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
#inner{font-size:${P.base}px;line-height:1.35}
.cols{column-count:${P.cols};column-gap:28px}
h1{font-size:1.5em;font-style:italic;font-weight:800;margin-bottom:.3em}
h1.ttl{font-size:21px;line-height:1.35;text-align:center;margin-bottom:6px;position:relative;top:${P.titleDrop}px}
.ex{margin-bottom:.8em;break-inside:avoid}
.nm b{font-size:1.2em;font-weight:600;margin-right:.6em}
.sub{font-size:.8em;color:#aeb7c4}.sub i{margin:0 .35em}
.meta{font-size:.95em;font-weight:600;display:flex;gap:.9em;flex-wrap:wrap}
.y{color:#ffd23c}.c{color:#3fb5ff}.w{color:#f1f3f6}.g{color:#aeb7c4}
.note{font-size:.8em;color:#dfe5ee;margin-top:.15em}
.msg{height:100%;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;font-size:1.6em;font-weight:700;gap:.4em}
.msg small{font-size:.55em;font-weight:500;color:#aeb7c4}
</style></head><body><div id="page">
${titleHtml(P)}
${chartHtml(P)}
<div id="content"><div id="inner">${routineHtml(P)}</div></div>
</div></body></html>`;
}

mkdirSync("site", { recursive: true });

const only = process.env.PROFILE; // 특정 기기만 만들고 싶을 때(예: PROFILE=fire)
const targets = Object.entries(PROFILES).filter(([name]) => !only || name === only);

if (process.env.DRY) {
  for (const [name, P] of targets) writeFileSync(`site/preview-${name}.html`, buildHtml(name, P));
  console.log("DRY:", targets.map(([n]) => n).join(","), todayStr, dayName, JSON.stringify(st));
  process.exit(0);
}

// ---------- 이미지로 저장 ----------
const { default: puppeteer } = await import("puppeteer-core");
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});
for (const [name, P] of targets) {
  const W = P.w + P.bleedX * 2;
  const H = P.h + P.bleedY * 2;
  const html = buildHtml(name, P);
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: P.scale });
  try {
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 30000 });
  } catch {
    await page.setContent(html, { waitUntil: "load" }); // 구글 폰트가 안 불러와지면 기본 폰트로
  }
  await page.evaluate(() => document.fonts.ready);
  // 종목이 많아 넘치면 글자 크기를 줄여서 맞춘다. (세로로 넘치거나, 단이 옆으로 밀려나면 줄인다)
  await page.evaluate((base) => {
    const box = document.getElementById("content");
    const inner = document.getElementById("inner");
    let size = base;
    while ((inner.scrollHeight > box.clientHeight || inner.scrollWidth > box.clientWidth) && size > 8) {
      size -= 0.5;
      inner.style.fontSize = size + "px";
    }
  }, P.base);
  await page.screenshot({ path: `site/${P.file}`, type: "jpeg", quality: 88 });
  await page.close();
  console.log("완료:", `site/${P.file}`, `${W * P.scale}x${H * P.scale}`, todayStr, dayName, JSON.stringify(st));
}
await browser.close();
