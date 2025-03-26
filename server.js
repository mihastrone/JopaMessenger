const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

// Порт берется из переменных окружения (для облачного хостинга)
const PORT = process.env.PORT || 3000;
const MESSAGE_LIFETIME = 30000; // 30 секунд

const app = express();

// Проверка на наличие заголовков от прокси
app.set('trust proxy', true);

// Настройки CORS для работы с разных источников
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  credentials: true
}));

// Обработчик OPTIONS запросов
app.options('*', cors());

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Middleware для логирования запросов
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Добавляем проверку работоспособности для облачного хостинга
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

const server = http.createServer(app);

// Настройки Socket.IO для облачного хостинга
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
  },
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['polling', 'websocket'],
  path: '/socket.io/'
});

// Хранение сообщений и активных пользователей
const messages = [];
const users = {};
const messageTimers = {}; // Для хранения таймеров удаления сообщений

// Функция для удаления сообщения из истории
function scheduleMessageDeletion(messageId) {
  // Отменяем существующий таймер, если он есть
  if (messageTimers[messageId]) {
    clearTimeout(messageTimers[messageId]);
  }
  
  // Создаем новый таймер для удаления сообщения
  messageTimers[messageId] = setTimeout(() => {
    // Находим индекс сообщения в массиве
    const messageIndex = messages.findIndex(msg => msg.id === messageId);
    
    // Если сообщение найдено, удаляем его
    if (messageIndex !== -1) {
      messages.splice(messageIndex, 1);
      console.log(`Удалено сообщение с ID: ${messageId}`);
    }
    
    // Удаляем таймер из хранилища
    delete messageTimers[messageId];
  }, MESSAGE_LIFETIME);
}

// Для отладки подключений
io.engine.on("connection_error", (err) => {
  console.log(`Ошибка подключения Socket.IO: ${err.code} - ${err.message}`);
});

io.on('connection', (socket) => {
  console.log(`Новое подключение: ${socket.id}`);

  // Отправляем тестовое сообщение при подключении
  socket.emit('connection-test', { status: 'connected', server_time: new Date().toISOString() });

  // Регистрация пользователя
  socket.on('register', (username) => {
    users[socket.id] = username;
    
    // Отправляем актуальные сообщения
    socket.emit('message-history', messages);
    
    io.emit('user-list', Object.values(users));
    
    // Создаем системное сообщение о подключении
    const systemMessageId = Date.now();
    const systemMessage = `${username} подключился к чату`;
    io.emit('system-message', systemMessage);
    
    console.log(`Пользователь ${username} зарегистрирован`);
  });

  // Получение сообщения
  socket.on('send-message', (messageData) => {
    const messageId = Date.now();
    const message = {
      id: messageId,
      user: users[socket.id],
      text: messageData.text,
      timestamp: new Date().toISOString()
    };
    
    // Добавляем сообщение в историю
    messages.push(message);
    
    // Планируем удаление этого сообщения
    scheduleMessageDeletion(messageId);
    
    // Отправляем сообщение всем клиентам
    io.emit('new-message', message);
  });

  // Отключение пользователя
  socket.on('disconnect', () => {
    if (users[socket.id]) {
      const username = users[socket.id];
      
      // Создаем системное сообщение об отключении
      const systemMessageId = Date.now();
      const systemMessage = `${username} покинул чат`;
      io.emit('system-message', systemMessage);
      
      delete users[socket.id];
      io.emit('user-list', Object.values(users));
    }
  });
});

// Очистка ресурсов при завершении работы
process.on('SIGINT', () => {
  console.log('Завершение работы сервера...');
  
  // Очищаем все таймеры удаления сообщений
  Object.values(messageTimers).forEach(timer => clearTimeout(timer));
  
  // Завершаем работу сервера
  server.close(() => {
    console.log('Сервер остановлен');
    process.exit(0);
  });
});

// Запуск сервера
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Сервер запущен на порту ${PORT}`);
  console.log(`Время запуска: ${new Date().toISOString()}`);
}); 