# Builds story/audition.json (the Audition question bank, docs/AUDITION_PLAN.md) from the .txt files here, and checks it:
# unique ids, every `if` value matches its source's options, every follow-up set exists, wild cards have 12-16 answers.
# Run: python3 story/audition-src/build_bank.py   (writes story/audition.json). Edit the .txt files, not the JSON.
# Format: "@section id | Title | how many an interview draws", "@more id" adds to a section; a question is
# "type id flags | question | option; option>followset; ... | if-source:value~value" (or "!" for "not one of"),
# types one / many / scale (options = "low end; high end") / text, flags req, other, max=N, to=card.field.
import json,re,sys,os
os.chdir(os.path.dirname(os.path.abspath(__file__)))   # reads the .txt files next to this script
OUT=os.path.abspath(sys.argv[1]) if len(sys.argv)>1 else os.path.abspath('../audition.json')
def opts(s): 
    out=[]
    for o in s.split(';'):
        o=o.strip()
        if not o: continue
        if '>' in o: l,f=o.rsplit('>',1); out.append({"l":l.strip(),"f":f.strip()})
        else: out.append(o)
    return out
def cond(s):
    m=re.match(r'([\w.]+)([:!])(.*)$',s.strip()); assert m,s
    return [m.group(1), m.group(2)==':', m.group(3).split('~')]
def head(h):
    p=h.split(); t,i=p[0],p[1]; q={"id":i,"t":t}
    for f in p[2:]:
        if f=='req': q['req']=1
        elif f=='other': pass   # no open answers since v269: choices only
        elif f.startswith('to='): q['to']=f[3:]
        elif f.startswith('max='): q['max']=int(f[4:])
        elif f.startswith('w='): q['w']=float(f[2:])
        elif f.startswith('if='): q['if']=cond(f[3:])
        else: raise Exception('flag '+f+' in '+h)
    return q
def qline(l):
    parts=[x.strip() for x in l.split(' | ')]
    if ' if=' in parts[0]:   # world.how style
        h,c=parts[0].split(' if=',1); cc=re.match(r'(\S+)(.*)',c); parts[0]=h+cc.group(2); parts.append(None); ifc=cc.group(1)
    else: ifc=None
    q=head(parts[0]); q['q']=parts[1]
    if q['t'] in ('one','many'):
        q['o']=opts(parts[2]); rest=parts[3:]
    elif q['t']=='scale':
        lo,hi=[x.strip() for x in parts[2].split(';')]; q['lo']=lo; q['hi']=hi; rest=parts[3:]
    else: rest=parts[2:]
    rest=[r for r in rest if r]
    if rest: q['if']=cond(rest[0])
    return q
bank={"v":1,"total":80,"sections":[],"qs":[],"follow":{},"generic":{},"wild":[]}
sec=None
for fn in ['bank1.txt','bank2.txt','bank3.txt']:
    for l in open(fn).read().split('\n'):
        if not l.strip(): continue
        if l.startswith('@more'):
            sec=[x for x in bank['sections'] if x['id']==l.split()[1]][0]; continue
        if l.startswith('@section'):
            _,rest=l.split(' ',1); i,t,n=[x.strip() for x in rest.split('|')]; sec={"id":i,"title":t,"n":int(n)}; bank['sections'].append(sec); continue
        q=qline(l); q['s']=sec['id']; bank['qs'].append(q)
cur=None
for l in open('follow.txt').read().split('\n'):
    if not l.strip(): continue
    if l.startswith('@generic'):
        cur=bank['generic'].setdefault(l.split()[1],[]); continue
    if l.startswith('@follow'):
        p=l.split(None,2); sid=p[1]; d={"qs":[]}
        rest=p[2] if len(p)>2 else ''
        if rest.endswith('nogeneric'): d['nogen']=1; rest=rest[:-9].strip()
        if rest.startswith('name='): d['name']=rest[5:]
        bank['follow'][sid]=d; cur=d['qs']; continue
    q=qline(l)
    cur.append(q)
for l in open('wild.txt').read().split('\n'):
    if not l.strip(): continue
    i,q,o=[x.strip() for x in l.split(' | ')]
    bank['wild'].append({"id":i,"t":"one","q":q,"o":opts(o)})
