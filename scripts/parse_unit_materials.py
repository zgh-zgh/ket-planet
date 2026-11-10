# -*- coding: utf-8 -*-
"""
从新增的单元资料（知识清单 / 期末复习解析版）里抽取「重点词汇 / 重点短语 / 重点句子」。
这些资料是人工整理的中英对照，比 OCR 出来的课文句干净得多，用作教材词例句的首选来源。

数据来源：zl/ 下三个压缩包（上册.zip、新教材7年级单元专项练习.zip、新教材7年级同步知识点及单元测试.zip）
输出：.cache_textbook/unit_materials.json
    { "7A": { "1": { "title": "...", "words": [...], "phrases": [...], "sentences": [...] } }, "8A": {...} }

依赖：无（标准库解析 docx）
用法：python scripts/parse_unit_materials.py
"""
import os
import re
import json
import glob
import zipfile
from xml.etree import ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAT = os.path.join(ROOT, '.cache_textbook', 'mat')
OUT = os.path.join(ROOT, '.cache_textbook', 'unit_materials.json')

NS = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
CJK = re.compile(r'[\u4e00-\u9fff]')


def para_text(p):
    out = []
    for node in p.iter():
        tag = node.tag.split('}')[-1]
        if tag == 't':
            out.append(node.text or '')
        elif tag == 'tab':
            out.append(' ')
        elif tag == 'br':
            out.append('\n')
    return ''.join(out)


def walk(el, lines):
    for child in el:
        tag = child.tag.split('}')[-1]
        if tag == 'p':
            t = para_text(child).strip()
            if t:
                lines.append(t)
        elif tag == 'tbl':
            for tr in child.findall('.//w:tr', NS):
                cells = []
                for tc in tr.findall('./w:tc', NS):
                    sub = [para_text(p).strip() for p in tc.findall('.//w:p', NS)]
                    sub = [x for x in sub if x]
                    cells.append(' '.join(sub))
                row = ' | '.join(cells).strip()
                if row.strip(' |'):
                    lines.append(row)
        else:
            walk(child, lines)


def docx_lines(path):
    with zipfile.ZipFile(path) as z:
        root = ET.fromstring(z.read('word/document.xml'))
    lines = []
    walk(root.find('w:body', NS), lines)
    return lines


def tidy(s):
    s = (s.replace('’', "'").replace('‘', "'")
          .replace('“', '"').replace('”', '"')
          .replace('；', '; ').replace('，', ', '))
    s = re.sub(r'\s+', ' ', s).strip()
    return s


def split_pair(line):
    """把「英文中文」或「中文英文」拆成 (en, cn)，拆不出返回 None"""
    line = tidy(line)
    m = CJK.search(line)
    if not m:
        return None
    i = m.start()
    if i == 0:                                   # 中文在前
        m2 = re.search(r'[A-Za-z]', line)
        if not m2:
            return None
        return line[m2.start():].strip(), line[:m2.start()].strip(' 。;；,')
    return line[:i].strip(), line[i:].strip()


EN_OK = re.compile(r"[A-Za-z]")


CN_JUNK = re.compile(r'^(?:注意|考点|用法|分析|拓展|链接|高分|解析|点拨|说明|例句|辨析|提示|总结|比较|区别)')
EN_JUNK = re.compile(r'[|｜①-⑩→※★【】]')


def good_sentence(en):
    if not en or not EN_OK.search(en):
        return False
    if EN_JUNK.search(en):
        return False
    if en.startswith(('—', '-', '–')):
        en = en.lstrip('—-– ').strip()
    if not en or not en[0].isupper():
        return False
    words = en.split()
    if not (5 <= len(words) <= 32):
        return False
    if CJK.search(en):
        return False
    if '___' in en or '…' in en or '...' in en:
        return False
    if re.search(r'\b[A-D]\s*[.．]\s', en):       # 选项
        return False
    if not re.search(r'[.!?"\']\s*$', en):
        # 语法讲解里的例句常不带句号，只要大写开头、够长就收
        if not (en[0].isupper() and len(words) >= 6):
            return False
    if len(re.findall(r'[A-Za-z]', en)) < len(en) * 0.6:
        return False
    return True


