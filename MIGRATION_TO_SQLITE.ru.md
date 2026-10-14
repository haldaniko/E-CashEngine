# Перенос production с PostgreSQL на `db.sqlite3`

Новая версия хранит рабочую базу в `db.sqlite3`, а загруженные обложки в `media/` **в корне проекта на Linux-хосте**. Обычный `docker compose -f docker-compose.prod.yml up --build -d` запускает импорт перед backend, если `db.sqlite3` ещё нет. После успешного импорта эта же команда не перезаписывает данные.

## Первый переход на сервере

Команды выполняются из каталога проекта. Перед обновлением кода узнайте имя старого Compose project и проверьте volumes:

```bash
docker compose ls
export PROJECT=ИМЯ_ПРОЕКТА_ИЗ_ВЫВОДА
docker volume inspect "${PROJECT}_ecashengine_prod_postgres_data" "${PROJECT}_ecashengine_prod_uploads" >/dev/null
```

Если volumes не найдены, выясните прежнее имя проекта до продолжения. Compose с другим именем создаст новые пустые volumes.

Остановите старые веб-контейнеры, чтобы база и файлы не менялись во время снимка:

```bash
docker compose -p "$PROJECT" --env-file .env.production -f docker-compose.prod.yml stop backend frontend
```

Сохраните резервные копии за пределами проекта:

```bash
export BACKUP_DIR="../ecash-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
docker compose -p "$PROJECT" --env-file .env.production -f docker-compose.prod.yml exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$BACKUP_DIR/postgres.dump"
docker run --rm -v "${PROJECT}_ecashengine_prod_uploads:/source:ro" alpine tar -C /source -czf - . > "$BACKUP_DIR/media.tar.gz"
test -s "$BACKUP_DIR/postgres.dump" && test -s "$BACKUP_DIR/media.tar.gz"
```

Разверните обновлённый код, сохранив существующие `.env.production` и `backend/.env.production`. Для запуска Compose **без `--env-file`** один раз подготовьте корневой `.env`:

```bash
cp .env.production .env
docker volume inspect "${PROJECT}_ecashengine_prod_postgres_data" "${PROJECT}_ecashengine_prod_uploads" >/dev/null
docker compose -p "$PROJECT" -f docker-compose.prod.yml up --build -d
```

Если корневой `.env` уже содержит нужные production-переменные, копирование не требуется. Не заменяйте его без предварительной проверки. В корне проекта не должно быть случайного `db.sqlite3`: при наличии этого файла импорт пропускается.

Чтобы последующие команды были **буквально** `docker compose -f docker-compose.prod.yml up --build -d` без `-p`, запускайте их из каталога с тем же именем Compose project. Если старый проект запускался с `-p` или имя каталога изменилось, сохраняйте `-p "$PROJECT"` в команде: это необходимо для подключения именно старых volumes.

Compose поднимет старый PostgreSQL, запустит `import-legacy-data` и дождётся успешного завершения до запуска backend. Импорт переносит пользователей, refresh tokens, статьи, настройки, события аудита и подписчиков с прежними ID и датами. Из старого uploads volume копируются все обычные файлы. Существующие файлы в `media/` не перезаписываются; конфликт содержимого завершает импорт ошибкой. Готовая база появляется как `db.sqlite3` только после проверок целостности и ссылок на загруженные обложки.

Проверьте результат:

```bash
docker compose -p "$PROJECT" -f docker-compose.prod.yml ps -a
docker compose -p "$PROJECT" -f docker-compose.prod.yml logs import-legacy-data backend
test -s db.sqlite3 && test -d media
find media -type f | wc -l
curl -f http://127.0.0.1:4105/api/health
curl -f http://127.0.0.1:4105/api/posts
```

Если импорт завершился ошибкой, backend не должен стартовать. Посмотрите `logs import-legacy-data`, исправьте причину и повторите `up`. При прерванном импорте может остаться `.db.sqlite3.importing`; проверьте этот временный файл и удалите **только его** перед повтором. Старые volumes и резервные копии сохраняются.

## Дальнейшие обновления

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

Backend после импорта читает и пишет только `db.sqlite3` и `media/` на хосте. Контейнер PostgreSQL остаётся в Compose как источник для одноразового импорта, но приложение к нему больше не обращается. Не запускайте `docker compose down -v`, пока не проверены данные и резервные копии. При отсутствии `db.sqlite3` production backend не создаёт пустую базу.

Для дальнейших резервных копий сохраняйте `db.sqlite3` и `media/` вместе. При активных записях делайте консистентный снимок SQLite через SQLite backup API или кратко останавливайте backend перед копированием файла.
