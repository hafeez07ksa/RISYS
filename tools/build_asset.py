"""
Generate src/data/eccGuidance.json — the bundled reference content for the
control detail page.

Two sources, kept separate on purpose. NCA's guidance is regulatory material and
the UI must be able to attribute it; RISYS commentary is our own reading and must
never be presented as if the regulator said it.

Re-run this when NCA reissues the guide or the internal commentary changes.
"""
import json, os

OFFICIAL = '/home/claude/guide/official.json'
RISYS    = '/home/claude/guide/risys_commentary.json'
OUT      = '/home/claude/risys/src/data/eccGuidance.json'

SOURCES = {
    'nca_official': {
        'label': 'NCA implementation guidance',
        'publisher': 'National Cybersecurity Authority',
        'version': 'Guide to ECC Implementation (Oct 2023)',
        'authority': 'regulatory',
        'caveat': (
            'This guide was published against ECC-1:2018. NCA had not reissued it for '
            'ECC-2:2024 when this content was loaded, so for controls whose wording '
            'changed in ECC-2 the guidance may lag the clause text shown above it.'
        ),
    },
    'risys': {
        'label': 'RISYS commentary',
        'publisher': 'RISYS',
        'version': 'Internal, 2026',
        'authority': 'internal',
        'caveat': (
            'Internal reading of the control, not a regulatory source. Do not quote '
            'this to an auditor as if it were NCA guidance.'
        ),
    },
}

SECTION_LABELS = {
    'tools':        'Relevant cybersecurity tools',
    'guidelines':   'Control implementation guidelines',
    'deliverables': 'Expected deliverables',
    'plain_terms':  'In plain terms',
    'how_to':       'How to implement',
    'evidence':     'Evidence to keep',
    'platforms':    'Platforms',
    'in_risys':     'In RISYS',
}

# Section order as printed, so the page reads like the document
NCA_ORDER   = ['tools', 'guidelines', 'deliverables']
RISYS_ORDER = ['plain_terms', 'how_to', 'evidence', 'platforms', 'in_risys']


def build():
    official = json.load(open(OFFICIAL))
    risys = json.load(open(RISYS)) if os.path.exists(RISYS) else {}

    controls = {}

    for cid, entry in official.items():
        sections = []
        for key in NCA_ORDER:
            items = [b for b in entry.get(key, []) if b['text'].strip()]
            if items:
                sections.append({
                    'key': key,
                    'label': SECTION_LABELS[key],
                    'items': [{'level': b['level'], 'text': b['text'].strip()} for b in items],
                })
        if sections:
            controls.setdefault(cid, {})['nca_official'] = sections

    for cid, entry in risys.items():
        sections = []
        for key in RISYS_ORDER:
            val = entry.get(key)
            if not val:
                continue
            items = val if isinstance(val, list) else [val]
            sections.append({
                'key': key,
                'label': SECTION_LABELS[key],
                'items': [{'level': 0, 'text': t} for t in items],
            })
        node = controls.setdefault(cid, {})
        if sections:
            node['risys'] = sections
        if entry.get('automation_class'):
            node['automation_class'] = entry['automation_class']

    payload = {
        'framework': 'NCA ECC',
        'sources': SOURCES,
        'controls': controls,
    }

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False, separators=(',', ':'))

    size = os.path.getsize(OUT)
    with_nca = sum(1 for v in controls.values() if 'nca_official' in v)
    with_risys = sum(1 for v in controls.values() if 'risys' in v)
    print(f'controls            : {len(controls)}')
    print(f'  NCA guidance      : {with_nca}')
    print(f'  RISYS commentary  : {with_risys}')
    print(f'asset size          : {size/1024:.0f} KB  ->  {OUT}')


if __name__ == '__main__':
    build()
