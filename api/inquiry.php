<?php
// 홈페이지 견적 문의를 서버(data/inquiry.jsonl.php)에도 저장합니다.
// 메일 전송(FormSubmit)은 그대로 두고, 이 저장은 그와 별도로 한 번 더 남기는 것입니다.
// 웹에서는 data/ 를 열 수 없고, 관리자 화면(로그인 뒤)에서만 봅니다.
declare(strict_types=1);
require __DIR__ . '/_lib.php';
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

function out(int $code, array $body): void { http_response_code($code); echo json_encode($body, JSON_UNESCAPED_UNICODE); exit; }

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') out(405, ['ok' => false, 'error' => 'method']);
if (!eco_same_origin()) out(403, ['ok' => false, 'error' => 'origin']);
if (stripos((string)($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json') !== 0) out(415, ['ok' => false, 'error' => 'type']);

$raw = (string)file_get_contents('php://input', false, null, 0, 16385);
if (strlen($raw) > 16384) out(413, ['ok' => false, 'error' => 'size']);
$d = json_decode($raw, true);
if (!is_array($d)) out(400, ['ok' => false, 'error' => 'json']);

// 로봇이 채우는 숨은 칸이 채워져 있으면 저장하지 않고 성공처럼 답합니다.
if (eco_cut($d['_honey'] ?? '', 50) !== '') out(200, ['ok' => true]);

// 같은 사람 1시간 10건, 사이트 전체 하루 300건까지
$vk = eco_visitor_key();
if (!eco_rate_ok('inq-' . $vk, 10, 3600) || !eco_rate_ok('inq-all', 300, 86400)) out(429, ['ok' => false, 'error' => 'rate']);

$r = [
  'company' => eco_cut($d['company'] ?? '', 80),
  'name'    => eco_cut($d['name'] ?? '', 40),
  'phone'   => eco_cut($d['phone'] ?? '', 30),
  'email'   => eco_cut($d['email'] ?? '', 120),
  'lineup'  => eco_cut($d['lineup'] ?? '', 40),
  'size'    => eco_cut($d['size'] ?? '', 40),
  'qty'     => eco_cut($d['qty'] ?? '', 12),
  'due'     => eco_cut($d['due'] ?? '', 20),
  'print'   => eco_cut($d['print'] ?? '', 30),
  'sample'  => !empty($d['sample']),
  'msg'     => eco_cut($d['msg'] ?? '', 2000),
  'src'     => eco_cut($d['src'] ?? '', 120),   // utm_source/medium/campaign (있을 때만)
];

if ($r['company'] === '' || $r['name'] === '') out(422, ['ok' => false, 'error' => 'required']);
if (strlen((string)preg_replace('/\D/', '', $r['phone'])) < 9) out(422, ['ok' => false, 'error' => 'phone']);
if ($r['email'] !== '' && !filter_var($r['email'], FILTER_VALIDATE_EMAIL)) out(422, ['ok' => false, 'error' => 'email']);
if ($r['qty'] !== '' && !preg_match('/^\d{1,9}$/', $r['qty'])) $r['qty'] = '';
if ($r['due'] !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $r['due'])) $r['due'] = '';
if (empty($d['agree'])) out(422, ['ok' => false, 'error' => 'agree']);

$id = 'Q' . date('ymd-His') . '-' . bin2hex(random_bytes(2));
$row = ['id' => $id, 'at' => date('Y-m-d H:i:s')] + $r + ['vk' => $vk];
try { eco_append('inquiry', $row); } catch (Throwable $e) { out(500, ['ok' => false, 'error' => 'store']); }
out(200, ['ok' => true, 'id' => $id]);
