const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Порт берется из переменных окружения (Railway автоматически устанавливает PORT)
const PORT = process.env.PORT || 3000;
// Уменьшаем интервал очистки для Railway, так как он имеет ограниченный объем хранилища
const CLEANUP_INTERVAL = 1000 * 60 * 30; // Очистка каждые 30 минут
// Уменьшаем время хранения изображений
const IMAGE_MAX_AGE = 1000 * 60 * 60 * 12; // 12 часов для хостинга
const DEFAULT_MESSAGE_LIFETIME = 30000; // 30 секунд по умолчанию

// Получение URL хоста из переменных окружения Railway
const HOST_URL = process.env.RAILWAY_STATIC_URL || process.env.RAILWAY_PUBLIC_DOMAIN || 'localhost';

// Директория для хранения изображений
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');

// Директория для хранения пользовательских данных
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

// Создаем нужные директории с проверкой ошибок
try {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    console.log(`Создана директория для загрузок: ${UPLOADS_DIR}`);
  }

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log(`Создана директория для данных: ${DATA_DIR}`);
  }
} catch (error) {
  console.error('Ошибка при создании директорий:', error);
  // Продолжаем выполнение, так как Railway может иметь ограничения на запись в файловую систему
}

// Инициализация хранилища пользователей с обработкой ошибок
let userDatabase = {};
try {
  if (fs.existsSync(USERS_FILE)) {
    const userData = fs.readFileSync(USERS_FILE, 'utf8');
    userDatabase = JSON.parse(userData);
    console.log(`Загружено ${Object.keys(userDatabase).length} пользователей`);
  } else {
    // Создаем пустой файл пользователей
    fs.writeFileSync(USERS_FILE, JSON.stringify({}), 'utf8');
    console.log('Создан новый файл пользователей');
  }
} catch (error) {
  console.error(`Ошибка при работе с файлом пользователей: ${error.message}`);
  // Продолжаем с пустой базой пользователей
  userDatabase = {};
}

// Функция сохранения пользователей в файл с дополнительной обработкой ошибок для Railway
function saveUsers() {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(userDatabase), 'utf8');
    console.log('Данные пользователей сохранены');
  } catch (error) {
    console.error(`Ошибка при сохранении пользователей: ${error.message}`);
    // В случае ошибки записи на Railway, можно добавить механизм резервного копирования
  }
}

// Функция для хеширования пароля с солью
function hashPassword(password, salt = null) {
  // Если соль не предоставлена, генерируем новую
  if (!salt) {
    salt = crypto.randomBytes(16).toString('hex');
  }
  
  // Хешируем пароль с солью
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  
  // Возвращаем соль и хеш для сохранения
  return { salt, hash };
}

// Функция для проверки пароля
function verifyPassword(password, salt, storedHash) {
  const { hash } = hashPassword(password, salt);
  return hash === storedHash;
}

// Функция для регистрации нового пользователя
function registerUser(username, displayName, password) {
  // Проверка, существует ли пользователь
  if (userDatabase[username]) {
    return { success: false, message: 'Пользователь с таким логином уже существует' };
  }
  
  // Хешируем пароль
  const { salt, hash } = hashPassword(password);
  
  // Создаем запись о пользователе
  userDatabase[username] = {
    displayName,
    salt,
    hash,
    created: Date.now()
  };
  
  // Сохраняем обновленный список пользователей
  saveUsers();
  
  return { success: true, message: 'Регистрация успешна' };
}

// Функция для аутентификации пользователя
function authenticateUser(username, password) {
  // Проверка, существует ли пользователь
  if (!userDatabase[username]) {
    return { success: false, message: 'Пользователь не найден' };
  }
  
  // Получаем данные пользователя
  const user = userDatabase[username];
  
  // Проверяем пароль
  if (!verifyPassword(password, user.salt, user.hash)) {
    return { success: false, message: 'Неверный пароль' };
  }
  
  return { 
    success: true, 
    message: 'Авторизация успешна',
    displayName: user.displayName
  };
}

