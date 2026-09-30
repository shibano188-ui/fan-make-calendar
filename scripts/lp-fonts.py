# LP（public/lp.html）に埋め込まれたフォントを外し、使っている文字だけのサブセットにして public/lp/fonts/ に置く。
#
# なぜ要るか:
#   デザインツールの書き出しは Noto Sans JP（可変フォント・Google Fonts の分割124ファイル）を丸ごと埋め込むので、
#   lp.html が約7.3MB になる。大きすぎて X のクローラーがカードを作れず、スマホでの初回表示も重い。
#
# やること:
#   1. テンプレートの @font-face が指しているフォントを manifest から取り出す
#   2. LP で使っている文字（テンプレートの中の文字＋ASCII）を集める
#   3. 分割ファイルごとに、使う文字だけに絞る → 太さを 400 / 700 に固定 → 1本にまとめる
#   4. public/lp/fonts/noto-sans-jp-400.woff2 / -700.woff2 に書き、@font-face をそれに差し替える（font-display: swap）
#   5. manifest からフォントを消す
#
# 使い方（デザインツールから lp.html を書き出し直したら、この順で実行してからコミットする）:
#   python -m pip install fonttools brotli      （初回だけ）
#   python scripts/lp-fonts.py
#   node scripts/lp-og-tags.mjs
#   npm run build
# 2回目以降の実行（フォントがもう外れている lp.html）は、何もせずに終わる。
# LP の文言を変えたのにフォントだけ作り直したいときは、書き出し直した lp.html に対して実行する
# （外したあとの lp.html には元のフォントが無いので、文字を足したサブセットは作れない）。
#
# 見た目の確かめ方:
#   実行前後の lp.html を同じ幅で表示して見比べる。最後に「フォントに無い文字」が出たら、その文字は
#   元の埋め込みフォントにも無かった（端末のフォントで表示される）ので、サブセットのせいではない。
import base64
import gzip
import hashlib
import io
import json
import re
import sys
from pathlib import Path

from fontTools import subset
from fontTools.merge import Merger
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

# Windows のコンソール（cp932）では ✕ などが出せずに落ちるので、出力は UTF-8 にする
sys.stdout.reconfigure(encoding='utf-8')

FILE = Path('public/lp.html')
OUT_DIR = Path('public/lp/fonts')
URL_BASE = '/lp/fonts'
FAMILY = 'Noto Sans JP'
NAME = 'noto-sans-jp'

html = FILE.read_text(encoding='utf-8')
lines = html.split('\n')


def script_line(kind: str) -> int:
    """<script type="__bundler/<kind>"> の次の行（中身の JSON）の位置"""
    for i, line in enumerate(lines):
        if line.strip() == f'<script type="__bundler/{kind}">':
            return i + 1
    sys.exit(f'<script type="__bundler/{kind}"> が見つからない。書き出しの形式が変わった？')


def enc_template(s: str) -> str:
    # 書き出し元と同じ書き方（JSON 文字列で、</ を </ にする）
    return json.dumps(s, ensure_ascii=False).replace('</', '<\\u002F')


def enc_manifest(m: dict) -> str:
    return json.dumps(m, ensure_ascii=False, separators=(',', ':'))


mi, ti = script_line('manifest'), script_line('template')
manifest = json.loads(lines[mi])
template = json.loads(lines[ti])
# 書き戻しで余計な差分が出ないことを先に確かめる
if enc_template(template) != lines[ti] or enc_manifest(manifest) != lines[mi]:
    sys.exit('lp.html を同じ形で書き戻せない（エスケープの仕方が変わった？）。中身を確かめること')

font_ids = {k for k, v in manifest.items() if v['mime'].startswith('font/')}
face_re = re.compile(r'@font-face\s*\{[^}]*\}\s*')
faces = [f for f in face_re.findall(template) if any(i in f for i in font_ids)]
if not faces:
    print('埋め込みフォントは外してある。何もしない')
    sys.exit(0)

