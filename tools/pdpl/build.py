"""Builds the SDAIA PDPL framework: migration SQL and frontend data files.

  python3 -I build.py <repo>

Reads parsed.json (parse.py) and spec.py. Writes:
  <repo>/supabase/migrations/_pdpl_catalogue_1.sql, _pdpl_catalogue_2.sql, _pdpl_framework.sql
      The applied versions are 20261109092919, 20261109093221 and 20261109093515.
      Delete the _pdpl_*.sql files after a regeneration; a change goes in a new
      migration, never by editing or re-pushing the applied ones.
  <repo>/src/data/pdplEvidenceData.js
  <repo>/src/data/pdplGuidance.json
  <repo>/src/data/pdplCatalogue.js   (automation classes, conditions, crosswalk)
"""
import json, re, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from spec import (DOMAINS, LAW_TITLES, TITLE_FIX, CONDITIONS, REQ, ALSO_SERVES_ECC,
                  EVIDENCE_FROM_ECC, SIGNAL_MAP, PRIVACY_SIGNALS, PERIODIC, RISYS_NOTES)

REPO = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
P = json.load(open(os.path.join(HERE, 'parsed.json'), encoding='utf-8'))

PART_NAME = {'L': 'Personal Data Protection Law', 'IR': 'Implementing Regulation', 'TR': 'Transfer Regulation'}
PART_SHORT = {'L': 'Law', 'IR': 'IR', 'TR': 'TR'}
VERSION = {'L': 'PDPL (M/19, amended M/148)', 'IR': 'PDPL-IR:2023', 'TR': 'PDPL-TR:2023'}


def tidy(t):
    t = re.sub(r'\s*Chapter \d+:\s*[^.]*$', '', t or '')
    t = re.sub(r'\s*(First|Second):\s*$', '', t)
    t = re.sub(r'\s+', ' ', t).strip()
    t = t.replace(' ,', ',').replace('..', '.').replace('"# ', 'b) ')
    return t


def ar_split(text):
    lines = text.split('\n')
    intro, cl = [], []
    for l in lines:
        m = re.match(r'^(\d{1,2})- (.*)$', l)
        if m and int(m.group(1)) == len(cl) + 1:
            cl.append([m.group(2)]); continue
        (cl[-1] if cl else intro).append(l)
    j = lambda xs: re.sub(r'[ \t]+', ' ', '\n'.join(xs)).strip()
    return j(intro), [j(c) for c in cl]


# ── rows ────────────────────────────────────────────────────────────────────
law_ar = {a['no']: dict(a, text=a['text'].translate(str.maketrans('()', ')('))) for a in P['law_ar']}
articles = []
for a in P['law']:
    articles.append(dict(part='L', no=a['no'], title=LAW_TITLES[a['no']], intro=a['intro'], clauses=a['clauses']))
for a in P['irtr']:
    title, cont = TITLE_FIX.get((a['part'], a['no']), (a['title'], None))
    intro = a['intro']
    if cont and intro.startswith(cont):
        intro = intro[len(cont):].strip()
    articles.append(dict(part=a['part'], no=a['no'], title=title, intro=intro, clauses=a['clauses']))

rows, sort = [], 0
for a in articles:
    key = (a['part'], a['no'])
    mid = f"{a['part']}-{a['no']}"
    spec = REQ.get(key)
    dom = spec['d'] if spec else ('9' if a['part'] == 'L' else '8')
    dname, dname_ar, dobj = DOMAINS[dom]
    intro = tidy(a['intro'])
    clauses = [dict(n=c['n'], text=tidy(c['text'])) for c in a['clauses']]
    clauses = [c for c in clauses if c['text']]
    main_text = intro or (a['title'] + ':' if clauses else a['title'])
    ar_main, ar_cl = None, []
    if a['part'] == 'L' and a['no'] in law_ar:
        full = law_ar[a['no']]['text']
        ai, ac = ar_split(full)
        if len(ac) == len(clauses) and clauses:
            ar_main, ar_cl = (ai or None), ac
        else:
            ar_main = full
    base = dict(part=a['part'], no=a['no'], title=a['title'], domain_id=dom, domain_name=dname,
                domain_name_ar=dname_ar, subdomain_id=mid, subdomain_name=a['title'],
                subdomain_name_ar=(law_ar[a['no']]['heading'].rstrip(':') if a['part'] == 'L' and a['no'] in law_ar else None),
                objective=dobj, is_requirement=bool(spec), applies_when=(spec or {}).get('when'),
                law_refs=[f'L-{n}' for n in (spec or {}).get('law', [])])
    sort += 1
    rows.append(dict(base, control_id=mid, control_type='Main Control', text=main_text, text_ar=ar_main,
                     parent=None, sort=sort))
    for i, c in enumerate(clauses):
        sort += 1
        rows.append(dict(base, control_id=f"{mid}-{c['n']}", control_type='Sub-Control', text=c['text'],
                         text_ar=(ar_cl[i] if ar_cl else None), parent=mid, sort=sort))

