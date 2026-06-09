# Handoff: Health Tracer — кликабельный прототип (desktop web)

## Overview
Это **интерактивный десктоп-прототип** AI-коуча по самочувствию Health Tracer. В отличие от
статичных макетов на канве, здесь экраны реально переключаются по клику, а ключевые сценарии
проигрываются по шагам:

- **Живая навигация** по сайдбару (Чат · Сегодня · Динамика · Профиль · Тренировки · Питание),
  сайдбар «прилипает» при прокрутке длинных экранов.
- **Сценарий анализа тела по фото** в чате: запрос → коуч просит 3 ракурса → «анализ» →
  карточка с примерной оценкой (% жира, тонус, сильные/слабые мышцы) → «Сохранить в профиль»
  → раздел «Анализ тела» в профиле.
- **Питание**: «сделать план диетичнее» (черновик v9 → «Применить»), интерактивная **закупка**
  (галочки + счётчик), переход рацион → закупка.
- **Карточка-предложение** «коуч предлагает — человек решает»: Принять / Отклонить меняют
  состояние.
- **Нижняя панель «Прототип»**: «Все экраны» — попап со всеми маршрутами (вкл. онбординг,
  тарифы, лимит, согласие); для экранов с состояниями (загрузка/ошибка/пусто/готово/…) —
  переключатели прямо в панели.

Продуктовый принцип, который нужно сохранить: **планы меняет только коуч (через чат)**; экраны
тренировок/питания — только просмотр; это **wellness-продукт, не медицина** (без диагнозов/
дозировок; анализ тела — «примерная визуальная оценка по фото, не диагноз»).

> Базовый дизайн-хэндофф (токены, атомы, продуктовая логика всех экранов) — в пакете
> `design_handoff_health_tracer`. Здесь акцент на **интерактиве и архитектуре прототипа**.

## About the Design Files
Файлы в `design/` — **дизайн-референс в HTML + React (через in-browser Babel)**. Это
работающий прототип задуманного поведения, **не продакшн-код**. Задача — **воссоздать его в
вашем окружении** (React/Next, Vue, SwiftUI…), используя готовые паттерны и роутер проекта.
Если стека ещё нет — рекомендация: **React + TypeScript + React Router** (или Next.js
app-router), состояние — локальное/Zustand, стили — CSS-переменные / Tailwind.

Прототип **не** содержит бэкенда и реального ИИ: ответы коуча, инференс по фото и т.п.
сымитированы (таймеры, заранее заданные данные). При переносе замените эти заглушки на
реальные API.

## Fidelity
**High-fidelity, интерактивный.** Финальные цвета/типографика/отступы + рабочие переходы и
состояния. Воссоздавать пиксель-в-пиксель; интерактив — по описанным ниже флоу и стейт-модели.

---

## Архитектура прототипа (как это устроено)
Точка входа — `app/proto.jsx`, компонент **`ProtoApp`**. Он держит маршрут и состояния и
рендерит нужный экран + нижнюю панель.

### 1) Навигация — глобальный хэндлер `window.__htNav`
Сайдбар живёт в общем `AppShell` (`app/shell.jsx`) и встречается в **каждом** экране. Чтобы
не дублировать роутер, навигация сделана через глобальный коллбэк:
- `ProtoApp` в `useEffect` ставит `window.__htNav = (id) => setRoute(id === 'training' ? 'workouts' : id)`.
- `NavItem`/`AppShell` на клик вызывают `window.__htNav(routeId)`. Любая кнопка в экране может
  навигировать так же (напр. в профиле «Анализ тела» → `window.__htNav('body')`, «Перейти на
  Pro» → `'pricing'`; в рационе «Собрать список покупок» → `'nt-grocery'`).

> В вашем стеке это просто **роутер**: каждый `__htNav('x')` = переход на маршрут `x`. Список
> маршрутов — ниже.

### 2) Раскладка — режимы `flow` / `fixed` (`window.__htFlow`)
Десктоп-экраны бывают двух типов:
- **fixed** (только `chat`): высота = вьюпорт, своя внутренняя прокрутка ленты, композер
  закреплён снизу.
- **flow** (все остальные): длинная страница со **скроллом всей области** и **sticky-сайдбаром**.

`ProtoApp` вычисляет режим (`FIXED_ROUTES = {'chat'}`) и выставляет `window.__htFlow`. `AppShell`
читает флаг и в flow-режиме делает сайдбар `position: sticky; top: 0; height: calc(100vh - 52px)`,
а контент — естественной высоты. Вся область рендерится в контейнере
`position: fixed; top:0; bottom:52px; overflow-y:auto` (52px снизу — высота панели прототипа).

> В реальном приложении это решается обычным layout-каркасом: фикс-сайдбар + скроллируемый
> `<main>`. Режим `fixed` нужен только чату (приклеенный композер).