# 太さごとの分割ファイル
by_weight: dict[int, list[str]] = {}
for f in faces:
    fam = re.search(r"font-family:\s*['\"]([^'\"]+)", f).group(1)
    if fam != FAMILY:
        sys.exit(f'想定外のフォント: {fam}（{FAMILY} だけを想定している）')
    w = int(re.search(r'font-weight:\s*(\d+)', f).group(1))
    uid = re.search(r'url\("([0-9a-f-]{36})"\)', f).group(1)
    by_weight.setdefault(w, []).append(uid)

# 使っている文字。@font-face（unicode-range に大量の範囲が書いてある）を除いたテンプレートと、外側の HTML
outer = '\n'.join(l for i, l in enumerate(lines) if i not in (mi, ti))
text = face_re.sub('', template) + outer
chars = {ord(c) for c in text if ord(c) >= 0x20 and c not in '  '}
chars |= set(range(0x20, 0x7F))  # ASCII は全部入れておく（数字・記号は JS で組み立てることがある）


def load(uid: str) -> bytes:
    v = manifest[uid]
    b = base64.b64decode(v['data'])
    return gzip.decompress(b) if v.get('compressed') else b


OUT_DIR.mkdir(parents=True, exist_ok=True)
covered: set[int] = set()
new_faces = []
for w, uids in sorted(by_weight.items()):
    parts = []
    created = None
    for uid in dict.fromkeys(uids):
        font = TTFont(io.BytesIO(load(uid)))
        created = created or font['head'].created
        need = chars & set(font.getBestCmap())
        if not need:
            continue
        covered |= need
        opts = subset.Options()
        opts.layout_features = ['*']      # 約物の詰め・縦書きなど、元のまま残す
        opts.name_IDs = ['*']
        opts.notdef_outline = True
        opts.glyph_names = False
        s = subset.Subsetter(opts)
        s.populate(unicodes=need)
        s.subset(font)
        font = instancer.instantiateVariableFont(font, {'wght': w})  # 可変 → 太さを固定
        if 'BASE' in font:
            del font['BASE']  # Merger が扱えない。ブラウザの横書きの表示には使われない
        buf = io.BytesIO()
        font.save(buf)
        parts.append(buf)
    for p in parts:
        p.seek(0)
    merged = Merger().merge(parts)
    # 作り直すたびに中身（と ?v=）が変わらないよう、日時を元のフォントの作成日に固定する
    # （途中の保存やまとめる処理が、その時の日時を書き込むため）
    merged.recalcTimestamp = False
    merged['head'].created = merged['head'].modified = created
    merged.flavor = 'woff2'
    buf = io.BytesIO()
    merged.save(buf)
    data = buf.getvalue()
    path = OUT_DIR / f'{NAME}-{w}.woff2'
    path.write_bytes(data)
    ver = hashlib.sha256(data).hexdigest()[:8]  # 文字が変わったら URL も変えて、古いキャッシュを使わせない
    print(f'{path}: {len(data):,} バイト（分割 {len(parts)} 個から）')
    new_faces.append(
        '@font-face {\n'
        f"  font-family: '{FAMILY}';\n"
        '  font-style: normal;\n'
        f'  font-weight: {w};\n'
        '  font-display: swap;\n'
        f"  src: url(\"{URL_BASE}/{NAME}-{w}.woff2?v={ver}\") format('woff2');\n"
        '}\n'
    )

# 最初の @font-face の位置に新しい2つを置き、残りは消す
first = template.index(faces[0])
body = face_re.sub(lambda m: '' if any(i in m.group(0) for i in font_ids) else m.group(0), template)
template = body[:first] + ''.join(new_faces) + body[first:]
if any(i in template for i in font_ids):
    sys.exit('テンプレートにフォントの参照が残っている')

for i in font_ids:
    del manifest[i]
lines[ti] = enc_template(template)
lines[mi] = enc_manifest(manifest)
FILE.write_text('\n'.join(lines), encoding='utf-8', newline='')
print(f'{FILE}: {len(html.encode()):,} → {len(chr(10).join(lines).encode()):,} バイト')

missing = sorted(c for c in chars - covered if not chr(c).isspace())
if missing:
    print('フォントに無い文字（元の埋め込みフォントにも無い＝端末のフォントで表示される）:',
          ' '.join(f'{chr(c)}(U+{c:04X})' for c in missing))
print('次に node scripts/lp-og-tags.mjs を実行する（head の OG タグは消していないが、念のため）')