ids = [r['control_id'] for r in rows]
assert len(ids) == len(set(ids)), 'duplicate ids'
mains = [r for r in rows if r['control_type'] == 'Main Control']
req_mains = [r for r in mains if r['is_requirement']]
assert len(req_mains) == len(REQ), (len(req_mains), len(REQ))
for sig, rid in SIGNAL_MAP:
    assert rid in ids, rid
for rid, *_ in PERIODIC:
    assert rid in ids, rid
for _, rid, _ in EVIDENCE_FROM_ECC:
    assert rid in ids, rid
print('rows', len(rows), 'mains', len(mains), 'requirements', len(req_mains),
      'subs in scope', sum(1 for r in rows if r['is_requirement'] and r['parent']))


# ── SQL ─────────────────────────────────────────────────────────────────────
def q(v):
    if v is None:
        return 'null'
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, int):
        return str(v)
    if isinstance(v, list):
        return "array[" + ','.join(q(x) for x in v) + "]::text[]" if v else "'{}'::text[]"
    return "'" + str(v).replace("'", "''") + "'"



def compact_values(rs):
    out = []
    for r in rs:
        main = r['control_type'] == 'Main Control'
        out.append('(' + ', '.join([q(r['control_id']), q(r['text']), str(r['sort'])] + (
            [q(r['title']), q(r['domain_id']), q(r['is_requirement']), q(r['applies_when']),
             q(','.join(r['law_refs']) or None)] if main else ['null'] * 5)) + ')')
    return ',\n'.join(out)

LOAD = """with v(id, txt, sort, title, dom, req, aw, law) as (values
%s
)
insert into public.sdaia_pdpl
  (framework, version, regulation_part, article_id, article_title, clause_id, clause_text,
   control_id, control_type, control_text, parent_control_id, part, article_no,
   domain_id, subdomain_id, subdomain_name, is_requirement, applies_when, law_refs, sort_order)
select 'SDAIA PDPL',
       case split_part(v.id, '-', 1) when 'L' then 'PDPL (M/19, amended M/148)' when 'IR' then 'PDPL-IR:2023' else 'PDPL-TR:2023' end,
       case split_part(v.id, '-', 1) when 'L' then 'Personal Data Protection Law' when 'IR' then 'Implementing Regulation' else 'Transfer Regulation' end,
       'Article ' || split_part(v.id, '-', 2), coalesce(v.title, p.title), v.id, v.txt,
       v.id, case when p.id is null then 'Main Control' else 'Sub-Control' end, v.txt, p.id,
       split_part(v.id, '-', 1), split_part(v.id, '-', 2)::int,
       coalesce(v.dom, p.dom), coalesce(p.id, v.id), coalesce(v.title, p.title),
       coalesce(v.req, p.req, false), coalesce(v.aw, p.aw), coalesce(string_to_array(coalesce(v.law, p.law), ','), '{}'), v.sort
  from v left join v p on v.id !~ '^[A-Z]+-\\d+$' and p.id = regexp_replace(v.id, '-\\d+$', '');
"""

head = open(os.path.join(HERE, 'catalogue_tail.sql.tpl'), encoding='utf-8').read()
cut = head.index('insert into public.sdaia_pdpl')
cut2 = head.index('alter table public.sdaia_pdpl\n  alter column control_id set not null')
prelude, tail = head[:cut], head[cut2:]
dom_vals = ',\n  '.join(f"({q(k)}, {q(v[0])}, {q(v[1])}, {q(v[2])})" for k, v in DOMAINS.items())
derive = f"""-- Paragraphs inherit their article's title, domain, scoring and condition.
update public.sdaia_pdpl s
   set article_title = m.article_title, subdomain_name = m.article_title, domain_id = m.domain_id,
       is_requirement = m.is_requirement, applies_when = m.applies_when, law_refs = m.law_refs
  from public.sdaia_pdpl m
 where s.parent_control_id = m.control_id;

update public.sdaia_pdpl s
   set domain_name = d.name, domain_name_ar = d.name_ar, subdomain_objective = d.objective
  from (values
  {dom_vals}
  ) as d(id, name, name_ar, objective)
 where s.domain_id = d.id;

"""
law = [r for r in rows if r['part'] == 'L']
regs = [r for r in rows if r['part'] != 'L']
sql_a = ("-- SDAIA PDPL catalogue, part 1 of 2: the columns and the Law (43 articles).\n"
         "-- Part 2 loads the Implementing and Transfer Regulations; the framework\n"
         "-- migration that follows brings PDPL into Compliance.\n\n" + prelude + (LOAD % compact_values(law)))