bank['names']={
 "f":"Maya Noga Shira Tamar Yael Michal Dalia Ronit Hila Keren Liat Orly Sigal Efrat Tali Inbal Shani Neta Adi Lior Yarden Romi Hadas Galit Orna Ruti Ilana Zehava Miriam Esther Rivka Sarah Leah Rachel Hanna Naama Gili Mor Stav Agam Ella Mia Sophie Lucia Anna Nadia Olga Katya Leila Amira Rana Sivan Bracha Pnina Tova Yaffa Dorit Margalit Avital Ayelet".split(),
 "m":"Amit Omer Itay Yoni Eyal Guy Ronen Erez Tal Nir Ido Asaf Eitan Uri Ariel Ofer Gal Shai Doron Gil Yaron Elad Roi Barak Koby Shlomi Zvi Haim Yossef Menachem Ezra Nissim Shimon Reuven Amnon Ilan Yigal Dudi Motti Benny Sasha Misha Dima Felix Marco Pablo Leo Hugo Jonah Sami Karim Rami Yehuda Natan Yair Noam Alon Hagai Kfir Tzachi".split(),
 "nick":"Mimi Kiki Jojo Shushu Bibo Dudu Lolo Pupik Chiko Mushon Tiki Bubu Sheli Gigi Riri Momo Zuzu Pitzi".split(),
 "sur":"Peretz Mizrahi Levin Shapiro Katz Ben-David Avraham Azulay Friedman Golan Hadad Dahan Biton Amar Weiss Rosen Klein Gabay Ohana Navon Shalev Barak Eliyahu Sasson Halevi Tal Carmi Adler Stern Vaknin Elbaz Yosef Mor Ashkenazi Sharabi Tzur Galili Shemesh Oren Paz Shaked Harel Raz Nachmias Toledano Dror Lavi Zohar Eden Zamir Feldman Kaplan Segal Abutbul Asulin Ben-Ami Hazan Naor Cohen-Tov Almog".split()}
bank['blocked']="fuck shit cunt bitch dick cock pussy whore slut porn sex nazi hitler kill rape penis vagina ass bastard nigger faggot retard".split()
bank['famous']="ishai truman elvis madonna beyonce shakira messi ronaldo einstein jesus moses obama trump netanyahu bibi putin biden musk oprah rihanna drake gaga adele zelensky herzl bengurion rabin golda".split()
# checks
ids=set(); 
def allq():
    for q in bank['qs']: yield q
    for g in bank['generic'].values(): yield from g
    for f in bank['follow'].values(): yield from f['qs']
    yield from bank['wild']
for q in allq():
    assert q['id'] not in ids, q['id']; ids.add(q['id'])
    assert len(q['q'])<=140, q['id']
    for o in q.get('o',[]):
        lab=o['l'] if isinstance(o,dict) else o; assert len(lab)<=60,(q['id'],lab)
main={q['id']:q for q in bank['qs']}
for q in bank['qs']:
    if 'if' in q:
        t=main[q['if'][0]]; labs=[o['l'] if isinstance(o,dict) else o for o in t['o']]
        for v in q['if'][2]: assert v in labs,(q['id'],v)
fsets=set()
for q in allq():
    for o in q.get('o',[]):
        if isinstance(o,dict): fsets.add(o['f'])
missing=[f for f in fsets if f not in bank['follow']]
prefixless=[f for f in missing if f.split('.')[0] not in bank['generic']]
print('missing sets (generic only):',sorted(missing)); assert not prefixless, prefixless
unused=[f for f in bank['follow'] if f not in fsets]; print('unused sets:',unused)
for w in bank['wild']: assert 12<=len(w['o'])<=16,(w['id'],len(w['o']))
n=lambda: sum(1 for _ in allq())
print('main',len(bank['qs']),'generic',sum(len(g) for g in bank['generic'].values()),'specific',sum(len(f['qs']) for f in bank['follow'].values()),'wild',len(bank['wild']),'sets',len(bank['follow']),'total',n())
print('text main', sum(1 for q in bank['qs'] if q['t']=='text'))
json.dump(bank,open(OUT,'w'),ensure_ascii=False,indent=1)
print('wrote',OUT)
