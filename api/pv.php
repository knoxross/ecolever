<?php
// 에코레버 방문 집계(지마당 pv.php 방식). 페이지가 열릴 때 js/pv.js 가 한 번 부릅니다.
// IP·브라우저 정보는 저장하지 않고, 날마다 바뀌는 소금으로 만든 짧은 익명 값으로만 방문자 수를 셉니다.
// 검색 로봇·내부 점검(?qa=1 브라우저)은 세지 않습니다.
declare(strict_types=1);
require __DIR__ . '/_lib.php';
header('Content-Type: application/json; charset=utf-8'); header('X-Content-Type-Options: nosniff'); header('Cache-Control: no-store');
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { http_response_code(405); exit('{}'); }
$host = strtolower((string)preg_replace('/:\d+$/', '', (string)($_SERVER['HTTP_HOST'] ?? '')));
$orig = (string)($_SERVER['HTTP_ORIGIN'] ?? '');
if ($orig !== '' && strtolower((string)parse_url($orig, PHP_URL_HOST)) !== $host) { http_response_code(403); exit('{}'); }
$ua = (string)($_SERVER['HTTP_USER_AGENT'] ?? '');
if ($ua === '' || preg_match('/bot|crawl|spider|slurp|preview|monitor|curl|wget|python|headless|lighthouse/i', $ua)) exit('{"ok":true}');
if (!empty($_SERVER['HTTP_X_ECO_QA'])) exit('{"ok":true}');

// 같은 곳에서 10분에 120번까지
if (!eco_rate_ok('pv-' . eco_visitor_key() . '-' . date('YmdH') . intdiv((int)date('i'), 10), 120, 600)) { http_response_code(429); exit('{}'); }

$d = date('Y-m-d');
$path = (string)($_POST['p'] ?? '/'); $path = preg_match('#^/[A-Za-z0-9/_.\-]{0,80}$#', $path) ? $path : '/';
$ref = strtolower((string)($_POST['r'] ?? ''));
$ref = preg_match('/^[a-z0-9.-]{1,80}$/', $ref) && $ref !== $host && $ref !== 'www.' . $host && 'www.' . $ref !== $host ? $ref : '';
$utm = (string)($_POST['u'] ?? ''); $utm = preg_match('#^[A-Za-z0-9_./\-]{1,80}$#', $utm) ? strtolower($utm) : '';

function eco_source(string $ref, string $utm): string {
  if ($utm !== '') return 'utm';
  if ($ref === '') return 'direct';
  if (preg_match('/(^|\.)(youtube\.com|youtu\.be)$/', $ref)) return 'youtube';
  if (preg_match('/(^|\.)gmadang\.com$/', $ref)) return 'gmadang';
  if (preg_match('/(^|\.)(facebook\.com|instagram\.com|kakao\.com|kakao\.co\.kr|band\.us|t\.co|x\.com|twitter\.com|threads\.net|tiktok\.com|blog\.naver\.com|cafe\.naver\.com|tistory\.com|linkedin\.com)$/', $ref)) return 'sns';
  if (preg_match('/(^|\.)(google\.[a-z.]+|naver\.com|daum\.net|bing\.com|yahoo\.[a-z.]+|duckduckgo\.com|zum\.com|nate\.com)$/', $ref)) return 'search';
  if (preg_match('/(^|\.)(mail\.naver\.com|mail\.google\.com|outlook\.live\.com|mail\.daum\.net)$/', $ref)) return 'mail';
  return 'site';
}
// 쇼핑몰 통계처럼 이름 붙은 경로(11/29). 첫 방문 기준. 옛 'sc'는 그대로 두고 'sd'에 따로 셉니다.
function eco_source_detail(string $ref, string $utm): string {
  if ($utm !== '') {
    if (preg_match('/(^|[\/_.-])(mail|email|e-mail|dm|newsletter|knox)([\/_.-]|$)/', $utm)) return 'mail';
    if (strpos($utm, 'instagram') !== false || preg_match('/(^|[\/_.-])(ig|insta|reels?)([\/_.-]|$)/', $utm)) return 'instagram';
    if (strpos($utm, 'youtube') !== false || preg_match('/(^|[\/_.-])(yt|shorts)([\/_.-]|$)/', $utm)) return 'youtube';
    if (strpos($utm, 'gmadang') !== false) return 'gmadang';
    return 'etc';
  }
  if ($ref === '') return 'direct';
  if (preg_match('/(^|\.)(instagram\.com)$/', $ref)) return 'instagram';
  if (preg_match('/(^|\.)(youtube\.com|youtu\.be)$/', $ref)) return 'youtube';
  if (preg_match('/(^|\.)(mail\.naver\.com|mail\.google\.com|outlook\.live\.com|mail\.daum\.net)$/', $ref)) return 'mail';
  if (preg_match('/(^|\.)search\.naver\.com$|(^|\.)naver\.com$/', $ref)) return 'naver';
  if (preg_match('/(^|\.)google\.[a-z.]+$/', $ref)) return 'google';
  if (preg_match('/(^|\.)(daum\.net|bing\.com|yahoo\.[a-z.]+|duckduckgo\.com|zum\.com|nate\.com)$/', $ref)) return 'search_etc';
  if (preg_match('/(^|\.)gmadang\.com$/', $ref)) return 'gmadang';
  return 'etc';
}
function eco_device(string $ua): string {
  if (preg_match('/ipad|tablet|kindle|silk/i', $ua) || (stripos($ua, 'android') !== false && stripos($ua, 'mobile') === false)) return 'tablet';
  if (preg_match('/mobi|iphone|ipod|android/i', $ua)) return 'mobile';
  return 'pc';
}

