<?php
// 에코레버 관리 화면: 오늘 · 문의함(진행 단계·메모·CSV)
// 지마당 admin.php 구조를 따릅니다. 로그인은 지마당 관리 비밀번호를 지마당 허브가 확인·서명하고, 여기서 고정 공개키로 검증합니다.
// 2단계(OTP)는 꺼 두었습니다(ADMIN_2FA, 대표님 지시 2026-11-26 밤).
declare(strict_types=1);
require __DIR__ . '/_lib.php';
require __DIR__ . '/_sec.php';
session_name('ECOADM');
session_set_cookie_params(['httponly' => true, 'secure' => !empty($_SERVER['HTTPS']), 'samesite' => 'Strict', 'path' => '/api/']);
session_start();
header('X-Frame-Options: DENY'); header('X-Content-Type-Options: nosniff'); header('Cache-Control: no-store'); header('Referrer-Policy: no-referrer');
header("Content-Security-Policy: default-src 'self'; style-src 'unsafe-inline'; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'");
header('X-Robots-Tag: noindex, nofollow');

$dir = eco_dir();
const STEPS = ['접수', '견적 발송', '주문 확정', '출고', '세금계산서', '종료'];

function tok(): string { if (empty($_SESSION['t'])) $_SESSION['t'] = bin2hex(random_bytes(16)); return $_SESSION['t']; }
function chk(): void { if (!hash_equals($_SESSION['t'] ?? '', (string)($_POST['t'] ?? ''))) { http_response_code(400); exit('잘못된 요청입니다(보안 토큰). 화면을 새로 고친 뒤 다시 해 주세요.'); } }
function hid(): string { return '<input type="hidden" name="t" value="' . tok() . '">'; }
// CSV를 엑셀로 열 때 수식으로 실행되지 않게 = + - @ 탭 CR 로 시작하면 앞에 ' 를 붙입니다.
function csv_safe($v): string { $v = (string)$v; return preg_match('/^[=+\-@\t\r]/', $v) ? "'" . $v : $v; }
function page(string $title, string $body): void {
  echo '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>' . eco_h($title) . ' · 에코레버 관리</title>'
    . '<style>:root{--g:#2f5d3a;--l:#d9e1da;--bg:#f4f6f1;--t:#1d2a20;--m:#5b665e}*{box-sizing:border-box}body{font-family:"Noto Sans KR","Malgun Gothic",sans-serif;margin:0;background:var(--bg);color:var(--t)}'
    . 'main{max-width:1080px;margin:0 auto;padding:16px}h1{color:var(--g);font-size:22px;margin:4px 0 8px}h2{font-size:17px;margin:22px 0 8px}'
    . '.tabs{display:flex;flex-wrap:wrap;gap:6px 14px;margin:0 0 12px}.tabs a{font-weight:700;color:var(--g);text-decoration:none}.tabs a.on{text-decoration:underline}'
    . 'table{width:100%;border-collapse:collapse;background:#fff;font-size:14px}td,th{border:1px solid var(--l);padding:6px 8px;vertical-align:top;text-align:left}th{background:#eef3ec}'
    . '.wrap{overflow-x:auto}input,select,button,textarea{font:inherit;padding:7px 9px;border-radius:8px;border:1px solid #c9d3cb;max-width:100%}button{background:var(--g);color:#fff;border:0;cursor:pointer}'
    . '.note{color:var(--m);font-size:13px}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}.card{background:#fff;border:1px solid var(--l);border-radius:10px;padding:10px 12px}'
    . '.card .v{font-size:26px;font-weight:800;color:var(--g)}.badge{display:inline-block;padding:1px 8px;border-radius:99px;background:#eef3ec;font-size:12px}.new{background:#fde8d8;color:#9a3d10}'
    . 'form.inl{display:flex;flex-wrap:wrap;gap:4px}.warn{background:#fde8d8;border:1px solid #e8a77f;color:#7a2e08;padding:8px 10px;border-radius:8px;margin:8px 0}.deal{background:#fff;border:2px solid var(--g);border-radius:10px;padding:10px 12px;font-weight:700;margin:0 0 10px}'
    . '@media(max-width:600px){.wrap table,.wrap tbody,.wrap tr,.wrap td{display:block;width:100%}.wrap tr:first-child{display:none}.wrap tr{background:#fff;border:1px solid var(--l);border-radius:10px;margin:0 0 8px;padding:4px}.wrap td{border:0;padding:4px 6px}}.msg{background:#fff;border:1px solid var(--g);padding:8px 10px;border-radius:8px}</style></head><body><main>' . $body . '</main></body></html>';
  exit;
}

// 에코레버는 자기 비밀번호를 두지 않습니다. 지마당 관리 비밀번호 하나로 두 곳에 들어갑니다(대표님 지시 2026-11-26 밤).
// 처음 설정 화면이 없으므로, 주소가 먼저 알려져도 관리자 자리를 차지할 수 없습니다.

if (isset($_GET['out'])) { sec_audit('logout'); $_SESSION = []; session_destroy(); header('Location: admin.php'); exit; }

// 30분 동안 아무것도 안 하면 자동 로그아웃
if (!empty($_SESSION['ok']) && time() - (int)($_SESSION['seen'] ?? 0) > IDLE_LIMIT) { sec_audit('idle_logout'); $_SESSION = []; session_regenerate_id(true); }
if (!empty($_SESSION['ok'])) $_SESSION['seen'] = time();

// ---- 로그인: 비밀번호를 지마당 허브가 확인·서명 → 여기서 고정 공개키로 검증 ----
// 틀린 횟수는 이곳 서버에도 셉니다(같은 곳 15분 5번, 전체 15분 30번이면 15분 잠금). 지마당도 자기 관리 화면과 함께 셉니다.
if (empty($_SESSION['ok'])) {
  $lk = fn(string $id): string => $dir . '/lock-' . substr(hash('sha256', $id), 0, 16) . '.php';
  $cnt = function (string $f): int { if (!is_file($f) || filemtime($f) < time() - 900) return 0; return (int)preg_replace('/^<\?php.*?\?>\n/s', '', (string)file_get_contents($f)); };
  $mine = $lk('ip' . ($_SERVER['REMOTE_ADDR'] ?? '0')); $all = $lk('all');
  $fail = function () use ($mine, $all, $cnt): void { foreach ([$mine, $all] as $lf) @file_put_contents($lf, ECO_GUARD . ($cnt($lf) + 1), LOCK_EX); sleep(1); };
  $nonceNew = function (string $k): string { return $_SESSION[$k] = rtrim(strtr(base64_encode(random_bytes(24)), '+/', '-_'), '='); };
  $pwForm = function (string $msg = '') use ($nonceNew): string {
    $nonceNew('pw_nonce');
    return '<h1>에코레버 관리</h1>' . ($msg !== '' ? '<p class="msg">' . eco_h($msg) . '</p>' : '')
      . '<p class="note">지마당 관리 비밀번호로 들어갑니다(두 곳이 같은 비밀번호).</p><form method="post">' . hid()
      . '<input type="hidden" name="act" value="pw"><input type="password" name="p" placeholder="관리 비밀번호" required autofocus autocomplete="current-password"> <button>들어가기</button></form>';
  };
  $otpForm = function (string $msg = '') use ($nonceNew): string {
    $nonceNew('otp_nonce');
    return '<h1>에코레버 관리 — 2단계 확인</h1>' . ($msg !== '' ? '<p class="msg">' . eco_h($msg) . '</p>' : '')
      . '<p>대표님 휴대폰 인증 앱의 <b>(주)알앤케이그린월드</b> 6자리를 넣어 주세요.</p><form method="post">' . hid()
      . '<input type="hidden" name="act" value="otp"><input name="code" inputmode="numeric" pattern="\d{6}" maxlength="6" placeholder="6자리" required autofocus autocomplete="one-time-code" style="width:120px;letter-spacing:4px"> <button>들어가기</button></form><p class="note"><a href="admin.php?out=1">처음부터 다시</a></p>';
  };
  $hubDown = ['no_pub', 'hub_down', 'hub_bad', 'hub_no_key', 'kid', 'hub_unreachable'];
  $enter = function () use ($mine): void { @unlink($mine); session_regenerate_id(true); unset($_SESSION['pw_ok'], $_SESSION['pw_nonce'], $_SESSION['otp_nonce']); $_SESSION['ok'] = 1; $_SESSION['seen'] = time(); $_SESSION['t'] = bin2hex(random_bytes(16)); sec_audit('login_ok'); header('Location: admin.php'); exit; };
  if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    chk();
    if ($cnt($mine) >= 5 || $cnt($all) >= 30) { sec_audit('locked'); http_response_code(429); page('잠김', '<h1>에코레버 관리</h1><p>여러 번 틀려 15분 동안 잠겼습니다. 잠시 후 다시 시도해 주세요.</p>'); }
    $act = (string)($_POST['act'] ?? 'pw');
    if ($act === 'pw') {
      $nonce = (string)($_SESSION['pw_nonce'] ?? ''); unset($_SESSION['pw_nonce']);     // 한 번 쓰면 버림
      [$ok, $why] = $nonce === '' ? [false, 'no_nonce'] : pw_remote_verify((string)($_POST['p'] ?? ''), $nonce);
      if ($ok) {
        sec_audit('pw_ok');
        if (!ADMIN_2FA) $enter();
        session_regenerate_id(true); $_SESSION['t'] = bin2hex(random_bytes(16)); $_SESSION['pw_ok'] = time();
        page('2단계 확인', $otpForm());
      }
      sec_audit('pw_fail', ['why' => $why]);
      if (in_array($why, $hubDown, true)) page('로그인', $pwForm('지금은 비밀번호를 확인할 수 없어 들어갈 수 없습니다(' . $why . '). 잠시 후 다시 해 주세요.'));
      $fail();
      page('로그인', $pwForm('비밀번호가 맞지 않습니다.'));
    }
    if ($act === 'otp' && ADMIN_2FA) {
      if (time() - (int)($_SESSION['pw_ok'] ?? 0) > 300) { unset($_SESSION['pw_ok'], $_SESSION['otp_nonce']); page('로그인', $pwForm('시간이 지났습니다. 비밀번호부터 다시 넣어 주세요.')); }
      $nonce = (string)($_SESSION['otp_nonce'] ?? ''); unset($_SESSION['otp_nonce']);
      [$ok, $why] = $nonce === '' ? [false, 'no_nonce'] : otp_remote_verify((string)($_POST['code'] ?? ''), $nonce);
      if ($ok) $enter();
      sec_audit('otp_fail', ['why' => $why]);
      if (in_array($why, $hubDown, true)) page('2단계 확인', $otpForm('지금은 2단계 확인을 할 수 없어 들어갈 수 없습니다(' . $why . ').'));
      $fail();
      page('2단계 확인', $otpForm('인증 번호가 맞지 않거나 이미 쓴 번호입니다.'));
    }
  }
  if (ADMIN_2FA && !empty($_SESSION['pw_ok']) && time() - (int)$_SESSION['pw_ok'] <= 300) page('2단계 확인', $otpForm());
  page('로그인', $pwForm());
}

