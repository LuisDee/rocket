"""Prototype of the revised role-based week generator (design v2).

Scratch verification only -- not rocket code. Every number is the proposed
config value; the six-week table in the design is this script's output.
"""
import statistics as st
from datetime import date, timedelta

D = date.fromisoformat
def sh(d, n): return d + timedelta(days=n)
def r05(x): return round(x * 2) / 2

# ---------------------------------------------------------------- config ---
RACES = [  # date, name, km, effort
    ("2026-09-12", "Battersea Park Half", 21.1, "raced"),
    ("2026-10-04", "Lincoln Half", 21.1, "marathon-pace"),
    ("2026-10-11", "ASICS LDNX 10K", 10.0, "raced"),
    ("2026-10-24", "Battersea Park Marathon", 42.195, "raced"),
]
RACES = [(D(a), b, c, e) for a, b, c, e in RACES]
RACE_ON = {r[0]: r for r in RACES}
GOAL = D("2026-10-24")
# week, monday, phase, target, longKm, longDate, minRunDays
WEEKS = [
    (1, "2026-09-07", "race-taper", 28, 21.1, "2026-09-12", 4),
    (2, "2026-09-14", "rebuild", 60, 22, "2026-09-19", 5),   # Q1: 6 -> 5
    (3, "2026-09-21", "build", 80, 27, "2026-09-27", 6),
    (4, "2026-09-28", "peak", 100, 33, "2026-10-04", 7),
    (5, "2026-10-05", "taper", 80, 20, "2026-10-11", 6),     # Q3: 16 -> 20
    (6, "2026-10-12", "taper", 60, 13, "2026-10-18", 5),     # Q2: 18 -> 13
    (7, "2026-10-19", "race", 32, None, None, 3),
]
QUALITY_PER_WEEK = {"race-taper": 0, "rebuild": 1, "build": 1, "peak": 0, "taper": 1, "race": 0}
MP_FRAC = {"race-taper": 0, "rebuild": 0.23, "build": 0.37, "peak": 0.64, "taper": 0, "race": 0}
REC_DEFAULT, REC_MAX = 8, 10
Q_SHARE, Q_MIN, Q_MAX = 0.175, 0.14, 0.25
GA_RATIO = 2 / 3
MAX_DOUBLES, DOUBLE_AM, MIN_PM = 1, 10, 4
DR_KM, DR_MP, SHAKEOUT, TAPER_MP = 11, 3.2, 5, 6
V1_MIN = 1.4
LEGS_AFTER, LEGS_BEFORE, LEGS_MIN_KM, DROP_LEGS_FROM = 3, 4, 8, 6
MIN_REST, MIN_Q_GAP, STRIDE_DAYS = 1, 2, 2
MP_EASY_DAYS = 4  # Canova: easy days after a big marathon-pace session
FINAL_DAYS = [0, 5, 7, 9, 11]
SLOTS = [  # id, weekdays(ISO), maxKm, startLocal
    ("weekday-morning", {1, 2, 3, 4, 5}, 12, "06:30"),
    ("evening", {1, 2, 3, 4, 5, 6, 7}, 14, "18:30"),
    ("weekend-daytime", {6, 7}, 45, "09:00"),
]

def runin(d):
    out = (GOAL - d).days
    if out < 0: return None
    if out < len(FINAL_DAYS): return FINAL_DAYS[out]
    return 13 if out <= 14 else None

def slots_on(d): return [s for s in SLOTS if d.isoweekday() in s[1]]
def roomiest(d): return max(slots_on(d), key=lambda s: s[2])
def earliest(d): return min(slots_on(d), key=lambda s: s[3])

def easy_window(race):  # days after race that are easy-only (race day = day 0)
    d, _, km, effort = race
    n = round(km / 3) if effort == "raced" else MP_EASY_DAYS
    return {sh(d, i) for i in range(1, n + 1)}

EASY_ONLY = set().union(*(easy_window(r) for r in RACES))

def long_mp_km(week):
    _, _, phase, _, lkm, ldate, _ = week
    if lkm is None: return 0
    ld = D(ldate)
    if ld in EASY_ONLY: return 0          # post-race window zeroes MP
    if ld in RACE_ON: return RACE_ON[ld][2] if RACE_ON[ld][3] == "marathon-pace" else 0
    return round(lkm * MP_FRAC[phase], 1)

