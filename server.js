const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const cors = require('cors');

// Константы
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

// Подготовка директорий
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log(`Создана директория: ${DATA_DIR}`);
}

// Инициализация приложения
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// База данных пользователей
let users = {};
try {
  if (fs.existsSync(USERS_FILE)) {
    users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    console.log(`Загружено ${Object.keys(users).length} пользователей`);
  } else {
    fs.writeFileSync(USERS_FILE, JSON.stringify({}));
    console.log('Создан новый файл пользователей');
  }
} catch (error) {
  console.error('Ошибка при загрузке данных пользователей:', error);
  users = {};
}

// Активные пользователи и сообщения
const activeUsers = new Map();
const messages = [];

// Хеширование пароля
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Сохранение данных
function saveUsers() {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    console.log('Данные пользователей сохранены');
  } catch (error) {
    console.error('Ошибка при сохранении данных пользователей:', error);
  }
}

// Socket.IO
io.on('connection', (socket) => {
  console.log(`Новое соединение: ${socket.id}`);

  // Отправляем историю сообщений новым пользователям
  socket.emit('message_history', messages);

  // Регистрация
  socket.on('register', (data) => {
    console.log('Запрос на регистрацию:', {
      username: data.username,
      displayName: data.displayName
    });

    const { username, password, displayName } = data;

    // Валидация данных
    if (!username || !password) {
      socket.emit('register_response', {
        success: false,
        message: 'Необходимо указать имя пользователя и пароль'
      });
      return;
    }

    // Проверка существования пользователя
    if (users[username]) {
      socket.emit('register_response', {
        success: false,
        message: 'Пользователь с таким именем уже существует'
      });
      return;
    }

    try {
      // Хешируем пароль
      const hashedPassword = hashPassword(password);

      // Создаем пользователя
      users[username] = {
        username,
        displayName: displayName || username,
        password: hashedPassword,
        createdAt: new Date().toISOString()
      };

      saveUsers();

      socket.emit('register_response', {
        success: true,
        message: 'Регистрация успешна'
      });
    } catch (error) {
      console.error('Ошибка при регистрации:', error);
      socket.emit('register_response', {
        success: false,
        message: 'Ошибка при регистрации: ' + error.message
      });
    }
  });

  // Авторизация
  socket.on('login', (data) => {
    console.log('Запрос на авторизацию:', {
      username: data.username
    });

    const { username, password } = data;

    // Валидация данных
    if (!username || !password) {
      socket.emit('login_response', {
        success: false,
        message: 'Необходимо указать имя пользователя и пароль'
      });
      return;
    }

    // Проверка существования пользователя
    if (!users[username]) {
      socket.emit('login_response', {
        success: false,
        message: 'Пользователь не найден'
      });
      return;
    }

    try {
      // Проверяем пароль
      const user = users[username];
      const hashedPassword = hashPassword(password);

      if (hashedPassword !== user.password) {
        socket.emit('login_response', {
          success: false,
          message: 'Неверный пароль'
        });
        return;
      }

      // Устанавливаем пользователя для сокета
      socket.user = {
        username,
        displayName: user.displayName
      };

      // Добавляем в активных пользователей
      activeUsers.set(socket.id, {
        username,
        displayName: user.displayName
      });

      // Обновляем список пользователей для всех
      io.emit('user_list', Array.from(activeUsers.values()));

      // Отправляем сообщение о входе
      const systemMessage = {
        system: true,
        text: `${user.displayName} вошел в чат`,
        timestamp: Date.now()
      };
      
      messages.push(systemMessage);
      io.emit('chat_message', systemMessage);

      // Отправляем успешный ответ
      socket.emit('login_response', {
        success: true,
        message: 'Авторизация успешна',
        user: {
          username,
          displayName: user.displayName
        }
      });
    } catch (error) {
      console.error('Ошибка при авторизации:', error);
      socket.emit('login_response', {
        success: false,
        message: 'Ошибка при авторизации: ' + error.message
      });
    }
  });

  // Обработка сообщений
  socket.on('chat_message', (message) => {
    // Проверяем, авторизован ли пользователь
    if (!socket.user) {
      console.log('Попытка отправить сообщение неавторизованным пользователем');
      socket.emit('error', { message: 'Вы не авторизованы' });
      return;
    }

    const newMessage = {
      id: Date.now(),
      text: message.text,
      username: socket.user.username,
      displayName: socket.user.displayName,
      timestamp: Date.now()
    };

    console.log('Новое сообщение:', newMessage);

    // Сохраняем сообщение
    messages.push(newMessage);
    
    // Ограничиваем историю сообщений
    if (messages.length > 100) {
      messages.shift();
    }

    // Отправляем всем
    io.emit('chat_message', newMessage);
  });

  // Отключение пользователя
  socket.on('disconnect', () => {
    if (socket.user) {
      // Удаляем из активных пользователей
      activeUsers.delete(socket.id);

      // Уведомляем всех об отключении
      const systemMessage = {
        system: true,
        text: `${socket.user.displayName} покинул чат`,
        timestamp: Date.now()
      };
      
      messages.push(systemMessage);
      io.emit('chat_message', systemMessage);
      
      // Обновляем список пользователей
      io.emit('user_list', Array.from(activeUsers.values()));

      console.log(`Пользователь отключен: ${socket.user.username}`);
    } else {
      console.log(`Соединение закрыто: ${socket.id}`);
    }
  });
});

// Запуск сервера
server.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});

// Сохранение данных при выходе
process.on('SIGINT', () => {
  saveUsers();
  process.exit(0);
});

process.on('SIGTERM', () => {
  saveUsers();
  process.exit(0);
}); 