// ---- 여기부터 로그인한 사람만 ----
$S = eco_read_json('inq-status');                 // {문의 id: {st, note, at, log:[...]}}
$DM = eco_read_json('dm') + ['sent' => 0, 'form' => 0, 'reply' => 0, 'quote' => 0, 'order' => 0, 'at' => ''];
// 문의가 어디서 왔는지 다섯 갈래로 묶습니다(메일 utm · 유튜브 · 지마당 카드 · 검색 · 직접/기타)
function inq_src(array $r): string {
  $u = strtolower((string)($r['src'] ?? '')); $ref = strtolower((string)($r['ref'] ?? ''));
  if (strpos($u, 'gmadang') !== false || preg_match('/(^|\.)gmadang\.com$/', $ref)) return '지마당 카드';
  if (strpos($u, 'youtube') !== false || preg_match('/(^|\.)(youtube\.com|youtu\.be)$/', $ref)) return '유튜브';
  if ($u !== '') return '메일·캠페인(utm)';
  if (preg_match('/(^|\.)(google\.[a-z.]+|naver\.com|daum\.net|bing\.com|zum\.com|nate\.com)$/', $ref)) return '검색';
  return '직접·기타';
}
$L = eco_read_json('ledger');                     // {장부 id: {...}} 견적·주문 장부
$f = in_array($_GET['f'] ?? 'today', ['today', 'inbox', 'mail', 'ledger', 'visits'], true) ? (string)($_GET['f'] ?? 'today') : 'today';
const COLORS = ['1칼라' => 1000, '2칼라' => 1200];
// 방문 집계 읽기(api/pv.php 가 쌓은 것)
function pv_day(string $d): array { $m = eco_read_json('pv-' . substr($d, 0, 7)); return ($m[$d] ?? []) + ['pv' => 0, 'uv' => 0, 'nv' => 0, 'p' => [], 'r' => [], 'u' => [], 'sc' => [], 'dv' => [], 'h' => [], 'ev' => [], 'sd' => []]; }
// 집계를 시작한 날부터 오늘까지 모두 더한 값(누적). 달마다 파일 하나(pv-YYYY-MM)라 파일 수가 적습니다.
function pv_total(): array {
  static $T = null; if ($T !== null) return $T;
  $T = ['uv' => 0, 'nv' => 0, 'pv' => 0, 'days' => 0, 'from' => '', 'dv' => [], 'sc' => []];
  $fs = (array)glob(eco_dir() . '/pv-*.json.php'); sort($fs);
  foreach ($fs as $fp) { if (!preg_match('/pv-(\d{4}-\d{2})\.json\.php$/', (string)$fp, $mm)) continue; $m = eco_read_json('pv-' . $mm[1]); ksort($m);
    foreach ($m as $d => $x) { if (!is_array($x)) continue; if ($T['from'] === '' && (int)($x['uv'] ?? 0) > 0) $T['from'] = (string)$d;
      $T['uv'] += (int)($x['uv'] ?? 0); $T['nv'] += (int)($x['nv'] ?? 0); $T['pv'] += (int)($x['pv'] ?? 0); $T['days']++;
      foreach ((array)($x['dv'] ?? []) as $k => $v) $T['dv'][$k] = ($T['dv'][$k] ?? 0) + (int)$v;
      foreach ((array)($x['sc'] ?? []) as $k => $v) $T['sc'][$k] = ($T['sc'][$k] ?? 0) + (int)$v; } }
  return $T;
}
// 여러 날 합계(오늘 포함 최근 n일)
function pv_sum(int $n): array {
  $T = ['uv' => 0, 'nv' => 0, 'pv' => 0, 'dv' => [], 'sc' => []];
  for ($i = 0; $i < $n; $i++) { $x = pv_day(date('Y-m-d', strtotime("-$i day"))); $T['uv'] += (int)$x['uv']; $T['nv'] += (int)$x['nv']; $T['pv'] += (int)$x['pv'];
    foreach ($x['dv'] as $k => $v) $T['dv'][$k] = ($T['dv'][$k] ?? 0) + (int)$v; foreach ($x['sc'] as $k => $v) $T['sc'][$k] = ($T['sc'][$k] ?? 0) + (int)$v; }
  return $T;
}
// "모바일 5 · PC 3 · 태블릿 0" 처럼 기기 한 줄, 경로 한 줄
function pv_dvline(array $dv): string { return '모바일 ' . (int)($dv['mobile'] ?? 0) . ' · PC ' . (int)($dv['pc'] ?? 0) . ' · 태블릿 ' . (int)($dv['tablet'] ?? 0); }
function pv_scline(array $sc): string { arsort($sc); $o = []; foreach ($sc as $k => $v) if ((int)$v > 0) $o[] = (SRC[$k] ?? $k) . ' ' . (int)$v; return $o ? implode(' · ', $o) : '기록 없음'; }
function pv_pct(int $a, int $b): string { return $b > 0 ? round($a * 100 / $b) . '%' : '-'; }
// 집계 시작일부터 오늘까지 날짜별 값. ['YYYY-MM' => ['YYYY-MM-DD' => 그날 값, ...], ...] (오래된 달·날짜 먼저)
function pv_all_days(): array {
  $from = pv_total()['from']; $today = date('Y-m-d'); if ($from === '' || $from > $today) $from = $today;
  $out = []; $t = strtotime($from); $end = strtotime($today);
  for ($n = 0; $t <= $end && $n < 3700; $n++, $t = strtotime('+1 day', $t)) { $k = date('Y-m-d', $t); $out[substr($k, 0, 7)][$k] = pv_day($k); }
  return $out;
}
// 여러 날 값을 더함(방문자·신규·페이지·기기·경로)
function pv_add(array $T, array $x): array {
  $T += ['uv' => 0, 'nv' => 0, 'pv' => 0, 'dv' => [], 'sc' => [], 'ev' => [], 'days' => 0];
  foreach ((array)($x['ev'] ?? []) as $k => $v) $T['ev'][$k] = ($T['ev'][$k] ?? 0) + (int)$v;
  $T['uv'] += (int)($x['uv'] ?? 0); $T['nv'] += (int)($x['nv'] ?? 0); $T['pv'] += (int)($x['pv'] ?? 0); $T['days']++;
  foreach ((array)($x['dv'] ?? []) as $k => $v) $T['dv'][$k] = ($T['dv'][$k] ?? 0) + (int)$v;
  foreach ((array)($x['sc'] ?? []) as $k => $v) $T['sc'][$k] = ($T['sc'][$k] ?? 0) + (int)$v;
  return $T;
}
const SRC = ['youtube' => '유튜브', 'gmadang' => '지마당', 'utm' => '메일·캠페인(utm)', 'search' => '검색', 'sns' => 'SNS·블로그', 'mail' => '웹메일', 'site' => '다른 사이트', 'direct' => '직접'];
const EVN = ['calc' => '가격 계산', 'pdf' => '가격표 PDF', 'tel' => '전화 버튼', 'mail' => '메일 버튼'];
function led_date($v): string { $v = (string)$v; return preg_match('/^\d{4}-\d{2}-\d{2}$/', $v) ? $v : ''; }
$M = isset($_SESSION['msg']) ? '<p class="msg">' . eco_h($_SESSION['msg']) . '</p>' : ''; unset($_SESSION['msg']);

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
  chk(); $act = (string)($_POST['act'] ?? '');
  if ($act === 'stage') {
    $id = (string)($_POST['id'] ?? '');
    if (preg_match('/^Q\d{6}-\d{6}-[0-9a-f]{4}$/', $id)) {
      $st = in_array($_POST['st'] ?? '', STEPS, true) ? (string)$_POST['st'] : '접수';
      $note = eco_cut($_POST['note'] ?? '', 300);
      $cur = $S[$id] ?? ['log' => []];
      $cur['log'][] = ['at' => date('Y-m-d H:i'), 'st' => $st, 'note' => $note];
      $cur['log'] = array_slice($cur['log'], -30);
      $S[$id] = ['st' => $st, 'note' => $note, 'at' => date('Y-m-d H:i'), 'log' => $cur['log']];
      eco_write_json('inq-status', $S); $_SESSION['msg'] = "$id — '$st'(으)로 저장했습니다.";
    }
    header('Location: admin.php?f=inbox#' . rawurlencode($id)); exit;
  }
  if ($act === 'dm') {
    foreach (['sent', 'form', 'reply', 'quote', 'order'] as $k) $DM[$k] = max(0, min(100000, (int)($_POST[$k] ?? 0)));
    $DM['at'] = date('Y-m-d H:i'); eco_write_json('dm', $DM); $_SESSION['msg'] = '이메일 DM 숫자를 저장했습니다.';
    header('Location: admin.php'); exit;
  }
  if ($act === 'mail_save') {
    // 메일 설정: 앱 비밀번호는 바꿀 때만 받고, 화면에는 다시 보여 주지 않습니다.
    $c = eco_mail_conf();
    $c['host'] = (string)preg_replace('/[^a-z0-9.-]/i', '', (string)($_POST['host'] ?? ''));
    $c['port'] = (int)($_POST['port'] ?? 465) === 587 ? 587 : 465;
    $u = trim((string)($_POST['user'] ?? '')); $c['user'] = filter_var($u, FILTER_VALIDATE_EMAIL) ? $u : '';
    $fr = trim((string)($_POST['from'] ?? '')); $c['from'] = filter_var($fr, FILTER_VALIDATE_EMAIL) ? $fr : '';
    if (!empty($_POST['clearpass'])) $c['pass'] = '';
    elseif ((string)($_POST['pass'] ?? '') !== '') $c['pass'] = str_replace(' ', '', (string)$_POST['pass']);   // Google 앱 비밀번호의 띄어쓰기는 빼고 저장
    eco_mail_save($c); sec_audit('mail_conf_save', ['smtp' => $c['host'] !== '' && $c['pass'] !== '' ? 'on' : 'off']);
    $_SESSION['msg'] = '메일 설정을 저장했습니다.';
    header('Location: admin.php?f=mail'); exit;
  }
  if ($act === 'mail_test') {
    $r = eco_mail_send('[에코레버 관리] 시험 메일', "에코레버 관리 화면에서 보낸 시험 메일입니다.\n" . date('Y-m-d H:i') . "\n\n이 메일이 받은편지함에 오면 문의 알림 메일도 같은 길로 옵니다.");
    $c = eco_mail_conf(); $c['last'] = date('Y-m-d H:i') . ' ' . $r; eco_mail_save($c); sec_audit('mail_test', ['res' => $r === 'ok' ? 'ok' : 'fail']);
    $_SESSION['msg'] = $r === 'ok' ? '시험 메일을 보냈습니다. ' . ECO_NOTIFY_TO . ' 받은편지함(스팸함 포함)을 확인하세요.' : '보내지 못했습니다: ' . $r;
    header('Location: admin.php?f=mail'); exit;
  }
  if ($act === 'led_save') {
    $id = (string)($_POST['id'] ?? '');
    if ($id === '') $id = 'L' . date('ymd-His') . '-' . bin2hex(random_bytes(2));
    if (preg_match('/^L\d{6}-\d{6}-[0-9a-f]{4}$/', $id)) {
      $color = array_key_exists($_POST['color'] ?? '', COLORS) ? (string)$_POST['color'] : '1칼라';
      $qty = max(0, min(10000000, (int)($_POST['qty'] ?? 0)));
      $unit = (int)($_POST['unit'] ?? 0); if ($unit <= 0) $unit = COLORS[$color];
      $supply = (int)($_POST['supply'] ?? 0); if ($supply <= 0) $supply = $qty * $unit;      // 비우면 수량×단가
      $ship = max(0, (int)($_POST['ship'] ?? 0));                                             // 배송비(공급가에 더함)
      $base = $supply + $ship; $vat = (int)round($base * 0.1);
      $L[$id] = [
        'made' => led_date($_POST['made'] ?? '') ?: date('Y-m-d'), 'company' => eco_cut($_POST['company'] ?? '', 80), 'inq' => eco_cut($_POST['inq'] ?? '', 24),
        'color' => $color, 'qty' => $qty, 'unit' => $unit, 'supply' => $supply, 'ship' => $ship, 'vat' => $vat, 'total' => $base + $vat,
        'stage' => in_array($_POST['stage'] ?? '', ['견적', '주문 확정', '취소'], true) ? (string)$_POST['stage'] : '견적',
        'paid' => led_date($_POST['paid'] ?? ''), 'shipped' => led_date($_POST['shipped'] ?? ''), 'tax' => !empty($_POST['tax']), 'note' => eco_cut($_POST['note'] ?? '', 200), 'at' => date('Y-m-d H:i'),
      ];
      if ($L[$id]['company'] === '') { unset($L[$id]); $_SESSION['msg'] = '업체 이름을 넣어 주세요.'; }
      else { eco_write_json('ledger', $L); $_SESSION['msg'] = "장부 $id 를 저장했습니다."; }
    }
    header('Location: admin.php?f=ledger'); exit;
  }
  if ($act === 'led_del') {
    $id = (string)($_POST['id'] ?? '');
    if (isset($L[$id]) && ($_POST['yes'] ?? '') === '1') { unset($L[$id]); eco_write_json('ledger', $L); $_SESSION['msg'] = "장부 $id 를 지웠습니다."; }
    header('Location: admin.php?f=ledger'); exit;
  }
  if ($act === 'inq_del') {
    // 문의 지우기(처리 완료 후 1년이 지난 것, 시험 접수 등). 확인 체크가 있어야 지웁니다.
    $id = (string)($_POST['id'] ?? '');
    if (preg_match('/^Q\d{6}-\d{6}-[0-9a-f]{4}$/', $id) && ($_POST['yes'] ?? '') === '1') {
      $pf = eco_dir() . '/inquiry.jsonl.php'; $fh = @fopen($pf, 'c+');
      if ($fh) { flock($fh, LOCK_EX); $keep = []; $hit = false;
        foreach (explode("\n", (string)stream_get_contents($fh)) as $l) { if ($l === '' || strncmp($l, '<?php', 5) === 0) continue; $j = json_decode($l, true); if (is_array($j) && ($j['id'] ?? '') === $id) { $hit = true; continue; } $keep[] = $l; }
        ftruncate($fh, 0); rewind($fh); fwrite($fh, ECO_GUARD . ($keep ? implode("\n", $keep) . "\n" : '')); fflush($fh); flock($fh, LOCK_UN); fclose($fh);
        if ($hit) { unset($S[$id]); eco_write_json('inq-status', $S); sec_audit('inq_delete', ['id' => $id]); $_SESSION['msg'] = "$id 문의를 지웠습니다."; } }
    }
    header('Location: admin.php?f=inbox'); exit;
  }
  if ($act === 'inq_del') {
    // 문의 지우기(처리 완료 후 1년이 지난 것, 시험 접수 등). 확인 체크가 있어야 지웁니다.
    $id = (string)($_POST['id'] ?? '');
    if (preg_match('/^Q\d{6}-\d{6}-[0-9a-f]{4}$/', $id) && ($_POST['yes'] ?? '') === '1') {
      $pf = eco_dir() . '/inquiry.jsonl.php'; $fh = @fopen($pf, 'c+');
      if ($fh) { flock($fh, LOCK_EX); $keep = []; $hit = false;
        foreach (explode("\n", (string)stream_get_contents($fh)) as $l) { if ($l === '' || strncmp($l, '<?php', 5) === 0) continue; $j = json_decode($l, true); if (is_array($j) && ($j['id'] ?? '') === $id) { $hit = true; continue; } $keep[] = $l; }
        ftruncate($fh, 0); rewind($fh); fwrite($fh, ECO_GUARD . ($keep ? implode("\n", $keep) . "\n" : '')); fflush($fh); flock($fh, LOCK_UN); fclose($fh);
        if ($hit) { unset($S[$id]); eco_write_json('inq-status', $S); sec_audit('inq_delete', ['id' => $id]); $_SESSION['msg'] = "$id 문의를 지웠습니다."; } }
    }
    header('Location: admin.php?f=inbox'); exit;
  }
  header('Location: admin.php'); exit;
}

