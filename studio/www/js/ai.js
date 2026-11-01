/* 영상뚝딱 — Claude AI 자동편집
 * 사진(작게 줄인 이미지)과 명령어를 Claude 에게 보내고, 구조화된 편집 계획(JSON)을 받아옵니다.
 */
'use strict';

const AI_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'];
const AI = { key: '', model: AI_MODELS[0] };

async function loadAiSettings() {
  AI.key = (await Platform.getSecret('anthropic_api_key')) || '';
  const m = Platform.getPref('ai_model');
  AI.model = AI_MODELS.includes(m) ? m : AI_MODELS[0];
}
const aiReady = () => !!AI.key && typeof window.Anthropic === 'function';

function aiClient() {
  return new window.Anthropic({ apiKey: AI.key, dangerouslyAllowBrowser: true, maxRetries: 2, timeout: 5 * 60 * 1000 });
}

const enumOf = list => ({ type: 'string', enum: list });
const textCard = {
  type: 'object', additionalProperties: false, required: ['text', 'sub', 'duration'],
  properties: { text: { type: 'string' }, sub: { type: 'string' }, duration: { type: 'number' } },
};
const PLAN_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['aspect', 'mood', 'filter', 'font', 'title', 'outro', 'caption_style', 'clips', 'music', 'music_volume', 'summary'],
  properties: {
    aspect: enumOf(['16:9', '9:16', '1:1', '4:5']),
    mood: enumOf(Object.keys(MOODS)),
    filter: enumOf(FILTERS.map(f => f.v)),
    font: enumOf(FONTS.map(f => f.v)),
    title: textCard,
    outro: textCard,
    caption_style: {
      type: 'object', additionalProperties: false, required: ['position', 'color', 'box', 'animation'],
      properties: {
        position: enumOf(['top', 'center', 'bottom']),
        color: { type: 'string' },
        box: { type: 'boolean' },
        animation: enumOf(TEXT_ANIMS.map(a => a.v)),
      },
    },
    clips: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['media', 'duration', 'trim_start', 'caption', 'narration', 'transition', 'motion'],
        properties: {
          media: { type: 'integer' },
          duration: { type: 'number' },
          trim_start: { type: 'number' },
          caption: { type: 'string' },
          narration: { type: 'string' },
          transition: enumOf(TRANSITIONS.map(t => t.v)),
          motion: enumOf(MOTIONS.map(m => m.v)),
        },
      },
    },
    music: { type: 'boolean' },
    music_volume: { type: 'number' },
    summary: { type: 'string' },
  },
};