def good_phrase(en):
    if not en or CJK.search(en):
        return False
    words = en.split()
    if not (1 <= len(words) <= 7):
        return False
    return bool(re.match(r"^[A-Za-z][A-Za-z' .\-]*$", en))


NUM = re.compile(r'^(\d{1,2})\s*[.．、]\s*(.+)$')
HEAD = re.compile(r'^([一二三四五六七八九十]{1,3})\s*[.．、]\s*(.+)$')
POS = re.compile(r'^(?:n|v|vt|vi|adj|adv|prep|conj|pron|num|art|int|aux|modal)\s*\.?\s*(.*)$', re.I)


def parse_vocab(body):
    out = []
    for raw in body:
        m = NUM.match(raw)
        if not m:
            continue
        txt = tidy(m.group(2))
        # guitar  n.吉他 / dark  褐色的；乌黑的
        mm = re.match(r"^([A-Za-z][A-Za-z' .\-]{0,28}?)\s{1,}([a-z]{1,5}\.)?\s*([\u4e00-\u9fff].*)$", txt)
        if not mm:
            continue
        w = mm.group(1).strip().lower()
        cn = mm.group(3).strip()
        if not w or not cn:
            continue
        out.append({'w': w, 'cn': cn})
    return out


def parse_numbered_pairs(body, is_sentence):
    out = []
    for raw in body:
        m = NUM.match(raw)
        if not m:
            continue
        pair = split_pair(m.group(2))
        if not pair:
            continue
        en, cn = pair
        en = en.lstrip('—-– ').strip()
        if is_sentence:
            if CN_JUNK.match(cn):
                continue
            if not good_sentence(en) or len(cn) < 3:
                continue
            if not re.search(r'[.!?。！？"\']\s*$', en):
                en = en.rstrip() + '.'
            out.append({'en': en, 'cn': cn})
        else:
            if not good_phrase(en) or len(cn) < 1:
                continue
            out.append({'en': en.lower(), 'cn': cn})
    return out


def book_unit(path):
    """从路径判断 (册, [(起始单元, 结束单元)])"""
    p = path.replace('\\', '/')
    name = os.path.basename(path)
    if '新教材7年级同步知识点及单元测试' in p and '记忆版' in name:
        m = re.search(r'Unit\s*(\d)', name)
        return ('7A', [int(m.group(1))] if m else [])
    if '8年级上期末复习' in p and '解析版' in name:
        m = re.search(r'Unit(\d)-Unit(\d)', name)
        if m:
            return ('8A', list(range(int(m.group(1)), int(m.group(2)) + 1)))
    return ('', [])


def _real_name(name, info):
    """zip 里的中文名多为 GBK，被 zipfile 按 cp437 解出来是乱码"""
    if info.flag_bits & 0x800:
        return name
    for enc in ('gbk', 'utf-8'):
        try:
            return name.encode('cp437').decode(enc)
        except Exception:
            continue
    return name


def ensure_extracted():
    """zl/*.zip 解到 .cache_textbook/mat（已存在就跳过），并展开里面套的二级 zip"""
    if os.path.isdir(MAT) and os.listdir(MAT):
        return
    src = os.path.join(os.path.dirname(ROOT), 'zl')
    zips = [os.path.join(src, n) for n in
            ('上册.zip', '新教材7年级单元专项练习.zip', '新教材7年级同步知识点及单元测试.zip')]
    zips = [z for z in zips if os.path.exists(z)]
    if not zips:
        raise SystemExit('找不到素材压缩包：%s' % src)

    def unzip(path, dest):
        with zipfile.ZipFile(path) as z:
            for info in z.infolist():
                if info.is_dir():
                    continue
                target = os.path.join(dest, _real_name(info.filename, info))
                os.makedirs(os.path.dirname(target), exist_ok=True)
                with z.open(info) as f, open(target, 'wb') as out:
                    out.write(f.read())

    for z in zips:
        unzip(z, os.path.join(MAT, os.path.splitext(os.path.basename(z))[0]))
    for z in glob.glob(os.path.join(MAT, '**', '*.zip'), recursive=True):
        try:
            unzip(z, z[:-4] + '_x')
        except Exception as e:
            print('  二级解压失败 %s：%s' % (os.path.basename(z), e))
    print('已解压素材到 %s' % MAT)