// ---- 방문 리포트 (11/29 대표님 "쇼핑몰 통계처럼": 카드 4개 → 흐름 → 14일 막대 → 경로 → 많이 본 화면 → 날짜별) ----
if ($f === 'visits') {
  $td = fn($v, bool $b = false): string => '<td style="text-align:right">' . ($b ? '<b>' . $v . '</b>' : $v) . '</td>';
  $AD = pv_all_days(); $MT = []; $GT = [];
  foreach ($AD as $mk => $ds) { $MT[$mk] = []; foreach ($ds as $x) { $MT[$mk] = pv_add($MT[$mk], $x); $GT = pv_add($GT, $x); } }
  $GT += ['uv' => 0, 'nv' => 0, 'pv' => 0, 'dv' => [], 'sc' => [], 'ev' => [], 'days' => 0];
  $csvRow = function (string $k, array $x): array { $r = [$k, (int)$x['uv'], (int)$x['nv'], max(0, (int)$x['uv'] - (int)$x['nv']), (int)$x['pv'], (int)($x['dv']['mobile'] ?? 0), (int)($x['dv']['pc'] ?? 0), (int)($x['dv']['tablet'] ?? 0)]; foreach (array_keys(SRC) as $z) $r[] = (int)($x['sc'][$z] ?? 0); foreach (array_keys(EVN) as $z) $r[] = (int)($x['ev'][$z] ?? 0); return $r; };
  if (in_array($_GET['csv'] ?? '', ['days', 'months'], true)) { $cm = (string)$_GET['csv'];
    header('Content-Type: text/csv; charset=utf-8'); header('Content-Disposition: attachment; filename="ecolever-visits-' . ($cm === 'days' ? 'daily' : 'monthly') . '-' . date('Ymd') . '.csv"'); echo "\xEF\xBB\xBF"; $o = fopen('php://output', 'w');
    fputcsv($o, array_merge([$cm === 'days' ? '날짜' : '월', '방문자', '신규', '재방문', '페이지 보기', '모바일', 'PC', '태블릿'], array_values(SRC), array_values(EVN)));
    foreach ($AD as $mk => $ds) {
      if ($cm === 'days') { foreach ($ds as $k => $x) fputcsv($o, array_map('csv_safe', $csvRow($k, $x))); fputcsv($o, array_map('csv_safe', $csvRow($mk . ' 소계', $MT[$mk]))); }
      else fputcsv($o, array_map('csv_safe', $csvRow($mk, $MT[$mk]))); }
    fputcsv($o, array_map('csv_safe', $csvRow('누적 합계', $GT)));
    exit; }

  // 문의: 서버에 저장된 홈페이지 문의(data/inquiry.jsonl.php), 날짜별 건수
  $IQ = []; foreach (eco_rows('inquiry') as $r) { $k = substr((string)($r['at'] ?? ''), 0, 10); if ($k !== '') $IQ[$k] = ($IQ[$k] ?? 0) + 1; }
  // 견적·주문: 장부(취소 제외). 견적 = 작성일, 주문 = '주문 확정'
  $QD = []; $OD = []; foreach ($L as $x) { if (($x['stage'] ?? '') === '취소') continue; $k = (string)($x['made'] ?? ''); if ($k === '') continue; $QD[$k] = ($QD[$k] ?? 0) + 1; if (($x['stage'] ?? '') === '주문 확정') $OD[$k] = ($OD[$k] ?? 0) + 1; }
  $sumRange = function (array $byDay, string $from, string $to): int { $n = 0; foreach ($byDay as $k => $v) if ($k >= $from && $k <= $to) $n += (int)$v; return $n; };
  $today = date('Y-m-d'); $yday = date('Y-m-d', strtotime('-1 day'));
  $wk = date('Y-m-d', strtotime('monday this week'));                    // 이번 주 = 월요일부터 오늘까지
  $from = $GT['days'] > 0 ? (string)array_key_first(reset($AD) ?: []) : $today;
  $days = (int)$GT['days'];
  $evSum = function (string $a, string $b, string $e) use ($AD): int { $n = 0; foreach ($AD as $ds) foreach ($ds as $k => $x) if ($k >= $a && $k <= $b) $n += (int)($x['ev'][$e] ?? 0); return $n; };
  $uvSum = function (string $a, string $b) use ($AD): int { $n = 0; foreach ($AD as $ds) foreach ($ds as $k => $x) if ($k >= $a && $k <= $b) $n += (int)$x['uv']; return $n; };
  $evOn = false; foreach ($AD as $ds) foreach ($ds as $x) if (!empty($x['ev'])) $evOn = true;

  $tD = pv_day($today); $yD = pv_day($yday); $tU = (int)$tD['uv']; $yU = (int)$yD['uv'];
  $diff = $tU - $yU; $arrow = $diff > 0 ? '▲ ' . $diff : ($diff < 0 ? '▼ ' . abs($diff) : '어제와 같음');
  $big = fn(string $label, string $v, string $sub, string $help): string => '<div class="card"><div class="lbl">' . eco_h($label) . '</div><div class="v">' . eco_h($v) . '</div><div class="sub">' . eco_h($sub) . '</div><div class="note">' . eco_h($help) . '</div></div>';
  $calcW = $evSum($wk, $today, 'calc'); $pdfW = $evSum($wk, $today, 'pdf'); $telW = $evSum($wk, $today, 'tel'); $iqW = $sumRange($IQ, $wk, $today);
  $evNote = $evOn ? '' : ' · 11/29부터 기록';
  $cards = '<div class="cards">'
    . $big('오늘 방문', $tU . '명', '어제 ' . $yU . '명 · ' . $arrow, '오늘 사이트에 들어온 사람 수(같은 기기는 하루 1명)')
    . $big('이번 주 문의', $iqW . '건', '월요일(' . substr($wk, 5) . ')부터 오늘까지', '홈페이지 문의서로 들어온 견적 문의')
    . $big('가격 계산 · 가격표', ($calcW + $pdfW) . '명', '가격 계산 ' . $calcW . ' · 가격표 PDF ' . $pdfW . $evNote, '이번 주 가격을 직접 확인한 사람 수')
    . $big('전화 버튼', $telW . '명', '이번 주' . $evNote, '휴대폰에서 전화 버튼을 누른 사람 수')
    . '</div>';

  // 흐름(깔때기): 집계 시작일부터 오늘까지(데이터가 30일보다 길면 최근 30일)
  $fFrom = $days > 30 ? date('Y-m-d', strtotime('-29 day')) : $from; $fLab = $days > 30 ? '최근 30일' : substr($from, 5) . '부터 오늘까지';
  $st = [
    ['방문', $uvSum($fFrom, $today), '사이트에 들어온 사람'],
    ['가격 확인', $evSum($fFrom, $today, 'calc') + $evSum($fFrom, $today, 'pdf'), '가격 계산 · 가격표 PDF' . ($evOn ? '' : ' (11/29부터 기록)')],
    ['문의 · 전화', $sumRange($IQ, $fFrom, $today) + $evSum($fFrom, $today, 'tel'), '문의서 ' . $sumRange($IQ, $fFrom, $today) . ' · 전화 버튼 ' . $evSum($fFrom, $today, 'tel')],
    ['견적', $sumRange($QD, $fFrom, $today), '장부에 적은 견적'],
    ['주문', $sumRange($OD, $fFrom, $today), "장부 '주문 확정'"],
  ];
  $mx = max(1, $st[0][1]); $funnel = '<div class="funnel">'; $prev = null;
  foreach ($st as $i => [$n, $v, $d]) { $w = max(2, (int)round($v * 100 / $mx));
    $rate = $prev === null ? '' : ($prev > 0 ? ' · 앞 단계의 ' . round($v * 100 / $prev) . '%' : ' · -');
    $funnel .= '<div class="fs"><div class="fl"><b>' . ($i + 1) . '. ' . eco_h($n) . '</b> <span class="fv">' . (int)$v . '</span><span class="note">' . eco_h($rate) . '</span></div><div class="fb"><i style="width:' . $w . '%"></i></div><div class="note">' . eco_h($d) . '</div></div>';
    $prev = $v; }
  $funnel .= '</div>';

  // 최근 14일 막대: 방문 · 문의
  $bars = '<div class="bars">'; $bv = []; for ($i = 13; $i >= 0; $i--) { $k = date('Y-m-d', strtotime("-$i day")); $bv[$k] = [(int)pv_day($k)['uv'], (int)($IQ[$k] ?? 0)]; }
  $bm = max(1, max(array_map(fn($a) => $a[0], $bv)));
  foreach ($bv as $k => [$v, $q]) { $bars .= '<div class="bc" title="' . eco_h($k . ' 방문 ' . $v . ' · 문의 ' . $q) . '"><div class="bn">' . ($v ?: '') . '</div><div class="bw"><i class="b1" style="height:' . (int)round($v * 100 / $bm) . '%"></i><i class="b2" style="height:' . ($q > 0 ? max(6, (int)round($q * 100 / $bm)) : 0) . '%"></i></div><div class="bd">' . eco_h(substr($k, 8)) . '</div></div>'; }
  $bars .= '</div><p class="note"><span class="dot d1"></span>방문 <span class="dot d2"></span>문의 · 막대 위 숫자 = 방문 · 아래 = 날짜(일)</p>';

  // 들어온 경로(첫 방문 기준, 14일). 11/29부터는 자세한 경로(sd), 그 전 날은 옛 분류(sc)로 셉니다.
  $SD = ['mail' => '메일(DM)', 'instagram' => '인스타그램', 'youtube' => '유튜브', 'naver' => '검색 · 네이버', 'google' => '검색 · 구글', 'search_etc' => '검색 · 기타', 'direct' => '직접(주소 입력·즐겨찾기·앱 안 링크)', 'gmadang' => '지마당', 'etc' => '기타(블로그·다른 사이트 등)'];
  $old2sd = ['utm' => 'mail', 'youtube' => 'youtube', 'gmadang' => 'gmadang', 'search' => 'search_etc', 'sns' => 'etc', 'mail' => 'mail', 'site' => 'etc', 'direct' => 'direct'];
  $src = []; $tp = []; $dv = [];
  for ($i = 0; $i < 14; $i++) { $x = pv_day(date('Y-m-d', strtotime("-$i day")));
    if (!empty($x['sd'])) { foreach ($x['sd'] as $a => $b) $src[$a] = ($src[$a] ?? 0) + (int)$b; } else { foreach ($x['sc'] as $a => $b) { $z = $old2sd[$a] ?? 'etc'; $src[$z] = ($src[$z] ?? 0) + (int)$b; } }
    foreach ($x['p'] as $a => $b) $tp[$a] = ($tp[$a] ?? 0) + (int)$b; foreach ($x['dv'] as $a => $b) $dv[$a] = ($dv[$a] ?? 0) + (int)$b; }
  $sT = max(1, array_sum($src)); arsort($src); $srcT = '<div class="wrap2"><table><tr><th>들어온 경로</th><th style="text-align:right">사람</th><th style="text-align:right">비율</th></tr>';
  foreach ($SD as $k => $nm) if (!isset($src[$k])) $src[$k] = 0;
  foreach ($src as $k => $v) $srcT .= '<tr><td>' . eco_h($SD[$k] ?? $k) . '</td><td style="text-align:right">' . (int)$v . '</td><td style="text-align:right">' . round($v * 100 / $sT) . '%</td></tr>';
  $srcT .= '</table></div><p class="note">최근 14일, 그날 첫 방문 기준. 메일(DM) = 메일 링크(utm)나 웹메일에서 온 사람. 11/28 이전 날은 검색 엔진을 나누지 못해 \'검색 · 기타\'로 셉니다.</p>';
  $PN = ['/' => '첫 화면(홈)', '/guide/' => '구매 가이드 목록', '/guide/faq.html' => '자주 묻는 질문'];
  arsort($tp); $pgT = '<div class="wrap2"><table><tr><th>많이 본 화면</th><th style="text-align:right">보기</th></tr>'; $n = 0;
  foreach ($tp as $k => $v) { if ($n++ >= 5) break; $pgT .= '<tr><td>' . eco_h($PN[$k] ?? $k) . '</td><td style="text-align:right">' . (int)$v . '</td></tr>'; }
  $pgT .= ($tp ? '' : '<tr><td colspan="2">기록 없음</td></tr>') . '</table></div>';
  $dvT = max(1, array_sum($dv));
  $dvLine = '<p class="note">기기(14일): 모바일 ' . (int)($dv['mobile'] ?? 0) . '명(' . round((int)($dv['mobile'] ?? 0) * 100 / $dvT) . '%) · PC ' . (int)($dv['pc'] ?? 0) . '명 · 태블릿 ' . (int)($dv['tablet'] ?? 0) . '명</p>';

  // ---- 11/29 추가(대표님 "일일·월·신규·기존 개념"): [오늘 | 일별 | 월별] 탭, 전일·전월 대비, 용어 정의, 신규·기존 고객 ----
  $vw = in_array($_GET['v'] ?? 'today', ['today', 'day', 'month'], true) ? (string)($_GET['v'] ?? 'today') : 'today';
  $arw = function (int $cur, ?int $prev): string { if ($prev === null) return '<span class="note">-</span>'; $d = $cur - $prev; return $d > 0 ? '<span class="up">▲ ' . $d . '</span>' : ($d < 0 ? '<span class="dn">▼ ' . abs($d) . '</span>' : '<span class="note">같음</span>'); };
  $c = fn(string $l, $v, bool $b = false): string => '<td data-l="' . $l . '" style="text-align:right">' . ($b ? '<b>' . $v . '</b>' : $v) . '</td>';

  // 고객: 문의서·장부의 회사 이름으로 같은 곳을 묶습니다((주)·주식회사·띄어쓰기 무시).
  $ck = fn($s): string => strtolower((string)preg_replace('/\s+|\(주\)|㈜|주식회사|\(유\)|\(사\)|사단법인|재단법인/u', '', (string)$s));
  $EV = [];   // [회사키, 날짜, 종류(inq|quote|order)]
  foreach (eco_rows('inquiry') as $r) { $k = $ck($r['company'] ?? ''); $d = substr((string)($r['at'] ?? ''), 0, 10); if ($k !== '' && $d !== '') $EV[] = [$k, $d, 'inq']; }
  foreach ($L as $x) { if (($x['stage'] ?? '') === '취소') continue; $k = $ck($x['company'] ?? ''); $d = (string)($x['made'] ?? ''); if ($k !== '' && $d !== '') $EV[] = [$k, $d, ($x['stage'] ?? '') === '주문 확정' ? 'order' : 'quote']; }
  usort($EV, fn($a, $b) => strcmp($a[1], $b[1]));
  // 기간(a~b)의 신규 고객 = 그 기간에 처음 연락(문의·견적·주문)한 곳 / 기존 고객 = 그 기간 전에 주문한 적이 있는 곳의 재문의·재주문
  $cust = function (string $a, string $b) use ($EV): array { $first = []; $ordered = []; $new = []; $old = [];
    foreach ($EV as [$k, $d, $t]) {
      if ($d > $b) break;
      if ($d >= $a) { if (!isset($first[$k]) || $first[$k] >= $a) $new[$k] = 1; elseif (isset($ordered[$k]) && $ordered[$k] < $a) $old[$k] = 1; }
      if (!isset($first[$k])) $first[$k] = $d;
      if ($t === 'order' && !isset($ordered[$k])) $ordered[$k] = $d; }
    foreach ($old as $k => $_) unset($new[$k]);
    return [count($new), count($old)]; };
  $mFrom = date('Y-m-01'); [$cn, $co] = $cust($mFrom, $today);
  $custCards = '<div class="cards">'
    . $big('신규 고객 (이번 달)', $cn . '곳', '처음 문의하거나 처음 견적·주문한 곳', '문의함·견적·주문 장부의 회사 이름 기준. 아직 0이면 첫 손님을 기다리는 중입니다.')
    . $big('기존 고객 (이번 달)', $co . '곳', '전에 주문한 곳이 다시 문의·주문', "재주문이 생기면 여기에 잡힙니다. 장부에 '주문 확정'으로 적어야 셉니다.")
    . '</div>';
  $terms = '<details class="terms"' . ($vw === 'today' ? ' open' : '') . '><summary>이 화면의 말 뜻</summary><ul>'
    . '<li><b>방문</b> = 그날 사이트에 들어온 사람 수. 같은 기기는 하루 1명으로 셉니다(IP 저장 안 함).</li>'
    . '<li><b>신규 방문자</b> = 이 기기로 처음 온 사람. <b>재방문(기존) 방문자</b> = 전에 온 적 있는 사람.</li>'
    . '<li><b>신규 고객</b> = 처음 문의하거나 처음 견적·주문한 곳(회사). <b>기존 고객</b> = 전에 주문한 곳이 다시 문의·주문한 경우.</li>'
    . '<li><b>가격 확인</b> = 가격 계산을 쓰거나 가격표 PDF를 연 사람. <b>전화</b> = 휴대폰에서 전화 버튼을 누른 사람. 둘 다 같은 사람 하루 1번.</li>'
    . '<li><b>▲▼</b> = 일별은 전날보다, 월별은 전달보다 늘었는지 줄었는지.</li></ul></details>';

  // 일별: 최근 14일(집계 시작일부터), 전일 대비
  $rows = ''; for ($i = 0; $i < 14; $i++) { $k = date('Y-m-d', strtotime("-$i day")); if ($k < $from) break; $x = pv_day($k); $uv = (int)$x['uv']; $nv = (int)$x['nv'];
    $pk = date('Y-m-d', strtotime($k . ' -1 day')); $pv = $pk >= $from ? (int)pv_day($pk)['uv'] : null;
    $rows .= '<tr><td class="dk">' . eco_h(substr($k, 5)) . ($k === $today ? ' (오늘)' : '') . '</td>' . $c('방문', $uv, true) . '<td data-l="전일 대비" style="text-align:right">' . $arw($uv, $pv) . '</td>' . $c('신규 방문자', $nv) . $c('재방문', max(0, $uv - $nv)) . $c('문의', (int)($IQ[$k] ?? 0)) . $c('가격 확인', (int)($x['ev']['calc'] ?? 0) + (int)($x['ev']['pdf'] ?? 0)) . $c('전화', (int)($x['ev']['tel'] ?? 0)) . $c('모바일', (int)($x['dv']['mobile'] ?? 0)) . $c('PC', (int)($x['dv']['pc'] ?? 0)) . '</tr>'; }
  $daily = '<div class="wrap lab"><table><tr><th>날짜</th><th>방문</th><th>전일 대비</th><th>신규 방문자</th><th>재방문</th><th>문의</th><th>가격 확인</th><th>전화</th><th>모바일</th><th>PC</th></tr>' . $rows . '</table></div>'
    . '<p class="note">한 줄 = 하루. 방문 = 그날 들어온 사람 수, 신규 방문자 + 재방문 = 방문. 문의 = 그날 들어온 문의서 건수.</p>';

  // 월별: 달마다 한 줄 + 누계, 전월 대비
  $mrows = ''; $prevU = null; $T = ['uv' => 0, 'nv' => 0, 'iq' => 0, 'ck' => 0, 'tel' => 0, 'q' => 0, 'o' => 0, 'cn' => 0, 'co' => 0];
  foreach ($MT as $mk => $x) { $uv = (int)($x['uv'] ?? 0); $nv = (int)($x['nv'] ?? 0); $a = $mk . '-01'; $b = date('Y-m-t', strtotime($a));
    $iq = $sumRange($IQ, $a, $b); $q = $sumRange($QD, $a, $b); $o = $sumRange($OD, $a, $b); [$mn, $mo] = $cust($a, $b);
    $chk = (int)($x['ev']['calc'] ?? 0) + (int)($x['ev']['pdf'] ?? 0); $tel = (int)($x['ev']['tel'] ?? 0);
    $mrows .= '<tr><td class="dk">' . eco_h($mk) . ' (' . (int)($x['days'] ?? 0) . '일)</td>' . $c('방문', $uv, true) . '<td data-l="전월 대비" style="text-align:right">' . $arw($uv, $prevU) . '</td>' . $c('신규 방문자', $nv) . $c('재방문', max(0, $uv - $nv)) . $c('문의', $iq) . $c('가격 확인', $chk) . $c('전화', $tel) . $c('견적', $q) . $c('주문', $o) . $c('신규 고객', $mn) . $c('기존 고객', $mo) . '</tr>';
    $prevU = $uv; foreach (['uv' => $uv, 'nv' => $nv, 'iq' => $iq, 'ck' => $chk, 'tel' => $tel, 'q' => $q, 'o' => $o, 'cn' => $mn, 'co' => $mo] as $kk => $vv) $T[$kk] += $vv; }
  $mrows .= '<tr class="sum"><td class="dk">누계 (' . (int)$GT['days'] . '일)</td>' . $c('방문', $T['uv'], true) . '<td data-l="전월 대비"></td>' . $c('신규 방문자', $T['nv']) . $c('재방문', max(0, $T['uv'] - $T['nv'])) . $c('문의', $T['iq']) . $c('가격 확인', $T['ck']) . $c('전화', $T['tel']) . $c('견적', $T['q']) . $c('주문', $T['o']) . $c('신규 고객', $T['cn']) . $c('기존 고객', $T['co']) . '</tr>';
  $monthly = '<div class="wrap lab"><table><tr><th>월</th><th>방문</th><th>전월 대비</th><th>신규 방문자</th><th>재방문</th><th>문의</th><th>가격 확인</th><th>전화</th><th>견적</th><th>주문</th><th>신규 고객</th><th>기존 고객</th></tr>' . $mrows . '</table></div>'
    . "<p class=\"note\">한 줄 = 한 달. 월 방문 = 그달 날짜별 방문을 더한 값(같은 사람이 다른 날 오면 따로 셉니다). 견적·주문·고객은 '견적·주문 장부'와 문의함 기준. 누계 = 집계 시작일부터 지금까지.</p>";

  $since = '<p class="since">' . eco_h(substr($from, 5)) . '부터 집계 (' . $days . '일째)' . ($days < 7 ? ' · 7일이 지나면 7일·30일 합계가 나타납니다' : '') . ' · 내부 점검 기기(?qa=1)와 검색 로봇은 세지 않음</p>';
  $range = '';
  if ($days >= 7) { $s7 = pv_sum(7); $range .= $big('최근 7일 방문', (int)$s7['uv'] . '명', '신규 ' . (int)$s7['nv'] . ' · 재방문 ' . max(0, (int)$s7['uv'] - (int)$s7['nv']), '날짜별 방문을 더한 값'); }
  if ($days >= 30) { $s30 = pv_sum(30); $range .= $big('최근 30일 방문', (int)$s30['uv'] . '명', '신규 ' . (int)$s30['nv'] . ' · 재방문 ' . max(0, (int)$s30['uv'] - (int)$s30['nv']), '날짜별 방문을 더한 값'); }

  $css = '<style>.cards .lbl{font-weight:700;font-size:14px}.cards .v{font-size:30px}.cards .sub{font-size:13px;font-weight:700;color:#7a4b12;margin:2px 0}.cards{grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}'
    . '.since{background:#fff;border:1px dashed var(--l);border-radius:8px;padding:6px 10px;font-size:13px;color:var(--m)}'
    . '.vtabs{display:flex;margin:6px 0 10px;border:1px solid var(--g);border-radius:10px;overflow:hidden;max-width:420px}.vtabs a{flex:1;text-align:center;padding:9px 0;font-weight:700;text-decoration:none;color:var(--g);background:#fff}.vtabs a.on{background:var(--g);color:#fff}'
    . '.terms{background:#fff;border:1px solid var(--l);border-radius:10px;padding:8px 12px;margin:0 0 10px;font-size:13.5px}.terms summary{font-weight:700;cursor:pointer}.terms ul{margin:6px 0 0;padding-left:18px}.terms li{margin:3px 0}'
    . '.up{color:#2f6b3d;font-weight:700}.dn{color:#b3261e;font-weight:700}tr.sum td{background:#eef3ec;font-weight:700}'
    . '.funnel{background:#fff;border:1px solid var(--l);border-radius:10px;padding:10px 12px}.fs{margin:0 0 10px}.fl{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px}.fv{font-size:20px;font-weight:800;color:var(--g)}.fb{height:12px;background:#eef3ec;border-radius:6px;overflow:hidden;margin:3px 0}.fb i{display:block;height:100%;background:var(--g);border-radius:6px}'
    . '.bars{display:flex;gap:3px;align-items:flex-end;height:170px;background:#fff;border:1px solid var(--l);border-radius:10px;padding:8px 6px 4px}.bc{flex:1;display:flex;flex-direction:column;align-items:center;height:100%;min-width:0}.bn{font-size:11px;color:var(--m);height:14px}.bw{flex:1;width:100%;display:flex;gap:1px;align-items:flex-end;justify-content:center}.bw i{display:block;width:45%;min-height:0;border-radius:3px 3px 0 0}.b1{background:#2f6b3d}.b2{background:#e08a3c}.bd{font-size:11px;color:var(--m);margin-top:2px}'
    . '.dot{display:inline-block;width:10px;height:10px;border-radius:2px;margin:0 3px 0 8px;vertical-align:-1px}.d1{background:#2f6b3d}.d2{background:#e08a3c}'
    . '.wrap2{overflow-x:auto}.two{display:grid;grid-template-columns:1fr 1fr;gap:12px}@media(max-width:700px){.two{grid-template-columns:1fr}}'
    . '@media(max-width:600px){.lab td[data-l]{display:inline-block;width:auto;text-align:left!important;padding:2px 8px 2px 0}.lab td[data-l]::before{content:attr(data-l) " ";color:var(--m);font-size:12px}.lab td.dk{font-weight:700;border-bottom:1px solid var(--l)!important}.lab td[data-l]:empty{display:none}}</style>';
  $tabsV = '<p class="tabs"><a href="?f=today">오늘</a><a href="?f=inbox">문의함</a><a href="?f=ledger">견적·주문 장부</a><a href="?f=visits" class="on">방문 리포트</a><a href="?f=mail">메일 설정</a><a href="?out=1">나가기</a></p>';
  $vt = '<nav class="vtabs" aria-label="기간"><a href="?f=visits&v=today"' . ($vw === 'today' ? ' class="on"' : '') . '>오늘</a><a href="?f=visits&v=day"' . ($vw === 'day' ? ' class="on"' : '') . '>일별 (14일)</a><a href="?f=visits&v=month"' . ($vw === 'month' ? ' class="on"' : '') . '>월별</a></nav>';
  $dl = '<p class="note">내려받기: <a href="?f=visits&csv=days">날짜별 전체 CSV</a> · <a href="?f=visits&csv=months">월별 CSV</a></p>';
  $head = $css . '<h1>에코레버 관리</h1>' . $tabsV . $vt . $since . $terms;
  if ($vw === 'day') page('방문 리포트 · 일별', $head . '<h2>최근 14일 방문 · 문의</h2>' . $bars . '<h2>일별 (최근 14일)</h2>' . $daily . $dl);
  if ($vw === 'month') page('방문 리포트 · 월별', $head . '<h2>월별 · 누계</h2>' . $monthly . $dl);
  page('방문 리포트', $head
    . '<h2>오늘 한눈에</h2>' . $cards . ($range !== '' ? '<div class="cards" style="margin-top:8px">' . $range . '</div>' : '')
    . '<h2>고객 (이번 달)</h2>' . $custCards
    . '<h2>손님이 주문까지 가는 흐름 <span class="note">(' . eco_h($fLab) . ')</span></h2>' . $funnel
    . '<p class="note">쇼핑몰의 "방문 → 장바구니 → 결제"와 같은 흐름입니다. 각 단계 숫자 = 그 단계까지 온 사람·건수, % = 앞 단계 중 몇 %가 다음으로 왔는지.</p>'
    . '<h2>최근 14일 방문 · 문의</h2>' . $bars
    . '<div class="two"><div><h2>들어온 경로</h2>' . $srcT . '</div><div><h2>많이 본 화면 5개</h2>' . $pgT . $dvLine . '</div></div>'
    . '<p class="note">날짜마다 숫자는 <a href="?f=visits&v=day">일별</a>, 달마다 숫자는 <a href="?f=visits&v=month">월별</a> 탭에서 봅니다. <b>내부 접속 제외:</b> 대표님·총괄 휴대폰과 PC에서 <a href="https://www.ecolever.co.kr/?qa=1" target="_blank" rel="noopener">ecolever.co.kr/?qa=1</a> 을 한 번 열어 두면 그 기기는 숫자에서 빠집니다(기기마다 한 번).</p>' . $dl);
}

