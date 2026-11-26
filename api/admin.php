<?php
// 에코레버 관리 화면: 오늘 · 문의함(진행 단계·메모·CSV)
// 지마당 admin.php 구조를 따릅니다. 처음 접속한 사람이 관리 비밀번호를 정하고, 그 뒤에는 비밀번호로만 들어옵니다.
declare(strict_types=1);
require __DIR__ . '/_lib.php';
session_name('ECOADM');
session_set_cookie_params(['httponly' => true, 'secure' => !empty($_SERVER['HTTPS']), 'samesite' => 'Strict', 'path' => '/api/']);
session_start();
header('X-Frame-Options: DENY'); header('X-Content-Type-Options: nosniff'); header('Cache-Control: no-store'); header('Referrer-Policy: no-referrer');
header("Content-Security-Policy: default-src 'self'; style-src 'unsafe-inline'; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'");
header('X-Robots-Tag: noindex, nofollow');

$dir = eco_dir(); $pw = $dir . '/admin-pass.php';
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
    . 'form.inl{display:flex;flex-wrap:wrap;gap:4px}.msg{background:#fff;border:1px solid var(--g);padding:8px 10px;border-radius:8px}</style></head><body><main>' . $body . '</main></body></html>';
  exit;
}

// ---- 처음 한 번: 관리 비밀번호 정하기 ----
if (!is_file($pw)) {
  if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    chk(); $a = (string)($_POST['p1'] ?? '');
    if (strlen($a) < 10 || $a !== (string)($_POST['p2'] ?? '')) page('처음 설정', '<h1>에코레버 관리 — 처음 설정</h1><p>비밀번호는 10자 이상, 두 번 같게 입력해 주세요. <a href="admin.php">다시</a></p>');
    file_put_contents($pw, '<?php return ' . var_export(password_hash($a, PASSWORD_DEFAULT), true) . ';', LOCK_EX); @chmod($pw, 0640);
    page('처음 설정', '<h1>에코레버 관리</h1><p>관리 비밀번호를 정했습니다. <a href="admin.php">로그인</a></p>');
  }
  page('처음 설정', '<h1>에코레버 관리 — 처음 설정</h1><p>관리 비밀번호를 정합니다. 10자 이상. 정한 뒤에는 이 화면이 다시 나오지 않습니다.</p><form method="post">' . hid()
    . '<p><input type="password" name="p1" placeholder="새 비밀번호" required minlength="10" autocomplete="new-password"></p><p><input type="password" name="p2" placeholder="한 번 더" required autocomplete="new-password"></p><button>정하기</button></form>');
}

if (isset($_GET['out'])) { $_SESSION = []; session_destroy(); header('Location: admin.php'); exit; }

// ---- 로그인 (틀린 횟수는 서버 파일에: 같은 곳 15분 5번, 전체 15분 30번이면 15분 잠금) ----
if (empty($_SESSION['ok'])) {
  $lk = fn(string $id): string => $dir . '/lock-' . substr(hash('sha256', $id), 0, 16) . '.php';
  $cnt = function (string $f): int { if (!is_file($f) || filemtime($f) < time() - 900) return 0; return (int)preg_replace('/^<\?php.*?\?>\n/s', '', (string)file_get_contents($f)); };
  $mine = $lk('ip' . ($_SERVER['REMOTE_ADDR'] ?? '0')); $all = $lk('all');
  if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    chk();
    if ($cnt($mine) >= 5 || $cnt($all) >= 30) { http_response_code(429); page('잠김', '<h1>에코레버 관리</h1><p>비밀번호를 여러 번 틀려 15분 동안 잠겼습니다. 잠시 후 다시 시도해 주세요.</p>'); }
    if (password_verify((string)($_POST['p'] ?? ''), (string)(require $pw))) { @unlink($mine); session_regenerate_id(true); $_SESSION['ok'] = 1; $_SESSION['t'] = bin2hex(random_bytes(16)); header('Location: admin.php'); exit; }
    foreach ([$mine, $all] as $lf) @file_put_contents($lf, ECO_GUARD . ($cnt($lf) + 1), LOCK_EX);
    sleep(1);
    page('로그인', '<h1>에코레버 관리</h1><p class="msg">비밀번호가 맞지 않습니다.</p><form method="post">' . hid() . '<input type="password" name="p" placeholder="관리 비밀번호" required autofocus autocomplete="current-password"> <button>들어가기</button></form>');
  }
  page('로그인', '<h1>에코레버 관리</h1><form method="post">' . hid() . '<input type="password" name="p" placeholder="관리 비밀번호" required autofocus autocomplete="current-password"> <button>들어가기</button></form>');
}

// ---- 여기부터 로그인한 사람만 ----
$S = eco_read_json('inq-status');                 // {문의 id: {st, note, at, log:[...]}}
$DM = eco_read_json('dm') + ['sent' => 0, 'reply' => 0, 'quote' => 0, 'order' => 0, 'at' => ''];
$f = in_array($_GET['f'] ?? 'today', ['today', 'inbox'], true) ? (string)($_GET['f'] ?? 'today') : 'today';
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
    foreach (['sent', 'reply', 'quote', 'order'] as $k) $DM[$k] = max(0, min(100000, (int)($_POST[$k] ?? 0)));
    $DM['at'] = date('Y-m-d H:i'); eco_write_json('dm', $DM); $_SESSION['msg'] = '이메일 DM 숫자를 저장했습니다.';
    header('Location: admin.php'); exit;
  }
  header('Location: admin.php'); exit;
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

