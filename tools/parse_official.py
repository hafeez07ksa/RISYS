"""
Parse the NCA 'Guide to Essential Cybersecurity Controls (ECC) Implementation'
into structured per-control guidance.

The document has a rigid shape per control:

    <control-id>
    <control text>
    Relevant cybersecurity tools          (optional)
      • ...
    Control implementation guidelines:
      • ...
    Expected deliverables
      • ...

Bullets nest one level: '•' is top level, 'o' is a child. We keep the nesting
as a prefix so the UI can indent without re-parsing.
"""
import re, json, sys

SRC = '/home/claude/guide/official_plain.txt'

# Page furniture that appears on every page and must not land inside a bullet.
FURNITURE = re.compile(
    r'^(Guide to Essential Cybersecurity|Controls \(ECC\) Implementation|'
    r'TLP: White|Document Classification: Public|\d{1,3})$'
)

ID_LINE   = re.compile(r'^([0-9]-[0-9]{1,2}-[0-9]{1,2}(?:-[0-9]{1,2})?)$')
SEC_TOOLS = re.compile(r'^Relevant cybersecurity tools\b', re.I)
SEC_IMPL  = re.compile(r'^Control implementation guidelines\s*:?\s*$', re.I)
SEC_DELIV = re.compile(r'^Expected deliverables\b', re.I)
# Subdomain headers like "1-2" sitting alone, plus "Objective" / "Controls" bands
SUBDOMAIN = re.compile(r'^[0-9]-[0-9]{1,2}$')


def clean_lines(raw):
    out = []
    for ln in raw.split('\n'):
        t = ln.strip()
        if not t or FURNITURE.match(t):
            continue
        out.append(t)
    return out


def repair(lines):
    """
    Two artefacts from the PDF's text layer:
      - a bare bullet marker on its own line, with its text on the next line
      - the same visual line emitted twice where glyph runs overlap
    """
    out = []
    i = 0
    while i < len(lines):
        t = lines[i]
        if t in ('\u2022', 'o') and i + 1 < len(lines):
            out.append(('\u2022 ' if t == '\u2022' else 'o ') + lines[i + 1])
            i += 2
            continue
        if out and out[-1] == t:      # exact duplicate line
            i += 1
            continue
        out.append(t)
        i += 1
    return out


def join_wrapped(lines):
    """
    pdftotext hard-wraps prose. Re-join a line onto the previous one unless it
    starts a new bullet, a new section, or a new control.
    """
    merged = []
    for t in lines:
        starts_new = (
            t.startswith('•') or t.startswith('o ') or t == 'o'
            or ID_LINE.match(t) or SUBDOMAIN.match(t)
            or SEC_TOOLS.match(t) or SEC_IMPL.match(t) or SEC_DELIV.match(t)
            or t in ('Objective', 'Controls')
        )
        if merged and not starts_new:
            prev = merged[-1]
            # don't glue prose onto a bare structural marker
            if not (ID_LINE.match(prev) or SUBDOMAIN.match(prev)
                    or prev in ('Objective', 'Controls')):
                merged[-1] = prev + ' ' + t
                continue
        merged.append(t)
    return merged


def collect_bullets(lines, i, stop):
    """Gather bullets from position i until a stop predicate fires."""
    items = []
    while i < len(lines):
        t = lines[i]
        if stop(t):
            break
        if t.startswith('•'):
            items.append({'level': 0, 'text': t.lstrip('•').strip()})
        elif t.startswith('o '):
            items.append({'level': 1, 'text': t[2:].strip()})
        elif items:
            # continuation that escaped the join pass
            items[-1]['text'] += ' ' + t
        i += 1
    return items, i


def parse():
    raw = open(SRC, encoding='utf-8', errors='replace').read()
    lines = join_wrapped(repair(clean_lines(raw)))

    # Index every control-id heading
    heads = [(i, m.group(1)) for i, t in enumerate(lines)
             if (m := ID_LINE.match(t))]

    controls = {}
    for n, (start, cid) in enumerate(heads):
        end = heads[n + 1][0] if n + 1 < len(heads) else len(lines)
        block = lines[start + 1:end]

        is_boundary = lambda t: bool(
            SEC_TOOLS.match(t) or SEC_IMPL.match(t) or SEC_DELIV.match(t)
        )

        entry = {'control_id': cid, 'tools': [], 'guidelines': [], 'deliverables': []}
        i = 0
        # anything before the first section marker is the control text (already
        # held verbatim in nca_ecc, so we discard it rather than duplicate)
        while i < len(block) and not is_boundary(block[i]):
            i += 1

        while i < len(block):
            t = block[i]
            if SEC_TOOLS.match(t):
                items, i = collect_bullets(block, i + 1, is_boundary)
                entry['tools'] += items
            elif SEC_IMPL.match(t):
                items, i = collect_bullets(block, i + 1, is_boundary)
                entry['guidelines'] += items
            elif SEC_DELIV.match(t):
                items, i = collect_bullets(block, i + 1, is_boundary)
                entry['deliverables'] += items
            else:
                i += 1

        if entry['guidelines'] or entry['deliverables'] or entry['tools']:
            # a control id can recur across page breaks; merge rather than clobber
            if cid in controls:
                for k in ('tools', 'guidelines', 'deliverables'):
                    controls[cid][k] += entry[k]
            else:
                controls[cid] = entry

    return controls


# Words the PDF's text layer drops entirely (the glyph run is present visually
# but not extractable). Repaired against the printed page.
FIXUPS = [
    ('-based Message Authentication, Reporting & Conformance',
     'Create Domain-based Message Authentication, Reporting & Conformance'),
]


def apply_fixups(controls):
    for entry in controls.values():
        for key in ('tools', 'guidelines', 'deliverables'):
            for b in entry[key]:
                for bad, good in FIXUPS:
                    if b['text'].startswith(bad):
                        b['text'] = good + b['text'][len(bad):]
    return controls


if __name__ == '__main__':
    c = apply_fixups(parse())
    json.dump(c, open('/home/claude/guide/official.json', 'w'), indent=1)
    withg = sum(1 for v in c.values() if v['guidelines'])
    withd = sum(1 for v in c.values() if v['deliverables'])
    witht = sum(1 for v in c.values() if v['tools'])
    print(f'controls parsed      : {len(c)}')
    print(f'  with guidelines    : {withg}')
    print(f'  with deliverables  : {withd}')
    print(f'  with tools         : {witht}')