// ---- 견적·주문 장부 ----
if ($f === 'ledger') {
  uasort($L, fn($a, $b) => strcmp((string)($b['made'] ?? ''), (string)($a['made'] ?? '')));
  if (isset($_GET['csv'])) {
    header('Content-Type: text/csv; charset=utf-8'); header('Content-Disposition: attachment; filename="ecolever-ledger-' . date('Ymd') . '.csv"');
    echo "\xEF\xBB\xBF"; $o = fopen('php://output', 'w');
    fputcsv($o, ['번호', '작성일', '업체', '문의 번호', '단계', '색상', '수량', '단가', '공급가', '배송비', '부가세', '합계', '입금일', '출고일', '세금계산서', '메모']);
    foreach ($L as $id => $x) fputcsv($o, array_map('csv_safe', [$id, $x['made'] ?? '', $x['company'] ?? '', $x['inq'] ?? '', $x['stage'] ?? '', $x['color'] ?? '', $x['qty'] ?? 0, $x['unit'] ?? 0, $x['supply'] ?? 0, $x['ship'] ?? 0, $x['vat'] ?? 0, $x['total'] ?? 0, $x['paid'] ?? '', $x['shipped'] ?? '', !empty($x['tax']) ? '발행' : '', $x['note'] ?? '']));
    exit;
  }
  // 월 합계: 매출은 입금일 기준(입금된 것만), 견적은 작성일 기준
  $mon = [];
  foreach ($L as $x) {
    if (($x['stage'] ?? '') === '취소') continue;
    $mq = substr((string)($x['made'] ?? ''), 0, 7); if ($mq !== '') { $mon[$mq]['q'] = ($mon[$mq]['q'] ?? 0) + 1; $mon[$mq]['qa'] = ($mon[$mq]['qa'] ?? 0) + (int)($x['total'] ?? 0); }
    $mp = substr((string)($x['paid'] ?? ''), 0, 7); if ($mp !== '') { $mon[$mp]['n'] = ($mon[$mp]['n'] ?? 0) + 1; $mon[$mp]['s'] = ($mon[$mp]['s'] ?? 0) + (int)($x['supply'] ?? 0) + (int)($x['ship'] ?? 0); $mon[$mp]['v'] = ($mon[$mp]['v'] ?? 0) + (int)($x['vat'] ?? 0); }
  }
  krsort($mon);
  $mrows = ''; foreach ($mon as $m => $v) $mrows .= '<tr><td>' . eco_h($m) . '</td><td style="text-align:right">' . (int)($v['q'] ?? 0) . '건 · ' . number_format((int)($v['qa'] ?? 0)) . '원</td><td style="text-align:right">' . (int)($v['n'] ?? 0) . '건</td><td style="text-align:right"><b>' . number_format((int)($v['s'] ?? 0)) . '원</b></td><td style="text-align:right">' . number_format((int)($v['v'] ?? 0)) . '원</td></tr>';
  $edit = isset($_GET['e'], $L[$_GET['e']]) ? (string)$_GET['e'] : ''; $x = $edit !== '' ? $L[$edit] : ['made' => date('Y-m-d'), 'color' => '1칼라', 'stage' => '견적', 'inq' => eco_cut($_GET['inq'] ?? '', 24), 'company' => eco_cut($_GET['co'] ?? '', 80)];
  $co = ''; foreach (COLORS as $c => $u) $co .= '<option value="' . eco_h($c) . '"' . (($x['color'] ?? '') === $c ? ' selected' : '') . '>' . eco_h($c) . ' (' . number_format($u) . '원)</option>';
  $sg = ''; foreach (['견적', '주문 확정', '취소'] as $s) $sg .= '<option' . (($x['stage'] ?? '') === $s ? ' selected' : '') . '>' . eco_h($s) . '</option>';
  $v = fn(string $k) => eco_h($x[$k] ?? '');
  $form = '<form method="post" class="inl" style="background:#fff;border:1px solid var(--l);border-radius:10px;padding:10px">' . hid() . '<input type="hidden" name="act" value="led_save"><input type="hidden" name="id" value="' . eco_h($edit) . '">'
    . '<label>작성일 <input type="date" name="made" value="' . $v('made') . '"></label><label>업체 <input name="company" value="' . $v('company') . '" required maxlength="80"></label><label>문의 번호 <input name="inq" value="' . $v('inq') . '" placeholder="Q…(선택)" maxlength="24" style="width:170px"></label>'
    . '<label>단계 <select name="stage">' . $sg . '</select></label><label>색상 <select name="color">' . $co . '</select></label><label>수량 <input type="number" name="qty" min="0" value="' . (int)($x['qty'] ?? 0) . '" style="width:100px"></label>'
    . '<label>단가 <input type="number" name="unit" min="0" value="' . (((int)($x['unit'] ?? 0)) ?: '') . '" placeholder="비우면 색상 단가" style="width:100px"></label><label>공급가 <input type="number" name="supply" min="0" value="' . (((int)($x['supply'] ?? 0)) ?: '') . '" placeholder="비우면 수량×단가" style="width:120px"></label>'
    . '<label>배송비 <input type="number" name="ship" min="0" value="' . (int)($x['ship'] ?? 0) . '" style="width:100px"></label><label>입금일 <input type="date" name="paid" value="' . $v('paid') . '"></label><label>출고일 <input type="date" name="shipped" value="' . $v('shipped') . '"></label>'
    . '<label><input type="checkbox" name="tax" value="1"' . (!empty($x['tax']) ? ' checked' : '') . '> 세금계산서 발행</label><label>메모 <input name="note" value="' . $v('note') . '" maxlength="200"></label>'
    . '<button>' . ($edit !== '' ? '고쳐 저장' : '장부에 넣기') . '</button>' . ($edit !== '' ? ' <a href="?f=ledger">새로 쓰기</a>' : '') . '</form><p class="note">공급가를 비우면 수량×단가, 단가를 비우면 색상 단가(1칼라 1,000원 · 2칼라 1,200원). 부가세는 (공급가+배송비)의 10%로 계산합니다. 계좌번호는 여기에 적지 않습니다.</p>';
  $rows = '';
  foreach ($L as $id => $y) {
    $rows .= '<tr><td>' . eco_h($id) . '<br><span class="note">' . eco_h($y['made'] ?? '') . '</span></td><td><b>' . eco_h($y['company'] ?? '') . '</b>' . (($y['inq'] ?? '') !== '' ? '<br><span class="note">' . eco_h($y['inq']) . '</span>' : '') . '</td>'
      . '<td>' . eco_h($y['stage'] ?? '') . '</td><td>' . eco_h($y['color'] ?? '') . ' ' . number_format((int)($y['qty'] ?? 0)) . '개 × ' . number_format((int)($y['unit'] ?? 0)) . '</td>'
      . '<td style="text-align:right">' . number_format((int)($y['supply'] ?? 0) + (int)($y['ship'] ?? 0)) . '<br><span class="note">부가세 ' . number_format((int)($y['vat'] ?? 0)) . '</span></td><td style="text-align:right"><b>' . number_format((int)($y['total'] ?? 0)) . '</b></td>'
      . '<td class="note">입금 ' . eco_h(($y['paid'] ?? '') ?: '-') . '<br>출고 ' . eco_h(($y['shipped'] ?? '') ?: '-') . '<br>계산서 ' . (!empty($y['tax']) ? '발행' : '-') . '</td>'
      . '<td><a href="?f=ledger&e=' . eco_h(rawurlencode($id)) . '">고치기</a><form method="post" class="inl" style="margin-top:4px">' . hid() . '<input type="hidden" name="act" value="led_del"><input type="hidden" name="id" value="' . eco_h($id) . '"><label class="note"><input type="checkbox" name="yes" value="1" required> 지우기 확인</label><button style="background:#9a3d10">지우기</button></form></td></tr>';
  }
  $tabsL = '<p class="tabs"><a href="?f=today">오늘</a><a href="?f=inbox">문의함</a><a href="?f=ledger" class="on">견적·주문 장부</a><a href="?f=visits">방문 리포트</a><a href="?f=mail">메일 설정</a><a href="?out=1">나가기</a></p>';
  page('장부', '<h1>에코레버 관리</h1>' . $tabsL . $M . '<h2>' . ($edit !== '' ? '장부 고치기' : '새 견적·주문') . '</h2>' . $form
    . '<h2>월 합계</h2><div class="wrap"><table><tr><th>월</th><th>견적(작성일 기준, 취소 제외)</th><th>입금 건수</th><th>매출 공급가(입금일 기준)</th><th>부가세</th></tr>' . ($mrows ?: '<tr><td colspan="5">아직 없음</td></tr>') . '</table></div>'
    . '<h2>장부 <a class="note" href="?f=ledger&csv=1">CSV 내려받기</a></h2><div class="wrap"><table><tr><th>번호</th><th>업체</th><th>단계</th><th>품목</th><th>공급가(배송 포함)</th><th>합계</th><th>입금·출고·계산서</th><th></th></tr>' . ($rows ?: '<tr><td colspan="8">아직 없음 — 첫 매출 기록이 여기에 남습니다.</td></tr>') . '</table></div>');
}

