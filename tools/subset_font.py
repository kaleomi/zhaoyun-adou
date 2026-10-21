# 从代码里收集用到的汉字，把马善政毛笔楷书裁成一个小字体文件。
# 用法：python3 tools/subset_font.py <MaShanZheng-Regular.ttf>
import sys, os, re, glob
try:
    import brotli  # noqa
except ImportError:
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'brotli_shim'))
from fontTools import subset

root = os.path.join(os.path.dirname(__file__), '..')
src = sys.argv[1]
text = ''
for pat in ['js/*.js', 'index.html', 'css/*.css']:
    for f in glob.glob(os.path.join(root, pat)):
        text += open(f, encoding='utf-8').read()
chars = set(ch for ch in text if ord(ch) > 0x2e80)
chars |= set('0123456789０１２３４５６７８９一二三四五六七八九十百千万×+-·…！？，。、：；“”‘’（）《》【】')
chars |= set('赵云与阿斗刀枪弓骑农剑贼寇匪盗巫甲营兵征')
out = os.path.join(root, 'fonts', 'brush.woff2')
opts = subset.Options()
opts.flavor = 'woff2'
opts.layout_features = ['*']
opts.name_IDs = ['*']
opts.notdef_outline = True
font = subset.load_font(src, opts)
s = subset.Subsetter(opts)
s.populate(text=''.join(sorted(chars)))
s.subset(font)
subset.save_font(font, out, opts)
print(len(chars), 'glyphs ->', out, os.path.getsize(out), 'bytes')
