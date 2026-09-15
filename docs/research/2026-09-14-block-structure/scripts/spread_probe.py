import re,statistics as st
rows=[]
for f in ["marathon_pfitzinger_18_55.ts","marathon_pfitzinger_18_70.ts","marathon_pfitzinger_12_70.ts","marathon_higdon_intermediate_2.ts","marathon_hansons_advanced.ts"]:
    t=open(f).read()
    ws=re.findall(r'description:\s*"([^"]*)",\s*totalDistance:\s*([\d.]+)',t)
    n=len(ws)//7
    for w in range(n):
        days=[(s,float(d)) for s,d in ws[w*7:(w+1)*7]]
        if any('arathon' in s and d>26 for s,d in days) or any('Race Day' in s for s,d in days): continue  # skip race week
        runs=[d for s,d in days if d>0]
        longest=max(runs); nonlong=sorted(runs); nonlong.remove(longest)
        if len(nonlong)<3: continue
        sp=max(nonlong)/min(nonlong)
        # distinct-size check: count of non-long days within 1 mile of the modal value
        rows.append((f.split('_',1)[1][:-3],w+1,sum(runs),round(sp,2),nonlong))
sps=[r[3] for r in rows]
print("weeks",len(rows),"min",min(sps),"p10",sorted(sps)[len(sps)//10],"median",st.median(sps))
for r in sorted(rows,key=lambda r:r[3])[:12]: print(r)
print("--- per plan min / weeks under 1.5")
from collections import defaultdict
by=defaultdict(list)
for r in rows: by[r[0]].append(r)
for k,v in by.items():
    s=sorted(x[3] for x in v)
    print(k,"n",len(v),"min",s[0],"under1.5",sum(1 for x in s if x<1.5), [ (x[1],x[3]) for x in v if x[3]<1.6])
print("--- weeks >= 35 mi (~56 km):", sorted(r[3] for r in rows if r[2]>=35)[:8])
print("--- weeks with >=3 equal non-long run days, and double-day placement")
from collections import Counter
for r in rows:
    c=Counter(r[4]).most_common(1)[0]
    if c[1]>=3: print(r[0],r[1],r[4],"max repeat",c[1])
for f in ["marathon_pfitzinger_18_55.ts","marathon_pfitzinger_18_70.ts","marathon_pfitzinger_12_70.ts"]:
    t=open(f).read(); ws=re.findall(r'description:\s*"([^"]*)",\s*totalDistance:\s*([\d.]+)',t)
    for w in range(len(ws)//7):
        days=ws[w*7:(w+1)*7]
        for i,(s,d) in enumerate(days):
            if 'p.m.' in s:
                lr=max(range(7),key=lambda j:float(days[j][1]))
                print(f,"wk",w+1,"double on day",i,"(Mon=0)",s[:40],"| week longest on day",lr, "| prev-week long on Sun")
