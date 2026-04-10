import { useState } from "react";

function timeToMinutes(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function isAvailable(player, time) {
  return (
    timeToMinutes(player.start) <= timeToMinutes(time) &&
    timeToMinutes(player.end) > timeToMinutes(time)
  );
}

function generateTimeSlots(schedule) {
  const slots = [];
  schedule.forEach((s) => {
    const base = timeToMinutes(s.time);
    slots.push({ time: s.time, courts: s.courts });

    const nextMin = base + 30;
    const hh = String(Math.floor(nextMin / 60)).padStart(2, "0");
    const mm = String(nextMin % 60).padStart(2, "0");

    slots.push({ time: `${hh}:${mm}`, courts: s.courts });
  });
  return slots;
}

function shuffle(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

function simulateOnce(players, schedule) {
  const slots = generateTimeSlots(schedule);
  const output = [];

  const gameCount = {};
  const restStreak = {};
  const playStreak = {};
  const timeline = {};

  players.forEach((p) => {
    gameCount[p.name] = 0;
    restStreak[p.name] = 0;
    playStreak[p.name] = 0;
    timeline[p.name] = [];
  });

  slots.forEach((slot) => {
    let available = players.filter((p) => isAvailable(p, slot.time));

    available = shuffle(available).sort((a, b) => {
      const score = (p) => {
        const ps = playStreak[p.name];
        const g = gameCount[p.name];
        const r = restStreak[p.name];
        return ps * 50 + g * 10 - r * 5;
      };
      return score(a) - score(b);
    });

    const cap = slot.courts * 4;
    const selected = [];

    const wouldBreakStreak = (p) => {
      const arr = timeline[p.name];
      const n = arr.length;
      if (n >= 2 && arr[n - 1] === 1 && arr[n - 2] === 1) return true;
      return false;
    };

    for (const p of available) {
      if (selected.length >= cap) break;
      if (wouldBreakStreak(p)) continue;
      selected.push(p);
    }

    if (selected.length < cap) {
      const rest = available.filter((p) => !selected.includes(p));
      rest.sort((a, b) => playStreak[a.name] - playStreak[b.name]);
      for (const p of rest) {
        if (selected.length >= cap) break;
        selected.push(p);
      }
    }

    const matches = [];

    for (let i = 0; i < selected.length; i += 4) {
      if (selected[i + 3]) {
        const g = [selected[i], selected[i + 1], selected[i + 2], selected[i + 3]];
        matches.push([
          [g[0], g[1]],
          [g[2], g[3]]
        ]);

        g.forEach((p) => {
          gameCount[p.name] += 1;
          restStreak[p.name] = 0;
          playStreak[p.name] += 1;
          timeline[p.name].push(1);
        });
      }
    }

    const played = new Set(matches.flat(2).map((p) => p.name));

    available.forEach((p) => {
      if (!played.has(p.name)) {
        restStreak[p.name] += 1;
        playStreak[p.name] = 0;
        timeline[p.name].push(0);
      }
    });

    output.push({
      time: slot.time,
      matches,
      rest: available.filter((p) => !played.has(p.name))
    });
  });

  let penalty = 0;

  const values = Object.values(gameCount);
  if (values.length) {
    penalty += (Math.max(...values) - Math.min(...values)) * 10;
  }

  Object.values(timeline).forEach((arr) => {
    let streak = 0;
    arr.forEach((v) => {
      if (v === 1) {
        streak++;
        if (streak >= 3) penalty += streak * 80;
        if (streak >= 4) penalty += 300;
      } else {
        streak = 0;
      }
    });

    let last = -100;
    arr.forEach((v, i) => {
      if (v === 1) {
        const gap = i - last;
        if (gap === 1) penalty += 40;
        if (gap === 2) penalty += 10;
        last = i;
      }
    });
  });

  return { output, penalty };
}

function simulate(players, schedule) {
  let best = null;

  for (let i = 0; i < 300; i++) {
    const r = simulateOnce(players, schedule);
    if (!best || r.penalty < best.penalty) {
      best = r;
    }
  }

  return { output: best.output };
}

const containerStyle = {
  padding: 20,
  background: "#0f2c4d",
  minHeight: "100vh",
  color: "white"
};

const cardStyle = {
  background: "white",
  color: "black",
  padding: 20,
  borderRadius: 16,
  maxWidth: 900,
  margin: "0 auto"
};

const inputStyle = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #ddd",
  background: "#f5f5f5",
  textAlign: "center"
};

const buttonStyle = {
  padding: "10px 18px",
  borderRadius: 10,
  border: "none",
  background: "#2ea4ff",
  color: "white",
  fontWeight: "bold",
  cursor: "pointer"
};

export default function App() {
  const [tab, setTab] = useState("input");
  const [players, setPlayers] = useState([
    { name: "민경", start: "19:00", end: "22:00" }
  ]);
  const [schedule, setSchedule] = useState([
    { time: "19:00", courts: 1 }
  ]);
  const [result, setResult] = useState([]);
  const [stats, setStats] = useState({});

  const generate = () => {
    const { output } = simulate(players, schedule);

    const gameStats = {};
    players.forEach((p) => (gameStats[p.name] = 0));

    output.forEach((r) => {
      r.matches.forEach((m) => {
        m.flat().forEach((p) => {
          gameStats[p.name] += 1;
        });
      });
    });

    setStats(gameStats);
    setResult(output);
    setTab("result");
  };

  return (
    <div style={containerStyle}>
      <h1 style={{ textAlign: "center", fontSize: 32, fontWeight: 800, color: "white" }}>
        TENNIS WITH ME 🎾
      </h1>

      {tab === "input" && (
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          <div style={{ ...cardStyle, marginBottom: 20 }}>
            <h3 style={{ textAlign: "center" }}>참석자 입력</h3>

            {players.map((p, i) => (
              <div key={i} style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 8 }}>
                <input
                  style={inputStyle}
                  value={p.name}
                  onChange={(e) => {
                    const c = [...players];
                    c[i].name = e.target.value;
                    setPlayers(c);
                  }}
                />
                <input
                  style={inputStyle}
                  type="time"
                  value={p.start}
                  onChange={(e) => {
                    const c = [...players];
                    c[i].start = e.target.value;
                    setPlayers(c);
                  }}
                />
                <input
                  style={inputStyle}
                  type="time"
                  value={p.end}
                  onChange={(e) => {
                    const c = [...players];
                    c[i].end = e.target.value;
                    setPlayers(c);
                  }}
                />
                <button onClick={() => setPlayers(players.filter((_, idx) => idx !== i))}>✖️</button>
              </div>
            ))}

            <div style={{ textAlign: "center" }}>
              <button onClick={() => setPlayers([...players, { name: "", start: "16:00", end: "20:00" }])}>➕</button>
            </div>
          </div>

          <div style={{ ...cardStyle, marginBottom: 20 }}>
            <h3 style={{ textAlign: "center" }}>시간별 코트수</h3>

            {schedule.map((s, i) => (
              <div key={i} style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 8 }}>
                <input
                  style={inputStyle}
                  type="time"
                  value={s.time}
                  onChange={(e) => {
                    const c = [...schedule];
                    c[i].time = e.target.value;
                    setSchedule(c);
                  }}
                />
                <input
                  style={inputStyle}
                  type="number"
                  value={s.courts}
                  onChange={(e) => {
                    const c = [...schedule];
                    c[i].courts = Number(e.target.value);
                    setSchedule(c);
                  }}
                />
                <button onClick={() => setSchedule(schedule.filter((_, idx) => idx !== i))}>✖️</button>
              </div>
            ))}

            <div style={{ textAlign: "center" }}>
              <button onClick={() => setSchedule([...schedule, { time: "17:00", courts: 1 }])}>➕</button>
            </div>
          </div>

          <div style={{ textAlign: "center" }}>
            <button style={buttonStyle} onClick={generate}>
              대진 생성
            </button>
          </div>
        </div>
      )}

      {tab === "result" && (
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <button onClick={() => setTab("input")}>← 입력으로 돌아가기</button>
          </div>

          <div style={cardStyle}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "center" }}>
              <thead>
                <tr style={{ background: "#2ea4ff", color: "white" }}>
                  <th>시간</th>
                  <th>코트</th>
                  <th>팀 A</th>
                  <th>팀 B</th>
                  <th>휴식자</th>
                </tr>
              </thead>
              <tbody>
                {result.map((r, i) =>
                  r.matches.map((m, j) => (
                    <tr key={`${i}-${j}`}>
                      <td style={{ border: "1px solid #ddd", padding: 8 }}>{r.time}</td>
                      <td style={{ border: "1px solid #ddd" }}>{j + 1}</td>
                      <td style={{ border: "1px solid #ddd" }}>{m[0][0].name}/{m[0][1].name}</td>
                      <td style={{ border: "1px solid #ddd" }}>{m[1][0].name}/{m[1][1].name}</td>
                      <td style={{ border: "1px solid #ddd" }}>{j === 0 ? r.rest.map((p) => p.name).join(", ") : ""}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div style={{ ...cardStyle, marginTop: 20 }}>
            <h3 style={{ textAlign: "center" }}>참가자별 게임 수</h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
              {Object.entries(stats).map(([name, count]) => (
                <div key={name} style={{ padding: "8px 12px", borderRadius: 8, background: "#f2f2f2" }}>
                  {name} : {count}게임
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
