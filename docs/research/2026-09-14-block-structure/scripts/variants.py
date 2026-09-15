import re,io,contextlib
src=open('gen2.py').read()
def run(label, subs, weeks):
    s=src
    for a,b in subs: assert a in s, a; s=s.replace(a,b)
    buf=io.StringIO()
    with contextlib.redirect_stdout(buf): exec(compile(s,'gen2v','exec'),{'__name__':'__main__'})
    out=buf.getvalue()
    print("#####",label)
    for w in weeks:
        m=re.search(r"\n== week %d .*?(?=\n== week|\nlong-session)"%w,out,re.S); print(m.group(0).strip())
run("Q1 = no (week 2 keeps 6 run days)",[('"2026-09-19", 5),   # Q1','"2026-09-19", 6),   # Q1')],[2])
run("Q2 = no (Sun 18 Oct stays 18 km, all easy)",[('13, "2026-10-18", 5),     # Q2','18, "2026-10-18", 5),     # Q2')],[6])
run("Q3 = no (10K day stays 16 km)",[('20, "2026-10-11", 6),     # Q3','16, "2026-10-11", 6),     # Q3')],[5])
run("Q4 = yes (one weekday evening holds 18 km: evening cap 18)",[('("evening", {1, 2, 3, 4, 5, 6, 7}, 14,','("evening", {1, 2, 3, 4, 5, 6, 7}, 18,')],[3,4,5])