// ---- 메일 설정 ----
if ($f === 'mail') {
  $c = eco_mail_conf(); $smtp = $c['host'] !== '' && $c['user'] !== '' && $c['pass'] !== '';
  $mtabs = '<p class="tabs"><a href="?f=today">오늘</a><a href="?f=inbox">문의함</a><a href="?f=ledger">견적·주문 장부</a><a href="?f=visits">방문 리포트</a><a href="?f=mail" class="on">메일 설정</a><a href="?out=1">나가기</a></p>';
  page('메일 설정', '<h1>에코레버 관리</h1>' . $mtabs . $M
    . '<p>새 문의가 들어오면 <b>' . eco_h(ECO_NOTIFY_TO) . '</b> 로 알림 메일을 보냅니다. 지금 방식: <b>' . ($smtp ? 'Google SMTP' : '서버 기본 메일(가비아) — Google 메일함에 도착하지 않을 수 있음') . '</b></p>'
    . '<p class="note">Google(Workspace)로 보내려면: 서버 smtp.gmail.com · 포트 465 · 계정 ' . eco_h(ECO_NOTIFY_TO) . ' · <b>앱 비밀번호 16자리</b>(Google 계정 → 보안 → 2단계 인증 → 앱 비밀번호). 평소 로그인 비밀번호는 넣지 마세요. 앱 비밀번호는 이 화면에만 넣고 채팅·메일에 붙여 넣지 마세요.</p>'
    . '<form method="post">' . hid() . '<input type="hidden" name="act" value="mail_save">'
    . '<p>SMTP 서버<br><input name="host" value="' . eco_h($c['host'] ?: 'smtp.gmail.com') . '" size="28"> 포트 <select name="port"><option' . ((int)$c['port'] !== 587 ? ' selected' : '') . '>465</option><option' . ((int)$c['port'] === 587 ? ' selected' : '') . '>587</option></select></p>'
    . '<p>계정 이메일<br><input name="user" type="email" value="' . eco_h($c['user'] ?: ECO_NOTIFY_TO) . '" size="32"></p>'
    . '<p>보내는 주소(비우면 계정 이메일)<br><input name="from" type="email" value="' . eco_h($c['from']) . '" size="32"></p>'
    . '<p>앱 비밀번호 ' . ($c['pass'] !== '' ? '<b>(저장되어 있음 — 바꿀 때만 입력)</b>' : '(없음)') . '<br><input name="pass" type="password" autocomplete="new-password" size="32"> <label class="note"><input type="checkbox" name="clearpass" value="1"> 지우기</label></p>'
    . '<button>저장</button></form>'
    . '<form method="post" style="margin-top:10px">' . hid() . '<input type="hidden" name="act" value="mail_test"><button>시험 메일 보내기</button></form>'
    . ($c['last'] !== '' ? '<p class="note">최근 시험: ' . eco_h($c['last']) . '</p>' : ''));
}