// 버튼 누름 기록(11/29): 가격 계산 · 가격표 PDF · 전화 · 메일. 같은 사람이 같은 날 같은 버튼을 여러 번 눌러도 1로 셉니다.
const ECO_EVENTS = ['calc', 'pdf', 'tel', 'mail'];
$ev = (string)($_POST['e'] ?? '');
if ($ev !== '' && !in_array($ev, ECO_EVENTS, true)) exit('{"ok":true}');

// 오늘 처음 온 사람인지: 하루 단위 익명 값 목록(uv-YYYYMMDD.php, 첫 줄 가드)
$vid = substr(eco_visitor_key() . substr(hash('sha256', $ua), 0, 6), 0, 18);
$key = $ev === '' ? $vid : $vid . '|' . $ev;
$uf = eco_dir() . '/uv-' . str_replace('-', '', $d) . '.php';
$fh = fopen($uf, 'c+'); flock($fh, LOCK_EX);
$body = (string)stream_get_contents($fh); $seen = strpos($body, $key . "\n") !== false;
if ($body === '') fwrite($fh, ECO_GUARD);
if (!$seen) { fseek($fh, 0, SEEK_END); fwrite($fh, $key . "\n"); }
flock($fh, LOCK_UN); fclose($fh);

$mp = eco_dir() . '/pv-' . substr($d, 0, 7) . '.json.php';
$fh = fopen($mp, 'c+'); flock($fh, LOCK_EX);
$M = json_decode((string)preg_replace('/^<\?php.*?\?>\n/s', '', (string)stream_get_contents($fh)), true) ?: [];
$t = ($M[$d] ?? []) + ['pv' => 0, 'uv' => 0, 'nv' => 0, 'p' => [], 'r' => [], 'u' => [], 'sc' => [], 'dv' => [], 'h' => []];
if ($ev !== '') {
  if (!$seen) { $t['ev'] = (array)($t['ev'] ?? []); $t['ev'][$ev] = (int)($t['ev'][$ev] ?? 0) + 1; $M[$d] = $t;
    ftruncate($fh, 0); rewind($fh); fwrite($fh, ECO_GUARD . json_encode($M, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)); fflush($fh); }
  flock($fh, LOCK_UN); fclose($fh);
  exit('{"ok":true}');
}
$t['pv']++;
if (!$seen) {
  $t['uv']++;
  if (($_POST['n'] ?? '') === '1') $t['nv']++;
  $sc = eco_source($ref, $utm); $t['sc'][$sc] = (int)($t['sc'][$sc] ?? 0) + 1;
  $t['sd'] = (array)($t['sd'] ?? []); $sd = eco_source_detail($ref, $utm); $t['sd'][$sd] = (int)($t['sd'][$sd] ?? 0) + 1;
  $dv = eco_device($ua); $t['dv'][$dv] = (int)($t['dv'][$dv] ?? 0) + 1;
  $hk = date('G'); $t['h'][$hk] = (int)($t['h'][$hk] ?? 0) + 1;   // 시간대(그날 첫 방문 기준)
  if ($utm !== '' && (isset($t['u'][$utm]) || count($t['u']) < 100)) $t['u'][$utm] = (int)($t['u'][$utm] ?? 0) + 1;
}
if (isset($t['p'][$path]) || count($t['p']) < 300) $t['p'][$path] = (int)($t['p'][$path] ?? 0) + 1;
if ($ref !== '' && (isset($t['r'][$ref]) || count($t['r']) < 100)) $t['r'][$ref] = (int)($t['r'][$ref] ?? 0) + 1;
$M[$d] = $t;
ftruncate($fh, 0); rewind($fh); fwrite($fh, ECO_GUARD . json_encode($M, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)); fflush($fh); flock($fh, LOCK_UN); fclose($fh);
echo '{"ok":true}';

// 사흘 지난 익명 값 파일과 하루 지난 제한 기록 정리
if (random_int(1, 100) === 1) {
  foreach ((array)glob(eco_dir() . '/uv-*.php') as $o) if (is_file((string)$o) && filemtime((string)$o) < time() - 3 * 86400) @unlink((string)$o);
  foreach ((array)glob(eco_dir() . '/rate-*.php') as $o) if (is_file((string)$o) && filemtime((string)$o) < time() - 86400) @unlink((string)$o);
}
