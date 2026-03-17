const fs = require('fs');
const nodemailer = require('nodemailer');

// data.json 읽기
const raw = fs.readFileSync('data.json', 'utf8');
const data = JSON.parse(raw);

// 지난달 계산
const now = new Date();
const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
const y = lastMonth.getFullYear();
const m = String(lastMonth.getMonth() + 1).padStart(2, '0');
const ym = `${y}${m}`;

// 전달
const prevDate = new Date(y, lastMonth.getMonth() - 1, 1);
const pym = `${prevDate.getFullYear()}${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

function getStats(ymKey) {
  const entries = Object.entries(data)
    .filter(([k, v]) => k.startsWith(ymKey) && v.strong > 0)
    .sort(([a], [b]) => a.localeCompare(b));
  const days = entries.length;
  const mins = entries.reduce((s, [, v]) => s + (v.strong || 0), 0);
  const sets = entries.reduce((s, [, v]) => s + (v.workout?.totalSets || 0), 0);
  return { entries, days, mins, sets };
}

const cur  = getStats(ym);
const prev = getStats(pym);

const hours = (cur.mins / 60).toFixed(1);
const monthStr = `${y}년 ${parseInt(m)}월`;

function diff(cur, prev) {
  const d = cur - prev;
  if (d === 0) return '<span style="color:#555">— same</span>';
  const col = d > 0 ? '#2ed573' : '#ff4757';
  const arrow = d > 0 ? '▲' : '▼';
  return `<span style="color:${col}">${arrow} ${Math.abs(Math.round(d * 10) / 10)}</span>`;
}

// 운동 목록 행
const workoutRows = cur.entries.map(([k, v]) => {
  const day = parseInt(k.slice(6, 8));
  const title = v.workout?.title || '운동';
  const wMins = v.strong || 0;
  const wSets = v.workout?.totalSets || 0;
  return `<tr>
    <td style="padding:8px 16px;color:#666;font-family:monospace;font-size:13px;border-bottom:1px solid rgba(255,255,255,0.04);">${parseInt(m)}/${day}</td>
    <td style="padding:8px 16px;color:#ff4757;font-weight:bold;font-size:13px;border-bottom:1px solid rgba(255,255,255,0.04);">${title}</td>
    <td style="padding:8px 16px;color:#888;font-size:13px;border-bottom:1px solid rgba(255,255,255,0.04);text-align:right;">${Math.floor(wMins/60)}h${wMins%60}m &nbsp;·&nbsp; ${wSets}sets</td>
  </tr>`;
}).join('');

const reportUrl = `https://bulcoh.github.io/ssimg2/report.html`;

const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0e0e0e;font-family:'Helvetica Neue',Arial,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:40px 20px;">

  <!-- 헤더 -->
  <div style="margin-bottom:32px;">
    <p style="font-size:11px;color:#444;letter-spacing:0.15em;text-transform:uppercase;margin:0 0 8px;">Workout Report</p>
    <h1 style="font-size:44px;font-weight:900;color:#f0f0f0;margin:0;line-height:1;">
      ${y}&nbsp;<span style="color:#ff4757;">${m}</span>
    </h1>
  </div>

  <!-- 숫자 카드 -->
  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
    <tr>
      <td style="padding:0 4px 0 0;width:33%;">
        <div style="background:#1a1a1a;border-radius:12px;padding:18px 14px;border-top:2px solid #ff4757;">
          <div style="font-size:30px;font-weight:900;color:#f0f0f0;line-height:1;">${cur.days}</div>
          <div style="font-size:9px;color:#555;letter-spacing:0.12em;text-transform:uppercase;margin:4px 0 6px;">Workout Days</div>
          <div style="font-size:11px;font-family:monospace;">${diff(cur.days, prev.days)}</div>
        </div>
      </td>
      <td style="padding:0 4px;width:33%;">
        <div style="background:#1a1a1a;border-radius:12px;padding:18px 14px;border-top:2px solid #F0B83B;">
          <div style="font-size:30px;font-weight:900;color:#f0f0f0;line-height:1;">${hours}h</div>
          <div style="font-size:9px;color:#555;letter-spacing:0.12em;text-transform:uppercase;margin:4px 0 6px;">Total Hours</div>
          <div style="font-size:11px;font-family:monospace;">${diff(parseFloat(hours), parseFloat((prev.mins/60).toFixed(1)))}</div>
        </div>
      </td>
      <td style="padding:0 0 0 4px;width:33%;">
        <div style="background:#1a1a1a;border-radius:12px;padding:18px 14px;border-top:2px solid #784CD8;">
          <div style="font-size:30px;font-weight:900;color:#f0f0f0;line-height:1;">${cur.sets}</div>
          <div style="font-size:9px;color:#555;letter-spacing:0.12em;text-transform:uppercase;margin:4px 0 6px;">Total Sets</div>
          <div style="font-size:11px;font-family:monospace;">${diff(cur.sets, prev.sets)}</div>
        </div>
      </td>
    </tr>
  </table>

  <!-- 운동 목록 -->
  <div style="background:#1a1a1a;border-radius:12px;overflow:hidden;margin-bottom:28px;">
    <div style="padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.06);">
      <span style="font-size:9px;color:#555;letter-spacing:0.15em;text-transform:uppercase;">이달 운동 목록</span>
    </div>
    <table width="100%" cellpadding="0" cellspacing="0">
      ${workoutRows || '<tr><td style="padding:16px;color:#555;font-size:13px;">운동 기록 없음</td></tr>'}
    </table>
  </div>

  <!-- 리포트 버튼 -->
  <div style="text-align:center;margin-bottom:36px;">
    <a href="${reportUrl}" style="display:inline-block;background:#ff4757;color:#fff;text-decoration:none;padding:14px 36px;border-radius:50px;font-size:14px;font-weight:bold;letter-spacing:0.04em;">
      📊 전체 리포트 보기
    </a>
  </div>

  <p style="font-size:11px;color:#333;text-align:center;font-family:monospace;letter-spacing:0.1em;">SHARE STRONG IMAGE V2</p>
</div>
</body>
</html>`;

// 전송
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS
  }
});

transporter.sendMail({
  from: `"Workout Report" <${process.env.GMAIL_USER}>`,
  to: 'khsx007@naver.com',
  subject: `💪 ${monthStr} 운동 리포트 — ${cur.days}일 · ${hours}h · ${cur.sets}sets`,
  html: html
}).then(() => {
  console.log(`✅ 전송 완료: ${monthStr}`);
}).catch(err => {
  console.error('❌ 전송 실패:', err);
  process.exit(1);
});