LONGS = {D(w[5]): w for w in WEEKS if w[5]}
KEY = {r[0] for r in RACES} | {d for d, w in LONGS.items() if long_mp_km(w) > 0}

# ------------------------------------------------------------- generator ---
def plan_week(week, prev_hard, quality_dates_global):
    wk, monday, phase, target, lkm, ldate, min_run = week
    mon = D(monday); dates = [sh(mon, i) for i in range(7)]
    notes = []
    hard = {}  # date -> km (long / race sessions in the week)
    if ldate: hard[D(ldate)] = lkm
    extra_race_km = 0
    for rd, name, km, eff in RACES:
        if rd in dates and rd not in hard:
            hard[rd] = km; extra_race_km += 0  # additional to target (goal race)
    anchors = sorted(set(hard) | set(prev_hard))
    roles = {d: "hard" for d in hard}
    # 1. fixed rest: day after every long / race anchor
    rest = [sh(a, 1) for a in anchors if sh(a, 1) in dates and sh(a, 1) not in hard]
    for d in rest: roles[d] = "rest"
    # 2. fixed recovery / race-week roles
    for h in hard:
        if sh(h, -1) in dates and sh(h, -1) not in roles:
            roles[sh(h, -1)] = "shakeout" if h == GOAL else "recovery"
        if h in RACE_ON and RACE_ON[h][3] == "raced" and sh(h, -2) in dates and sh(h, -2) not in roles:
            roles[sh(h, -2)] = "recovery"
    if GOAL in dates and sh(GOAL, -4) not in roles: roles[sh(GOAL, -4)] = "dress"
    # 3. quality date
    races_in_week = sum(1 for r in RACES if r[0] in dates)
    budget = QUALITY_PER_WEEK[phase] - races_in_week
    qdate = None
    if budget > 0:
        gap = lambda d: min(abs((d - a).days) for a in anchors)
        cands = [d for d in dates if d not in roles and d not in EASY_ONLY and gap(d) >= MIN_Q_GAP]
        if cands: qdate = max(cands, key=lambda d: (gap(d), -d.toordinal()))
        else: notes.append("no day clears quality spacing and post-race windows; week all easy")
    if qdate: roles[qdate] = "quality"
    # 4. rest-day count (minRunDays is a floor, capped by the mandatory rest)
    want_rest = 7 - min(min_run, 7 - MIN_REST)
    if min_run > 7 - MIN_REST: notes.append(f"asks {min_run} run days; mandatory rest caps it at {7-MIN_REST}")
    added_rest = []
    def free(d): return d not in roles
    if len(rest) < want_rest and qdate and sh(qdate, 1) in dates and free(sh(qdate, 1)):
        roles[sh(qdate, 1)] = "rest"; rest.append(sh(qdate, 1)); added_rest.append(sh(qdate, 1))
    for d in dates:
        if len(rest) >= want_rest: break
        if free(d): roles[d] = "rest"; rest.append(d); added_rest.append(d)
    # 5. first run after a raced effort (within 7 days) is recovery
    for rd, _, _, eff in RACES:
        if eff != "raced": continue
        after = [d for d in dates if d > rd and (d - rd).days <= 7 and roles.get(d) not in ("rest", "hard")]
        if after and roles.get(after[0]) in (None,): roles[after[0]] = "recovery-first"
    hard_all = set(anchors) | ({qdate} if qdate else set()) | {d for d, r in roles.items() if r == "dress"}
    hard_all |= {sh(mon, 7 + (D(w[5]) - sh(mon, 7)).days) for w in WEEKS if w[5] and 0 <= (D(w[5]) - sh(mon, 7)).days < 7}
    def dist(d): return min(abs((d - h).days) for h in hard_all)
    def next_hard(d):
        n = [(h - d).days for h in hard_all if h > d]; return min(n) if n else 99
    order = lambda ds: sorted(ds, key=lambda d: (-dist(d), -next_hard(d), d))
    return size(week, dates, roles, rest, added_rest, qdate, hard, dist, next_hard, order, notes)