const app = express();

// Проверка на наличие заголовков от прокси (важно для Railway)
app.set('trust proxy', true);

// Расширенные настройки CORS для Railway
const corsOptions = {
  origin: ['https://' + HOST_URL, 'http://' + HOST_URL, '*'], // Разрешаем Railway домен и локальную разработку
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  credentials: true,
  maxAge: 86400 // 1 день кэширования preflight запросов
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Обработчик preflight запросов

// Увеличиваем лимит для JSON-данных
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Middleware для логирования запросов в формате для облачного хостинга
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} (IP: ${req.ip})`);
  next();
});

// Railway нуждается в проверке работоспособности для мониторинга
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    host: HOST_URL,
    uptime: process.uptime()
  });
});

const server = http.createServer(app);

// Настройки Socket.IO оптимизированные для Railway
const io = socketIo(server, {
  cors: {
    origin: ['https://' + HOST_URL, 'http://' + HOST_URL, '*'],
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
  },
  allowEIO3: true,
  pingTimeout: 30000, // Сокращаем таймаут для Railway
  pingInterval: 15000, // Сокращаем интервал пингов
  transports: ['polling', 'websocket'],
  path: '/socket.io/',
  maxHttpBufferSize: 1e6 // 1 MB максимум для сообщений (для изображений)
});

// Хранение данных
const messages = [];
const users = {}; // Хранит socketId -> username
const activeUsers = {}; // Хранит username -> { socketId, displayName }
const messageTimers = {}; // Для хранения таймеров удаления сообщений
const rooms = new Map(); // Хранение приватных комнат

// Класс для сообщений с расширенными атрибутами
class Message {
  constructor(id, user, text, timestamp, roomId = null, autoDelete = false, lifetime = DEFAULT_MESSAGE_LIFETIME, image = null, displayName = null) {
    this.id = id;
    this.user = user;
    this.text = text;
    this.timestamp = timestamp;
    this.roomId = roomId;
    this.autoDelete = autoDelete;
    this.lifetime = lifetime;
    this.image = image; // Добавляем поле для хранения изображения
    this.displayName = displayName; // Добавляем отображаемое имя
  }
}

// Класс для приватных комнат
class Room {
  constructor(id, name, creator) {
    this.id = id;
    this.name = name;
    this.creator = creator;
    this.members = new Set([creator]);
    this.messages = [];
    this.autoDeleteEnabled = true;
    this.messageLifetime = DEFAULT_MESSAGE_LIFETIME;
  }
}

// Функция для удаления сообщения из истории
function scheduleMessageDeletion(messageId, lifetime) {
  // Отменяем существующий таймер, если он есть
  if (messageTimers[messageId]) {
    clearTimeout(messageTimers[messageId]);
  }
  
  // Создаем новый таймер для удаления сообщения
  messageTimers[messageId] = setTimeout(() => {
    // Находим сообщение в общем чате
    const messageIndex = messages.findIndex(msg => msg.id === messageId);
    if (messageIndex !== -1) {
      // Если есть изображение, удаляем его файл
      const message = messages[messageIndex];
      if (message.image) {
        deleteImage(message.image);
      }
      
      messages.splice(messageIndex, 1);
      console.log(`Удалено сообщение с ID: ${messageId} из общего чата`);
    }
    
    // Ищем сообщение в комнатах
    rooms.forEach(room => {
      const roomMessageIndex = room.messages.findIndex(msg => msg.id === messageId);
      if (roomMessageIndex !== -1) {
        // Если есть изображение, удаляем его файл
        const message = room.messages[roomMessageIndex];
        if (message.image) {
          deleteImage(message.image);
        }
        
        room.messages.splice(roomMessageIndex, 1);
        console.log(`Удалено сообщение с ID: ${messageId} из комнаты ${room.name}`);
      }
    });
    
    // Удаляем таймер из хранилища
    delete messageTimers[messageId];
  }, lifetime || DEFAULT_MESSAGE_LIFETIME);
}

// Функция для удаления файла изображения
function deleteImage(imagePath) {
  // Проверяем, что это действительно путь к файлу, а не base64
  if (imagePath && imagePath.startsWith('/uploads/')) {
    try {
      const filePath = path.join(__dirname, 'public', imagePath);
      
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`Удален файл изображения: ${filePath}`);
      }
    } catch (error) {
      console.error(`Ошибка при удалении файла изображения ${imagePath}:`, error);
    }
  }
}

// Для отладки подключений
io.engine.on("connection_error", (err) => {
  console.log(`Ошибка подключения Socket.IO: ${err.code} - ${err.message}`);
});

io.on('connection', (socket) => {
  console.log(`Новое подключение: ${socket.id}`);

  // Отправляем тестовое сообщение при подключении
  socket.emit('connection-test', { status: 'connected', server_time: new Date().toISOString() });

  // Регистрация пользователя через старый метод (совместимость)
  socket.on('register', (username) => {
    users[socket.id] = username;
    activeUsers[username] = { socketId: socket.id, displayName: username };
    
    // Отправляем актуальные сообщения
    socket.emit('message-history', messages);
    
    io.emit('user-list', Object.values(activeUsers).map(u => u.displayName || u.username));
    
    // Создаем системное сообщение о подключении
    const systemMessageId = Date.now();
    const systemMessage = `${username} подключился к чату`;
    io.emit('system-message', systemMessage);
    
    console.log(`Пользователь ${username} зарегистрирован (упрощенный метод)`);
  });
  
  // Регистрация нового пользователя через пароль
  socket.on('register_user', (data) => {
    const { username, displayName, password } = data;
    
    if (!username || !displayName || !password) {
      socket.emit('registration_result', { 
        success: false, 
        message: 'Отсутствуют обязательные поля' 
      });
      return;
    }
    
    // Регистрируем пользователя
    const result = registerUser(username, displayName, password);
    
    if (result.success) {
      // Авторизуем пользователя после успешной регистрации
      users[socket.id] = username;
      activeUsers[username] = { socketId: socket.id, displayName };
      
      // Отправляем актуальные сообщения
      socket.emit('message-history', messages);
      
      // Обновляем список пользователей для всех
      io.emit('user-list', Object.values(activeUsers).map(u => u.displayName || u.username));
      
      // Создаем системное сообщение о подключении
      const systemMessage = `${displayName} подключился к чату`;
      io.emit('system-message', systemMessage);
      
      console.log(`Пользователь ${username} (${displayName}) зарегистрирован`);
    }
    
    // Отправляем результат регистрации
    socket.emit('registration_result', result);
  });
  
  // Аутентификация пользователя по паролю
  socket.on('authenticate', (data) => {
    const { username, password, displayName } = data;
    
    if (!username || !password) {
      socket.emit('auth_result', { 
        success: false, 
        message: 'Отсутствуют обязательные поля' 
      });
      return;
    }
    
    // Проверяем пользователя
    const authResult = authenticateUser(username, password);
    
    if (authResult.success) {
      // Авторизуем пользователя
      users[socket.id] = username;
      activeUsers[username] = { 
        socketId: socket.id, 
        displayName: authResult.displayName || displayName || username 
      };
      
      // Добавляем сведения о пользователе в результат
      authResult.username = username;
      authResult.displayName = activeUsers[username].displayName;
      
      // Отправляем актуальные сообщения
      socket.emit('message-history', messages);
      
      // Обновляем список пользователей для всех
      io.emit('user-list', Object.values(activeUsers).map(u => u.displayName || u.username));
      
      // Создаем системное сообщение о подключении
      const systemMessage = `${activeUsers[username].displayName} подключился к чату`;
      io.emit('system-message', systemMessage);
      
      console.log(`Пользователь ${username} (${activeUsers[username].displayName}) успешно авторизован`);
    } else {
      console.log(`Неудачная попытка авторизации для ${username}: ${authResult.message}`);
    }
    
    // Отправляем результат авторизации
    socket.emit('auth_result', authResult);
  });

  // Создание приватной комнаты
  socket.on('create_room', ({ roomId, roomName, creator }) => {
    if (rooms.has(roomId)) {
      socket.emit('error', { message: 'Комната с таким ID уже существует' });
      return;
    }

    const room = new Room(roomId, roomName, creator);
    rooms.set(roomId, room);
    
    // Присоединяем создателя к комнате
    socket.join(roomId);
    
    // Оповещаем всех о создании комнаты
    io.emit('room_created', { roomId, roomName, creator });
    
    console.log(`Создана новая комната: ${roomName} (ID: ${roomId})`);
  });

  // Присоединение к комнате
  socket.on('join_room', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) {
      socket.emit('error', { message: 'Комната не найдена' });
      return;
    }

    // Получаем имя пользователя
    const username = users[socket.id];
    if (!username) {
      socket.emit('error', { message: 'Вы не авторизованы' });
      return;
    }

    // Добавляем пользователя в комнату
    room.members.add(username);
    socket.join(roomId);
    
    // Отправляем историю сообщений комнаты используя специальное событие
    socket.emit('room_messages', room.messages);
    
    // Оповещаем всех участников комнаты о новом пользователе
    const displayName = activeUsers[username]?.displayName || username;
    io.to(roomId).emit('user_joined_room', { 
      username, 
      displayName,
      roomId, 
      roomName: room.name 
    });
    
    // Оповещаем присоединившегося пользователя
    socket.emit('room_joined', { roomId, roomName: room.name });
    
    console.log(`Пользователь ${username} (${displayName}) присоединился к комнате ${room.name}`);
  });

  // Выход из комнаты
  socket.on('leave_room', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) {
      socket.emit('error', { message: 'Комната не найдена' });
      return;
    }

    // Удаляем пользователя из комнаты
    const username = users[socket.id];
    room.members.delete(username);
    socket.leave(roomId);
    
    // Оповещаем всех участников комнаты о выходе пользователя
    io.to(roomId).emit('user_left_room', { 
      username, 
      roomId, 
      roomName: room.name 
    });
    
    // Оповещаем пользователя о выходе из комнаты
    socket.emit('room_left', { roomId, roomName: room.name });
    
    console.log(`Пользователь ${users[socket.id]} покинул комнату ${room.name}`);
  });

  // Удаление комнаты
  socket.on('delete_room', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) {
      socket.emit('error', { message: 'Комната не найдена' });
      return;
    }

    // Проверяем, является ли пользователь создателем комнаты
    if (room.creator !== users[socket.id]) {
      socket.emit('error', { message: 'У вас нет прав на удаление этой комнаты' });
      return;
    }

    // Оповещаем всех участников комнаты
    io.to(roomId).emit('room_deleted', { roomId, roomName: room.name });
    
    // Удаляем комнату
    rooms.delete(roomId);
    
    console.log(`Комната ${room.name} удалена пользователем ${users[socket.id]}`);
  });

  // Запрос сообщений общего чата
  socket.on('get_messages', () => {
    socket.emit('message-history', messages);
  });

  // Модифицированное получение сообщения
  socket.on('message', (messageData) => {
    const messageId = Date.now();
    const username = users[socket.id];
    
    if (!username) {
      socket.emit('error', { message: 'Пользователь не зарегистрирован' });
      return;
    }

    // Получаем отображаемое имя пользователя
    const displayName = activeUsers[username]?.displayName || username;
    
    let imagePath = null;

    // Проверяем размер сообщения с изображением
    if (messageData.hasImage && messageData.image) {
      const imageSizeInBytes = calculateBase64Size(messageData.image);
      const maxSizeInBytes = 1024 * 1024; // 1MB максимальный размер
      
      if (imageSizeInBytes > maxSizeInBytes) {
        socket.emit('error', { message: 'Изображение слишком большое. Максимальный размер 1MB' });
        return;
      }

      // Сохраняем изображение на диск
      try {
        imagePath = saveImage(messageData.image, messageId);
        console.log(`Изображение сохранено: ${imagePath}`);
      } catch (error) {
        console.error('Ошибка при сохранении изображения:', error);
        socket.emit('error', { message: 'Не удалось сохранить изображение' });
        return;
      }
    }

    // Создаем объект сообщения
    const message = new Message(
      messageId,
      username,
      messageData.text,
      new Date().toISOString(),
      messageData.roomId,
      false,
      DEFAULT_MESSAGE_LIFETIME,
      imagePath,
      displayName // Добавляем отображаемое имя
    );

    if (messageData.roomId) {
      // Сообщение для приватной комнаты
      const room = rooms.get(messageData.roomId);
      if (!room) {
        socket.emit('error', { message: 'Комната не найдена' });
        return;
      }

      if (!room.members.has(username)) {
        socket.emit('error', { message: 'Вы не являетесь участником этой комнаты' });
        return;
      }

      // Добавляем сообщение в историю комнаты
      room.messages.push(message);
      
      // Планируем удаление сообщения, если включено автоудаление в комнате
      if (room.autoDeleteEnabled) {
        scheduleMessageDeletion(messageId, room.messageLifetime);
      }

      // Отправляем сообщение только участникам комнаты
      io.to(messageData.roomId).emit('room_message', message);
    } else {
      // Сообщение для общего чата
      messages.push(message);
      io.emit('new-message', message);
    }
  });

  // Отключение пользователя
  socket.on('disconnect', () => {
    if (users[socket.id]) {
      const username = users[socket.id];
      const displayName = activeUsers[username]?.displayName || username;
      
      // Удаляем пользователя из всех комнат
      rooms.forEach((room, roomId) => {
        if (room.members.has(username)) {
          room.members.delete(username);
          io.to(roomId).emit('user_left_room', { 
            username, 
            displayName,
            roomId, 
            roomName: room.name 
          });
        }
      });
      
      // Создаем системное сообщение об отключении
      const systemMessage = `${displayName} покинул чат`;
      io.emit('system-message', systemMessage);
      
      // Удаляем пользователя из списков
      delete activeUsers[username];
      delete users[socket.id];
      
      // Обновляем список активных пользователей
      io.emit('user-list', Object.values(activeUsers).map(u => u.displayName || u.username));
    }
  });

  socket.on('user_left_room', ({ username, roomId, roomName }) => {
    // Оповещаем всех участников комнаты о выходе пользователя
    const room = rooms.get(roomId);
    const displayName = activeUsers[username]?.displayName || username;
    
    io.to(roomId).emit('user_left_room', { 
      username, 
      displayName,
      roomId, 
      roomName: room.name 
    });
    
    // Оповещаем пользователя о выходе из комнаты
    socket.emit('room_left', { roomId, roomName: room.name });
    
    console.log(`Пользователь ${username} (${displayName}) покинул комнату ${room.name}`);
  });
});

// Обработка SIGTERM и SIGINT для корректного завершения в Railway
['SIGTERM', 'SIGINT'].forEach(signal => {
  process.on(signal, () => {
    console.log(`Получен сигнал ${signal}, завершение работы...`);
    
    // Очищаем все таймеры удаления сообщений
    Object.values(messageTimers).forEach(timer => clearTimeout(timer));
    
    // Завершаем работу сервера
    server.close(() => {
      console.log('Сервер остановлен');
      process.exit(0);
    });
    
    // Устанавливаем таймаут для принудительного завершения,
    // если сервер не завершится корректно в течение 10 секунд
    setTimeout(() => {
      console.error('Принудительное завершение сервера после таймаута!');
      process.exit(1);
    }, 10000);
  });
});

// Запуск сервера с поддержкой Railway
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Сервер запущен на порту ${PORT}`);
  console.log(`Публичный URL: ${HOST_URL}`);
  console.log(`Время запуска: ${new Date().toISOString()}`);
  
  // Запускаем периодическую очистку старых изображений (важно для Railway)
  setInterval(cleanupOldImages, CLEANUP_INTERVAL);
  
  // Периодическое сохранение пользовательских данных
  setInterval(saveUsers, 1000 * 60 * 10); // Каждые 10 минут
});

