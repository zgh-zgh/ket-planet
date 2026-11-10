# -*- coding: utf-8 -*-
"""从电子课本抽取「教材例句」，生成 textbook_examples.js。

流程：
  1. 逐页取文字：有文字层的册子按正文字号抽 span；扫描版读 scripts/ocr_textbook.py 的 OCR 结果
  2. 按 Unit 切分（扉页定位），把正文拆成句子并过滤（题干、页码、脚注、残句）
  3. 给每个教材词匹配 1-2 句，优先同单元、中短句
  4. 调大模型批量翻译成中文（带缓存，可断点续跑）
  5. 输出 textbook_examples.js（TEXTBOOK_UNITS + TEXTBOOK_EXAMPLES）

用法：
    python scripts/build_textbook_examples.py 7B 8A
    python scripts/build_textbook_examples.py 7B 8A --no-translate   # 只抽句不回译
不修改任何教材原文件；中间结果都在 .cache_textbook/。
依赖：pip install pymupdf wordninja（扫描册还需 rapidocr-onnxruntime）
"""
import json
import os
import re
import sys
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, '.cache_textbook')
PDF_DIR = os.path.join(os.path.dirname(ROOT), 'zl')

BOOKS = {
    '7A': dict(short='七上', name='七年级上册', mode='ocr', glob=['七上英语', '七年级上册']),
    '7B': dict(short='七下', name='七年级下册', mode='text', glob=['英语七下', '七年级下册'],
               openers=[9, 25, 41, 57, 73, 89, 105, 121]),
    '8A': dict(short='八上', name='八年级上册', mode='text', glob=['八年级上册'],
               openers=[8, 27, 44, 61, 78, 96, 115, 136]),
    '8B': dict(short='八下', name='八年级下册', mode='ocr', glob=['八下']),
    '9A': dict(short='九上', name='九年级上册', mode='ocr', glob=['9上', '九年级上册']),
}
ORDER = ['7A', '7B', '8A', '8B', '9A']

# 已确认的单元标题（从各册目录/扉页读出；OCR 册子在运行时再补）
UNIT_TITLES = {
    '7B': ['People around us', 'Travelling around the world', 'Trees and us', 'Our animal friends',
           'Water is life', 'Electricity everywhere', 'Role models of our time', 'Follow your interests'],
    '8A': ['Look it up!', 'Amazing numbers', 'Our digital lives', 'Inventions',
           'Going on an exchange trip', 'Wisdom counts', 'The secret of memory', 'Pets and us'],
    '7A': ['Friendship', 'School life', 'The seasons', 'The Earth',
           'Off to space', 'Travelling around Asia', 'Fun after school', 'Collecting as a hobby'],
    # 8B 第 7、8 单元扉页在 PDF 里是空白页，只保留能确认的标题
    '8B': ['Helping those in need', 'Body language', 'Comics and animation', 'Arts and heritage',
           'Saving animals in danger', 'Learning by doing', 'Space exploration', 'Unit 8'],
    '9A': ['Great people', 'Great ideas', 'Family traditions', 'A better me',
           'My time, my joy', 'Food and health', 'Reading Mark Twain', 'The power of love'],
}

BODY_MIN, BODY_MAX = 11.4, 12.6      # 正文正文字号（7B/8A 均为 12pt）
LEX = set()
_lex_path = os.path.join(CACHE, 'lexicon.txt')
if os.path.exists(_lex_path):
    LEX = {w.strip().lower() for w in open(_lex_path, encoding='utf-8') if w.strip()}
CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳'


# ---------------- 文字层 ----------------
def fix_glue(line):
    """OCR 常把整句粘成一串（storyandfind），用 wordninja 按词频切开；真词保持原样"""
    import wordninja
    def rep(m):
        w = m.group(0)
        if len(w) < 6:
            return w
        parts = wordninja.split(w)
        if len(parts) <= 1 or any(len(p) < 2 for p in parts):
            return w
        if w[0].isupper():
            parts[0] = parts[0][0].upper() + parts[0][1:]
        return ' '.join(parts)
    return re.sub(r'[A-Za-z]{6,}', rep, line)


