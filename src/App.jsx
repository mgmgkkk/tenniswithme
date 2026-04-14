import { useMemo, useState } from "react";

function timeToMinutes(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(total) {
  const hh = String(Math.floor(total / 60)).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function isAvailable(player, time) {
  const now = timeToMinutes(time);
  return timeToMinutes(player.start) <= now && timeToMinutes(player.end) > now;
}

function generateTimeSlots(schedule) {
  const slots = [];

  schedule
    .slice()
    .sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time))
    .forEach((s) => {
      const base = timeToMinutes(s.time);
      slots.push({ time: s.time, courts: Number(s.courts) || 0 });
      slots.push({ time: minutesToTime(base + 30), courts: Number(s.courts) || 0 });
    });

  return slots;
}

function shuffle(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

function pairKey(a, b) {
  return [a, b].sort().join("|");
}

function buildRemainingOpportunities(players, slots) {
  const remaining = {};

  players.forEach((p) => {
    remaining[p.name] = new Array(slots.length).fill(0);
    let count = 0;
    for (let i = slots.length - 1; i >= 0; i -= 1) {
      if (isAvailable(p, slots[i].time)) count += 1;
      remaining[p.name][i] = count;
    }
  });

  return remaining;
}

function getPairPenalty(a, b, pairHistory) {
  return (pairHistory[pairKey(a.name, b.name)] || 0) * 120;
}

function getOpponentPenalty(teamA, teamB, oppHistory) {
  let score = 0;
  for (const a of teamA) {
    for (const b of teamB) {
      score += (oppHistory[pairKey(a.name, b.name)] || 0) * 35;
    }
  }
  return score;
}

function groupPairingScore(group, pairHistory, oppHistory) {
  const pairings = [
    [[group[0], group[1]], [group[2], group[3]]],
    [[group[0], group[2]], [group[1], group[3]]],
    [[group[0], group[3]], [group[1], group[2]]],
  ];

  let best = null;

  pairings.forEach((match) => {
    const [teamA, teamB] = match;
    const score =
      getPairPenalty(teamA[0], teamA[1], pairHistory) +
      getPairPenalty(teamB[0], teamB[1], pairHistory) +
      getOpponentPenalty(teamA, teamB, oppHistory);

    if (!best || score < best.score) {
      best = { match, score };
    }
  });

  return best;
}

function bestMatchArrangement(players, pairHistory, oppHistory) {
  if (players.length === 0) {
    return { matches: [], score: 0 };
  }

  const first = players[0];
  let best = null;

  for (let i = 1; i < players.length; i += 1) {
    for (let j = i + 1; j < players.length; j += 1) {
      for (let k = j + 1; k < players.length; k += 1) {
        const group = [first, players[i], players[j], players[k]];
        const rest = players.filter((_, idx) => idx !== 0 && idx !== i && idx !== j && idx !== k);
        const pairing = groupPairingScore(group, pairHistory, oppHistory);
        const tail = bestMatchArrangement(rest, pairHistory, oppHistory);
        const total = pairing.score + tail.score;

        if (!best || total < best.score) {
          best = {
            matches: [pairing.match, ...tail.matches],
            score: total,
          };
        }
      }
    }
  }

  return best || { matches: [], score: 0 };
}

function choosePlayersForSlot(available, cap, state, slotIndex, remainingOpportunities) {
  const ranked = shuffle(available).sort((a, b) => {
    const score = (p) => {
      const gameScore = state.gameCount[p.name] * 18;
      const playScore = state.playStreak[p.name] * 140;
      const restBonus = state.restStreak[p.name] * -50;
      const futureScore = (remainingOpportunities[p.name]?.[slotIndex] || 0) * 3;
      return gameScore + playScore + restBonus + futureScore;
    };

    return score(a) - score(b);
  });

  const windowSize = Math.min(ranked.length, cap + 4);
  const pool = ranked.slice(0, windowSize);

  if (cap <= 0 || pool.length <= cap) {
    return pool;
  }

  let bestSubset = null;

  function dfs(start, chosen) {
    if (chosen.length === cap) {
      let score = 0;

      chosen.forEach((p) => {
        score += state.playStreak[p.name] * 180;
        score += state.gameCount[p.name] * 12;
        score -= state.restStreak[p.name] * 40;
        score += (remainingOpportunities[p.name]?.[slotIndex] || 0) * 2;
      });

      const excluded = pool.filter((p) => !chosen.includes(p));
      excluded.forEach((p) => {
        score += state.restStreak[p.name] * 55;
        score += Math.max(0, 2 - state.gameCount[p.name]) * 20;
      });

      const arrangement = bestMatchArrangement(chosen, state.pairHistory, state.oppHistory);
      score += arrangement.score;

      if (!bestSubset || score < bestSubset.score) {
        bestSubset = { players: [...chosen], score };
      }
      return;
    }

    for (let i = start; i < pool.length; i += 1) {
      chosen.push(pool[i]);
      dfs(i + 1, chosen);
      chosen.pop();
    }
  }

  dfs(0, []);
  return bestSubset ? bestSubset.players : pool.slice(0, cap);
}

function evaluateTimelinePenalty(timeline) {
  let penalty = 0;

  Object.values(timeline).forEach((arr) => {
    let playRun = 0;
    let restRun = 0;
    let lastPlay = -999;

    arr.forEach((v, i) => {
      if (v === 1) {
        playRun += 1;
        restRun = 0;
        if (playRun >= 3) penalty += playRun * 90;
        if (playRun >= 4) penalty += 400;

        const gap = i - lastPlay;
        if (gap === 1) penalty += 60;
        if (gap === 2) penalty += 15;
        lastPlay = i;
      } else {
        restRun += 1;
        playRun = 0;
        if (restRun >= 2) penalty += restRun * 35;
      }
    });
  });

  return penalty;
}

function simulateOnce(players, schedule) {
  const slots = generateTimeSlots(schedule);
  const remainingOpportunities = buildRemainingOpportunities(players, slots);
  const output = [];

  const state = {
    gameCount: {},
    restStreak: {},
    playStreak: {},
    timeline: {},
    pairHistory: {},
    oppHistory: {},
  };

  players.forEach((p) => {
    state.gameCount[p.name] = 0;
    state.restStreak[p.name] = 0;
    state.playStreak[p.name] = 0;
    state.timeline[p.name] = [];
  });

  slots.forEach((slot, slotIndex) => {
    const available = players.filter((p) => isAvailable(p, slot.time));
    const cap = Math.min(slot.courts * 4, available.length - (available.length % 4));

    const selected = choosePlayersForSlot(
      available,
      cap,
      state,
      slotIndex,
      remainingOpportunities
    );

    const arrangement = bestMatchArrangement(selected, state.pairHistory, state.oppHistory);
    const matches = arrangement.matches;
    const played = new Set(matches.flat(2).map((p) => p.name));

    matches.forEach((match) => {
      const [teamA, teamB] = match;

      state.pairHistory[pairKey(teamA[0].name, teamA[1].name)] =
        (state.pairHistory[pairKey(teamA[0].name, teamA[1].name)] || 0) + 1;
      state.pairHistory[pairKey(teamB[0].name, teamB[1].name)] =
        (state.pairHistory[pairKey(teamB[0].name, teamB[1].name)] || 0) + 1;

      teamA.forEach((a) => {
        teamB.forEach((b) => {
          const key = pairKey(a.name, b.name);
          state.oppHistory[key] = (state.oppHistory[key] || 0) + 1;
        });
      });
    });

    available.forEach((p) => {
      if (played.has(p.name)) {
        state.gameCount[p.name] += 1;
        state.restStreak[p.name] = 0;
        state.playStreak[p.name] += 1;
        state.timeline[p.name].push(1);
      } else {
        state.restStreak[p.name] += 1;
        state.playStreak[p.name] = 0;
        state.timeline[p.name].push(0);
      }
    });

    output.push({
      time: slot.time,
      matches,
      rest: available.filter((p) => !played.has(p.name)),
    });
  });

  let penalty = 0;
  const games = Object.values(state.gameCount);

  if (games.length) {
    penalty += (Math.max(...games) - Math.min(...games)) * 18;
  }

  Object.values(state.pairHistory).forEach((count) => {
    if (count > 1) penalty += (count - 1) * (count - 1) * 140;
  });

  Object.values(state.oppHistory).forEach((count) => {
    if (count > 2) penalty += (count - 2) * (count - 2) * 40;
  });

  penalty += evaluateTimelinePenalty(state.timeline);

  return { output, penalty };
}

function simulate(players, schedule) {
  let best = null;

  for (let i = 0; i < 120; i += 1) {
    const candidate = simulateOnce(players, schedule);
    if (!best || candidate.penalty < best.penalty) {
      best = candidate;
    }
  }

  return { output: best ? best.output : [] };
}

const containerStyle = {
  padding: 20,
  background: "#0f2c4d",
  minHeight: "100vh",
  color: "white",
};

const cardStyle = {
  background: "white",
  color: "black",
  padding: 20,
  borderRadius: 16,
  maxWidth: 900,
  margin: "0 auto",
};

const inputStyle = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #ddd",
  background: "#f5f5f5",
  textAlign: "center",
};

