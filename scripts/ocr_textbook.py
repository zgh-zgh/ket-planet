# -*- coding: utf-8 -*-
"""把扫描版教材 PDF 逐页 OCR 成文字，供「教材例句」抽取使用。

用法（在 words-app 目录下）：
    python scripts/ocr_textbook.py 7A          # 只跑七上
    python scripts/ocr_textbook.py 7A 8B 9A    # 依次跑多册
输出：.cache_textbook/ocr_<book>.json  {"pages": ["第1页文字", ...]}

说明：只读取 ../zl 下的电子课本，不修改任何原文件；中断后重跑会跳过已完成的页。
"""
import json
import os
import sys
import time

import numpy as np
import pymupdf
from rapidocr_onnxruntime import RapidOCR

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# 文件名里带版本/年份，避免写死错位：按关键词匹配
BOOK_PATTERNS = {
    '7A': ['七上英语', '七年级上册'],
    '7B': ['英语七下', '七年级下册'],
    '8A': ['八年级上册'],
    '8B': ['八下'],
    '9A': ['9上', '九年级上册'],
}
OUT_DIR = os.path.join(ROOT, '.cache_textbook')
PDF_DIR = os.path.join(os.path.dirname(ROOT), 'zl')


def find_pdf(book):
    pats = BOOK_PATTERNS[book]
    for name in os.listdir(PDF_DIR):
        if not name.lower().endswith('.pdf'):
            continue
        if any(p in name for p in pats):
            return os.path.join(PDF_DIR, name)
    raise SystemExit('找不到教材 PDF：' + book)


def ocr_book(book, dpi=140):
    os.makedirs(OUT_DIR, exist_ok=True)
    out_path = os.path.join(OUT_DIR, 'ocr_%s.json' % book)
    done = {}
    if os.path.exists(out_path):
        try:
            done = json.load(open(out_path, encoding='utf-8')).get('pages_by_index', {})
        except Exception:
            done = {}
    pdf = find_pdf(book)
    doc = pymupdf.open(pdf)
    engine = RapidOCR()
    t0 = time.time()
    for i in range(len(doc)):
        key = str(i)
        if key in done:
            continue
        page = doc[i]
        pix = page.get_pixmap(dpi=dpi)
        img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
        if pix.n == 4:
            img = img[:, :, :3]
        try:
            res, _ = engine(img)
        except Exception as e:
            res = []
            print('  页 %d OCR 失败：%s' % (i + 1, e))
        lines = [item[1] for item in (res or [])]
        done[key] = '\n'.join(lines)
        if (i + 1) % 5 == 0 or i == len(doc) - 1:
            json.dump({'book': book, 'pdf': os.path.basename(pdf), 'dpi': dpi,
                       'pages_by_index': done}, open(out_path, 'w', encoding='utf-8'),
                      ensure_ascii=False)
            print('%s 已 OCR %d/%d 页，用时 %.0fs' % (book, len(done), len(doc), time.time() - t0), flush=True)
    print('%s 完成：%d 页，总用时 %.0fs' % (book, len(done), time.time() - t0), flush=True)


if __name__ == '__main__':
    targets = sys.argv[1:] or ['7A', '8B', '9A']
    for b in targets:
        ocr_book(b)