def find_pdf(book):
    pats = BOOKS[book]['glob']
    for name in sorted(os.listdir(PDF_DIR)):
        if name.lower().endswith('.pdf') and any(p in name for p in pats):
            return os.path.join(PDF_DIR, name)
    raise SystemExit('找不到 PDF：' + book)


def page_lines_text(doc, i):
    """按正文字号取行，span 之间按横向间距补空格"""
    out = []
    for block in doc[i].get_text('dict')['blocks']:
        for line in block.get('lines', []):
            txt, prev = '', None
            for sp in line['spans']:
                if not (BODY_MIN <= sp['size'] <= BODY_MAX) or not sp['text'].strip():
                    continue
                if prev is not None:
                    gap = sp['bbox'][0] - prev['bbox'][2]
                    if gap > 0.18 * sp['size'] and not txt.endswith(' ') and not sp['text'].startswith(' '):
                        txt += ' '
                txt += sp['text']
                prev = sp
            txt = txt.strip()
            if txt and re.search(r'[A-Za-z]{2}', txt):
                out.append(txt)
    return out


def load_pages(book):
    """返回 [{no, lines}]，带缓存"""
    cache_path = os.path.join(CACHE, 'pages_%s.json' % book)
    if os.path.exists(cache_path):
        return json.load(open(cache_path, encoding='utf-8'))
    if BOOKS[book]['mode'] == 'ocr':
        ocr_path = os.path.join(CACHE, 'ocr_%s.json' % book)
        if not os.path.exists(ocr_path):
            raise SystemExit('%s 还没有 OCR 结果，先运行 scripts/ocr_textbook.py %s' % (book, book))
        raw = json.load(open(ocr_path, encoding='utf-8'))['pages_by_index']
        pages = [{'no': int(k) + 1, 'lines': [fix_glue(l.strip()) for l in v.split('\n') if l.strip()]}
                 for k, v in sorted(raw.items(), key=lambda x: int(x[0]))]
    else:
        import pymupdf
        doc = pymupdf.open(find_pdf(book))
        pages = [{'no': i + 1, 'lines': page_lines_text(doc, i)} for i in range(len(doc))]
    json.dump(pages, open(cache_path, 'w', encoding='utf-8'), ensure_ascii=False)
    return pages


