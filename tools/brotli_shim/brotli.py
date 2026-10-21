# 没装 Python brotli 时的替身：借 node 自带的 zlib 做 brotli 压缩（fontTools 输出 woff2 要用）
import subprocess
MODE_GENERIC, MODE_TEXT, MODE_FONT = 0, 1, 2
_JS = """const z=require('zlib');const c=[];process.stdin.on('data',d=>c.push(d));process.stdin.on('end',()=>{const b=Buffer.concat(c);
const out=process.argv[1]==='c'?z.brotliCompressSync(b,{params:{[z.constants.BROTLI_PARAM_MODE]:+process.argv[2],[z.constants.BROTLI_PARAM_QUALITY]:+process.argv[3],[z.constants.BROTLI_PARAM_LGWIN]:+process.argv[4],[z.constants.BROTLI_PARAM_SIZE_HINT]:b.length}}):z.brotliDecompressSync(b);
process.stdout.write(out);});"""
def compress(data, mode=0, quality=11, lgwin=22, lgblock=0):
    return subprocess.run(['node', '-e', _JS, 'c', str(mode), str(quality), str(lgwin)], input=bytes(data), capture_output=True, check=True).stdout
def decompress(data):
    return subprocess.run(['node', '-e', _JS, 'd'], input=bytes(data), capture_output=True, check=True).stdout