$R = eco_rows('inquiry');
$stOf = fn(array $r): string => (string)($S[$r['id'] ?? '']['st'] ?? '접수');

// ---- CSV (문의함) ----
if ($f === 'inbox' && isset($_GET['csv'])) {
  header('Content-Type: text/csv; charset=utf-8'); header('Content-Disposition: attachment; filename="ecolever-inquiries-' . date('Ymd') . '.csv"');
  echo "\xEF\xBB\xBF"; $o = fopen('php://output', 'w');
  fputcsv($o, ['번호', '접수 시각', '진행 단계', '메모', '회사·기관', '담당자', '연락처', '이메일', '라인업', '수량', '희망 납기', '로고 인쇄', '자료 요청', '문의내용', '유입']);
  foreach ($R as $r) { $s = $S[$r['id'] ?? ''] ?? [];
    fputcsv($o, array_map('csv_safe', [$r['id'] ?? '', $r['at'] ?? '', $s['st'] ?? '접수', $s['note'] ?? '', $r['company'] ?? '', $r['name'] ?? '', $r['phone'] ?? '', $r['email'] ?? '', $r['lineup'] ?? '', $r['qty'] ?? '', $r['due'] ?? '', $r['print'] ?? '', !empty($r['sample']) ? '예' : '', $r['msg'] ?? '', $r['src'] ?? ''])); }
  exit;
}

