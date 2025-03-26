# Jopa Messenger

Современный мессенджер с аутентификацией пользователей и приватными комнатами.

## Особенности

- Аутентификация пользователей с хешированием паролей
- Публичный общий чат
- Создание приватных комнат
- Обмен сообщениями и изображениями
- Автоудаление сообщений в приватных комнатах
- Темная и светлая тема интерфейса

## Технологии

- Frontend: HTML, CSS, JavaScript (ванильный)
- Backend: Node.js, Express
- Realtime коммуникация: Socket.IO
- Хранение данных: Файловая система (JSON)

## Установка и запуск

### Локальная разработка

1. Клонируйте репозиторий:
```
git clone https://your-repository-url.git
cd jopa-messenger
```

2. Установите зависимости:
```
npm install
```

3. Запустите сервер:
```
npm start
```

4. Для разработки с автоматической перезагрузкой:
```
npm run dev
```

5. Откройте браузер и перейдите по адресу: `http://localhost:3000`

### Деплой на Railway

1. Создайте аккаунт на [Railway.app](https://railway.app)

2. Установите Railway CLI:
```
npm i -g @railway/cli
```

3. Войдите в аккаунт:
```
railway login
```

4. Инициализируйте проект:
```
railway init
```

5. Разместите проект на Railway:
```
railway up
```

Или используйте автоматический деплой:

1. Подключите репозиторий в интерфейсе Railway
2. Выберите ветку для деплоя
3. Добавьте необходимые переменные окружения:
   - `PORT`: оставьте пустым или установите значение (Railway автоматически назначит порт)

## Оптимизация для Railway

Данное приложение оптимизировано для хостинга на Railway:

- Обработка изображений с низким качеством для экономии трафика
- Эффективное использование памяти
- Обработка перезапусков и масштабирования
- Периодическая очистка временных файлов
- Периодическое сохранение данных пользователей

## Лицензия

MIT 