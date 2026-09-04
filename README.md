# Leads Board Template

Standalone доска лидов (канбан), вынесенная из ICON CRM. Каждый клиентский
проект — отдельная копия этого репозитория со своим Firebase-проектом.
Общего бэкенда/пакета между проектами нет — адаптация происходит
дублированием репозитория, не подключением библиотеки.

## Стек

React 19 + Vite + Firebase (Auth/Firestore) + react-router-dom + Tailwind CSS.

## Быстрый старт (новый клиентский проект)

1. Скопировать репозиторий (не форк — именно копия, новая история).
2. Создать новый Firebase-проект (console.firebase.google.com), включить
   Authentication → Email/Password и Firestore.
3. `cp .env.example .env`, заполнить `VITE_FB_*` ключами нового проекта
   (Project settings → General → Web app).
4. `npm install`
5. Задеплоить правила и индексы: `firebase deploy --only firestore` (после
   `firebase use --add` на новый проект).
6. Завести первого администратора: создать пользователя в Firebase Auth
   (email/password), затем документ `staff/{uid}` в Firestore вручную —
   `{ fullName, phone, email, role: 'ceo', branchIds: ['main'], isActive: true }`.
7. `npm run dev` — проверить локально, `npm run deploy` — выложить на
   GitHub Pages (см. `package.json`, использует `gh-pages`).

Без реального Firebase-проекта под рукой можно погонять UI сразу:
`VITE_DEV_BYPASS_AUTH=true` в `.env` подставляет синтетического
пользователя (роль — `VITE_DEV_BYPASS_ROLE`, по умолчанию `ceo`). Никогда
не включать это в деплое.

## Схема Firestore

Коллекции, которые использует доска лидов (полный список — `firestore.rules`):

- `staff/{uid}` — `{ fullName, phone, email, role, branchIds[], teacherId?, isActive }`.
  `role` ∈ `ceo | manager | admin | teacher`.
- `branches/{id}` — `{ name }`. Филиал/точка.
- `courses/{id}` — `{ name }`. Для выпадающих списков в модалках записи на пробный/группу.
- `groups/{id}` — `{ branchId, courseId, code, ... }`.
- `students/{id}` — лиды и студенты в одной коллекции, стадия — `funnelStage`
  (см. `src/lib/leadFunnel.js` за списком стадий и переходов).
- `enrollments/{id}` — `{ studentId, groupId, status, branchId, isArchived }`.
- `settings/{branchId}` — настройки филиала (дедлайны стадий, чек-лист лида
  и т.д., см. `src/lib/leadChecklist.js`, `src/lib/leadFunnel.js`).
- `comments/{id}` — `{ entityType: 'lead', entityId, text, authorId, createdAt }`.
- `callLogs/{id}` — история звонков по лиду.

## Адаптация под новый проект

- Бренд: `public/favicon.svg`, `public/icon-*.png` (лого в сайдбаре не
  используется — там текстовый заголовок), `<title>` в `index.html`,
  заголовок на `src/pages/LoginPage.jsx`.
- Код страны телефона: захардкожен `998` (Узбекистан) в
  `src/pages/LoginPage.jsx` (`login(\`998${phone}\`, password)`) и
  `src/lib/auth.js` — поменять под нужную страну или сделать полем ввода.
- Стадии воронки/пункты меню: `src/lib/leadFunnel.js`,
  `src/components/layout/Sidebar.jsx`.
- Цвета/тема: CSS-переменные в `tailwind.config.js` + `src/index.css`.

## Команды

```bash
npm run dev       # локальная разработка
npm run build     # прод-сборка
npm run lint      # oxlint
npm run deploy    # build + публикация на GitHub Pages
```