$tabs = '<p class="tabs"><a href="?f=today"' . ($f === 'today' ? ' class="on"' : '') . '>오늘</a><a href="?f=inbox"' . ($f === 'inbox' ? ' class="on"' : '') . '>문의함</a><a href="?f=ledger">견적·주문 장부</a><a href="?f=visits">방문 리포트</a><a href="?f=mail">메일 설정</a><a href="?out=1">나가기</a></p>';
$H = '<h1>에코레버 관리</h1>' . $tabs . $M;

if ($f === 'today') {
  $cut = date('Y-m-d H:i:s', time() - 86400);
  $new24 = array_filter($R, fn($r) => ($r['at'] ?? '') >= $cut);
  $open = array_filter($R, fn($r) => $stOf($r) === '접수');
  $stale = array_filter($open, fn($r) => ($r['at'] ?? '') < $cut);            // 24시간 넘게 처리 안 한 문의
  $byStep = array_fill_keys(STEPS, 0); foreach ($R as $r) $byStep[$stOf($r)] = ($byStep[$stOf($r)] ?? 0) + 1;
  $src = array_fill_keys(['메일·캠페인(utm)', '유튜브', '지마당 카드', '검색', '직접·기타'], 0); foreach ($R as $r) $src[inq_src($r)]++;
  $card = fn(string $l, string $v, string $s = ''): string => '<div class="card"><div class="note">' . eco_h($l) . '</div><div class="v">' . eco_h($v) . '</div>' . ($s !== '' ? '<div class="note">' . eco_h($s) . '</div>' : '') . '</div>';
  $list = ''; foreach (array_slice($open, 0, 10) as $r) $list .= '<tr><td><a href="?f=inbox#' . eco_h(rawurlencode((string)$r['id'])) . '">' . eco_h($r['id']) . '</a> <span class="note">' . eco_h(substr((string)$r['at'], 0, 16)) . '</span>' . (($r['at'] ?? '') < $cut ? ' <span class="badge new">24시간 넘음</span>' : '') . '</td><td>' . eco_h($r['company'] ?? '') . ' · ' . eco_h($r['name'] ?? '') . '</td><td>' . eco_h(($r['qty'] ?? '') !== '' ? number_format((int)$r['qty']) . '개' : '-') . '</td></tr>';
  $sl = ''; foreach ($src as $k => $v) $sl .= $card($k, $v . '건');
  $steps = ''; foreach ($byStep as $k => $v) $steps .= '<span class="badge">' . eco_h($k) . ' ' . (int)$v . '</span> ';
  $deal = '첫 거래 진행: 이메일 ' . number_format((int)$DM['sent']) . ' / 양식 ' . (int)$DM['form'] . ' · 답장 ' . (int)$DM['reply'] . ' / 견적 ' . (int)$DM['quote'] . ' / 주문 ' . (int)$DM['order'];
  page('오늘', $H
    . '<div class="deal">' . eco_h($deal) . '<div class="note" style="font-weight:400">' . ($DM['at'] !== '' ? '숫자 고친 때 ' . eco_h($DM['at']) : '아래 「이메일 DM 숫자」에서 입력') . '</div></div>'
    . ($stale ? '<div class="warn">⚠ 24시간 넘게 처리하지 않은 문의가 <b>' . count($stale) . '건</b> 있습니다. <a href="?f=inbox&st=접수">문의함에서 보기</a></div>' : '')
    . (function () use ($L, $card) { $m = date('Y-m'); $q = 0; $qa = 0; $n = 0; $sa = 0; foreach ($L as $x) { if (($x['stage'] ?? '') === '취소') continue; if (substr((string)($x['made'] ?? ''), 0, 7) === $m) { $q++; $qa += (int)($x['total'] ?? 0); } if (substr((string)($x['paid'] ?? ''), 0, 7) === $m) { $n++; $sa += (int)($x['supply'] ?? 0) + (int)($x['ship'] ?? 0); } }
      return '<h2>이번 달 장부 (' . eco_h($m) . ')</h2><div class="cards">' . $card('견적', $q . '건', number_format($qa) . '원(부가세 포함)') . $card('입금된 매출', number_format($sa) . '원', $n . '건 · 공급가 기준') . '</div><p class="note"><a href="?f=ledger">장부 자세히</a></p>'; })()
    . '<div class="cards">' . $card('새 문의 (24시간)', count($new24) . '건') . $card('미처리 (접수 단계)', count($open) . '건') . $card('전체 문의', count($R) . '건') . '</div>'
    . '<p>' . $steps . '</p>'
    . '<h2>문의 출처</h2><div class="cards">' . $sl . '</div><p class="note">메일 utm·유튜브·지마당 카드는 주소의 utm이나 들어온 사이트로 나눕니다. 리퍼러가 없으면 직접·기타입니다.</p>'
    . '<h2>미처리 문의</h2><div class="wrap"><table><tr><th>번호</th><th>회사 · 담당자</th><th>수량</th></tr>' . ($list ?: '<tr><td colspan="3">없음</td></tr>') . '</table></div>'
    . '<h2>이메일 DM 숫자</h2><p class="note">메일은 knox@ 계정에서 보내므로 이 숫자는 손으로 고칩니다(누적).</p><form method="post" class="inl">' . hid() . '<input type="hidden" name="act" value="dm">'
    . '<label>이메일 <input name="sent" type="number" min="0" value="' . (int)$DM['sent'] . '" style="width:90px"></label><label>양식 <input name="form" type="number" min="0" value="' . (int)$DM['form'] . '" style="width:70px"></label><label>답장 <input name="reply" type="number" min="0" value="' . (int)$DM['reply'] . '" style="width:70px"></label>'
    . '<label>견적 <input name="quote" type="number" min="0" value="' . (int)$DM['quote'] . '" style="width:70px"></label><label>주문 <input name="order" type="number" min="0" value="' . (int)$DM['order'] . '" style="width:70px"></label><button>저장</button></form>'
    . (function () use ($card) { $y = pv_day(date('Y-m-d', strtotime('-1 day'))); $t = pv_day(date('Y-m-d')); $TT = pv_total(); $s7 = pv_sum(7);
      return '<h2>방문자</h2><div class="cards">'
        . $card('오늘 지금까지', (int)$t['uv'] . '명', '신규 ' . (int)$t['nv'] . ' · 재방문 ' . max(0, (int)$t['uv'] - (int)$t['nv']) . ' · 페이지 ' . (int)$t['pv'])
        . $card('어제 외부 방문자', (int)$y['uv'] . '명', '신규 ' . (int)$y['nv'] . ' · 재방문 ' . max(0, (int)$y['uv'] - (int)$y['nv']) . ' · 페이지 ' . (int)$y['pv'])
        . $card('최근 7일', (int)$s7['uv'] . '명', '신규 ' . (int)$s7['nv'] . ' · 재방문 ' . max(0, (int)$s7['uv'] - (int)$s7['nv']))
        . $card('누적 방문자', number_format($TT['uv']) . '명', '신규 ' . number_format($TT['nv']) . ' · ' . ($TT['from'] !== '' ? $TT['from'] . '부터' : '기록 없음')) . '</div>'
        . '<div class="wrap"><table><tr><th></th><th>접속 형태(기기)</th><th>들어온 경로</th></tr>'
        . '<tr><td>오늘</td><td>' . eco_h(pv_dvline($t['dv'])) . '</td><td>' . eco_h(pv_scline($t['sc'])) . '</td></tr>'
        . '<tr><td>어제</td><td>' . eco_h(pv_dvline($y['dv'])) . '</td><td>' . eco_h(pv_scline($y['sc'])) . '</td></tr>'
        . '<tr><td>7일</td><td>' . eco_h(pv_dvline($s7['dv'])) . '</td><td>' . eco_h(pv_scline($s7['sc'])) . '</td></tr></table></div>'
        . '<p class="note">내부 점검(?qa=1 브라우저)·검색 로봇 제외. 신규 = 이 기기로 처음 온 사람. <a href="?f=visits">방문 리포트 자세히</a></p>'; })());
}


