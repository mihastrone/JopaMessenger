const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Порт берется из переменных окружения (для облачного хостинга)
const PORT = process.env.PORT || 3000;
const DEFAULT_MESSAGE_LIFETIME = 30000; // 30 секунд по умолчанию
const CLEANUP_INTERVAL = 1000 * 60 * 60; // Очистка каждый час
const IMAGE_MAX_AGE = 1000 * 60 * 60 * 24; // Максимальный возраст изображений - 24 часа

// Директория для хранения изображений
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');

// Создаем директорию, если она не существует
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  console.log(`Создана директория для загрузок: ${UPLOADS_DIR}`);
}

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

// Хранение данных
const messages = [];
const users = {};
const messageTimers = {}; // Для хранения таймеров удаления сообщений
const rooms = new Map(); // Хранение приватных комнат

// Класс для сообщений с расширенными атрибутами
class Message {
  constructor(id, user, text, timestamp, roomId = null, autoDelete = false, lifetime = DEFAULT_MESSAGE_LIFETIME, image = null) {
    this.id = id;
    this.user = user;
    this.text = text;
    this.timestamp = timestamp;
    this.roomId = roomId;
    this.autoDelete = autoDelete;
    this.lifetime = lifetime;
    this.image = image; // Добавляем поле для хранения изображения
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

    // Добавляем пользователя в комнату
    room.members.add(users[socket.id]);
    socket.join(roomId);
    
    // Отправляем историю сообщений комнаты
    socket.emit('room_messages', room.messages);
    
    // Оповещаем всех участников комнаты
    io.to(roomId).emit('room_joined', { roomId, roomName: room.name });
    
    console.log(`Пользователь ${users[socket.id]} присоединился к комнате ${room.name}`);
  });

  // Выход из комнаты
  socket.on('leave_room', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) {
      socket.emit('error', { message: 'Комната не найдена' });
      return;
    }

    // Удаляем пользователя из комнаты
    room.members.delete(users[socket.id]);
    socket.leave(roomId);
    
    // Оповещаем всех участников комнаты
    io.to(roomId).emit('room_left', { roomId, roomName: room.name });
    
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

  // Получение сообщения
  socket.on('message', (messageData) => {
    const messageId = Date.now();
    const username = users[socket.id];
    
    if (!username) {
      socket.emit('error', { message: 'Пользователь не зарегистрирован' });
      return;
    }

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
      imagePath // Сохраняем путь к изображению вместо base64
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
      
      // Удаляем пользователя из всех комнат
      rooms.forEach((room, roomId) => {
        if (room.members.has(username)) {
          room.members.delete(username);
          io.to(roomId).emit('room_left', { roomId, roomName: room.name });
        }
      });
      
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
  
  // Запускаем периодическую очистку старых изображений
  setInterval(cleanupOldImages, CLEANUP_INTERVAL);
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

// Функция для сохранения изображения на диск
function saveImage(base64Data, messageId) {
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