sql_b = ("-- SDAIA PDPL catalogue, part 2 of 2: the Implementing Regulation (38 articles)\n"
         "-- and the Transfer Regulation (10), then the derived columns and constraints.\n\n"
         + (LOAD % compact_values(regs)) + '\n' + derive + tail)
open(os.path.join(REPO, 'supabase/migrations/_pdpl_catalogue_1.sql'), 'w', encoding='utf-8').write(sql_a)
open(os.path.join(REPO, 'supabase/migrations/_pdpl_catalogue_2.sql'), 'w', encoding='utf-8').write(sql_b)
cond_keys = ', '.join(q(k) for k in CONDITIONS)

sig_rows = ',\n  '.join('(' + ', '.join([q(k), q('risys'), q(v[0]), q(v[1]), q('internal'), q(v[2]),
                                             (str(v[3]) if v[3] is not None else 'null'),
                                             (str(v[4]) if v[4] is not None else 'null'), q(v[5]), q(v[6])]) + ')'
                         for k, v in PRIVACY_SIGNALS.items())
map_rows = ',\n  '.join(f'({q(s)}, {q(r)})' for s, r in SIGNAL_MAP)
also_rows = ',\n  '.join(f"({q(p)}, {q(e)})" for p, es in ALSO_SERVES_ECC.items() for e in es)
ev_rows = ',\n  '.join(f"({q(e)}, {q(p)}, {q(n)})" for e, p, n in EVIDENCE_FROM_ECC)
per_rows = ',\n  '.join(f"('SDAIA PDPL', {q(r)}, {q(t)}, {m})" for r, t, m in PERIODIC)

tpl = open(os.path.join(HERE, 'migration.sql.tpl'), encoding='utf-8').read()
sql = (tpl.replace('/*COND_KEYS*/', cond_keys)
          .replace('/*SIGNALS*/', sig_rows)
          .replace('/*SIGNAL_MAP*/', map_rows)
          .replace('/*ALSO_SERVES*/', also_rows)
          .replace('/*EVIDENCE_FROM_ECC*/', ev_rows)
          .replace('/*PERIODIC*/', per_rows)
          .replace('/*N_ROWS*/', str(len(rows)))
          .replace('/*N_REQ*/', str(len(req_mains))))
open(os.path.join(REPO, 'supabase/migrations/_pdpl_framework.sql'), 'w', encoding='utf-8').write(sql)


# ── frontend data ───────────────────────────────────────────────────────────
HEADER = ('// GENERATED by build.py from the SDAIA PDPL texts (Law, Implementing Regulation,\n'
          '// Transfer Regulation) and the RISYS reading in spec.py. Do not edit by hand:\n'
          '// change the source and regenerate.\n\n')

by_main = {}
for r in rows:
    by_main.setdefault(r['parent'] or r['control_id'], []).append(r)

evidence = {}
for (part, no), s in REQ.items():
    mid = f'{part}-{no}'
    main = next(r for r in rows if r['control_id'] == mid)
    subs = [r for r in by_main[mid] if r['parent']]
    skip = set(s.get('skip', []))
    dlv = s.get('dlv', {})
    out = []
    if not subs or 0 in dlv:
        out.append(dict(code=mid, text=main['text'], deliverables=dlv.get(0, [])))
    for r in subs:
        n = int(r['control_id'].rsplit('-', 1)[1])
        if n in skip:
            continue
        out.append(dict(code=r['control_id'], text=r['text'], deliverables=dlv.get(n, [])))
    evidence[mid] = dict(title=f"{PART_SHORT[part]} Art. {no} · {main['title']}", cls=s['cls'],
                         when=s.get('when'), subs=out)

open(os.path.join(REPO, 'src/data/pdplEvidenceData.js'), 'w', encoding='utf-8').write(
    HEADER + 'export const PDPL_EVIDENCE_DATA = ' + json.dumps(evidence, ensure_ascii=False, indent=1) + '\n')