# ---------------- 单元切分 ----------------
def detect_openers(book, pages):
    cfg = BOOKS[book]
    if cfg.get('openers'):
        return cfg['openers']
    # OCR 册子：扉页都有「Unit objectives / Key question」，按页序取
    openers = []
    for p in pages:
        head = ' '.join(p['lines'][:16])
        if re.search(r'Unit\s*objectives', head, re.I):
            openers.append(p['no'])
    if len(openers) < 8:
        # 个别扉页 OCR 失败（空白页）：用已识别扉页的间距把缺的补出来
        if len(openers) >= 2:
            gaps = sorted(b - a for a, b in zip(openers, openers[1:]) if 0 < b - a < 40)
            step = gaps[len(gaps) // 2] if gaps else 16
            while len(openers) < 8 and openers:
                nxt = openers[-1] + step
                if nxt > pages[-1]['no']:
                    break
                openers.append(nxt)
        if len(openers) < 8:
            print('  [warn] %s 只识别到 %d 个单元扉页' % (book, len(openers)))
    return openers[:8]


def unit_titles(book, pages, openers):
    if book in UNIT_TITLES:
        return UNIT_TITLES[book]
    # 从 OCR 目录页里抓 "Unit N" 后面的标题
    titles = ['Unit %d' % (i + 1) for i in range(len(openers))]
    for p in pages[:12]:
        for idx, ln in enumerate(p['lines']):
            m = re.match(r'Unit\s*(\d{1,2})\s*(.*)', ln.strip(), re.I)
            if not m:
                continue
            n = int(m.group(1))
            if not (1 <= n <= len(titles)):
                continue
            tail = m.group(2).strip(' |')
            if len(tail) < 3 and idx + 1 < len(p['lines']):
                tail = p['lines'][idx + 1].strip()
            tail = re.sub(r'\(p\.?\s*\d+\)', '', tail).strip(' |')
            if 3 <= len(tail) <= 40 and tail.lower() != 'unit %d' % n:
                titles[n - 1] = tail
    return titles


# ---------------- 句子 ----------------
IMPERATIVE = re.compile(r'^(?:Change|Complete|Choose|Match|Read|Look|Listen|Fill|Write|Work|Discuss|Answer|'
                        r'Circle|Underline|Tick|Label|Number|Put|Use|Find|Decide|Talk|Think|Study|Copy|'
                        r'Translate|Rewrite|Correct|Describe|Retell|Practise|Practice|Say|Ask|Tell|'
                        r'Role-play|Act|Make|Draw|Share|Compare|Check|Guess|Predict|Skim|Scan)\b')

BAD = re.compile(r'Contents|Key question|\(p\.\s*\d|Section \d|\bUnit\s+\d+|•|■|□|_{2,}|\(\d\)|→|'
                 + '|'.join(CIRCLED))


def join_lines(lines):
    s = ''
    for ln in lines:
        if not s:
            s = ln
            continue
        if s.endswith('-') and ln[:1].islower():
            s = s[:-1] + ln
        else:
            s += ' ' + ln
    return s


def tidy(s):
    s = s.replace('’', "'").replace('‘', "'").replace('“', '"').replace('”', '"')
    s = re.sub(r'\s+([.,!?;:])', r'\1', s)
    s = re.sub(r'([.,!?;:])(["])([A-Za-z])', r'\1\2 \3', s)   # 引号贴着下一个词
    s = re.sub(r'([.,!?])\1+', r'\1', s)
    s = re.sub(r'\s{2,}', ' ', s)
    return s.strip()


def glue_token(tok):
    """PDF 排版常把两个词粘成一个（ofwhat / opinionyou），能在词典里拆开就判为噪声"""
    t = tok.lower()
    if len(t) < 6 or not t.isalpha() or t in LEX:
        return False
    for i in range(2, len(t) - 2):
        if t[:i] in LEX and t[i:] in LEX:
            return True
    return False


def good_sentence(s):
    s = tidy(s)
    if not (5 <= len(s.split()) <= 28):
        return False
    if BAD.search(s):
        return False
    if not re.search(r'[.!?]["\')\]]?$', s):
        return False
    if s.count('?') > 1 or (s.count('?') == 1 and not s.rstrip('"\')]').endswith('?')):
        return False          # 题干与句子粘在一起
    if len(re.findall(r'[A-Za-z]', s)) < len(s) * 0.65:
        return False
    if len(re.findall(r'[\u4e00-\u9fff]', s)) > 1:
        return False
    if re.search(r'\b\w{17,}\b', s):
        return False
    if re.search(r'\s\d{1,2}\s+[a-z]', s):
        return False
    if '...' in s or '…' in s or '|' in s or '=' in s:
        return False
    if re.search(r'\.\s*\d{1,2}\.?\s*$', s):        # 句尾挂着的题号
        return False
    if re.search(r'\s\d{1,2}\s+[A-Z][a-z]', s):       # 句中插入的题号
        return False
    if s.count('. ') >= 2:                              # 明显是两三句粘在一起
        return False
    if LEX and any(glue_token(tok) for tok in re.findall(r"[A-Za-z]{6,}", s)):
        return False
    if IMPERATIVE.match(s):                       # 练习题指令
        return False
    if re.search(r'"\s*\d{1,3}\s*"', s):          # 引号里夹着页码/题号
        return False
    if re.search(r'\d{1,3}\s*"', s):
        return False
    if s.count('"') % 2 == 1:                      # 引号没闭合，多半是排版截断
        return False
    return True


def heading_set(pages):
    """OCR 常把表格/小标题拼进正文句子（…honest with Words for personal qualities each other），
    先把这些短标题收集起来，句子里出现就整句丢弃。"""
    heads = set()
    for p in pages:
        for ln in p['lines']:
            t = ln.strip()
            if not t or not t[0].isupper():
                continue
            if re.search(r'[.!?:;]$', t):
                continue
            words = t.split()
            if not (3 <= len(words) <= 6):
                continue
            if len(t) > 44:
                continue
            if not re.match(r"^[A-Z][A-Za-z' ,\-]*$", t):
                continue
            heads.add(re.sub(r'\s+', ' ', t.lower()))
    return heads


# OCR 常把栏目标签（Quotes / Grammar / Writing…）插进句子中间，单独处理
LABELS = ('Quotes Grammar Writing Reading Listening Speaking Project Practice Exercises '
          'Summary Notes Tips Task Review Culture Corner Study Skills Strategy Quiz '
          'Dictation Translation Spelling Vocabulary Pronunciation').split()
LABEL_RX = re.compile(r'(?<=[a-z,;]\s)(?:' + '|'.join(LABELS) + r')(?=\s+[a-z])')


def strip_labels(s):
    prev = None
    while prev != s:
        prev = s
        s = LABEL_RX.sub('', s)
    return re.sub(r'\s{2,}', ' ', s).strip()


def has_heading(s, heads):
    low = re.sub(r'\s+', ' ', s.lower())
    for h in heads:
        if h in low:
            return True
    return False


def build_pool(pages, openers):
    pool = []
    heads = heading_set(pages)
    for p in pages:
        if p['no'] < openers[0]:
            continue
        unit = 1
        for j, op in enumerate(openers):
            if p['no'] >= op:
                unit = j + 1
        text = join_lines(p['lines'])
        for raw in re.split(r'(?<=[.!?])\s+(?=[A-Z"“(\[])', text):
            s = re.sub(r'^\d{1,2}\s+', '', raw.strip())
            # 页边残留的单字母（M A true friend…）
            s = re.sub(r'^[A-Z]\s+(?=[A-Z])', '', s)
            s = strip_labels(s)
            s = re.sub(r'^[A-Z]\d{1,2}\s*:\s*', '', s)   # 版面编号（S2: / A3:）
            if has_heading(s, heads):
                continue
            if good_sentence(s):
                pool.append((unit, tidy(s)))
    return pool


# ---------------- 匹配 ----------------
IRREG = set('''went gone made took taken said found gave given got gotten knew known saw seen came come thought told
became become left felt brought began begun kept held wrote written stood heard let meant set met ran paid sat spoke
spoken led grew grown lost fell fallen sent built understood drew drawn broke broken spent cut rose risen drove driven
bought wore worn chose chosen ate eaten read woke woken taught caught threw thrown slept slid sought sold fought struck
dealt arose arisen froze frozen hid hidden bit bitten blew blown bore borne swore sworn tore torn'''.split())


def variants(w):
    w = w.lower()
    out = {w}
    if ' ' in w or '-' in w:
        out.add(w.replace('-', ' '))
        out.add(w.replace(' ', '-'))
    if w.endswith('ies'):
        out.add(w[:-3] + 'y')
    elif w.endswith('es'):
        out |= {w[:-2], w[:-1]}
    elif w.endswith('s') and not w.endswith('ss'):
        out.add(w[:-1])
    for suf in ('ing', 'ed'):
        if w.endswith(suf) and len(w) > len(suf) + 2:
            b = w[:-len(suf)]
            # 词干太短时不要（caring → car 会把 "a car" 当成 caring）
            if len(b) >= 4:
                out.add(b)
            out.add(b + 'e')
            if len(b) > 2 and b[-1] == b[-2]:
                out.add(b[:-1])
    if w.endswith('er') and len(w) > 4:
        out.add(w[:-2])
    if w.endswith('est') and len(w) > 5:
        out.add(w[:-3])
    return out


IRREGULAR = {
    'be': 'am is are was were been being', 'go': 'went gone goes going', 'have': 'has had having',
    'do': 'did done does doing', 'make': 'made making', 'take': 'took taken taking',
    'get': 'got gotten getting', 'give': 'gave given giving', 'come': 'came coming',
    'see': 'saw seen seeing', 'say': 'said saying', 'think': 'thought thinking',
    'buy': 'bought buying', 'teach': 'taught teaching', 'catch': 'caught catching',
    'bring': 'brought bringing', 'find': 'found finding', 'tell': 'told telling',
    'feel': 'felt feeling', 'keep': 'kept keeping', 'leave': 'left leaving',
    'meet': 'met meeting', 'run': 'ran running', 'sit': 'sat sitting',
    'stand': 'stood standing', 'understand': 'understood understanding',
    'write': 'wrote written writing', 'read': 'reading', 'speak': 'spoke spoken speaking',
    'break': 'broke broken breaking', 'begin': 'began begun beginning',
    'drink': 'drank drunk drinking', 'eat': 'ate eaten eating',
    'fall': 'fell fallen falling', 'fly': 'flew flown flying flying',
    'forget': 'forgot forgotten forgetting', 'know': 'knew known knowing',
    'sing': 'sang sung singing', 'swim': 'swam swum swimming',
    'wear': 'wore worn wearing', 'win': 'won winning', 'lose': 'lost losing',
    'pay': 'paid paying', 'spend': 'spent spending', 'build': 'built building',
    'send': 'sent sending', 'sleep': 'slept sleeping', 'wake': 'woke woken waking',
    'child': 'children', 'man': 'men', 'woman': 'women', 'person': 'people persons',
    'foot': 'feet', 'tooth': 'teeth', 'mouse': 'mice', 'life': 'lives',
    'wife': 'wives', 'half': 'halves', 'shelf': 'shelves', 'knife': 'knives',
    'leaf': 'leaves', 'wolf': 'wolves', 'potato': 'potatoes', 'tomato': 'tomatoes',
    'hero': 'heroes', 'photo': 'photos', 'piano': 'pianos',
    'good': 'better best', 'bad': 'worse worst', 'many': 'more most', 'much': 'more most',
    'little': 'less least', 'far': 'farther further farthest furthest',
}
VOWEL = set('aeiou')


def inflections(w):
    """单词的常见变形：复数、三单、过去式、进行时、比较级等（用于在句子里找它）"""
    out = {w}
    if w in IRREGULAR:
        out |= set(IRREGULAR[w].split())
    # 复数 / 三单
    out |= {w + 's', w + 'es'}
    if re.search(r'[^aeiou]y$', w):
        out |= {w[:-1] + 'ies', w[:-1] + 'ied', w[:-1] + 'ier', w[:-1] + 'iest'}
    # 进行时 / 过去式
    out |= {w + 'ed', w + 'ing', w + 'd'}
    if w.endswith('e'):
        out.add(w[:-1] + 'ing')
    if w.endswith('f'):
        out.add(w[:-1] + 'ves')
    if w.endswith('fe'):
        out.add(w[:-2] + 'ves')
    # 双写尾字母（stop → stopped / stopping）
    if len(w) >= 3 and w[-1] not in VOWEL and w[-2] in VOWEL and w[-3] not in VOWEL:
        out |= {w + w[-1] + 'ed', w + w[-1] + 'ing', w + w[-1] + 'er', w + w[-1] + 'est'}
    out |= {w + 'er', w + 'est'}
    return {x for x in out if x}


def make_matcher(w):
    wl = w.lower().strip()
    if re.search(r'[\s\-]', wl):
        parts = [p for p in re.split(r'[\s\-]+', wl) if p and p not in
                 ('...', 'somebody', 'someone', 'something', 'oneself', 'one', 'ones')]
        if not parts:
            parts = [p for p in re.split(r'[\s\-]+', wl) if p]
        body = r'\s+(?:\w+\s+){0,2}'.join(
            r'(?:' + re.escape(p) + r'(?:s|es|ed|d|ing)?)' for p in parts)
        rx = re.compile(r'\b' + body + r'\b', re.I)
        return rx
    vs = sorted(inflections(wl) | variants(wl), key=len, reverse=True)
    return re.compile(r'\b(?:' + '|'.join(re.escape(v) for v in vs) + r')\b', re.I)


def score(unit, s, target_unit):
    n = len(s.split())
    sc = 0
    if unit == target_unit:
        sc += 5
    if 8 <= n <= 18:
        sc += 3
    elif 6 <= n <= 24:
        sc += 1
    if s.endswith(('.', '!', '?')):
        sc += 1
    if s[0].isupper():
        sc += 1
    if n > 25:
        sc -= 2
    if s.rstrip().endswith('?'):
        sc -= 2          # 问句当例句不体面
    return sc


def highlight(s, rx):
    m = rx.search(s)
    if not m:
        return s
    return s[:m.start()] + '<B>' + m.group(0) + '</B>' + s[m.end():]


def load_materials():
    p = os.path.join(CACHE, 'unit_materials.json')
    if not os.path.exists(p):
        return {}
    return json.load(open(p, encoding='utf-8'))


def material_pool(book, materials):
    """单元资料里的中英对照句：[(unit, en, cn)]，人工译文，优先使用"""
    out = []
    for u, slot in (materials.get(book) or {}).items():
        for s in slot.get('sentences', []):
            en = s.get('en', '').strip()
            cn = (s.get('cn') or '').strip()
            if not en or not cn or '___' in en:
                continue
            out.append((int(u), en, cn))
    return out


def match_book(book, pages, materials):
    openers = detect_openers(book, pages)
    titles = unit_titles(book, pages, openers)
    pool = build_pool(pages, openers)
    mat = material_pool(book, materials)
    words = json.load(open(os.path.join(CACHE, 'words.json'), encoding='utf-8'))[book]['words']
    out = {}
    for w, cn, unit in words:
        rx = make_matcher(w)
        picked, seen = [], set()

        # ① 单元资料的人工中英对照句优先（干净、有译文、就是课本句子）
        hits1 = [(score(u, t, unit) + (2 if u == unit else 0), u, t, c)
                 for u, t, c in mat if rx.search(t)]
        hits1.sort(key=lambda x: (-x[0], len(x[2])))
        for sc, u, t, c in hits1:
            if len(picked) >= 2:
                break
            key = re.sub(r'\W+', '', t.lower())[:60]
            if key in seen:
                continue
            seen.add(key)
            picked.append({'en': highlight(t, rx), 'unit': u, 'book': book, 'cn': c})

        # ② 再从课文正文里补（没有人工译文的稍后统一翻译）
        if len(picked) < 2:
            hits2 = [(score(u, t, unit), u, t) for u, t in pool if rx.search(t)]
            hits2.sort(key=lambda x: (-x[0], len(x[2])))
            for sc, u, t in hits2:
                if len(picked) >= 2:
                    break
                if sc < 3:
                    continue
                key = re.sub(r'\W+', '', t.lower())[:60]
                if key in seen:
                    continue
                seen.add(key)
                picked.append({'en': highlight(t, rx), 'unit': u, 'book': book})

        if picked:
            out[w] = picked
    print('%s：%d/%d 词有课本句（资料句 %d · 正文句 %d · 单元扉页 %s）'
          % (book, len(out), len(words), len(mat), len(pool), openers))
    return out, titles, mat + [(u, t, None) for u, t in pool]


# ---------------- 翻译 ----------------
def api_key():
    k = os.environ.get('AGNES_API_KEY')
    if k:
        return k
    srv = os.path.join(ROOT, 'server.js')
    if os.path.exists(srv):
        m = re.search(r"AGNES_API_KEY\s*=\s*'([^']+)'", open(srv, encoding='utf-8').read())
        if m:
            return m.group(1)
    raise SystemExit('缺少 AGNES_API_KEY 环境变量')


def chat(payload):
    req = urllib.request.Request(
        'https://apihub.agnes-ai.com/v1/chat/completions',
        data=json.dumps(payload).encode('utf-8'),
        headers={'Authorization': 'Bearer ' + api_key(), 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.loads(r.read().decode('utf-8'))


def translate(sentences):
    """sentences: list[str] -> dict，带磁盘缓存；4 路并发，一批 20 句"""
    from concurrent.futures import ThreadPoolExecutor
    cache_path = os.path.join(CACHE, 'translations.json')
    cache = {}
    if os.path.exists(cache_path):
        cache = json.load(open(cache_path, encoding='utf-8'))
    todo = [x for x in sentences if x not in cache]
    print('待翻译 %d 句（已缓存 %d）' % (len(todo), len(cache)), flush=True)
    batches = [todo[i:i + 20] for i in range(0, len(todo), 20)]

    def work(batch):
        numbered = '\n'.join('%d. %s' % (j + 1, x) for j, x in enumerate(batch))
        body = {
            'model': 'agnes-3.0-flash',
            'temperature': 0.2,
            'messages': [
                {'role': 'system', 'content': '你是中学英语老师，把英文例句翻译成自然、简洁的简体中文，'
                                              '保留原文语气，不要解释。只输出 JSON。'},
                {'role': 'user', 'content': '把下列句子逐条翻译成中文，返回 {"items":[{"i":1,"cn":"……"}]}：\n' + numbered},
            ],
        }
        for attempt in range(4):
            try:
                d = chat(body)
                txt = d['choices'][0]['message']['content']
                m = re.search(r'\{[\s\S]*\}', txt)
                items = json.loads(m.group(0))['items']
                got = {}
                for it in items:
                    idx = int(it['i']) - 1
                    if 0 <= idx < len(batch) and str(it.get('cn', '')).strip():
                        got[batch[idx]] = str(it['cn']).strip()
                return got
            except Exception as e:
                print('  翻译重试 %d/4：%s' % (attempt + 1, str(e)[:100]), flush=True)
                time.sleep(1.5 + attempt * 2)
        return {}

    done = 0
    with ThreadPoolExecutor(max_workers=4) as ex:
        for got in ex.map(work, batches):
            cache.update(got)
            done += 1
            if done % 3 == 0:
                json.dump(cache, open(cache_path, 'w', encoding='utf-8'), ensure_ascii=False)
                print('  进度 %d/%d 批，已译 %d 句' % (done, len(batches), len(cache)), flush=True)
    json.dump(cache, open(cache_path, 'w', encoding='utf-8'), ensure_ascii=False)
    return cache


# ---------------- 输出 ----------------
def emit(data, titles, out_path):
    units = {}
    for b in ORDER:
        if b not in titles:
            continue
        units[b] = {'short': BOOKS[b]['short'], 'name': BOOKS[b]['name'], 'units': titles[b]}
    head = ('// 教材例句：从电子课本正文抽取（每词 1-2 句，优先同单元），scripts/build_textbook_examples.py 生成\n'
            '// 仅作课堂教学参考，教材版权归上海教育出版社所有。\n')
    body = 'const TEXTBOOK_UNITS = ' + json.dumps(units, ensure_ascii=False) + ';\n' \
           + 'const TEXTBOOK_EXAMPLES = ' + json.dumps(data, ensure_ascii=False) + ';\n'
    open(out_path, 'w', encoding='utf-8').write(head + body)
    print('写出 %s（%d 词，%.0f KB）' % (out_path, len(data), os.path.getsize(out_path) / 1024))


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    do_translate = '--no-translate' not in sys.argv
    books = args or ORDER
    os.makedirs(CACHE, exist_ok=True)
    if not os.path.exists(os.path.join(CACHE, 'words.json')):
        raise SystemExit('缺少 .cache_textbook/words.json')
    materials = load_materials()
    data, titles, pools = {}, {}, {}
    for b in books:
        papers = load_pages(b)
        got, tt, pool = match_book(b, papers, materials)
        data.update(got)
        titles[b] = tt
        pools[b] = pool

    # 本册找不到的，允许从同系列其他册补（仍是教材原句，只是别的分册）
    words_all = json.load(open(os.path.join(CACHE, 'words.json'), encoding='utf-8'))
    order_idx = {b: i for i, b in enumerate(ORDER)}
    added = 0
    for b in books:
        for w, cn, unit in words_all[b]['words']:
            if w in data:
                continue
            rx = make_matcher(w)
            best = None
            for ob, pool in pools.items():
                for u, sent, cn2 in pool:
                    if not rx.search(sent):
                        continue
                    sc = score(u, sent, unit) - abs(order_idx[ob] - order_idx[b]) * 2
                    if sc < 3:
                        continue
                    if best is None or sc > best[0]:
                        best = (sc, ob, u, sent, cn2)
            if best:
                _, ob, u, sent, cn2 = best
                item = {'en': highlight(sent, rx), 'unit': u, 'book': ob}
                if cn2:
                    item['cn'] = cn2
                data[w] = [item]
                added += 1
    print('跨册补句 %d 个词' % added)
    json.dump(data, open(os.path.join(CACHE, 'tb_examples.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)
    json.dump(titles, open(os.path.join(CACHE, 'tb_titles.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)
    if do_translate:
        sents = sorted({re.sub(r'<[^>]+>', '', e['en'])
                        for arr in data.values() for e in arr
                        if not (e.get('cn') or '').strip()})
        cache = translate(sents)
        missing = [s for s in sents if not cache.get(s)]
        print('无译文 %d 句' % len(missing))
        for arr in data.values():
            for e in arr:
                if not (e.get('cn') or '').strip():
                    e['cn'] = cache.get(re.sub(r'<[^>]+>', '', e['en']), '')
    emit(data, titles, os.path.join(ROOT, 'textbook_examples.js'))


if __name__ == '__main__':
    main()
