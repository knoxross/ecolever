<?php
// 에코레버 관리 화면 보안: 감사 로그, 지마당 허브 서명 검증(비밀번호 확인 · 2단계 OTP)
// 다른 PHP가 불러 쓰는 파일이라, 주소로 직접 열면 404를 돌려줍니다.
declare(strict_types=1);
if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === basename(__FILE__)) { http_response_code(404); exit; }

// 대표님 지시(2026-11-26 밤): "OTP 인증이 안 되니 1단계만 하자." → 2단계 끔.
// 로그인은 지마당 관리 비밀번호 하나로 합니다(에코레버 비밀번호를 따로 두지 않음, 처음 설정 화면 없음).
const ADMIN_2FA = false;
const GMADANG_PW_URL  = 'https://www.gmadang.com/api/pw_verify.php';
const GMADANG_OTP_URL = 'https://www.gmadang.com/api/otp_verify.php';
// 지마당 허브 서명 공개키(ed25519, base64 32바이트). 지마당 /api/otp_pub.php 의 pub 값을 고정합니다.
const GMADANG_OTP_PUB = 'Bgr0oC/73bm5yHH1P0iCFN6RE2xs2qbNcEJ73VuJgOI=';   // 2026-11-26 지마당 운영 /api/otp_pub.php 값(RNK·총괄 각각 확인)
const GMADANG_OTP_KID = 'dab99a118cc63a51';   // = sha256(공개키 32바이트) 앞 16자. 응답의 kid가 이 값과 같아야 함
const IDLE_LIMIT = 1800;                                  // 30분 동안 아무것도 안 하면 자동 로그아웃

// 감사 로그: 언제 무엇이 있었는지만 남깁니다. 비밀번호·OTP 번호·IP 원문은 남기지 않습니다(IP는 해시 앞 12자).
function sec_audit(string $ev, array $x = []): void {
  $row = ['at' => date('Y-m-d H:i:s'), 'ev' => $ev, 'ip' => substr(hash('sha256', 'eco-audit|' . ($_SERVER['REMOTE_ADDR'] ?? '0')), 0, 12)] + $x;
  try { eco_append('audit', $row); } catch (Throwable $e) {}
}

// 지마당 허브에 POST(HTTPS, 인증서 확인, 연결 5초·전체 8초). 연결 못 하면 null.
// 가비아 에코레버 서버는 allow_url_fopen이 꺼져 있어(2026-11-26 확인) curl 확장으로 보냅니다.
// curl이 없으면 'unreachable' 를 돌려 로그인을 막습니다(fail-closed).
function hub_post(string $url, array $f): ?string {
  if (!function_exists('curl_init')) return 'unreachable';
  $c = curl_init($url);
  curl_setopt_array($c, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => http_build_query($f), CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CONNECTTIMEOUT => 5, CURLOPT_TIMEOUT => 8, CURLOPT_SSL_VERIFYPEER => true, CURLOPT_SSL_VERIFYHOST => 2,
    CURLOPT_FOLLOWLOCATION => false, CURLOPT_PROTOCOLS => CURLPROTO_HTTPS, CURLOPT_HTTPHEADER => ['Accept: application/json']]);
  $r = curl_exec($c);
  curl_close($c);
  return is_string($r) ? $r : null;
}

// 허브 응답 {payload, sig, kid} 검증. payload = {"ok":bool,"nonce":..,"ts":..,"site":"ecolever","kind":"pw"|"otp"}
// 모두 맞을 때만 [true,'ok']: 서명(고정 공개키) · kid · site · nonce · ts ±60초 · kind(있으면 기대값과 같아야 함)
function hub_check(?string $res, string $nonce, string $kind): array {
  if (!function_exists('sodium_crypto_sign_verify_detached')) return [false, 'no_pub'];
  $pub = base64_decode(GMADANG_OTP_PUB, true);
  if ($pub === false || strlen($pub) !== 32 || substr(hash('sha256', $pub), 0, 16) !== GMADANG_OTP_KID) return [false, 'no_pub'];
  if ($res === 'unreachable') return [false, 'hub_unreachable'];             // 서버에 curl이 없음
  if ($res === null) return [false, 'hub_down'];                                     // 지마당에 연결 못 함 → 막음(fail-closed)
  $r = json_decode($res, true);
  if (is_array($r) && ($r['err'] ?? '') === 'no_key') return [false, 'hub_no_key'];
  if (!is_array($r) || !isset($r['payload'], $r['sig'])) return [false, 'hub_bad'];
  if (!hash_equals(GMADANG_OTP_KID, (string)($r['kid'] ?? ''))) return [false, 'kid'];
  $pl = (string)$r['payload']; $sig = base64_decode((string)$r['sig'], true);
  if ($sig === false || strlen($sig) !== 64 || !sodium_crypto_sign_verify_detached($sig, $pl, $pub)) return [false, 'sig'];
  $p = json_decode($pl, true);
  if (!is_array($p) || ($p['site'] ?? '') !== 'ecolever' || !hash_equals($nonce, (string)($p['nonce'] ?? '')) || abs(time() - (int)($p['ts'] ?? 0)) > 60) return [false, 'claims'];
  if (isset($p['kind']) && $p['kind'] !== $kind) return [false, 'claims'];          // 비밀번호 확인 서명을 OTP 자리에(또는 반대로) 못 씀
  return [($p['ok'] ?? null) === true, ($p['ok'] ?? null) === true ? 'ok' : 'wrong'];
}

// 지마당 관리 비밀번호 확인. 보내는 값: password · nonce · site. 비밀번호는 서버끼리 HTTPS로만 오가고 어디에도 저장하지 않습니다.
function pw_remote_verify(string $password, string $nonce, ?callable $post = null): array {
  if ($password === '' || strlen($password) > 200) return [false, 'format'];
  $post = $post ?? fn(array $f): ?string => hub_post(GMADANG_PW_URL, $f);
  return hub_check($post(['password' => $password, 'nonce' => $nonce, 'site' => 'ecolever']), $nonce, 'pw');
}

// 2단계 OTP(지금은 꺼져 있음, ADMIN_2FA=false). 다시 켤 때를 위해 남겨 둡니다.
function otp_remote_verify(string $code, string $nonce, ?callable $post = null): array {
  if (!preg_match('/^\d{6}$/', $code)) return [false, 'format'];
  $post = $post ?? fn(array $f): ?string => hub_post(GMADANG_OTP_URL, $f);
  return hub_check($post(['code' => $code, 'nonce' => $nonce, 'site' => 'ecolever']), $nonce, 'otp');
}