$tabs = '<p class="tabs"><a href="?f=today"' . ($f === 'today' ? ' class="on"' : '') . '>오늘</a><a href="?f=inbox"' . ($f === 'inbox' ? ' class="on"' : '') . '>문의함</a><span class="note">견적·주문 장부와 방문 리포트는 다음 단계에서 붙습니다</span><a href="?out=1">나가기</a></p>';
$H = '<h1>에코레버 관리</h1>' . $tabs . $M;

if ($f === 'today') {
  $cut = date('Y-m-d H:i:s', time() - 86400);
  $new24 = array_filter($R, fn($r) => ($r['at'] ?? '') >= $cut);
  $open = array_filter($R, fn($r) => $stOf($r) === '접수');
  $byStep = array_fill_keys(STEPS, 0); foreach ($R as $r) $byStep[$stOf($r)] = ($byStep[$stOf($r)] ?? 0) + 1;
  $src = []; foreach ($R as $r) { $k = ($r['src'] ?? '') !== '' ? (string)$r['src'] : '(직접·알 수 없음)'; $src[$k] = ($src[$k] ?? 0) + 1; } arsort($src);
  $card = fn(string $l, string $v, string $s = ''): string => '<div class="card"><div class="note">' . eco_h($l) . '</div><div class="v">' . eco_h($v) . '</div>' . ($s !== '' ? '<div class="note">' . eco_h($s) . '</div>' : '') . '</div>';
  $list = ''; foreach (array_slice($open, 0, 10) as $r) $list .= '<tr><td><a href="?f=inbox#' . eco_h(rawurlencode((string)$r['id'])) . '">' . eco_h($r['id']) . '</a><br><span class="note">' . eco_h(substr((string)$r['at'], 0, 16)) . '</span></td><td>' . eco_h($r['company'] ?? '') . ' · ' . eco_h($r['name'] ?? '') . '</td><td>' . eco_h(($r['qty'] ?? '') !== '' ? number_format((int)$r['qty']) . '개' : '-') . '</td></tr>';
  $sl = ''; foreach (array_slice($src, 0, 8, true) as $k => $v) $sl .= '<tr><td>' . eco_h($k) . '</td><td style="text-align:right">' . (int)$v . '</td></tr>';
  $steps = ''; foreach ($byStep as $k => $v) $steps .= '<span class="badge">' . eco_h($k) . ' ' . (int)$v . '</span> ';
  page('오늘', $H
    . '<div class="cards">' . $card('새 문의 (24시간)', count($new24) . '건') . $card('미처리 (접수 단계)', count($open) . '건') . $card('전체 문의', count($R) . '건')
    . $card('이메일 DM 보냄', number_format((int)$DM['sent']) . '통', $DM['at'] !== '' ? '숫자 고친 때 ' . $DM['at'] : '아래에서 입력')
    . $card('답장 / 견적 / 주문', (int)$DM['reply'] . ' / ' . (int)$DM['quote'] . ' / ' . (int)$DM['order']) . '</div>'
    . '<p>' . $steps . '</p>'
    . '<h2>미처리 문의</h2><div class="wrap"><table><tr><th>번호</th><th>회사 · 담당자</th><th>수량</th></tr>' . ($list ?: '<tr><td colspan="3">없음</td></tr>') . '</table></div>'
    . '<h2>문의가 들어온 곳</h2><div class="wrap"><table><tr><th>유입(utm)</th><th>문의</th></tr>' . ($sl ?: '<tr><td colspan="2">아직 없음</td></tr>') . '</table></div>'
    . '<h2>이메일 DM 숫자</h2><p class="note">메일은 knox@ 계정에서 보내므로 이 숫자는 손으로 고칩니다(누적).</p><form method="post" class="inl">' . hid() . '<input type="hidden" name="act" value="dm">'
    . '<label>보냄 <input name="sent" type="number" min="0" value="' . (int)$DM['sent'] . '" style="width:90px"></label><label>답장 <input name="reply" type="number" min="0" value="' . (int)$DM['reply'] . '" style="width:80px"></label>'
    . '<label>견적 <input name="quote" type="number" min="0" value="' . (int)$DM['quote'] . '" style="width:80px"></label><label>주문 <input name="order" type="number" min="0" value="' . (int)$DM['order'] . '" style="width:80px"></label><button>저장</button></form>'
    . '<h2>어제 방문자</h2><p class="note">방문 리포트(④ 단계)를 붙이면 여기에 외부 방문자 수와 유입 경로가 나옵니다. 그 전까지는 GA4에서 봅니다.</p>');
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
    . ($log !== '' ? '<details><summary class="note">기록</summary><div class="note">' . $log . '</div></details>' : '') . '</td></tr>';
}
$filt = '<form method="get" class="inl"><input type="hidden" name="f" value="inbox"><input name="q" value="' . eco_h($q) . '" placeholder="회사·담당자·연락처 검색"><select name="st"><option value="">모든 단계</option>';
foreach (STEPS as $s) $filt .= '<option' . ($only === $s ? ' selected' : '') . '>' . eco_h($s) . '</option>';
$filt .= '</select><button>찾기</button> <a href="?f=inbox&csv=1">CSV 내려받기</a></form>';
page('문의함', $H . $filt . '<p class="note">' . count($R) . '건 · 개인정보: 처리 완료 후 1년이 지나면 지웁니다. 단계: ' . eco_h(implode(' → ', STEPS)) . '</p>'
  . '<div class="wrap"><table><tr><th style="width:140px">번호</th><th>문의</th><th style="width:330px">진행 단계 · 메모</th></tr>' . ($rows ?: '<tr><td colspan="3">해당하는 문의가 없습니다.</td></tr>') . '</table></div>');
