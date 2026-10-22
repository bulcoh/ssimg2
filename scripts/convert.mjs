import { writeFileSync } from "node:fs";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const REQUIRED = ["WEEK", "DAY", "TITLE", "EXERCISE"];

function parseCSV(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(f); f = ""; rows.push(row); row = [];
    } else f += c;
  }
  if (f !== "" || row.length) { row.push(f); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

function convert(text) {
  const rows = parseCSV(text);
  if (!rows.length) throw new Error("CSV가 비어 있어요.");
  const head = rows[0].map((h) => h.trim().toUpperCase());
  const miss = REQUIRED.filter((h) => !head.includes(h));
  if (miss.length) throw new Error("헤더에 없는 열: " + miss.join(", "));
  const get = (r, h) => {
    const i = head.indexOf(h);
    return i < 0 ? "" : (r[i] || "").trim();
  };
  const out = {};
  let lw = "", ld = "", lt = "";
  for (const r of rows.slice(1)) {
    const week = get(r, "WEEK") || lw, day = get(r, "DAY") || ld, title = get(r, "TITLE") || lt;
    lw = week; ld = day; lt = title;
    out[week] ??= {};
    out[week][day] ??= { title, exercises: [] };
    const name = get(r, "EXERCISE");
    if (name) out[week][day].exercises.push({
      name, w: get(r, "W"), sets: get(r, "SETS"), reps: get(r, "REPS"), rpe: get(r, "RPE"),
      rest: get(r, "REST"), sub1: get(r, "SUB 1"), sub2: get(r, "SUB 2"), note: get(r, "NOTE"),
    });
  }
  for (const w of Object.keys(out)) for (const d of DAYS)
    out[w][d] ??= { title: d === "Sun" ? "Rest" : "", exercises: [] };
  return out;
}

const url = process.env.CSV_URL;
if (!url) throw new Error("CSV_URL이 설정되지 않았어요.");
const res = await fetch(url);
if (!res.ok) throw new Error("CSV를 가져오지 못했어요: " + res.status);
const result = convert(await res.text());
writeFileSync(process.env.OUT_FILE || "routine.json", JSON.stringify(result, null, 2) + "\n");
console.log("완료:", Object.keys(result).length, "개 주차");
