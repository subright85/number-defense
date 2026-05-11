# ND Asset Spec — Brand Identity & Sprites

목표: ND를 *학교 프로젝트* → *인디 게임* 시각 톤으로. 우솝 풍선 sprite의 painterly pastel 스타일과 통일.

---

## 1. Brand Identity

### 1.1 Color Palette (brand)

풍선 6색을 brand primary로 reverse 매핑. 기성 Tailwind 팔레트 의존 종료.

| 토큰 | hex | 용도 |
|---|---|---|
| `--nd-primary` | `#FFD93D` | 노란 풍선 = brand main. CTA 버튼/하이라이트 |
| `--nd-accent-red` | `#FF6B6B` | 빨강 풍선 = danger/gameover/콤보 깨짐 |
| `--nd-accent-orange` | `#FF9F43` | 주황 풍선 = warning/콤보 진행 |
| `--nd-accent-green` | `#6BCF7F` | 초록 풍선 = success/정답/NEW BEST |
| `--nd-accent-blue` | `#4ECDC4` | 파랑 풍선 = info/timer/cool effects |
| `--nd-accent-purple` | `#A78BFA` | 보라 풍선 = leaderboard/secondary |
| `--nd-bg-deep` | `#0a0a1a` | 배경 deep (기존 유지) |
| `--nd-bg-mid` | `#1e1b4b` | 배경 mid (기존 유지) |
| `--nd-bg-card` | `rgba(255,255,255,0.04)` | 카드 base |
| `--nd-text-primary` | `#f5f5fa` | 본문 |
| `--nd-text-muted` | `rgba(255,255,255,0.65)` | 보조 |

### 1.2 Style Guide (모든 신규 에셋 공통)

- **스타일**: Pastel painterly + soft shading + slight cel-shading (우솝 풍선 매칭)
- **배경**: Transparent PNG (favicon/og 제외)
- **stroke**: 외곽선 부드러움, ~2-3px equiv at base size
- **하이라이트**: 좌상단 부드러운 highlight (구형 풍선 톤)
- **그림자**: 자체 drop-shadow X (CSS에서 박음). 단 *형상* 안에는 soft shading.
- **참고 톤**: kenney.nl Animal Pack / Game Icons "casual flat" 톤

---

## 2. Brand Marks

### 2.1 Favicon — `public/favicon.png`

| 항목 | 값 |
|---|---|
| 크기 | 256×256 (single PNG, 브라우저 자동 다운스케일) |
| 형식 | PNG with alpha |
| 컨셉 | 노란 풍선 + 가운데 흰 디스크 + 검은 숫자 "1" 또는 "+" 또는 "∞" |
| 배경 | Transparent |
| 사용처 | `<link rel="icon" href="/favicon.png">` + apple-touch-icon |

**AI Prompt template (Midjourney/SD):**
```
A single round yellow balloon icon, painterly pastel illustration, 
soft cel-shading, white circular disc in center with bold black number, 
slight gradient highlight top-left, no string, no background, 
transparent png, app icon style, 256x256, sharp edges, vibrant
```

### 2.2 Logo Wordmark — `public/logo-wordmark.png`

| 항목 | 값 |
|---|---|
| 크기 | 800×200 (display max width 320px on mobile) |
| 형식 | PNG with alpha |
| 컨셉 | "NUMBER DEFENSE" 텍스트 — 둥글고 부드러운 게임 폰트, 밝은 노랑(`#FFD93D`) + 흰 외곽선, 약간의 입체감. 옆에 작은 풍선 아이콘 박혀도 OK. |
| 배경 | Transparent |
| 사용처 | 시작 화면 hero |

**AI Prompt:**
```
Game logo "NUMBER DEFENSE", chunky rounded sans-serif game font,
bright yellow #FFD93D fill with white 3px outline, soft drop shadow,
playful arcade game logo, painterly style, transparent background,
no extra text, single line layout, 800x200
```

### 2.3 OG Banner — `public/og-image.png`

| 항목 | 값 |
|---|---|
| 크기 | 1200×630 (Facebook/Twitter 표준) |
| 형식 | PNG (alpha 불필요) |
| 컨셉 | 다크 그라디언트 배경 (`#0a0a1a` → `#1e1b4b`) + 6색 풍선 무리 + "NUMBER DEFENSE" wordmark + 부제 "Math · Pop · Defend" |
| 배경 | Solid (gradient) |
| 사용처 | og:image, twitter:image |

**AI Prompt:**
```
Social media banner 1200x630, dark navy gradient background with stars,
floating colorful balloons (red yellow orange green blue purple)
each with a number on white center disc, big bold yellow logo
"NUMBER DEFENSE" centered, subtitle "Math · Pop · Defend",
playful arcade game promo, painterly pastel illustration
```

---

## 3. UI Icons (이모지 → 커스텀 sprite)