// Расчет размера данных в base64
function calculateBase64Size(base64String) {
  // Удаляем заголовок data URL если он есть
  const base64 = base64String.indexOf(';base64,') !== -1 
    ? base64String.split(';base64,')[1] 
    : base64String;
  
  // Размер в байтах = (длина строки base64) * 3/4
  return Math.ceil(base64.length * 0.75);
}

// Функция для сохранения изображения, оптимизированная для Railway
function saveImage(base64Data, messageId) {
  try {
    // Генерируем уникальное имя файла
    const hash = crypto.createHash('md5').update(messageId.toString()).digest('hex');
    
    // Определяем формат файла из base64
    let fileExt = 'jpg';
    if (base64Data.includes('data:image/png')) {
      fileExt = 'png';
    } else if (base64Data.includes('data:image/gif')) {
      fileExt = 'gif';
    } else if (base64Data.includes('data:image/webp')) {
      fileExt = 'webp';
    }
    
    const fileName = `${hash}-${messageId}.${fileExt}`;
    const filePath = path.join(UPLOADS_DIR, fileName);
    
    // Конвертируем base64 в бинарные данные
    const base64Image = base64Data.split(';base64,').pop();
    const imageBuffer = Buffer.from(base64Image, 'base64');
    
    // Записываем файл на диск
    fs.writeFileSync(filePath, imageBuffer);
    
    // Возвращаем относительный путь для доступа через веб
    return `/uploads/${fileName}`;
  } catch (error) {
    console.error('Ошибка при сохранении изображения:', error);
    // В случае ошибки для Railway возвращаем null вместо выброса исключения
    return null;
  }
}