// ---- 문의함 ----
$q = eco_cut($_GET['q'] ?? '', 40); $only = in_array($_GET['st'] ?? '', STEPS, true) ? (string)$_GET['st'] : '';
$rows = '';
foreach ($R as $r) {
  $id = (string)($r['id'] ?? ''); $cur = $S[$id] ?? ['st' => '접수', 'note' => '', 'log' => []];
  if ($only !== '' && ($cur['st'] ?? '접수') !== $only) continue;
  if ($q !== '' && stripos(($r['company'] ?? '') . ' ' . ($r['name'] ?? '') . ' ' . ($r['email'] ?? '') . ' ' . ($r['phone'] ?? ''), $q) === false) continue;
  $info = '<b>' . eco_h($r['company'] ?? '') . '</b> · ' . eco_h($r['name'] ?? '') . '<br>' . eco_h($r['phone'] ?? '') . ($r['email'] ?? '' ? ' · ' . eco_h($r['email']) : '')
    . '<br><span class="note">' . eco_h(trim(($r['lineup'] ?? '') . ' ' . (($r['qty'] ?? '') !== '' ? number_format((int)$r['qty']) . '개' : '') . ' ' . ($r['print'] ?? '') . (($r['due'] ?? '') !== '' ? ' · 희망 ' . $r['due'] : '') . (!empty($r['sample']) ? ' · 자료 요청' : '') . (($r['src'] ?? '') !== '' ? ' · 유입 ' . $r['src'] : ''))) . '</span>'
    . (($r['msg'] ?? '') !== '' ? '<br>' . nl2br(eco_h($r['msg'])) : '');
  $opts = ''; foreach (STEPS as $s) $opts .= '<option' . (($cur['st'] ?? '접수') === $s ? ' selected' : '') . '>' . eco_h($s) . '</option>';
  $log = ''; foreach (array_reverse((array)($cur['log'] ?? [])) as $l) $log .= eco_h(($l['at'] ?? '') . ' ' . ($l['st'] ?? '') . (($l['note'] ?? '') !== '' ? ' — ' . $l['note'] : '')) . '<br>';
  $rows .= '<tr id="' . eco_h($id) . '"><td>' . eco_h($id) . '<br><span class="note">' . eco_h(substr((string)($r['at'] ?? ''), 0, 16)) . '</span>' . (($cur['st'] ?? '접수') === '접수' ? '<br><span class="badge new">미처리</span>' : '') . '</td><td>' . $info . '</td>'
    . '<td><form method="post" class="inl">' . hid() . '<input type="hidden" name="act" value="stage"><input type="hidden" name="id" value="' . eco_h($id) . '"><select name="st">' . $opts . '</select>'
    . '<input name="note" value="' . eco_h($cur['note'] ?? '') . '" placeholder="메모 (예: 견적서 ECO-20261127-01 보냄)" maxlength="300"><button>저장</button></form>'
    . ($log !== '' ? '<details><summary class="note">기록</summary><div class="note">' . $log . '</div></details>' : '')
    . '<a class="note" href="?f=ledger&inq=' . eco_h(rawurlencode($id)) . '&co=' . eco_h(rawurlencode((string)($r['company'] ?? ''))) . '">→ 장부에 견적 쓰기</a>'
    . '<details><summary class="note">지우기</summary><form method="post" class="inl">' . hid() . '<input type="hidden" name="act" value="inq_del"><input type="hidden" name="id" value="' . eco_h($id) . '"><label class="note"><input type="checkbox" name="yes" value="1" required> 이 문의를 지웁니다(되돌릴 수 없음)</label><button style="background:#9a3d10">지우기</button></form></details></td></tr>';
}
$filt = '<form method="get" class="inl"><input type="hidden" name="f" value="inbox"><input name="q" value="' . eco_h($q) . '" placeholder="회사·담당자·연락처 검색"><select name="st"><option value="">모든 단계</option>';
foreach (STEPS as $s) $filt .= '<option' . ($only === $s ? ' selected' : '') . '>' . eco_h($s) . '</option>';
$filt .= '</select><button>찾기</button> <a href="?f=inbox&csv=1">CSV 내려받기</a></form>';
page('문의함', $H . $filt . '<p class="note">' . count($R) . '건 · 개인정보: 처리 완료 후 1년이 지나면 지웁니다. 단계: ' . eco_h(implode(' → ', STEPS)) . '</p>'
  . '<div class="wrap"><table><tr><th style="width:140px">번호</th><th>문의</th><th style="width:330px">진행 단계 · 메모</th></tr>' . ($rows ?: '<tr><td colspan="3">해당하는 문의가 없습니다.</td></tr>') . '</table></div>');
