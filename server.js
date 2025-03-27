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
const ROOMS_FILE = path.join(DATA_DIR, 'rooms.json');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
const IMAGES_DIR = path.join(UPLOADS_DIR, 'images');

// Подготовка директорий
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log(`Создана директория: ${DATA_DIR}`);
}

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  console.log(`Создана директория: ${UPLOADS_DIR}`);
}

if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
  console.log(`Создана директория: ${IMAGES_DIR}`);
}

// Инициализация приложения
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
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

// База данных комнат
let rooms = {};
try {
  if (fs.existsSync(ROOMS_FILE)) {
    rooms = JSON.parse(fs.readFileSync(ROOMS_FILE, 'utf8'));
    console.log(`Загружено ${Object.keys(rooms).length} комнат`);
  } else {
    // Создаем общую комнату по умолчанию
    rooms = {
      general: {
        id: 'general',
        name: 'Общий чат',
        creator: 'system',
        createdAt: new Date().toISOString(),
        messages: []
      }
    };
    fs.writeFileSync(ROOMS_FILE, JSON.stringify(rooms, null, 2));
    console.log('Создан новый файл комнат с общим чатом');
  }
} catch (error) {
  console.error('Ошибка при загрузке данных комнат:', error);
  rooms = {
    general: {
      id: 'general',
      name: 'Общий чат',
      creator: 'system',
      createdAt: new Date().toISOString(),
      messages: []
    }
  };
}

// Активные пользователи
const activeUsers = new Map();

// Хеширование пароля
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Генерация ID
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

// Сохранение данных пользователей
function saveUsers() {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    console.log('Данные пользователей сохранены');
  } catch (error) {
    console.error('Ошибка при сохранении данных пользователей:', error);
  }
}

// Сохранение данных комнат
function saveRooms() {
  try {
    // Перед сохранением ограничиваем количество сообщений для каждой комнаты
    Object.values(rooms).forEach(room => {
      if (room.messages && room.messages.length > 100) {
        room.messages = room.messages.slice(-100);
      }
    });
    
    fs.writeFileSync(ROOMS_FILE, JSON.stringify(rooms, null, 2));
    console.log('Данные комнат сохранены');
  } catch (error) {
    console.error('Ошибка при сохранении данных комнат:', error);
  }
}

// Сохранение изображения
function saveImage(imageData) {
  try {
    // Получаем формат и данные изображения
    const matches = imageData.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      throw new Error('Неверный формат данных изображения');
    }

    const imageExtension = matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, 'base64');
    
    // Создаем уникальное имя файла
    const fileName = `${Date.now()}_${Math.floor(Math.random() * 10000)}.${imageExtension}`;
    const filePath = path.join(IMAGES_DIR, fileName);
    
    // Записываем файл
    fs.writeFileSync(filePath, buffer);
    console.log(`Изображение сохранено: ${filePath}`);
    
    // Возвращаем URL изображения
    return `/uploads/images/${fileName}`;
  } catch (error) {
    console.error('Ошибка при сохранении изображения:', error);
    return null;
  }
}