def main():
    ensure_extracted()
    files = []
    for pat in ('**/*记忆版*.docx', '**/*解析版*.docx'):
        files += glob.glob(os.path.join(MAT, pat), recursive=True)
    files = sorted(set(files))
    print('扫描资料 %d 份' % len(files))

    UNIT_LINE = re.compile(r'^Unit\s*(\d{1,2})$', re.I)
    data = {}

    def slot(book, u):
        return data.setdefault(book, {}).setdefault(str(u), {
            'words': [], 'phrases': [], 'sentences': [], 'source': []})

    for f in files:
        book, units = book_unit(f)
        if not book:
            continue
        lines = docx_lines(f)
        cur_u = units[0] if units else 0
        sec = None
        for ln in lines:
            um = UNIT_LINE.match(ln.strip())
            if um:
                cur_u = int(um.group(1))
                sec = None
                continue
            h = HEAD.match(ln)
            if h:
                sec = {'title': tidy(h.group(2)), 'body': []}
                t = sec['title']
                if '词汇' in t and '拓展' not in t:
                    sec['kind'] = 'vocab'
                elif '短语' in t:
                    sec['kind'] = 'phrase'
                elif '句子' in t or '句型' in t:
                    sec['kind'] = 'sentence'
                else:
                    sec['kind'] = 'grammar'
                if cur_u:
                    slot(book, cur_u).setdefault('sections', []).append(sec)
                continue
            if sec is not None and cur_u:
                sec['body'].append(ln)

        for u in units:
            st = slot(book, u)
            st['source'].append(os.path.basename(f)[:60])
            for sec in st.get('sections', []):
                if sec['kind'] == 'vocab':
                    st['words'] += parse_vocab(sec['body'])
                elif sec['kind'] in ('phrase', 'sentence'):
                    # 有些资料把小标题写错（「重点短语」下面是句子），按内容判断而不是看标题
                    for raw in sec['body']:
                        mnum = NUM.match(raw)
                        if not mnum:
                            continue
                        pair = split_pair(mnum.group(2))
                        if not pair:
                            continue
                        en, cn = pair
                        en = en.lstrip('—-– ').strip()
                        if len(cn) < 2:
                            continue
                        if len(en.split()) >= 5 and good_sentence(en) and not CN_JUNK.match(cn):
                            if not re.search(r'[.!?。！？"\']\s*$', en):
                                en = en.rstrip() + '.'
                            st['sentences'].append({'en': en, 'cn': cn, 'pri': 0})
                        elif good_phrase(en):
                            st['phrases'].append({'en': en.lower(), 'cn': cn})
                else:
                    # 语法/用法/考点段：逐行找中英对照，作为补充例句
                    for raw in sec['body']:
                        if '___' in raw or '→' in raw:
                            continue
                        pair = split_pair(raw)
                        if not pair:
                            continue
                        en, cn = pair
                        if CN_JUNK.match(cn):
                            continue
                        if not good_sentence(en) or len(cn) < 3:
                            continue
                        en = en.lstrip('—-– ').strip()
                        if not re.search(r'[.!?。！？"\']\s*$', en):
                            en = en.rstrip() + '.'
                        st['sentences'].append({'en': en, 'cn': cn, 'pri': 1})

    # 去重 + 排序（重点句子优先）
    total_s = 0
    for book, units in data.items():
        for u, st in units.items():
            st.pop('sections', None)
            for key, idkey in (('words', 'w'), ('phrases', 'en'), ('sentences', 'en')):
                seen, dedup = set(), []
                for it in st[key]:
                    k = it[idkey].lower()
                    if k in seen:
                        continue
                    seen.add(k)
                    dedup.append(it)
                if key == 'sentences':
                    dedup.sort(key=lambda x: x.get('pri', 0))
                st[key] = dedup
            total_s += len(st['sentences'])

    json.dump(data, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('写出 %s（%.0f KB）' % (OUT, os.path.getsize(OUT) / 1024))
    for book in sorted(data):
        for u in sorted(data[book], key=int):
            st = data[book][u]
            print('  %s U%-2s 词汇 %2d 短语 %2d 句子 %2d'
                  % (book, u, len(st['words']), len(st['phrases']), len(st['sentences'])))
    print('合计句子 %d' % total_s)


if __name__ == '__main__':
    main()