전부 transparent PNG, 64×64 base (CSS display 14-24px).
스타일: Flat painterly, brand color로 채색, 흰 외곽선 ~2px.

폴더: `public/sprites/icons/`

| 파일 | 교체 대상 이모지 | 컬러 | 컨셉 |
|---|---|---|---|
| `heart.png` | (현재 SVG `heart`) | `#FF6B6B` 빨강 | HUD 라이프 — 풍만한 픽토 하트 |
| `target.png` | (현재 SVG `target`) | `#4ECDC4` 청록 | 정확도 — 동심원 3겹 + 십자선 |
| `star.png` | (현재 SVG `star`) | `#FFD93D` 노랑 | 점수 — 5각 별 + 부드러운 highlight |
| `balloon-icon.png` | (현재 SVG `balloon`) | mixed (작은 6색 풍선) | 킬카운트 — 풍선 1개 미니 |
| `timer.png` | (현재 SVG `timer`) | `#A78BFA` 보라 | 경과시간 — 시계/모래시계 |
| `flame.png` | (현재 SVG `flame`) | `#FF9F43` 주황→빨강 그라데 | 콤보 — 불꽃 모양 |
| `trophy.png` | 🏆 | `#FFD93D` + `#FF9F43` | Leaderboard 버튼 |
| `retry.png` | ↻ | `#f5f5fa` 흰색 | Retry 버튼 — 둥근 화살표 |
| `share.png` | (현재 텍스트) | `#4ECDC4` | Share 버튼 — 노드 3개 + 연결선 |
| `new-badge.png` | ⭐ | `#6BCF7F` 초록 + `#FFD93D` 노랑 | NEW BEST 뱃지 — 별 + "NEW" 리본 |
| `daily-target.png` | 🎯 | `#FF6B6B` + 흰색 | Daily Challenge — 다트 보드 |
| `pause.png` | (현재 텍스트) | `#f5f5fa` | Pause — 더블 바 |
| `settings.png` | (없음, 추가 권고) | `#A78BFA` | 톱니바퀴 |
| `mute-on.png` / `mute-off.png` | 🔇 / 🔊 | `#f5f5fa` | 사운드 토글 |

**AI Prompt template (개별 아이콘, 위 13개에 모두 적용):**
```
Single icon: [컨셉 설명], flat painterly game UI icon style,
brand color [hex], soft white 2px outline, slight inner highlight,
no shadow, transparent background, centered composition,
64x64 sharp PNG, video game icon, kenney.nl style
```

예시 — heart.png:
```
Single icon: a plump rounded heart shape,
flat painterly game UI icon style, brand color #FF6B6B (coral red),
soft white 2px outline, slight inner highlight top-left,
no shadow, transparent background, centered, 64x64 sharp PNG, casual game icon
```

---

## 4. Enemy Variant Overlays (mixed ops)

베이스 풍선 sprite (우솝 6색)는 그대로 사용. *Modifier overlay*만 새로 박음. 6×4=24장 안 그려도 됨.

폴더: `public/sprites/enemy-modifiers/`

### 4.1 Tank Overlay — `tank-overlay.png`

| 항목 | 값 |
|---|---|
| 크기 | 144×192 (base 풍선 60×80 위 1.2× 사이즈로 cover) |
| 형식 | PNG with alpha |
| 컨셉 | 풍선 외곽 따라가는 두꺼운 외곽선 (3-4px equiv) + 내부에 약간 어두운 vignette overlay. 형상 자체는 풍선 실루엣. 색상 X (BlendMode `multiply` 적용 가능) |

**AI Prompt:**
```
Hollow balloon-shaped outline overlay, thick dark navy stroke 4px,
subtle inner shadow vignette, transparent center, no fill color,
balloon silhouette only, 144x192 transparent PNG, game UI overlay
```

### 4.2 Fast Trail — `fast-trail.png`

| 항목 | 값 |
|---|---|
| 크기 | 180×80 (풍선 뒤쪽 trail) |
| 형식 | PNG with alpha |
| 컨셉 | 수평 모션 streaks 3-5개 (반투명 흰색→투명 그라데) — 풍선 후방에 오버레이 |

**AI Prompt:**
```
Horizontal motion trail streaks, 4 parallel curved white lines fading
from 60% opacity to 0%, soft gaussian blur, suggestion of speed,
transparent background, 180x80 PNG, video game speed effect
```

### 4.3 Splitter Outline — `splitter-outline.png`

| 항목 | 값 |
|---|---|
| 크기 | 144×192 |
| 형식 | PNG with alpha |
| 컨셉 | 풍선 외곽 따라가는 *점선* (dashed 4-4 pattern, 2-3px equiv) — "분열 가능" 시각 hint |