const SYSTEM_PROMPT = `당신은 한국어 숏폼·홍보 영상을 만드는 숙련된 영상 편집자입니다.
사용자가 올린 사진/동영상(번호가 붙어 있음)과 명령어를 보고, 바로 쓸 수 있는 편집 계획을 JSON 으로 만듭니다.

편집 원칙 (숏폼 추천 알고리즘에 유리하게)
- 처음 1~2초가 가장 중요합니다(훅). 세로 짧은 영상이면 첫 화면을 긴 제목 화면으로 쓰지 말고, 가장 눈길 끄는 장면으로 바로 시작하세요. 제목이 필요하면 title.duration 을 1.2초 이하로 하거나 첫 장면 자막에 제목을 넣으세요.
- 쇼츠·릴스는 2~3초마다 장면이 바뀌게 하고, 마지막은 다시 보고 싶게(처음과 이어지거나 행동 유도: 구독·팔로우·문의) 끝냅니다.
- 소리를 끄고 보는 사람이 많으므로 핵심 장면엔 자막을 넣습니다.
- 명령어를 가장 우선합니다. 명령어에 없는 부분은 사진 내용과 용도에 맞게 알아서 정합니다.
- 첫 장면은 시선을 끄는 가장 좋은 사진으로 시작하고, 이야기 흐름(소개 → 특징·디테일 → 활용 모습 → 마무리)이 생기도록 순서를 정합니다.
- 흐리거나 거의 같은 사진은 빼도 됩니다. 단, 명령어가 '모두' 쓰라고 하면 모두 씁니다. 로고 이미지는 장면으로 쓰지 않습니다.
- clips[].media 는 반드시 아래 목록의 번호만 씁니다. 같은 번호를 두 번 쓰지 마세요.
- 길이(초): 명령어에 전체 길이가 있으면 제목·마지막 화면을 포함한 합계가 그 길이에 맞도록 나눕니다. 없으면 분위기에 맞게 정합니다(빠른 분위기 1.2~2초, 보통 2.5~3.5초, 잔잔 3.5~5초).
- 동영상은 trim_start(시작 지점, 초)와 duration 이 원본 길이 안에 들어가게 하고, 가장 볼만한 구간을 고릅니다. 사진은 trim_start 를 0 으로 둡니다.
- 자막(caption)은 장면마다 짧고 자연스러운 한국어 문구로 씁니다(한 줄 14자 안팎, 최대 두 줄). 사진에 실제로 보이는 것과 명령어에 있는 정보만 씁니다. 가격·수치·인증 같은 사실을 지어내지 마세요. 자막이 필요 없으면 빈 문자열로 둡니다.
- title 은 첫 화면 제목(필요 없으면 text 를 빈 문자열), outro 는 마지막 화면입니다. 명령어의 전화번호·이메일·주소·상호는 글자 그대로 outro.sub 에 넣습니다.
- narration 은 성우가 읽을 내레이션 문장입니다. 명령어가 내레이션·목소리·설명·성우를 원할 때만 장면마다 자연스러운 한국어 구어체로 씁니다(장면 길이 1초당 약 4~5글자). 원하지 않으면 빈 문자열로 둡니다. 내레이션이 있으면 장면 길이를 내레이션이 다 읽힐 만큼 넉넉히 잡습니다.
- motion 은 사진에 쓰는 느린 움직임입니다(동영상은 none). 장면마다 적당히 바꿔 단조롭지 않게 합니다.
- transition 은 이전 장면에서 이 장면으로 넘어가는 효과입니다. 분위기에 맞게 고르고, 첫 장면은 none 으로 둡니다.
- caption_style.color 는 #rrggbb 형식입니다.
- music 은 배경음악을 쓸지 여부입니다(음악 파일이 없으면 상관없음). music_volume 은 0~1 입니다.
- summary 에는 어떻게 편집했는지 한국어 한 문장으로 적습니다.`;

/** 사진을 AI 에 보낼 크기로 줄이기 (동영상은 미리 만든 대표 장면 사용) */
function mediaToBase64(m, maxSide) {
  if (m.type !== 'image') return m.thumb.split(',')[1];
  const c = document.createElement('canvas');
  const sc = Math.min(1, maxSide / Math.max(m.w, m.h));
  c.width = Math.max(1, Math.round(m.w * sc)); c.height = Math.max(1, Math.round(m.h * sc));
  c.getContext('2d').drawImage(m.el, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.72).split(',')[1];
}