def size(week, dates, roles, rest, added_rest, qdate, hard, dist, next_hard, order, notes):
    wk, monday, phase, target, lkm, ldate, min_run = week
    run_days = [d for d in dates if roles.get(d) != "rest"]
    ga = [d for d in run_days if d not in roles]
    # legs day
    legs = None
    if wk < DROP_LEGS_FROM and GOAL not in dates and wk > 1:
        cands = ([qdate] if qdate else []) + [d for d in hard if d not in RACE_ON] + order(ga)
        for d in cands:
            if d in RACE_ON or sh(d, 1) in RACE_ON: continue
            if any(0 < (d - k).days < LEGS_AFTER for k in KEY): continue
            if any(0 < (k - d).days < LEGS_BEFORE for k in KEY): continue
            legs = d; break
    medium_pool = [d for d in ga if d != legs] or ga
    medium = order(medium_pool)[0] if medium_pool else None
    cap = {}
    for d in run_days:
        c = (earliest(d)[2] if d == legs else roomiest(d)[2])
        if roles.get(d, "").startswith("recovery"): c = min(c, REC_MAX)
        ri = runin(d)
        cap[d] = c if ri is None or d in hard else min(c, ri)
    km = {d: 0.0 for d in dates}
    for d, k in hard.items(): km[d] = k
    for d in run_days:
        r = roles.get(d)
        if r in ("recovery", "recovery-first"): km[d] = min(REC_DEFAULT, cap[d])
        elif r == "dress": km[d] = min(DR_KM, cap[d])
        elif r == "shakeout": km[d] = min(SHAKEOUT, cap[d])
        elif r == "quality":
            q = min(max(r05(Q_SHARE * target), Q_MIN * target), Q_MAX * target)
            km[d] = min(q, cap[d])
    in_target = sum(km[d] for d in dates if not (d in RACE_ON and d != (D(ldate) if ldate else None)))
    R = target - in_target
    # capped proportional fill
    active = list(ga)
    while active and R > 1e-9:
        w = {d: (1.0 if d == medium else GA_RATIO) for d in active}
        share = {d: R * w[d] / sum(w.values()) for d in active}
        over = [d for d in active if km[d] + share[d] > cap[d] + 1e-9]
        if not over:
            for d in active: km[d] += share[d]
            R = 0; break
        for d in over:
            R -= cap[d] - km[d]; km[d] = cap[d]; active.remove(d)
    doubles = {}
    if R > 1e-9:  # (a) raise recovery days
        for d in run_days:
            if roles.get(d, "").startswith("recovery") and R > 1e-9:
                add = min(R, REC_MAX - km[d], (runin(d) or 99) - km[d]); km[d] += add; R -= add
    if R > 1e-9 and added_rest:  # (b) open a run day
        d = added_rest[-1]; del roles[d]; rest.remove(d); added_rest.remove(d)
        notes.append(f"opened {d} as a run day: the week does not fit its run days")
        return size(week, dates, roles, rest, added_rest, qdate, hard, dist, next_hard, order, notes)
    if R > 1e-9:  # (c) one recovery double
        banned = set()
        for h in hard:
            if h in RACE_ON or h in LONGS and long_mp_km(LONGS[h]) > 0:
                banned |= {sh(h, -1), sh(h, -2)}
        elig = [d for d in run_days if d not in hard and d != legs and d not in banned
                and roles.get(d) in (None, "recovery") and len(slots_on(d)) >= 2]
        for d in sorted(elig)[:MAX_DOUBLES]:
            room = min(DOUBLE_AM + earliest_pm(d), runin(d) or 99) - km[d]
            add = min(R, room); km[d] += add; R -= add
            doubles[d] = (DOUBLE_AM, None)
    if R > 1e-9: notes.append(f"shortfall {R:.1f} km: debt against the macro layer")
    # rounding, residual to medium then GA days with room
    for d in dates: km[d] = r05(km[d]) if d not in hard else km[d]
    resid = round(target - sum(km[d] for d in dates if not (d in RACE_ON and d != (D(ldate) if ldate else None))), 2)
    for d in ([medium] if medium else []) + ga + [d for d in run_days if roles.get(d, "").startswith("recovery")]:
        if abs(resid) < 1e-9: break
        room = (cap[d] if d not in doubles else 99) - km[d]
        step = min(resid, room) if resid > 0 else max(resid, -km[d])
        km[d] += step; resid -= step
    for d in doubles: doubles[d] = (DOUBLE_AM, round(km[d] - DOUBLE_AM, 1))
    return dict(week=week, dates=dates, km=km, roles=roles, qdate=qdate, legs=legs, medium=medium,
                doubles=doubles, notes=notes, hard=hard)

def earliest_pm(d): return max(s[2] for s in slots_on(d) if s[3] > "12:00")