// Socket.IO
io.on('connection', (socket) => {
  console.log(`Новое соединение: ${socket.id}`);

  // Отправляем список комнат
  socket.emit('room_list', Object.values(rooms).map(room => ({
    id: room.id,
    name: room.name,
    creator: room.creator,
    createdAt: room.createdAt
  })));

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

      // Отправляем сообщение о входе в общий чат
      const systemMessage = {
        system: true,
        text: `${user.displayName} вошел в чат`,
        timestamp: Date.now(),
        roomId: 'general'
      };
      
      if (rooms.general) {
        rooms.general.messages.push(systemMessage);
      }
      
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

  // Присоединение к комнате
  socket.on('join_room', (roomId) => {
    if (!socket.user) {
      socket.emit('error', { message: 'Вы не авторизованы' });
      return;
    }

    // Проверяем существование комнаты
    if (!rooms[roomId]) {
      socket.emit('error', { message: 'Комната не найдена' });
      return;
    }

    // Присоединяемся к комнате
    socket.join(roomId);
    socket.currentRoom = roomId;

    console.log(`${socket.user.displayName} присоединился к комнате ${rooms[roomId].name}`);

    // Отправляем историю сообщений комнаты
    socket.emit('room_messages', {
      roomId,
      messages: rooms[roomId].messages || []
    });

    // Отправляем уведомление всем в комнате
    const joinMessage = {
      system: true,
      text: `${socket.user.displayName} присоединился к комнате`,
      timestamp: Date.now(),
      roomId
    };

    rooms[roomId].messages.push(joinMessage);
    io.to(roomId).emit('chat_message', joinMessage);
  });

  // Создание комнаты
  socket.on('create_room', (data) => {
    if (!socket.user) {
      socket.emit('error', { message: 'Вы не авторизованы' });
      return;
    }

    const { name } = data;
    if (!name || name.trim() === '') {
      socket.emit('error', { message: 'Необходимо указать название комнаты' });
      return;
    }

    // Создаем новую комнату
    const roomId = generateId();
    const newRoom = {
      id: roomId,
      name: name.trim(),
      creator: socket.user.username,
      createdAt: new Date().toISOString(),
      messages: []
    };

    // Добавляем комнату в базу
    rooms[roomId] = newRoom;
    saveRooms();

    // Отправляем обновленный список комнат всем пользователям
    io.emit('room_list', Object.values(rooms).map(room => ({
      id: room.id,
      name: room.name,
      creator: room.creator,
      createdAt: room.createdAt
    })));

    // Присоединяем создателя к комнате
    socket.join(roomId);
    socket.currentRoom = roomId;

    // Отправляем системное сообщение о создании комнаты
    const systemMessage = {
      system: true,
      text: `Комната "${name.trim()}" создана`,
      timestamp: Date.now(),
      roomId
    };

    rooms[roomId].messages.push(systemMessage);
    io.to(roomId).emit('chat_message', systemMessage);

    // Отправляем подтверждение создателю
    socket.emit('room_created', {
      success: true,
      room: {
        id: roomId,
        name: name.trim(),
        creator: socket.user.username,
        createdAt: new Date().toISOString()
      }
    });

    console.log(`Создана новая комната "${name.trim()}" (${roomId}) пользователем ${socket.user.displayName}`);
  });

  // Обработка сообщений
  socket.on('chat_message', (message) => {
    // Проверяем, авторизован ли пользователь
    if (!socket.user) {
      console.log('Попытка отправить сообщение неавторизованным пользователем');
      socket.emit('error', { message: 'Вы не авторизованы' });
      return;
    }

    // Определяем комнату
    const roomId = message.roomId || socket.currentRoom || 'general';
    
    // Проверяем существование комнаты
    if (!rooms[roomId]) {
      socket.emit('error', { message: 'Комната не найдена' });
      return;
    }

    // Обрабатываем изображение, если оно есть
    let imageUrl = null;
    if (message.image) {
      imageUrl = saveImage(message.image);
    }

    // Создаем объект сообщения
    const newMessage = {
      id: generateId(),
      text: message.text,
      username: socket.user.username,
      displayName: socket.user.displayName,
      timestamp: Date.now(),
      roomId,
      image: imageUrl
    };

    console.log(`Новое сообщение в комнате ${roomId} от ${socket.user.displayName}`);

    // Сохраняем сообщение
    if (!rooms[roomId].messages) {
      rooms[roomId].messages = [];
    }
    
    rooms[roomId].messages.push(newMessage);
    
    // Ограничиваем историю сообщений
    if (rooms[roomId].messages.length > 100) {
      rooms[roomId].messages.shift();
    }

    // Отправляем сообщение всем в комнате
    io.to(roomId).emit('chat_message', newMessage);
    
    // Периодически сохраняем историю
    if (rooms[roomId].messages.length % 10 === 0) {
      saveRooms();
    }
  });

  // Получение сообщений комнаты
  socket.on('get_room_messages', (roomId) => {
    if (!socket.user) {
      socket.emit('error', { message: 'Вы не авторизованы' });
      return;
    }

    if (!rooms[roomId]) {
      socket.emit('error', { message: 'Комната не найдена' });
      return;
    }

    socket.emit('room_messages', {
      roomId,
      messages: rooms[roomId].messages || []
    });
  });

  // Обработка удаления комнаты
  socket.on('delete_room', (data) => {
    const roomId = data.roomId;
    
    // Проверяем существование комнаты
    if (!rooms[roomId]) {
      socket.emit('room_deleted', { 
        success: false,
        message: 'Комната не найдена',
        roomId
      });
      return;
    }
    
    // Проверяем, что это не основная комната
    if (roomId === 'general') {
      socket.emit('room_deleted', { 
        success: false,
        message: 'Нельзя удалить основную комнату',
        roomId
      });
      return;
    }
    
    // Удаляем комнату
    const roomName = rooms[roomId].name;
    delete rooms[roomId];
    
    // Уведомляем всех пользователей об удалении комнаты
    io.emit('room_list', Object.values(rooms));
    
    // Отправляем системное сообщение
    const systemMessage = {
      system: true,
      text: `Комната "${roomName}" была удалена`,
      timestamp: Date.now()
    };
    
    io.emit('chat_message', systemMessage);
    
    // Отправляем подтверждение удаления комнаты
    socket.emit('room_deleted', { 
      success: true,
      message: 'Комната удалена',
      roomId
    });
    
    // Сохраняем обновленный список комнат
    saveRooms();
  });

  // Отключение пользователя
  socket.on('disconnect', () => {
    if (socket.user) {
      // Определяем текущую комнату
      const roomId = socket.currentRoom || 'general';
      
      // Удаляем из активных пользователей
      activeUsers.delete(socket.id);

      // Уведомляем всех об отключении
      if (rooms[roomId]) {
        const systemMessage = {
          system: true,
          text: `${socket.user.displayName} покинул чат`,
          timestamp: Date.now(),
          roomId
        };
        
        rooms[roomId].messages.push(systemMessage);
        io.to(roomId).emit('chat_message', systemMessage);
      }
      
      // Обновляем список пользователей
      io.emit('user_list', Array.from(activeUsers.values()));

      console.log(`Пользователь отключен: ${socket.user.username}`);
    } else {
      console.log(`Соединение закрыто: ${socket.id}`);
    }
  });
});

// Сохранение комнат раз в 5 минут
setInterval(saveRooms, 5 * 60 * 1000);

// Запуск сервера
server.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});

// Сохранение данных при выходе
process.on('SIGINT', () => {
  saveUsers();
  saveRooms();
  process.exit(0);
});

process.on('SIGTERM', () => {
  saveUsers();
  saveRooms();
  process.exit(0);
}); 