async function planWithAI(command, signal) {
  const visual = state.media.map((m, i) => ({ m, i })).filter(x => x.m.type === 'image' || x.m.type === 'video');
  if (!visual.length) throw new Error('먼저 사진이나 동영상을 넣어 주세요.');
  const maxSide = visual.length > 30 ? 384 : visual.length > 12 ? 512 : 768;
  const content = [];
  for (const { m, i } of visual) {
    const desc = m.type === 'image'
      ? `[${i}] 사진 "${m.name}" (${m.w}×${m.h}${S.logoId === m.id ? ', 로고로 지정됨' : ''})`
      : `[${i}] 동영상 "${m.name}" (${m.w}×${m.h}, 길이 ${m.duration.toFixed(1)}초) — 대표 장면:`;
    content.push({ type: 'text', text: desc });
    if (m.type === 'video' && !m.thumb) continue;
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: mediaToBase64(m, maxSide) } });
  }
  const bgm = mediaById(S.bgmId) || state.media.find(m => m.type === 'audio' && m.role !== 'voice');
  const ctxInfo = [
    `현재 화면 비율 설정: ${S.aspect}`,
    bgm ? `배경음악: "${bgm.name}" (${bgm.duration.toFixed(0)}초${bgm.beat ? `, 약 ${bgm.beat.bpm}BPM` : ''})` : '배경음악: 없음',
    `사용 가능한 글꼴: ${FONTS.map(f => `${f.v} = ${f.label}`).join(', ')}`,
    `분위기 값: ${Object.entries(MOODS).map(([k, v]) => `${k} = ${v.label}`).join(', ')}`,
  ].join('\n');
  content.push({ type: 'text', text: `${ctxInfo}\n\n사용자 명령어:\n${command || '(명령어 없음 — 사진에 어울리는 홍보 영상을 알아서 만들어 주세요)'}` });

  const params = {
    model: AI.model,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content }],
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: PLAN_SCHEMA } },
  };
  // 안전 분류기에 막히면 서버가 다른 모델로 다시 시도 (Haiku 는 지원하지 않음)
  if (AI.model !== 'claude-haiku-5-5') { params.betas = ['server-side-fallback-2026-07-01']; params.fallbacks = 'default'; }

  let res;
  try {
    res = await aiClient().beta.messages.create(params, { signal });
  } catch (e) {
    throw new Error(aiErrorMessage(e));
  }
  if (res.stop_reason === 'refusal') throw new Error('AI가 이 요청을 처리하지 않았습니다. 명령어를 바꿔서 다시 시도해 주세요.');
  if (res.stop_reason === 'max_tokens') throw new Error('AI 응답이 너무 길어 잘렸습니다. 사진 수를 줄여 다시 시도해 주세요.');
  const text = res.content.filter(b => b.type === 'text').map(b => b.text).join('');
  let plan;
  try { plan = JSON.parse(text); } catch (e) { throw new Error('AI 응답을 해석하지 못했습니다. 다시 시도해 주세요.'); }
  plan.source = 'ai';
  plan.summary = `AI 편집: ${plan.summary || ''}`;
  return plan;
}

function aiErrorMessage(e) {
  const A = window.Anthropic;
  if (A && e instanceof A.APIUserAbortError) return '취소했습니다.';
  if (A && e instanceof A.AuthenticationError) return 'API 키가 올바르지 않습니다. AI 설정에서 키를 확인해 주세요.';
  if (A && e instanceof A.PermissionDeniedError) return '이 API 키로는 선택한 모델을 쓸 수 없습니다. 다른 모델을 골라 보세요.';
  if (A && e instanceof A.NotFoundError) return '선택한 AI 모델을 찾을 수 없습니다. AI 설정에서 다른 모델을 골라 보세요.';
  if (A && e instanceof A.RateLimitError) return 'AI 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.';
  if (A && e instanceof A.BadRequestError) {
    const msg = e.error?.error?.message || e.message || '';
    if (/credit|balance/i.test(msg)) return 'API 크레딧이 부족합니다. console.anthropic.com 에서 충전해 주세요.';
    return 'AI 요청 오류: ' + msg;
  }
  if (A && e instanceof A.InternalServerError) return 'AI 서버가 일시적으로 응답하지 않습니다. 잠시 후 다시 시도해 주세요.';
  if (A && e instanceof A.APIConnectionError) return '인터넷 연결을 확인해 주세요. (AI 서버에 연결할 수 없음)';
  if (A && e instanceof A.APIError) return 'AI 오류: ' + (e.message || e.status);
  return 'AI 오류: ' + (e && e.message ? e.message : e);
}

/** 키 확인 (토큰 비용 없음) */
async function testAiKey(key, model) {
  const client = new window.Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 0, timeout: 20000 });
  try {
    const info = await client.models.retrieve(model);
    return { ok: true, message: `연결 성공 — ${info.display_name || model} 사용 가능` };
  } catch (e) {
    return { ok: false, message: aiErrorMessage(e) };
  }
}