**AI Prompt:**
```
Hollow balloon-shaped dashed outline, dashed pattern 4px-4px gaps,
3px stroke white with slight glow, transparent fill, no shadow,
balloon silhouette only, 144x192 transparent PNG, game UI overlay
```

### 4.4 Shielded Ring — `shielded-ring.png`

| 항목 | 값 |
|---|---|
| 크기 | 160×210 (풍선보다 살짝 크게) |
| 형식 | PNG with alpha |
| 컨셉 | 풍선 둘레에 얇은 ring (2-3px) + soft glow. "shield" 느낌. |

**AI Prompt:**
```
Translucent protective shield ring around balloon area, soft glow,
2px white-blue stroke with cyan inner glow, transparent center,
no fill, 160x210 transparent PNG, video game shield aura
```

### 4.5 Shielded Op Badge — `shield-op-{add,sub,mul,div}.png` (4장)

각 풍선 위에 박히는 작은 op 심볼 뱃지.

| 항목 | 값 |
|---|---|
| 크기 | 32×32 (1장당) |
| 형식 | PNG with alpha |
| 컨셉 | 흰 동그란 디스크 + 가운데 op 심볼 (`+ − × ÷`) — Black bold sans, brand color 외곽선 |

**AI Prompt template:**
```
Small circular badge icon 32x32, white disc with thin colored border,
bold black mathematical symbol "[+, −, ×, ÷ 중 하나]" centered,
transparent background, painterly game UI badge
```

---

## 5. Splitter Children Variant (선택)

Splitter 격파 시 분열되는 작은 풍선은 기존 balloon sprite를 60% 사이즈로 렌더 가능 — 별도 sprite 불필요.

단 *시각 차별화* 강화하고 싶으면:
- `public/sprites/balloons-mini/` 폴더에 6색 60×80 → 36×48 사이즈 다운스케일 PNG 박을 수 있음
- 우선순위 LOW

---

## 6. Title Screen Demo Balloons (선택, P1)

시작 화면 entrance 모션용. 기존 balloon sprite 6장 reuse — 별도 에셋 X. CSS에서 random float 모션만 박으면 됨.

---

## 7. 산출물 요약 (성철이 박을 거)

> [!NOTE]
> 진행 상황 (2차): 기존 그리드 배경 문제를 해결하기 위해 녹색 크로마키 배경으로 에셋을 다시 생성하고, `remove_green_bg.py` 파이썬 스크립트를 통해 투명화 처리를 완료했습니다. 현재 다시 이미지 생성 할당량 초과로 일부 UI 아이콘이 대기 중입니다.

| 카테고리 | 장수 | 우선순위 | 진행 상태 |
|---|---|---|---|
| Brand: favicon / wordmark / og-image | 3 | **P0** | ✅ 3장 완료 (투명화 적용) |
| UI 아이콘 (HUD / 액션 / UI) | 15 | **P0** | ⚠️ 6장 완료, 9장 대기 |
| Enemy modifier overlays (tank/fast/splitter/shielded ring) | 4 | **P1** | ✅ 4장 완료 (투명화 적용) |
| Shield op badges | 4 | **P1** | ✅ 4장 완료 (투명화 적용) |
| Splitter mini balloons (선택) | 6 | P2 | ⏳ 6장 대기 |
| **합계** | **32장** | | **17장 완료 / 15장 대기** |

P0 = brand identity 진입에 필수. P1 = mixed ops 게임플레이 시각 차별화에 필수. P2 = 선택.

---

## 8. 통합 흐름

1. 성철이 위 prompt + 톤 가이드로 에셋 생성 (Midjourney/SD/Figma)
2. `public/sprites/` 하위 적절 폴더에 박음
3. 우솝이 컴포넌트 코드에 sprite 통합 (이모지 → `<img src=...>` 교체)
4. 상디가 brand 컬러 토큰 design system에 적용 (CSS 변수 → Tailwind config 또는 inline style)
5. 머지 게이트 — Zoro 검수 (스타일 일관성 + 사이즈 + alpha 정확)

---

## 9. 코드 변경 lane (에셋 없이 병렬 진행)

**Sanji** (UI/아트 lead):
- 위 brand 컬러 토큰 → CSS variable 박음
- Tailwind config에 brand 색 추가
- `MIXED_COLOR` 상수 → `var(--nd-primary)` 교체
- 카드/패널 깊이감 강화 (gradient overlay, soft inner shadow)

**Usopp** (UI 컴포넌트):
- 시작 화면 entrance 모션 (hero fade-in + 풍선 데모 floating)
- 게임오버 finalScore 22px → 60-80px hero size + count-up animation
- HUD 위계 강화 (텍스트 +30%, 아이콘 +40%)
- DonationFooter 메뉴 → 게임오버 화면 이동
- 데스크탑 wide canvas — 좌우 사이드 영역 활용 (combo log, mini-leaderboard 후보)

— Zoro
