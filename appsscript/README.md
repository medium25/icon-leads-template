# Apps Script — приём кандидатов в леды-борд

Код тут — не часть сборки Vite. Живёт в Apps Script проекте, привязанном к
Google-таблице **«ICON VACATIONS»** (в таблице: Расширения → Apps Script).
Файлы здесь — источник правды и для code review; заливать в script.google.com
вручную (или `clasp push`).

Пишут напрямую в Firestore проекта `icon-hr-crm` через REST API +
сервис-аккаунт (Cloud Functions не используем — бесплатный Spark-план).

## Файлы

| Файл | Источник | Как берёт данные |
|---|---|---|
| `VacancyLeadsSync.gs` | лист **«CALL CENTRE»** (Instagram/Meta) | опрос раз в минуту, фиксированная раскладка колонок (`COLUMN_MAP` в файле) |
| `FormLeadsSync.gs` | **Google Form «ICON HR bo'limi»** → новый лист-ответов | триггер «при отправке формы», берёт **все** ответы: имя/телефон/вакансию по ключевым словам в заголовке, остальное → `formAnswers` |

Оба пишут документ в `students` с `funnelStage: 'new'`, `source: 'vacancy_form'`,
`branchId` из `DEFAULT_BRANCH_ID` → карточка попадает в первый столбец доски.

## Общие Script Properties (Настройки проекта → шестерёнка)

| Property | Значение |
|---|---|
| `FIRESTORE_PROJECT_ID` | `icon-hr-crm` |
| `SERVICE_ACCOUNT_JSON` | весь JSON-ключ сервис-аккаунта (роль Cloud Datastore User), одной строкой |
| `DEFAULT_BRANCH_ID` | `main` |
| `DEFAULT_OPERATOR_UID` | uid оператора в `staff/{uid}` — необязательно; без него `assignedOperator` пустой |

## Подключить Google Form (FormLeadsSync.gs)

1. Форма → вкладка «Ответы» → зелёная иконка Sheets → «Выбрать существующую
   таблицу» → «ICON VACATIONS». Появится новый лист с ответами.
2. Добавить `FormLeadsSync.gs` в тот же Apps Script проект.
3. Выбрать функцию `form_installTrigger` → Выполнить (один раз, даст доступ).
4. Отправить тестовую заявку через форму → карточка появляется на доске.

Добавить/убрать вопрос в форме — код менять не надо, новый столбец сам
попадёт в `formAnswers`. Вопрос про вакансию распознаётся, если в его тексте
есть `vakansiya` / `vazifa` / `lavozim` / `вакансия` / `должность` / `позиция`
(см. `VACANCY_HINTS`).