catalogue = dict(
    automation={f'{p}-{n}': s['cls'] for (p, n), s in REQ.items()},
    conditions={f'{p}-{n}': s['when'] for (p, n), s in REQ.items() if s.get('when')},
    law_refs={f'{p}-{n}': [f'L-{x}' for x in s.get('law', [])] for (p, n), s in REQ.items()},
    also_serves_ecc=ALSO_SERVES_ECC,
    from_ecc_evidence={},
)
for e, p, _ in EVIDENCE_FROM_ECC:
    catalogue['from_ecc_evidence'].setdefault(e, []).append(p)
open(os.path.join(REPO, 'src/data/pdplCatalogue.js'), 'w', encoding='utf-8').write(
    HEADER + ''.join(f'export const PDPL_{k.upper()} = {json.dumps(v, ensure_ascii=False, indent=1)}\n\n'
                     for k, v in catalogue.items()))

# Guidance: the Law text each requirement implements (EN + the binding Arabic), and how RISYS measures it.
law_rows = {r['control_id']: r for r in rows if r['part'] == 'L'}


def law_items(lid):
    main = law_rows[lid]
    subs = [r for r in by_main[lid] if r['parent']]
    items = [dict(level=0, text=main['text'])] + [dict(level=1, text=f"{r['control_id'].rsplit('-', 1)[1]}- {r['text']}") for r in subs]
    return items


def law_ar_items(lid):
    n = int(lid.split('-')[1])
    a = law_ar.get(n)
    if not a:
        return []
    return [dict(level=0, text=p) for p in a['text'].split('\n') if p.strip()]


CLS_LABEL = {'automated': 'Automated — measured by RISYS', 'semi_automated': 'Semi-automated — partly measured, partly evidenced',
             'manual_evidence': 'Manual evidence — RISYS keeps the evidence and the review cycle'}
controls = {}
for (part, no), s in REQ.items():
    mid = f'{part}-{no}'
    node = {}
    law_ids = [f'L-{x}' for x in s.get('law', [])]
    if law_ids:
        sections = []
        for lid in law_ids:
            sections.append(dict(key=f'law_{lid}', label=f'Law Article {lid[2:]} · {LAW_TITLES[int(lid[2:])]}', items=law_items(lid)))
            ar = law_ar_items(lid)
            if ar:
                sections.append(dict(key=f'law_ar_{lid}', label=f'Arabic text, Article {lid[2:]} (binding)', items=ar, dir='rtl'))
        node['nca_official'] = sections
        node['nca_source'] = 'sdaia_law'
    risys = [dict(key='type', label='Evidence type', items=[dict(level=0, text=CLS_LABEL[s['cls']])])]
    if s.get('when'):
        risys.append(dict(key='when', label='Applies when', items=[dict(level=0, text=CONDITIONS[s['when']])]))
    sigs = [k for k, r in SIGNAL_MAP if r.startswith(mid + '-') or r == mid]
    if RISYS_NOTES.get(mid):
        risys.append(dict(key='data', label='What RISYS reads', items=[dict(level=0, text=t) for t in RISYS_NOTES[mid]]))
    if sigs:
        names = []
        for k in sigs:
            names.append(PRIVACY_SIGNALS[k][0] if k in PRIVACY_SIGNALS else k)
        risys.append(dict(key='signals', label='Signals', items=[dict(level=0, text=t) for t in names]))
    if ALSO_SERVES_ECC.get(mid):
        risys.append(dict(key='ecc', label='Also serves NCA ECC', items=[dict(level=0, text=', '.join(ALSO_SERVES_ECC[mid]))]))
    node['risys'] = risys
    controls[mid] = node
# Law rows themselves: their Arabic text.
for lid in law_rows:
    if '-' in lid[2:]:
        continue
    ar = law_ar_items(lid)
    if ar and lid not in controls:
        controls[lid] = dict(nca_official=[dict(key='law_ar', label='Arabic text (binding)', items=ar, dir='rtl')], nca_source='sdaia_law')

guidance = dict(
    framework='SDAIA PDPL',
    sources=dict(
        sdaia_law=dict(label='Personal Data Protection Law', publisher='SDAIA',
                       version='Personal Data Protection Law, Royal Decree M/19 (1443H), amended by M/148 (1444H)',
                       authority='regulatory',
                       caveat='English translation published by SDAIA. The Arabic text is binding.'),
        risys=dict(label='How RISYS measures it', publisher='RISYS', version='PDPL implementation, November 2026',
                   authority='internal',
                   caveat='Internal reading of what evidences the requirement and what RISYS reads. Not a regulatory source.'),
    ),
    controls=controls,
)
json.dump(guidance, open(os.path.join(REPO, 'src/data/pdplGuidance.json'), 'w', encoding='utf-8'), ensure_ascii=False)
print('ok')
