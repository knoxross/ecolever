<?php
// 에코레버 관리 화면 보안: 첫 설정 코드 메일, 감사 로그, 지마당 OTP 서명 검증(2단계)
// 다른 PHP가 불러 쓰는 파일이라, 주소로 직접 열면 404를 돌려줍니다.
declare(strict_types=1);
if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === basename(__FILE__)) { http_response_code(404); exit; }

const ADMIN_2FA = true;                                   // 2단계 인증 켜짐(대표님 지시 2026-11-26)
const SETUP_MAIL_TO = 'knox@ecolever.co.kr';              // 첫 설정 코드를 받는 회사 메일
const GMADANG_OTP_URL = 'https://www.gmadang.com/api/otp_verify.php';
// 지마당 OTP 서명 공개키(ed25519, base64 32바이트). 지마당 /api/otp_pub.php 의 pub 값을 받아 고정합니다.
// 비어 있으면 2단계를 통과할 수 없습니다(fail-closed).
const GMADANG_OTP_PUB = '';
const IDLE_LIMIT = 1800;                                  // 30분 동안 아무것도 안 하면 자동 로그아웃

// 감사 로그: 언제 무엇이 있었는지만 남깁니다. 비밀번호·코드·OTP 번호·IP 원문은 남기지 않습니다(IP는 해시 앞 12자).
function sec_audit(string $ev, array $x = []): void {
  $row = ['at' => date('Y-m-d H:i:s'), 'ev' => $ev, 'ip' => substr(hash('sha256', 'eco-audit|' . ($_SERVER['REMOTE_ADDR'] ?? '0')), 0, 12)] + $x;
  try { eco_append('audit', $row); } catch (Throwable $e) {}
}

// 서버 기본 메일로 보냅니다(가비아). 제목·본문은 UTF-8 base64.
function sec_mail(string $to, string $subject, string $text): bool {
  $host = preg_replace('/[^a-z0-9.-]/i', '', (string)($_SERVER['HTTP_HOST'] ?? 'www.ecolever.co.kr'));
  $from = 'noreply@' . preg_replace('/^www\./', '', $host);
  $hdr = 'From: =?UTF-8?B?' . base64_encode('에코레버 관리') . "?= <$from>\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64";
  return @mail($to, '=?UTF-8?B?' . base64_encode($subject) . '?=', chunk_split(base64_encode($text)), $hdr);
}

// 첫 설정 코드: 8자리(헷갈리는 글자 제외), 30분 유효, 서버에는 해시만 저장. 한 시간에 3번까지 보냄.
function setup_code_send(): string {
  $f = eco_dir() . '/setup-code.php';
  $prev = is_file($f) ? (array)(require $f) : [];
  $sent = array_values(array_filter((array)($prev['sent'] ?? []), fn($t) => (int)$t > time() - 3600));
  if (count($sent) >= 3) return 'too_many';
  $abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; $code = '';
  for ($i = 0; $i < 8; $i++) $code .= $abc[random_int(0, strlen($abc) - 1)];
  $sent[] = time();
  file_put_contents($f, '<?php return ' . var_export(['hash' => password_hash($code, PASSWORD_DEFAULT), 'exp' => time() + 1800, 'tries' => 0, 'sent' => $sent], true) . ';', LOCK_EX);
  @chmod($f, 0640);
  $ok = sec_mail(SETUP_MAIL_TO, '[에코레버 관리] 처음 설정 코드',
    "에코레버 관리 화면 처음 설정 코드입니다.\n\n    $code\n\n30분 동안 쓸 수 있습니다. 직접 요청하지 않았다면 이 메일은 무시하세요.\n" . date('Y-m-d H:i') . "\n");
  sec_audit('setup_code_sent', ['mail' => $ok ? 'ok' : 'fail']);
  return $ok ? 'ok' : 'mail_fail';
}
function setup_code_check(string $code): bool {
  $f = eco_dir() . '/setup-code.php';
  if (!is_file($f)) return false;
  $c = (array)(require $f);
  if (time() > (int)($c['exp'] ?? 0) || (int)($c['tries'] ?? 0) >= 5) return false;
  $ok = password_verify(strtoupper(trim($code)), (string)($c['hash'] ?? ''));
  if (!$ok) { $c['tries'] = (int)($c['tries'] ?? 0) + 1; file_put_contents($f, '<?php return ' . var_export($c, true) . ';', LOCK_EX); }
  return $ok;
}

// 지마당에 6자리를 보내고, 돌아온 서명을 고정 공개키로 검증합니다. 모든 조건이 맞을 때만 true.
// $post 는 시험 때 바꿔 끼우는 용도입니다(기본은 HTTPS POST).
function otp_remote_verify(string $code, string $nonce, ?callable $post = null): array {
  if (!preg_match('/^\d{6}$/', $code)) return [false, 'format'];
  if (GMADANG_OTP_PUB === '' || !function_exists('sodium_crypto_sign_verify_detached')) return [false, 'no_pub'];
  $pub = base64_decode(GMADANG_OTP_PUB, true);
  if ($pub === false || strlen($pub) !== 32) return [false, 'no_pub'];
  $post = $post ?? function (array $f): ?string {
    $ctx = stream_context_create(['http' => ['method' => 'POST', 'header' => "Content-Type: application/x-www-form-urlencoded\r\n", 'content' => http_build_query($f), 'timeout' => 8, 'ignore_errors' => true],
      'ssl' => ['verify_peer' => true, 'verify_peer_name' => true]]);
    $r = @file_get_contents(GMADANG_OTP_URL, false, $ctx);
    return $r === false ? null : $r;
  };
  $res = $post(['code' => $code, 'nonce' => $nonce, 'site' => 'ecolever']);
  if ($res === null) return [false, 'hub_down'];                 // 지마당에 연결 못 함 → 막음
  $r = json_decode($res, true);
  if (!is_array($r) || !isset($r['payload'], $r['sig'])) return [false, 'hub_bad'];
  $pl = (string)$r['payload']; $sig = base64_decode((string)$r['sig'], true);
  if ($sig === false || strlen($sig) !== 64 || !sodium_crypto_sign_verify_detached($sig, $pl, $pub)) return [false, 'sig'];
  $p = json_decode($pl, true);
  if (!is_array($p) || ($p['site'] ?? '') !== 'ecolever' || !hash_equals($nonce, (string)($p['nonce'] ?? '')) || abs(time() - (int)($p['ts'] ?? 0)) > 60) return [false, 'claims'];
  return [($p['ok'] ?? null) === true, ($p['ok'] ?? null) === true ? 'ok' : 'wrong'];
}
