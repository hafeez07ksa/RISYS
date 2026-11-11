"""Splits the SDAIA PDPL texts into articles and paragraphs.

  pdftotext -raw  'PDPL.pdf' law.raw.txt
  pdftotext -raw  'PDPL Implementing regulations.pdf' ir.raw.txt   (IR, then the Transfer Regulation)
  pdftotext -layout 'PDPL Arabic.pdf' ar.txt
  PDPL_SRC=<dir with those files> python3 -I parse.py   -> parsed.json beside this script
"""
import os, re, json, sys, unicodedata
SRC = os.environ.get('PDPL_SRC', '/tmp/pdpl')
NOISE = re.compile(r'^(Public|!|\d+|Page \d+.*|\s*)$')
LAW30 = re.compile(r'^!"#\$%&')
def clean_lines(path):
    out=[]
    for l in open(path,encoding='utf-8').read().splitlines():
        l=l.replace('\f','').strip()
        if LAW30.match(l): out.append('Article 30'); continue
        l=l.replace('!','').strip()
        if NOISE.match(l): continue
        out.append(l)
    return out

def split_articles(lines, head_re):
    arts=[]; cur=None
    for l in lines:
        m=head_re.match(l)
        if m:
            cur={'no':int(m.group(1)),'title':(m.group(2) if m.lastindex and m.lastindex>=2 else '') or '', 'lines':[]}
            arts.append(cur); continue
        if cur is not None: cur['lines'].append(l)
    return arts

def clauses(lines):
    """Split article body into intro + numbered paragraphs '1- ...' or '1-...'."""
    intro=[]; cl=[]; 
    for l in lines:
        m=re.match(r'^(\d{1,2})\s*[-.]\s*(.*)$', l)
        if m and (not cl and int(m.group(1))==1 or cl and int(m.group(1))==cl[-1]['n']+1):
            cl.append({'n':int(m.group(1)),'text':[m.group(2)]}); continue
        (cl[-1]['text'] if cl else intro).append(l)
    j=lambda xs: re.sub(r'\s+',' ',' '.join(xs)).strip()
    return j(intro), [{'n':c['n'],'text':j(c['text'])} for c in cl]

def ir_tr():
    lines=clean_lines(os.path.join(SRC, 'ir.raw.txt'))
    # drop index preamble
    start=[i for i,l in enumerate(lines) if l.startswith('Article 1: Definitions')][0]
    lines=lines[start:]
    arts=split_articles(lines, re.compile(r'^Article (\d+):\s*(.*)$'))
    # title continuation: if title ends without being complete, next line short -> append
    res=[];part='IR'
    for a in arts:
        if a['no']==1 and res: part='TR'
        # heading wrap: first body line that starts lowercase or is short continuation
        while a['lines'] and a['title'].endswith((',','for','of','for the','and','Data','Personal','Public','Scientific,')) and len(a['lines'][0])<60 and not re.match(r'^\d+\s*-',a['lines'][0]):
            a['title']+=' '+a['lines'].pop(0)
        intro,cl=clauses(a['lines'])
        res.append({'part':part,'no':a['no'],'title':a['title'].strip(),'intro':intro,'clauses':cl})
    return res

def law():
    lines=clean_lines(os.path.join(SRC, 'law.raw.txt'))
    arts=split_articles(lines, re.compile(r'^Article (\d+)$'))
    res=[]
    for a in arts:
        intro,cl=clauses(a['lines'])
        res.append({'part':'L','no':a['no'],'title':'','intro':intro,'clauses':cl})
    return res

def law_ar():
    t=open(os.path.join(SRC, 'ar.txt'),encoding='utf-8').read()
    t=unicodedata.normalize('NFKC',t)
    t=re.sub('[‪-‮‎‏​]','',t)
    lines=[l.strip() for l in t.splitlines()]
    heads=[i for i,l in enumerate(lines) if re.match(r'^المادة [^:]{2,30}:$',l)]
    res=[]
    for k,i in enumerate(heads):
        end=heads[k+1] if k+1<len(heads) else len(lines)
        body=[l for l in lines[i+1:end] if l and not re.match(r'^(\d+|عام|Public|!)$',l)]
        txt='\n'.join(body)
        txt=re.sub(r'(?m)^-(\d{1,2})\s*', r'\1- ', txt)
        txt=re.sub(r'\s+([،؛.:])', r'\1', txt)
        txt=re.sub(r'([،؛])(?=\S)', r'\1 ', txt)
        res.append({'no':k+1,'heading':lines[i],'text':txt.strip()})
    return res

if __name__=='__main__':
    d={'irtr':ir_tr(),'law':law(),'law_ar':law_ar()}
    json.dump(d,open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'parsed.json'),'w'),ensure_ascii=False,indent=1)
    for a in d['irtr']: print(a['part'],a['no'],a['title'],'| clauses',len(a['clauses']),'| intro',len(a['intro']))
    print('law',len(d['law']),[a['no'] for a in d['law']])
    print('ar',len(d['law_ar']))