const buttonStyle = {
  padding: "10px 18px",
  borderRadius: 10,
  border: "none",
  background: "#2ea4ff",
  color: "white",
  fontWeight: "bold",
  cursor: "pointer",
};

export default function App() {
  const [tab, setTab] = useState("input");
  const [players, setPlayers] = useState([
    { name: "민경", start: "16:00", end: "20:00" },
  ]);
  const [schedule, setSchedule] = useState([
    { time: "16:00", courts: 1 },
  ]);
  const [result, setResult] = useState([]);
  const [stats, setStats] = useState({});

  const sortedStats = useMemo(
    () => Object.entries(stats).sort((a, b) => b[1] - a[1]),
    [stats]
  );

  const generate = () => {
    const { output } = simulate(players, schedule);
    const gameStats = {};

    players.forEach((p) => {
      gameStats[p.name] = 0;
    });

    output.forEach((slot) => {
      slot.matches.forEach((match) => {
        match.flat().forEach((p) => {
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
      <h1 style={{ textAlign: "center", fontSize: 32, fontWeight: 800, color="white" }}>
        TENNIS WITH ME 🎾
      </h1>

      {tab === "input" && (
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          <div style={{ ...cardStyle, marginBottom: 20 }}>
            <h3 style={{ textAlign: "center" }}>참석자 입력</h3>

            {players.map((p, i) => (
              <div
                key={i}
                style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 8 }}
              >
                <input
                  style={{ ...inputStyle, width: 120 }}
                  value={p.name}
                  onChange={(e) => {
                    const copy = [...players];
                    copy[i].name = e.target.value;
                    setPlayers(copy);
                  }}
                />
                <input
                  style={inputStyle}
                  type="time"
                  value={p.start}
                  onChange={(e) => {
                    const copy = [...players];
                    copy[i].start = e.target.value;
                    setPlayers(copy);
                  }}
                />
                <input
                  style={inputStyle}
                  type="time"
                  value={p.end}
                  onChange={(e) => {
                    const copy = [...players];
                    copy[i].end = e.target.value;
                    setPlayers(copy);
                  }}
                />
                <button onClick={() => setPlayers(players.filter((_, idx) => idx !== i))}>✖️</button>
              </div>
            ))}

            <div style={{ textAlign: "center" }}>
              <button onClick={() => setPlayers([...players, { name: "", start: "19:00", end: "22:00" }])}>➕</button>
            </div>
          </div>

          <div style={{ ...cardStyle, marginBottom: 20 }}>
            <h3 style={{ textAlign: "center" }}>시간별 코트수</h3>

            {schedule.map((s, i) => (
              <div
                key={i}
                style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 8 }}
              >
                <input
                  style={inputStyle}
                  type="time"
                  value={s.time}
                  onChange={(e) => {
                    const copy = [...schedule];
                    copy[i].time = e.target.value;
                    setSchedule(copy);
                  }}
                />
                <input
                  style={{ ...inputStyle, width: 60 }}
                  type="number"
                  value={s.courts}
                  onChange={(e) => {
                    const copy = [...schedule];
                    copy[i].courts = Number(e.target.value);
                    setSchedule(copy);
                  }}
                />
                <button onClick={() => setSchedule(schedule.filter((_, idx) => idx !== i))}>✖️</button>
              </div>
            ))}

            <div style={{ textAlign: "center" }}>
              <button onClick={() => setSchedule([...schedule, { time: "19:00", courts: 1 }])}>➕</button>
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
            <button onClick={() => setTab("input")}>←입력으로 돌아가기</button>
          </div>

          <div style={cardStyle}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "center", color: "black" }}>
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
                  {result.map((slot, i) =>
                    slot.matches.map((match, j) => (
                      <tr key={`${i}-${j}`}>
                        <td style={{ border: "1px solid #ddd", padding: 8 }}>{slot.time}</td>
                        <td style={{ border: "1px solid #ddd" }}>{j + 1}</td>
                        <td style={{ border: "1px solid #ddd" }}>{match[0][0].name}/{match[0][1].name}</td>
                        <td style={{ border: "1px solid #ddd" }}>{match[1][0].name}/{match[1][1].name}</td>
                        <td style={{ border: "1px solid #ddd" }}>
                          {j === 0 ? slot.rest.map((p) => p.name).join(", ") : ""}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ ...cardStyle, marginTop: 20 }}>
            <h3 style={{ textAlign: "center" }}>참가자별 게임 수</h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
              {sortedStats.map(([name, count]) => (
                <div
                  key={name}
                  style={{ padding: "8px 12px", borderRadius: 8, background: "#f2f2f2" }}
                >
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
