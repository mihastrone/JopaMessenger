# Jopa Messenger

Онлайн-мессенджер с быстрым обменом сообщениями и автоудалением через 30 секунд.

## Возможности

- Обмен сообщениями в реальном времени
- Автоудаление сообщений через 30 секунд с анимацией
- Список активных пользователей
- Поддержка облачного хостинга
- Адаптивный дизайн

## Локальная разработка

### Требования

- [Node.js](https://nodejs.org/) (версия 14.x или выше)
- npm (входит в установку Node.js)

### Установка

```bash
# Клонировать репозиторий
git clone https://github.com/yourusername/jopa-messenger.git
cd jopa-messenger

# Установить зависимости
npm install

# Запустить сервер разработки
npm run dev
```

После запуска сервер будет доступен по адресу http://localhost:3000

## Деплой в облако

### Railway

1. Создайте аккаунт на [Railway](https://railway.app/)
2. Подключите ваш GitHub репозиторий
3. Выберите этот проект и нажмите Deploy
4. Railway автоматически определит, что это Node.js проект

### Render

1. Создайте аккаунт на [Render](https://render.com/)
2. Создайте новый Web Service
3. Подключите ваш GitHub репозиторий
4. Настройки:
   - Build Command: `npm install`
   - Start Command: `npm start`

### Heroku

1. Создайте аккаунт на [Heroku](https://heroku.com/)
2. Установите [Heroku CLI](https://devcenter.heroku.com/articles/heroku-cli)
3. Войдите в систему и выполните:

```bash
# Войти в систему
heroku login

# Создать приложение
heroku create jopa-messenger

# Загрузить код
git push heroku main

# Открыть приложение
heroku open
```

## Использование

1. Откройте сайт в браузере
2. Введите ваше имя
3. Начните общение!

Все сообщения автоматически удаляются через 30 секунд.

## Лицензия

MIT 