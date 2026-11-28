# LP（public/lp.html）の書体 Zen Maru Gothic を、LP で使っている字だけのサブセットにして public/lp/fonts/ に置く（2026-11-28）。
#
# なぜ要るか:
#   Google Fonts から読むと、日本語は字の範囲ごとに分けた woff2 を何十本も取りに行く（測ったら約665KB・49本）。
#   LP で使う字は数百字しかないので、その字だけにして自分で配る方がずっと軽い。
#   自分で配るので Google Fonts には何も送らない（プライバシーポリシーの Google Fonts は「使い方ガイドのページで利用」のまま）。
#
# 使い方（LP の文言を変えたら、これを流してからコミットする）:
#   python -m pip install fonttools brotli      （初回だけ）
#   元のフォント（ZenMaruGothic-Medium.ttf / -Black.ttf）を1つのフォルダに置く。
#     https://github.com/google/fonts/tree/main/ofl/zenmarugothic （SIL Open Font License 1.1。サブセットにして配ってよい）
#   python scripts/lp-fonts-zen.py <元のフォントのフォルダ>
#   → public/lp/fonts/zen-maru-gothic-<太さ>.woff2 を書き、テンプレートの @font-face に書く ?v= の値を表示する
#
# 集める字: テンプレート（<script type="__bundler/template"> の JSON 文字列）の中の字。
#   JS とテンプレートのコメント（// … と /* … */ と <!-- … -->）の字は数えない（画面に出ないので）。ASCII は全部入れる。
import hashlib
import json
import os
import re
import sys

from fontTools import subset

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
LP = os.path.join(ROOT, 'public', 'lp.html')
OUT = os.path.join(ROOT, 'public', 'lp', 'fonts')
WEIGHTS = {'500': 'Medium', '700': 'Bold', '900': 'Black'}
# 使う太さ。2026-11-28 に測って 500 と 900 の2つにした（700 も入れた3つより、Lighthouse モバイルの LCP が約0.2秒・転送量が54KB 少ない）。
# テンプレートの @font-face では 700 も 900 のファイルを指す（太字の指定が残っていても 900 で出る）
DEFAULT_WEIGHTS = ['500', '900']


def template_text() -> str:
    with open(LP, encoding='utf-8') as f:
        lines = f.read().split('\n')
    for i, line in enumerate(lines):
        if i > 0 and '<script type="__bundler/template">' in lines[i - 1]:
            return json.loads(line.rstrip('\r'))
    raise SystemExit('テンプレート（__bundler/template）が見つからない')


def used_chars(t: str) -> str:
    t = re.sub(r'<!--.*?-->', '', t, flags=re.S)
    t = re.sub(r'/\*.*?\*/', '', t, flags=re.S)
    t = re.sub(r'(^|[^:])//[^\n]*', r'\1', t)  # 行コメント（https:// は残す）
    chars = set(ch for ch in t if ord(ch) > 0x7e)
    chars.update(chr(c) for c in range(0x20, 0x7f))
    chars.update('　、。・「」（）！？ー〜…')
    return ''.join(sorted(chars))


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit('使い方: python scripts/lp-fonts-zen.py <元のフォントのフォルダ> [太さ,太さ…]')
    src = sys.argv[1]
    weights = sys.argv[2].split(',') if len(sys.argv) > 2 else DEFAULT_WEIGHTS
    text = used_chars(template_text())
    print(f'字の数: {len(text)}')
    os.makedirs(OUT, exist_ok=True)
    for w in weights:
        opts = subset.Options()
        opts.flavor = 'woff2'
        opts.layout_features = ['kern', 'palt', 'liga']
        opts.name_IDs = ['*']
        opts.notdef_outline = True
        font = subset.load_font(os.path.join(src, f'ZenMaruGothic-{WEIGHTS[w]}.ttf'), opts)
        s = subset.Subsetter(opts)
        s.populate(text=text)
        s.subset(font)
        path = os.path.join(OUT, f'zen-maru-gothic-{w}.woff2')
        subset.save_font(font, path, opts)
        with open(path, 'rb') as f:
            h = hashlib.sha256(f.read()).hexdigest()[:8]
        print(f'{w}: {os.path.getsize(path)} バイト  /lp/fonts/zen-maru-gothic-{w}.woff2?v={h}')


main()
