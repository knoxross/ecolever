// www/vendor/vendor.js (Claude SDK, MP4 muxer, Capacitor 플러그인) 와 www/fonts (한글 글꼴)를 만듭니다.
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const www = path.join(root, 'www');

await build({
  stdin: {
    contents: `
      import Anthropic from '@anthropic-ai/sdk';
      import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
      import { Filesystem, Directory } from '@capacitor/filesystem';
      import { Share } from '@capacitor/share';
      import { createFile, DataStream, Endianness, MP4BoxBuffer } from 'mp4box';
      window.Anthropic = Anthropic;
      window.Mp4Muxer = { Muxer, ArrayBufferTarget };
      window.CapPlugins = { Filesystem, Directory, Share };
      window.MP4Box = { createFile, DataStream, Endianness, MP4BoxBuffer };
    `,
    resolveDir: root,
    loader: 'js',
  },
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome110'],
  minify: true,
  legalComments: 'none',
  outfile: path.join(www, 'vendor', 'vendor.js'),
});

// 글꼴: woff2 만 복사 (오프라인에서도 한글 글꼴 사용)
const fonts = [
  ['noto-sans-kr', ['400', '700', '900']],
  ['black-han-sans', ['400']],
  ['gowun-batang', ['400', '700']],
  ['jua', ['400']],
];
const outDir = path.join(www, 'fonts');
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(path.join(outDir, 'files'), { recursive: true });
let css = '';
for (const [pkg, weights] of fonts) {
  const dir = path.join(root, 'node_modules', '@fontsource', pkg);
  for (const w of weights) {
    let c = fs.readFileSync(path.join(dir, `${w}.css`), 'utf8');
    c = c.replace(/,\s*url\([^)]*\.woff\) format\('woff'\)/g, '');
    for (const m of c.matchAll(/url\(\.\/files\/([^)]+\.woff2)\)/g)) {
      fs.copyFileSync(path.join(dir, 'files', m[1]), path.join(outDir, 'files', m[1]));
    }
    css += c + '\n';
  }
}
fs.writeFileSync(path.join(outDir, 'fonts.css'), css);
console.log('vendor + fonts ready');
