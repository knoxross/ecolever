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
function pv_day(string $d): array { $m = eco_read_json('pv-' . substr($d, 0, 7)); return ($m[$d] ?? []) + ['pv' => 0, 'uv' => 0, 'nv' => 0, 'p' => [], 'r' => [], 'u' => [], 'sc' => [], 'dv' => [], 'h' => []]; }
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
  $T += ['uv' => 0, 'nv' => 0, 'pv' => 0, 'dv' => [], 'sc' => [], 'days' => 0];
  $T['uv'] += (int)($x['uv'] ?? 0); $T['nv'] += (int)($x['nv'] ?? 0); $T['pv'] += (int)($x['pv'] ?? 0); $T['days']++;
  foreach ((array)($x['dv'] ?? []) as $k => $v) $T['dv'][$k] = ($T['dv'][$k] ?? 0) + (int)$v;
  foreach ((array)($x['sc'] ?? []) as $k => $v) $T['sc'][$k] = ($T['sc'][$k] ?? 0) + (int)$v;
  return $T;
}
const SRC = ['youtube' => '유튜브', 'gmadang' => '지마당', 'utm' => '메일·캠페인(utm)', 'search' => '검색', 'sns' => 'SNS·블로그', 'mail' => '웹메일', 'site' => '다른 사이트', 'direct' => '직접'];
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

