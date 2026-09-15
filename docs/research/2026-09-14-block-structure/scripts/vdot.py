import math
def vo2(v): return -4.60+0.182258*v+0.000104*v*v
def pct(t): return 0.8+0.1894393*math.exp(-0.012778*t)+0.2989558*math.exp(-0.1932605*t)
def vdot(d,t): return vo2(d/t)/pct(t)
def eq(V,d):
    lo,hi=5,600
    for _ in range(100):
        m=(lo+hi)/2
        (lo,hi)=(m,hi) if vdot(d,m)>V else (lo,m)
    return m
def pace(d,t): s=t*60/(d/1000); return f"{int(s//60)}:{int(s%60):02d}"
V=vdot(21097.5,98+58/60); print("VDOT half",round(V,1))
print("VDOT May marathon",round(vdot(42195,232+59/60),1))
tm=eq(V,42195); print("M equiv",round(tm,1),pace(42195,tm))
# 60-min race pace (T proxy)
lo,hi=10000,20000
for _ in range(60):
    m=(lo+hi)/2
    (lo,hi)=(m,hi) if vdot(m,60)<V else (lo,m)
print("60min dist",round(m),pace(m,60))