// Функция очистки старых изображений
function cleanupOldImages() {
  console.log('Запуск очистки старых изображений...');
  
  try {
    // Получаем список всех файлов в директории
    const files = fs.readdirSync(UPLOADS_DIR);
    const now = Date.now();
    let deletedCount = 0;
    
    // Проверяем каждый файл
    files.forEach(file => {
      const filePath = path.join(UPLOADS_DIR, file);
      
      try {
        // Получаем информацию о файле
        const stats = fs.statSync(filePath);
        const fileAge = now - stats.mtimeMs;
        
        // Удаляем файлы старше указанного возраста
        if (fileAge > IMAGE_MAX_AGE) {
          // Проверяем, используется ли файл в сообщениях
          const isInUse = checkImageInUse('/uploads/' + file);
          
          if (!isInUse) {
            fs.unlinkSync(filePath);
            deletedCount++;
            console.log(`Удален старый файл: ${file}, возраст: ${Math.round(fileAge / (1000 * 60 * 60))} часов`);
          }
        }
      } catch (error) {
        console.error(`Ошибка при обработке файла ${file}:`, error);
      }
    });
    
    console.log(`Очистка завершена. Удалено ${deletedCount} файлов.`);
  } catch (error) {
    console.error('Ошибка при очистке старых изображений:', error);
  }
}

// Проверка, используется ли изображение в сообщениях
function checkImageInUse(imagePath) {
  // Проверяем в общем чате
  const inMessages = messages.some(msg => msg.image === imagePath);
  if (inMessages) return true;
  
  // Проверяем в комнатах
  for (const [roomId, room] of rooms.entries()) {
    const inRoomMessages = room.messages.some(msg => msg.image === imagePath);
    if (inRoomMessages) return true;
  }
  
  return false;
} 