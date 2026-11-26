<?php
// 에코레버 공용 함수: data/ 읽기·쓰기, 글자 자르기, 화면 출력용 이스케이프.
// 다른 PHP가 불러 쓰는 파일이라, 주소로 직접 열면 404를 돌려줍니다.
declare(strict_types=1);
if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === basename(__FILE__)) { http_response_code(404); exit; }
date_default_timezone_set('Asia/Seoul');

// 모든 data 파일 맨 앞에 붙이는 줄. 누가 주소로 열어도 PHP가 먼저 404로 끝냅니다.
// data/.htaccess 의 접근 차단과 함께 두 겹으로 막습니다.
const ECO_GUARD = "<?php http_response_code(404); exit; ?>\n";

function eco_dir(): string {
  $d = dirname(__DIR__) . '/data';
  if (!is_dir($d)) @mkdir($d, 0750, true);
  return $d;
}

// 제어 문자를 지우고, 앞뒤 공백을 자르고, 글자 수(바이트 아님)로 자릅니다. mbstring 없이도 동작합니다.
function eco_cut($s, int $n): string {
  $s = (string)$s;
  if (!preg_match('//u', $s)) return '';                       // 깨진 UTF-8은 버림
  $s = trim((string)preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $s));
  return preg_match('/^.{0,' . $n . '}/us', $s, $m) ? $m[0] : '';
}

function eco_h($s): string { return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); }

// 한 줄에 한 건씩 쌓는 기록(JSON Lines). 첫 줄은 ECO_GUARD.
function eco_append(string $name, array $row): void {
  $p = eco_dir() . "/$name.jsonl.php";
  $fh = fopen($p, 'ab');
  if (!$fh) throw new RuntimeException('기록 파일을 열 수 없습니다');
  flock($fh, LOCK_EX);
  clearstatcache(true, $p);
  if (filesize($p) === 0) fwrite($fh, ECO_GUARD);
  fwrite($fh, json_encode($row, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n");
  fflush($fh); flock($fh, LOCK_UN); fclose($fh);
}

// 쌓인 기록을 최신 순으로 돌려줍니다.
function eco_rows(string $name): array {
  $p = eco_dir() . "/$name.jsonl.php";
  if (!is_file($p)) return [];
  $o = [];
  foreach (file($p, FILE_IGNORE_NEW_LINES) as $l) {
    if ($l === '' || strncmp($l, '<?php', 5) === 0) continue;
    $r = json_decode($l, true);
    if (is_array($r)) $o[] = $r;
  }
  return array_reverse($o);
}

// 통째로 읽고 쓰는 JSON 파일(상태값 등).
function eco_read_json(string $name): array {
  $p = eco_dir() . "/$name.json.php";
  if (!is_file($p)) return [];
  $j = preg_replace('/^<\?php.*?\?>\n/s', '', (string)file_get_contents($p));
  return json_decode((string)$j, true) ?: [];
}
function eco_write_json(string $name, array $v): void {
  file_put_contents(eco_dir() . "/$name.json.php", ECO_GUARD . json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX);
}

// IP를 그대로 저장하지 않고, 날마다 바뀌는 비밀 소금으로 해시한 짧은 값만 씁니다(같은 날 같은 사람 구분용).
function eco_visitor_key(): string {
  $saltFile = eco_dir() . '/salt.php';
  if (!is_file($saltFile)) @file_put_contents($saltFile, '<?php return ' . var_export(bin2hex(random_bytes(16)), true) . ';', LOCK_EX);
  $salt = (string)(@include $saltFile);
  return substr(hash('sha256', $salt . date('Y-m-d') . ($_SERVER['REMOTE_ADDR'] ?? '0')), 0, 16);
}

// 같은 사이트에서 온 요청인지: Origin(없으면 Referer)의 호스트가 지금 호스트와 같아야 합니다.
function eco_same_origin(): bool {
  $src = $_SERVER['HTTP_ORIGIN'] ?? ($_SERVER['HTTP_REFERER'] ?? '');
  $h = parse_url((string)$src, PHP_URL_HOST);
  $here = preg_replace('/:\d+$/', '', (string)($_SERVER['HTTP_HOST'] ?? ''));
  return is_string($h) && $h !== '' && strcasecmp($h, $here) === 0;
}

// 짧은 시간 안에 너무 많이 들어오면 막습니다. 키마다 파일 하나, 창 크기 $win초.
function eco_rate_ok(string $key, int $max, int $win): bool {
  $f = eco_dir() . '/rate-' . substr(hash('sha256', $key), 0, 16) . '.php';
  $now = time(); $list = [];
  if (is_file($f)) { $list = array_filter(array_map('intval', explode(',', (string)preg_replace('/^<\?php.*?\?>\n/s', '', (string)file_get_contents($f)))), fn($t) => $t > $now - $win); }
  if (count($list) >= $max) return false;
  $list[] = $now;
  @file_put_contents($f, ECO_GUARD . implode(',', $list), LOCK_EX);
  return true;
}

// 서버 기본 메일(가비아)로 보냅니다. 받는 사람은 코드에 고정된 회사 주소만 씁니다.
// 제목·본문은 UTF-8 base64라서 손님이 넣은 글자가 메일 머리말을 바꿀 수 없습니다.
const ECO_NOTIFY_TO = 'knox@ecolever.co.kr';
function eco_mail(string $subject, string $text, string $replyTo = ''): bool {
  $host = preg_replace('/[^a-z0-9.-]/i', '', (string)($_SERVER['HTTP_HOST'] ?? 'www.ecolever.co.kr'));
  $from = 'noreply@' . preg_replace('/^www\./', '', $host);
  $hdr = 'From: =?UTF-8?B?' . base64_encode('에코레버 홈페이지') . "?= <$from>\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64";
  if ($replyTo !== '' && filter_var($replyTo, FILTER_VALIDATE_EMAIL) && !preg_match('/[\r\n]/', $replyTo)) $hdr .= "\r\nReply-To: <$replyTo>";
  return @mail(ECO_NOTIFY_TO, '=?UTF-8?B?' . base64_encode($subject) . '?=', chunk_split(base64_encode($text)), $hdr);
}
