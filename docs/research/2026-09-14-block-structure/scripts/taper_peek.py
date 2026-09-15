import re,sys
for f in ["marathon_pfitzinger_18_55.ts","marathon_pfitzinger_18_70.ts","marathon_pfitzinger_12_70.ts","marathon_higdon_intermediate_2.ts","marathon_hansons_advanced.ts"]:
    t=open(f).read()
    ws=re.findall(r'description:\s*"([^"]*)",\s*totalDistance:\s*([\d.]+)',t)
    n=len(ws)//7
    print("==",f,len(ws),"workouts",n,"weeks")
    for w in range(max(0,n-4),n):
        days=ws[w*7:(w+1)*7]
        print(f" wk{w+1} tot={sum(float(d) for _,d in days):.1f} |", " | ".join(f"{d}:{s[:48]}" for s,d in days))
