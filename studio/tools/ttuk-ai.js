/* 영상뚝딱 — 명령줄에서 구글 AI(Imagen 사진 · Veo 영상)로 실사 장면 만들기
 * 키: 환경변수 TTUK_GOOGLE_KEY, 없으면 클라우드 환경의 네트워크 비밀(x-goog-api-key)이 프록시에서 자동으로 붙음.
 * curl 을 쓰는 이유: 회사·클라우드 프록시와 인증서 설정을 그대로 따르기 때문.
 * 실존 인물 얼굴 합성·립싱크는 하지 않는다(프롬프트에 실존 인물 이름을 넣지 않음). 결과 장면에는 'AI 제작' 표시.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const KEY = process.env.TTUK_GOOGLE_KEY || 'proxy-injected';
const IMAGE_MODEL = process.env.TTUK_IMAGE_MODEL || 'imagen-4.0-generate-001';
const VIDEO_MODEL = process.env.TTUK_VIDEO_MODEL || 'veo-3.0-generate-001';
const REAL = 'photorealistic, cinematic, natural light, shot on 35mm film, shallow depth of field, real people, candid, no text, no logo, no cartoon, no illustration';

function curlJson(url, { method = 'POST', body, tmpDir }) {
  const args = ['-sS', '-m', '120', '-X', method, '-H', `x-goog-api-key: ${KEY}`, '-H', 'content-type: application/json', '-w', '\n%{http_code}', url];
  if (body) { const f = path.join(tmpDir, `body-${Date.now()}.json`); fs.writeFileSync(f, JSON.stringify(body)); args.push('--data-binary', '@' + f); }
  const r = spawnSync('curl', args, { encoding: 'utf8', maxBuffer: 200 * 1024 * 1024 });
  const out = (r.stdout || '').trimEnd(); const i = out.lastIndexOf('\n');
  const code = +out.slice(i + 1); const text = out.slice(0, i);
  let json = null; try { json = JSON.parse(text); } catch (e) { /* 그대로 */ }
  if (!(code >= 200 && code < 300)) {
    const msg = json?.error?.message || text.slice(0, 200) || r.stderr;
    throw new Error(code === 401 || code === 403 || /API key not valid/i.test(msg) ? `구글 AI 키가 없거나 권한이 없습니다(${code}). 환경 설정의 네트워크 비밀에 키를 넣어 주세요.` : `구글 AI 오류 ${code}: ${msg}`);
  }
  return json;
}
const aspectOf = a => (['9:16', '16:9', '1:1', '3:4', '4:3'].includes(a) ? a : '9:16');

/** 실사 사진 1장 → 파일 경로 */
function genImage({ prompt, aspect, out, tmpDir }) {
  const body = { instances: [{ prompt: `${prompt}. ${REAL}` }], parameters: { sampleCount: 1, aspectRatio: aspectOf(aspect), personGeneration: 'allow_adult' } };
  const r = curlJson(`${BASE}/models/${IMAGE_MODEL}:predict`, { body, tmpDir });
  const p = (r.predictions || []).find(x => x.bytesBase64Encoded);
  if (!p) throw new Error('AI 사진이 만들어지지 않았습니다(안전 정책에 걸렸을 수 있음).');
  fs.writeFileSync(out, Buffer.from(p.bytesBase64Encoded, 'base64'));
  return out;
}
/** 실사 영상 1개(약 8초) → 파일 경로 */
function genVideo({ prompt, aspect, out, tmpDir, log = () => {} }) {
  const params = { aspectRatio: aspect === '16:9' ? '16:9' : '9:16', personGeneration: 'allow_all' };
  let op = curlJson(`${BASE}/models/${VIDEO_MODEL}:predictLongRunning`, { body: { instances: [{ prompt: `${prompt}. ${REAL}` }], parameters: params }, tmpDir });
  const t0 = Date.now();
  while (!op.done) {
    if (Date.now() - t0 > 12 * 60e3) throw new Error('AI 영상 만들기가 12분을 넘었습니다.');
    spawnSync('sleep', ['8']);
    log(`  AI 영상 만드는 중… ${Math.round((Date.now() - t0) / 1000)}초`);
    op = curlJson(`${BASE}/${op.name}`, { method: 'GET', tmpDir });
  }
  if (op.error) throw new Error('AI 영상 오류: ' + (op.error.message || op.error.code));
  const resp = op.response?.generateVideoResponse || op.response || {};
  const s = (resp.generatedSamples || resp.videos || [])[0] || {};
  const inline = s.video?.bytesBase64Encoded || s.bytesBase64Encoded;
  if (inline) { fs.writeFileSync(out, Buffer.from(inline, 'base64')); return out; }
  const uri = s.video?.uri || s.uri;
  if (!uri) throw new Error('AI 영상이 만들어지지 않았습니다. ' + (resp.raiMediaFilteredReasons || []).join(' '));
  const r = spawnSync('curl', ['-sS', '-L', '-m', '300', '-H', `x-goog-api-key: ${KEY}`, '-o', out, '-w', '%{http_code}', uri], { encoding: 'utf8' });
  if (r.stdout.trim() !== '200') throw new Error('AI 영상 내려받기 실패 ' + r.stdout);
  return out;
}
module.exports = { genImage, genVideo };