// ---- 방문 리포트 ----
if ($f === 'visits') {
  $rows = ''; $tp = []; $tr = []; $tu = []; $ts = []; $hr = array_fill(0, 24, 0); $hasH = false; $vals = []; $nvals = [];
  $td = fn($v, bool $b = false): string => '<td style="text-align:right">' . ($b ? '<b>' . $v . '</b>' : $v) . '</td>';
  for ($i = 0; $i < 30; $i++) { $k = date('Y-m-d', strtotime("-$i day")); $x = pv_day($k); $vals[$k] = (int)$x['uv']; $nvals[$k] = (int)$x['nv'];
    if ($i < 14) { foreach ($x['p'] as $a => $b) $tp[$a] = ($tp[$a] ?? 0) + (int)$b; foreach ($x['r'] as $a => $b) $tr[$a] = ($tr[$a] ?? 0) + (int)$b; foreach ($x['u'] as $a => $b) $tu[$a] = ($tu[$a] ?? 0) + (int)$b; foreach ($x['sc'] as $a => $b) $ts[$a] = ($ts[$a] ?? 0) + (int)$b;
      foreach ($x['h'] as $a => $b) { $hr[(int)$a] += (int)$b; $hasH = true; }
      $uv = (int)$x['uv']; $nv = (int)$x['nv'];
      $rows .= '<tr><td>' . eco_h($k) . ($i === 0 ? ' (오늘)' : '') . '</td>' . $td($uv, true) . $td($nv) . $td(max(0, $uv - $nv)) . $td((int)($x['dv']['mobile'] ?? 0)) . $td((int)($x['dv']['pc'] ?? 0)) . $td((int)($x['dv']['tablet'] ?? 0)) . $td((int)$x['pv']) . $td($uv > 0 ? round((int)$x['pv'] / $uv, 1) : 0) . '<td class="note">' . eco_h(pv_scline($x['sc'])) . '</td></tr>'; } }
  // 집계 시작일부터 오늘까지: 날짜별 전체 · 월별 누계
  $AD = pv_all_days(); $MT = []; $GT = [];
  foreach ($AD as $mk => $ds) { $MT[$mk] = []; foreach ($ds as $x) { $MT[$mk] = pv_add($MT[$mk], $x); $GT = pv_add($GT, $x); } }
  $GT += ['uv' => 0, 'nv' => 0, 'pv' => 0, 'dv' => [], 'sc' => [], 'days' => 0];
  $csvRow = function (string $k, array $x): array { $r = [$k, (int)$x['uv'], (int)$x['nv'], max(0, (int)$x['uv'] - (int)$x['nv']), (int)$x['pv'], (int)($x['dv']['mobile'] ?? 0), (int)($x['dv']['pc'] ?? 0), (int)($x['dv']['tablet'] ?? 0)]; foreach (array_keys(SRC) as $z) $r[] = (int)($x['sc'][$z] ?? 0); return $r; };
  if (in_array($_GET['csv'] ?? '', ['days', 'months'], true)) { $cm = (string)$_GET['csv'];
    header('Content-Type: text/csv; charset=utf-8'); header('Content-Disposition: attachment; filename="ecolever-visits-' . ($cm === 'days' ? 'daily' : 'monthly') . '-' . date('Ymd') . '.csv"'); echo "\xEF\xBB\xBF"; $o = fopen('php://output', 'w');
    fputcsv($o, array_merge([$cm === 'days' ? '날짜' : '월', '방문자', '신규', '재방문', '페이지 보기', '모바일', 'PC', '태블릿'], array_values(SRC)));
    foreach ($AD as $mk => $ds) {
      if ($cm === 'days') { foreach ($ds as $k => $x) fputcsv($o, array_map('csv_safe', $csvRow($k, $x))); fputcsv($o, array_map('csv_safe', $csvRow($mk . ' 소계', $MT[$mk]))); }
      else fputcsv($o, array_map('csv_safe', $csvRow($mk, $MT[$mk]))); }
    fputcsv($o, array_map('csv_safe', $csvRow('누적 합계', $GT)));
    exit; }
  if (isset($_GET['csv'])) { header('Content-Type: text/csv; charset=utf-8'); header('Content-Disposition: attachment; filename="ecolever-visits-' . date('Ymd') . '.csv"'); echo "\xEF\xBB\xBF"; $o = fopen('php://output', 'w');
    fputcsv($o, array_merge(['날짜', '방문자', '신규', '재방문', '페이지 보기', '모바일', 'PC', '태블릿'], array_values(SRC)));
    for ($i = 89; $i >= 0; $i--) { $k = date('Y-m-d', strtotime("-$i day")); $x = pv_day($k); $r = [$k, $x['uv'], $x['nv'], max(0, (int)$x['uv'] - (int)$x['nv']), $x['pv'], $x['dv']['mobile'] ?? 0, $x['dv']['pc'] ?? 0, $x['dv']['tablet'] ?? 0]; foreach (array_keys(SRC) as $z) $r[] = $x['sc'][$z] ?? 0; fputcsv($o, array_map('csv_safe', $r)); }
    exit; }
  $TT = pv_total(); $s7 = pv_sum(7); $s30 = pv_sum(30); $dvT = (int)array_sum($s30['dv']);
  $card = fn(string $l, string $v, string $s = ''): string => '<div class="card"><div class="note">' . eco_h($l) . '</div><div class="v">' . eco_h($v) . '</div>' . ($s !== '' ? '<div class="note">' . eco_h($s) . '</div>' : '') . '</div>';
  $top = function (array $a, string $lab, ?array $names = null): string { arsort($a); $o = ''; foreach (array_slice($a, 0, 12, true) as $k => $v) $o .= '<tr><td>' . eco_h($names[$k] ?? $k) . '</td><td style="text-align:right">' . (int)$v . '</td></tr>'; return '<div class="wrap"><table><tr><th>' . eco_h($lab) . '</th><th>수</th></tr>' . ($o ?: '<tr><td colspan="2">기록 없음</td></tr>') . '</table></div>'; };
  // 막대: 전체 높이 = 방문자, 진한 부분 = 신규
  $bar = function (array $v, array $lab, ?array $dark = null): string { $mx = max(1, max($v)); $o = '<div style="display:flex;align-items:flex-end;gap:2px;height:110px;background:#fff;border:1px solid var(--l);border-radius:10px;padding:8px">';
    foreach ($v as $i => $n) { $h = (int)round($n * 100 / $mx); $d = $dark !== null && $n > 0 ? (int)round(($dark[$i] ?? 0) * 100 / $n) : 0;
      $o .= '<div title="' . eco_h($lab[$i] . ' ' . $n . ($dark !== null ? ' (신규 ' . ($dark[$i] ?? 0) . ')' : '')) . '" style="flex:1;height:' . $h . '%;min-height:1px;border-radius:3px 3px 0 0;background:linear-gradient(to top,#2f6b3d ' . $d . '%,#9cc5a4 ' . $d . '%)"></div>'; }
    return $o . '</div>'; };
  $vr = array_reverse($vals, true); $nr = array_reverse($nvals, true);
  $top1 = function (array $sc): string { if (!$sc) return '-'; arsort($sc); $k = (string)array_key_first($sc); return (SRC[$k] ?? $k) . ' ' . (int)$sc[$k]; };
  $tabsV = '<p class="tabs"><a href="?f=today">오늘</a><a href="?f=inbox">문의함</a><a href="?f=ledger">견적·주문 장부</a><a href="?f=visits" class="on">방문 리포트</a><a href="?f=mail">메일 설정</a><a href="?out=1">나가기</a></p>';
  page('방문 리포트', '<h1>에코레버 관리</h1>' . $tabsV
    . '<h2>누적</h2><div class="cards">'
    . $card('총 방문자(누적)', number_format($TT['uv']) . '명', $TT['from'] !== '' ? $TT['from'] . '부터' : '아직 기록 없음')
    . $card('신규 방문자(누적)', number_format($TT['nv']) . '명', '재방문 ' . number_format(max(0, $TT['uv'] - $TT['nv'])) . '명')
    . $card('페이지 보기(누적)', number_format($TT['pv']) . '회', $TT['uv'] > 0 ? '방문자당 ' . round($TT['pv'] / $TT['uv'], 1) . '쪽' : '')
    . $card('누적 접속 형태', pv_pct((int)($TT['dv']['mobile'] ?? 0), (int)array_sum($TT['dv'])) . ' 모바일', pv_dvline($TT['dv'])) . '</div>'
    . '<h2>최근</h2><div class="cards">'
    . $card('최근 7일 방문자', number_format($s7['uv']) . '명', '신규 ' . $s7['nv'] . ' · 재방문 ' . max(0, $s7['uv'] - $s7['nv']) . ' · 페이지 ' . $s7['pv'])
    . $card('최근 30일 방문자', number_format($s30['uv']) . '명', '신규 ' . $s30['nv'] . ' · 재방문 ' . max(0, $s30['uv'] - $s30['nv']) . ' · 페이지 ' . $s30['pv'])
    . $card('30일 접속 형태', pv_pct((int)($s30['dv']['mobile'] ?? 0), $dvT) . ' 모바일', pv_dvline($s30['dv']))
    . $card('30일 들어온 경로 1위', $top1($s30['sc']), pv_scline($s30['sc'])) . '</div>'
    . '<h2>최근 30일 방문자</h2>' . $bar(array_values($vr), array_keys($vr), array_values($nr)) . '<p class="note">진한 부분 = 신규 · 막대에 마우스를 올리면 숫자 · <a href="?f=visits&csv=1">90일 CSV 내려받기</a></p>'
    . '<h2>시간대별 첫 방문 (최근 14일)</h2>' . ($hasH ? $bar($hr, array_map(fn($z) => $z . '시', range(0, 23))) . '<p class="note">0시 ~ 23시 · 메일·영상 올릴 시간을 정할 때 봅니다.</p>' : '<p class="note">이번 업데이트 뒤부터 집계합니다.</p>')
    . '<h2>최근 14일</h2><div class="wrap"><table style="white-space:nowrap"><tr><th rowspan="2">날짜</th><th rowspan="2">방문자</th><th colspan="2">방문 구분</th><th colspan="3">접속 형태(기기)</th><th rowspan="2">페이지 보기</th><th rowspan="2">방문자당</th><th rowspan="2">들어온 경로(첫 방문)</th></tr><tr><th>신규</th><th>재방문</th><th>모바일</th><th>PC</th><th>태블릿</th></tr>' . $rows . '</table></div>'
    . '<p class="note">방문자 = 같은 기기·같은 날 한 명(IP 저장 안 함). 신규 = 이 기기로 처음 온 사람, 재방문 = 전에 온 적 있는 사람. 기기·경로·시간대는 그날 첫 방문 기준. 검색 로봇과 내부 점검(?qa=1로 한 번 연 브라우저)은 세지 않습니다. 직접 = 주소 입력·즐겨찾기·메일 앱·카톡 앱 안 링크처럼 들어온 곳이 남지 않는 경우.</p>'
    . (function () use ($AD, $MT, $GT, $td): string {
        $head = fn(string $c): string => '<tr><th rowspan="2">' . $c . '</th><th rowspan="2">방문자</th><th colspan="2">방문 구분</th><th colspan="3">접속 형태(기기)</th><th rowspan="2">페이지 보기</th><th rowspan="2">방문자당</th><th rowspan="2">들어온 경로(첫 방문)</th></tr><tr><th>신규</th><th>재방문</th><th>모바일</th><th>PC</th><th>태블릿</th></tr>';
        $line = function (string $lab, array $x, string $st = '') use ($td): string { $uv = (int)$x['uv']; $nv = (int)$x['nv'];
          return '<tr' . $st . '><td>' . $lab . '</td>' . $td($uv, true) . $td($nv) . $td(max(0, $uv - $nv)) . $td((int)($x['dv']['mobile'] ?? 0)) . $td((int)($x['dv']['pc'] ?? 0)) . $td((int)($x['dv']['tablet'] ?? 0)) . $td((int)$x['pv']) . $td($uv > 0 ? round((int)$x['pv'] / $uv, 1) : 0) . '<td class="note">' . eco_h(pv_scline($x['sc'])) . '</td></tr>'; };
        $sub = ' style="background:#eef3ec;font-weight:700"';
        $sel = (string)($_GET['m'] ?? 'all'); if ($sel !== 'all' && !isset($AD[$sel])) $sel = 'all';
        $nav = '<p class="tabs"><a href="?f=visits&m=all#days"' . ($sel === 'all' ? ' class="on"' : '') . '>전체 기간</a>';
        foreach (array_reverse(array_keys($AD)) as $mk) $nav .= '<a href="?f=visits&m=' . eco_h($mk) . '#days"' . ($sel === $mk ? ' class="on"' : '') . '>' . eco_h($mk) . '</a>';
        $nav .= '</p>';
        $today = date('Y-m-d'); $rows = '';
        foreach (array_reverse($AD, true) as $mk => $ds) { if ($sel !== 'all' && $sel !== $mk) continue;
          foreach (array_reverse($ds, true) as $k => $x) $rows .= $line(eco_h($k) . ($k === $today ? ' (오늘)' : ''), $x);
          $rows .= $line(eco_h($mk) . ' 소계 (' . (int)$MT[$mk]['days'] . '일)', $MT[$mk], $sub); }
        $mrows = ''; foreach ($AD as $mk => $ds) $mrows .= $line(eco_h($mk) . ' (' . (int)$MT[$mk]['days'] . '일)', $MT[$mk]);
        $mrows .= $line('누적 합계 (' . (int)$GT['days'] . '일)', $GT, $sub);
        return '<h2 id="days">날짜별 전체 (집계 시작일부터 오늘까지)</h2>' . $nav
          . '<div class="wrap"><table style="white-space:nowrap">' . $head('날짜') . $rows . '</table></div>'
          . '<p class="note">최근 날짜가 위 · 달마다 끝에 소계 줄 · <a href="?f=visits&csv=days">날짜별 전체 CSV</a></p>'
          . '<h2>월별 누계</h2><div class="wrap"><table style="white-space:nowrap">' . $head('월') . $mrows . '</table></div>'
          . '<p class="note">달이 쌓이면 줄이 저절로 늘어납니다. 월 방문자 = 그달 날짜별 방문자를 더한 값(같은 사람이 다른 날 오면 따로 셉니다). · <a href="?f=visits&csv=months">월별 CSV</a></p>';
      })()
    . '<h2>14일 들어온 경로</h2>' . $top($ts, '경로', SRC) . '<h2>14일 utm(메일·캠페인)</h2>' . $top($tu, 'utm_source/medium/campaign') . '<h2>14일 들어온 사이트</h2>' . $top($tr, '사이트') . '<h2>14일 많이 본 화면</h2>' . $top($tp, '주소'));
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