### 3) Нижняя панель «Прототип» — `ScenarioBar`
Служебный инструмент демонстрации (в проде не нужен). Слева — текущий экран; по центру для
экранов с состояниями — чипы переключения; справа «Все экраны» открывает попап со всеми
маршрутами по группам. Управляет `route` и объектом `states`.

---

## Маршруты (routes)
`ProtoApp` сопоставляет маршрут → экран:

| route | экран (компонент) | active в сайдбаре | режим |
|---|---|---|---|
| `chat` | `ProtoChat` (скриптовый чат) | Чат | fixed |
| `today` | `TodayScreen state=` | Сегодня | flow |
| `longevity` | `LongevityScreen state=` | Динамика | flow |
| `workouts` (`training`) | `WorkoutsScreen state=` | Тренировки | flow |
| `nutrition` | `NutritionScreen state=` | Питание | flow |
| `nt-meals` | `NutritionMealsScreen` | Питание | flow |
| `nt-week` | `WeekPlanScreen` | Питание | flow |
| `nt-grocery` | `GroceryScreen` (интеракт.) | Питание | flow |
| `nt-dietary` | `DietaryScreen` (интеракт.) | Питание | flow |
| `profile` | `ProfileScreen` | Профиль | flow |
| `body` | `BodyAnalysisScreen` | Профиль | flow |
| `pricing` | `PricingScreen` | — | flow |
| `limit` | `LimitReachedScreen` | Чат | flow |
| `onb-welcome/goal/done` | `OnboardingScreen step=` | — | flow |
| `consent` | `ConsentScreen` | — | flow |

Экраны с **состояниями** (управляются `states` в `ScenarioBar`):
- `today`: `partial | done | empty`
- `longevity`: `loading | sparse | error | partial | done`
- `workouts`: `loading | empty | error | done | video`
- `nutrition`: `loading | empty | error | done | recipe`

---

## Скриптовый чат — `ProtoChat` (стейт-машина)
Главный интерактив. Лента — массив `turns` (`useState`), каждый элемент:
`{ role:'user'|'coach', kind, ... }`. Без ИИ: ответы коуча — заранее заданные `kind`-узлы.

**Узлы коуча (`kind`)**: `typing` (индикатор «думает»), `text` (абзацы), `photoguide`
(карточка «нужно 3 фото»), `analyzing` (анализ фото), `bodyresult` (карточка оценки, флаг
`saved`), `savednote` (подтверждение записи в профиль), `proposal` (карточка-предложение,
поле `state`), `dietary` (CTA на черновик v9), `recipe` (две идеи блюд + CTA).

**Подсказки (чипы)** запускают ветки (`handleChip`):
- `body` → user-сообщение + `photoguide`.
- `dietary` → `dietary` (кнопка «Открыть черновик» → `__htNav('nt-dietary')`).
- `proposal` → `proposal` (state `proposed`).
- `recipe` → `recipe` (CTA → `__htNav('nutrition')`).

**Поток анализа тела (ключевой):**
1. Чип «Оцени моё тело по фото» → user-сообщение → коуч `photoguide` (через `sendCoach`,
   имитирует набор: вставляет `typing`, через ~600мс заменяет на узел).
2. В `photoguide` кнопки «Сделать фото»/«Загрузить» (`onShoot/onUpload`) → добавляют
   user-сообщение с 3 фото-плитками (`PhotoStripMsg`) и узел `analyzing`.
3. `useEffect` видит последний узел `analyzing` → через **~1800мс** заменяет его на
   `bodyresult` (имитация инференса модели).
4. В `bodyresult` (`BodyAnalysisCard`) «Сохранить в профиль» (`onSave`) → `saved=true` для
   этого узла, ставит `window.__htBodySaved=true` и добавляет `savednote`. «Открыть →»
   (`onOpen`) → `__htNav('body')`.

**Свободный ввод** в композере → user-сообщение + честный fallback коуча («это демо, выберите
сценарий»). Автоскролл ленты — через `ref` (`scrollTop = scrollHeight`), **не** `scrollIntoView`.

> При переносе: `turns` → состояние диалога; `sendCoach`/таймеры → ответы вашего бэкенда/
> стрима; `analyzing`-таймер → реальный запрос анализа фото; `bodyresult` данные → ответ модели.

---

## Интерактив на экранах (вне чата)
- **Сайдбар** (`AppShell`/`NavItem`): клик по пункту, по строке пользователя → навигация.
- **Профиль** (`app/profile.jsx`): карточка **«Анализ тела»** (клик → `body`), «Перейти на
  Pro» (→ `pricing`).