# ------------------------------------------------------------ checks ---
def strides(p):
    dates, roles, km, hard = p["dates"], p["roles"], p["km"], p["hard"]
    hard_days = set(hard) | ({p["qdate"]} if p["qdate"] else set()) | {d for d, r in roles.items() if r == "dress"}
    hard_days |= set(LONGS)
    cands = [d for d in dates if km[d] > 0 and d not in hard_days and roles.get(d) not in ("recovery-first", "shakeout")
             and sh(d, 1) not in hard_days and d not in p["doubles"]]
    dist = lambda d: min(abs((d - h).days) for h in hard_days | {r[0] for r in RACES})
    nxt = lambda d: min([(h - d).days for h in hard_days if h > d] or [99])
    n = STRIDE_DAYS - (1 if any(r == "shakeout" for r in roles.values()) else 0)
    return sorted(sorted(cands, key=lambda d: (-dist(d), -nxt(d), d))[:n])

def check(p):
    wk, monday, phase, target, lkm, ldate, _ = p["week"]
    dates, km, roles = p["dates"], p["km"], p["roles"]
    tot = sum(km[d] for d in dates if not (d in RACE_ON and d != (D(ldate) if ldate else None)))
    long_d = D(ldate) if ldate else None
    nonlong = [km[d] for d in dates if km[d] > 0 and d != long_d and d not in RACE_ON]
    spread = max(nonlong) / min(nonlong) if len(nonlong) >= 3 else None
    v1 = spread is None or spread >= V1_MIN - 1e-9
    q = p["qdate"]
    v2 = q is None or (km[q] >= st.median(nonlong) and km[q] >= Q_MIN * target - 1e-9)
    v3 = all(km.get(sh(h, -1), 0) <= REC_MAX for h in p["hard"] if sh(h, -1) in dates)
    v4 = all(km.get(sh(h, 1), 0) == 0 for h in p["hard"] if sh(h, 1) in dates)
    runin_breach = [(str(d), km[d], runin(d)) for d in dates if runin(d) is not None and km[d] > runin(d) and d != GOAL]
    series = [km[d] for d in dates if not (d == GOAL)]
    mono = st.mean(series) / st.pstdev(series)
    return dict(total=tot, spread=spread, v1=v1, v2=v2, v3=v3, v4=v4, runin=runin_breach, mono=mono)

if __name__ == "__main__":
    prev = [D("2026-09-12")]
    allrows = []
    for w in WEEKS[1:]:
        p = plan_week(w, prev, set())
        c = check(p)
        s = strides(p)
        prev = [D(w[5])] if w[5] else []
        print(f"\n== week {w[0]} {w[1]} target {w[3]} -> total {c['total']:g}  spread {c['spread'] and round(c['spread'],2)}"
              f"  V1 {c['v1']} V2 {c['v2']} V3 {c['v3']} V4 {c['v4']}  km-monotony(excl race) {c['mono']:.2f}"
              f"  run-in breaches {c['runin']}")
        for d in p["dates"]:
            r = p["roles"].get(d, "ga" if p["km"][d] > 0 else "rest")
            if d == p["medium"]: r = "medium"
            tags = []
            if d == p["legs"]: tags.append("LEGS(earliest slot)")
            if d in p["doubles"]: tags.append(f"double {p['doubles'][d][0]}+{p['doubles'][d][1]}")
            if d in s: tags.append("strides")
            if d in EASY_ONLY: tags.append("easy-only window")
            ri = runin(d)
            print(f"   {d:%a %d %b}  {p['km'][d]:>6g}  {r:<15} {' '.join(tags)}{'  run-in '+str(ri) if ri is not None else ''}")
        for n in p["notes"]: print("   note:", n)
        allrows.append((w, p))
    # spike check against trailing-30-day longest (planned sessions stand in for history)
    sessions = [(D("2026-09-12"), 21.1)] + [(d, k) for w, p in allrows for d, k in p["km"].items() if k > 0]
    print("\nlong-session spikes (>110% of trailing-30-day longest):")
    for d, k in sorted(sessions):
        base = max([kk for dd, kk in sessions if 0 < (d - dd).days <= 30] or [0])
        if base and k / base > 1.10: print(f"   {d} {k} km = {100*k/base:.0f}% of {base}")
    print("\nMP ladder:", [(w[1], long_mp_km(w)) for w in WEEKS[1:]], "+ taper session", TAPER_MP, "+ dress", DR_MP)
    print("KEY sessions (legs gap anchors):", sorted(str(k) for k in KEY))