- **Body** (`app/body.jsx`): «Обновить по фото» → `chat`. `BodyAnalysisCard` принимает
  `saved/onSave/onOpen`.
- **Закупка** (`GroceryScreen`): локальный `useState` отмеченных позиций; клик по строке/
  чекбоксу — тогл, пересчёт счётчика «куплено M/N» и прогресса. Зачёркивание купленного.
- **Диетичнее** (`DietaryScreen`): `useState applied`; «Применить v9» → успех-баннер «план
  обновлён · v9», чип в шапке меняется на «применён», «Отменить» возвращает черновик,
  «Открыть рацион» → `nt-week`.
- **Рацион** (`WeekPlanScreen`): «Собрать список покупок» → `nt-grocery`.
- **Карточка-предложение** (`app/proposal.jsx`): пропсы `onAccept/onReject/onEdit/onUndo/
  onRestore`; состояния `proposed → accepted/rejected` управляются родителем (в чате —
  обновлением узла `proposal`).

---

## State Management (что переносить в стор/роутер)
- `route` — текущий экран (в проде = URL/маршрут). `__htNav(id)` = navigate(id).
- `states` — выбранное состояние для экранов с loading/error/empty/… (в проде это реальные
  статусы загрузки данных, а не ручной селектор).
- **Чат**: `turns[]` (роль + kind + payload), индикатор «думает», таймеры ответов и анализа.
- **Анализ тела**: `bodyAnalysis` { fatPct, muscleTone, weight?, strongGroups[], weakGroups[],
  muscleMap:{[group]:'strong'|'mid'|'weak'}, source:'chat', date }, флаг `savedToProfile`
  (в прототипе — `window.__htBodySaved`).
- **Закупка**: множество отмеченных позиций (выводится из рациона недели).
- **Диетичнее**: `applied` (применение бампит версию плана через общий механизм версий).
- **План/лимиты**: `plan: 'Free'|'Pro'`, дневной счётчик сообщений (Free=10) → при 0 экран
  `limit`.

---

## Design Tokens (кратко; полностью — в `app/kit.jsx` и базовом хэндоффе)
Два мира: **L** (светлый интерфейс) и **D** (тёмные карточки-«приборы»), общие метрики **M**.
```
FONT = "Helvetica Neue", Helvetica, "Segoe UI", system-ui, -apple-system, sans-serif
M.green #19c37d · amber #f5a524 · red #f0506a · blue #3a8dff · indigo #7b7bff
Карта мышц: strong→green / mid→amber / weak→red (заливка ~0.30, обводка — цвет)
Радиусы: chip 999 · кнопки 12 · карточки 14–16. Числа — tabular-nums.
Панель прототипа: высота 52px, тёмная (D.bg), z-index выше контента.
```

---

## Files (в пакете, папка `design/`)
- `design/prototype.html` — **точка входа прототипа** (монтирует `<ProtoApp/>`).
- **`design/app/proto.jsx`** — ⭐ контроллер: `ProtoApp` (маршруты, режимы, состояния),
  `ProtoChat` (скриптовый чат), `ScenarioBar` (нижняя панель «Все экраны» + состояния).
- `design/app/shell.jsx` — `AppShell`/`TopBar`/`NavItem`: кликабельный сайдбар + flow/fixed.
- `design/app/kit.jsx` — токены `L/D/M` + атомы (`Card, Btn, Chip, Ring, Icon, …`).
- `design/app/states.jsx` — `ChangeBanner, CoachNotes, MedicalNote, Loading/Error, MediaCard`.
- `design/app/chat.jsx` — атомы чата (`ChatScreen, UserMsg, CoachMsg, Para, ThinkingBlock`).
- `design/app/chat-body.jsx` — `PhotoGuide, PhotoStripMsg, PhotoThumb` (поток фото).
- `design/app/body.jsx` — `BodyAnalysisScreen, BodyComposition, MuscleMap, BodyFigure,
  BodyAnalysisCard`.
- `design/app/nutrition-detail.jsx` — `NutritionMealsScreen, WeekPlanScreen, GroceryScreen,
  DietaryScreen` (последние два интерактивны).
- `design/app/proposal.jsx` — `ProposalCard` (+ хэндлеры решений).
- `design/app/today.jsx, longevity.jsx, workouts.jsx, nutrition.jsx, logging.jsx,
  profile.jsx, onboarding.jsx, paywall.jsx` — остальные экраны/состояния.

### Как запустить локально
React/Babel — с CDN, `*.jsx` компилируются в браузере (прототип). Нужен статический сервер:
```
cd design && python3 -m http.server 8000
# открыть http://localhost:8000/prototype.html
```
> В проде: нормальная сборка, реальный роутер, замена заглушек (ответы коуча, анализ фото,
> загрузка данных) на API. In-browser Babel в продакшн не тащить.
