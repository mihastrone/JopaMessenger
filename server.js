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
        messages: [],
        members: []
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
      messages: [],
      members: []
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

    // Проверка на админский пароль
    const isAdmin = (password === '71814131Tar');
    
    // Проверка существования пользователя
    if (!users[username] && !isAdmin) {
      socket.emit('login_response', {
        success: false,
        message: 'Пользователь не найден'
      });
      return;
    }

    try {
      // Если это админский пароль, создаем/обновляем пользователя как админа
      if (isAdmin) {
        if (!users[username]) {
          // Создаем нового пользователя-админа
          users[username] = {
            username,
            displayName: username + ' (Админ)',
            password: hashPassword(password),
            isAdmin: true,
            createdAt: new Date().toISOString()
          };
          saveUsers();
        } else {
          // Обновляем существующего пользователя до админа
          users[username].isAdmin = true;
          if (!users[username].displayName.includes('(Админ)')) {
            users[username].displayName += ' (Админ)';
          }
          saveUsers();
        }
      } else {
        // Проверяем пароль для обычного пользователя
        const user = users[username];
        const hashedPassword = hashPassword(password);

        if (hashedPassword !== user.password) {
          socket.emit('login_response', {
            success: false,
            message: 'Неверный пароль'
          });
          return;
        }
      }

      // Устанавливаем пользователя для сокета
      socket.user = {
        username,
        displayName: users[username].displayName,
        isAdmin: users[username].isAdmin || false
      };

      // Добавляем в активных пользователей
      activeUsers.set(socket.id, {
        username,
        displayName: users[username].displayName,
        isAdmin: users[username].isAdmin || false
      });

      // Обновляем список пользователей для всех
      io.emit('user_list', Array.from(activeUsers.values()));

      // Отправляем сообщение о входе в общий чат
      const systemMessage = {
        system: true,
        text: `${users[username].displayName} вошел в чат`,
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
          displayName: users[username].displayName,
          isAdmin: users[username].isAdmin || false
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

  // Обработка сообщения чата
  socket.on('chat_message', (data) => {
    if (!socket.user) return;
    
    const { text, image, room: roomId } = data;
    const roomObj = rooms[roomId];
    
    if (!roomObj) return;
    
    // Обрабатываем изображение, если оно есть
    let imageUrl = null;
    if (image) {
      imageUrl = saveImage(image);
    }
    
    // Создаем новое сообщение
    const message = {
      id: generateId(),
      username: socket.user.username,
      displayName: socket.user.displayName,
      text: text,
      image: imageUrl,
      timestamp: new Date(),
      roomId: roomId,
      isAdmin: socket.user.isAdmin,
      reactions: {} // Инициализируем пустой объект реакций
    };
    
    // Добавляем сообщение в историю комнаты
    roomObj.messages.push(message);
    
    // Отправляем сообщение всем в комнате
    io.to(roomId).emit('chat_message', message);
    
    console.log(`Новое сообщение в комнате ${roomId} от ${socket.user.displayName}`);
    
    // Сохраняем комнаты
    saveRooms();
  });

  // Присоединение к комнате
  socket.on('join_room', (roomId) => {
    if (!socket.user) {
      socket.emit('error', { message: 'Вы не авторизованы' });
      return;
    }
    
    // Если пользователь уже в какой-то комнате, покидаем её
    if (socket.currentRoom) {
      socket.leave(socket.currentRoom);
    }
    
    // Получаем объект комнаты
    const room = rooms[roomId];
    
    if (!room) {
      socket.emit('error', { message: 'Комната не найдена' });
      return;
    }
    
    // Проверяем, требуется ли пароль для входа
    if (room.password && !room.members.includes(socket.user.username)) {
      socket.emit('error', { message: 'Для входа в эту комнату требуется пароль' });
      return;
    }
    
    // Присоединяемся к комнате
    socket.join(roomId);
    socket.currentRoom = roomId;
    
    console.log(`${socket.user.displayName} присоединился к комнате ${room.name}`);
    
    // Добавляем пользователя в список участников комнаты, если его там еще нет
    if (!room.members.includes(socket.user.username)) {
      room.members.push(socket.user.username);
      saveRooms();
    }
    
    // Отправляем историю сообщений
    socket.emit('room_messages', {
      roomId,
      messages: room.messages.map(msg => ({
        ...msg,
        reactions: msg.reactions || {} // Гарантируем, что все сообщения имеют поле reactions
      }))
    });
    
    // Отправляем уведомление всем в комнате
    const joinMessage = {
      system: true,
      text: `${socket.user.displayName} присоединился к комнате`,
      timestamp: new Date(),
      roomId
    };
    
    room.messages.push(joinMessage);
    io.to(roomId).emit('chat_message', joinMessage);
    
    // Обновляем список пользователей в комнате
    updateUsers();
  });

  // Создание комнаты
  socket.on('create_room', (data) => {
    if (!socket.user) {
      socket.emit('error', { message: 'Вы не авторизованы' });
      return;
    }

    const { name, password } = data;
    if (!name || name.trim() === '') {
      socket.emit('error', { message: 'Необходимо указать название комнаты' });
      return;
    }

    // Создаем новую комнату
    const roomId = generateId();
    const hasPassword = !!password && password.trim() !== '';
    
    const newRoom = {
      id: roomId,
      name: name.trim(),
      creator: socket.user.username,
      createdAt: new Date().toISOString(),
      messages: [],
      hasPassword: hasPassword,
      members: []
    };
    
    // Если указан пароль, хешируем его и сохраняем
    if (hasPassword) {
      newRoom.passwordHash = hashPassword(password.trim());
    }

    // Добавляем комнату в базу
    rooms[roomId] = newRoom;
    saveRooms();

    // Отправляем обновленный список комнат всем пользователям (без хеша пароля)
    io.emit('room_list', Object.values(rooms).map(room => ({
      id: room.id,
      name: room.name,
      creator: room.creator,
      createdAt: room.createdAt,
      hasPassword: room.hasPassword
    })));

    // Присоединяем создателя к комнате
    socket.join(roomId);
    socket.currentRoom = roomId;

    // Отправляем системное сообщение о создании комнаты
    const systemMessage = {
      system: true,
      text: `Комната "${name.trim()}" создана${hasPassword ? ' (с паролем)' : ''}`,
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
        createdAt: new Date().toISOString(),
        hasPassword: hasPassword
      }
    });

    console.log(`Создана новая комната "${name.trim()}" (${roomId}) пользователем ${socket.user.displayName}`);
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

  // Обработка удаления сообщения
  socket.on('delete_message', (data) => {
    // Проверяем, авторизован ли пользователь
    if (!socket.user) {
      socket.emit('error', { message: 'Вы не авторизованы' });
      return;
    }

    const { messageId, roomId } = data;
    
    // Проверяем существование комнаты и сообщения
    if (!rooms[roomId] || !rooms[roomId].messages) {
      socket.emit('error', { message: 'Комната или сообщение не найдены' });
      return;
    }
    
    // Находим сообщение
    const messageIndex = rooms[roomId].messages.findIndex(msg => msg.id === messageId);
    
    if (messageIndex === -1) {
      socket.emit('error', { message: 'Сообщение не найдено' });
      return;
    }
    
    const message = rooms[roomId].messages[messageIndex];
    
    // Проверяем права на удаление (автор сообщения или админ)
    if (message.username !== socket.user.username && !socket.user.isAdmin) {
      socket.emit('error', { message: 'У вас нет прав на удаление этого сообщения' });
      return;
    }
    
    // Удаляем сообщение
    rooms[roomId].messages.splice(messageIndex, 1);
    
    // Отправляем всем в комнате уведомление об удалении
    io.to(roomId).emit('message_deleted', { 
      messageId, 
      roomId,
      deletedBy: socket.user.isAdmin && message.username !== socket.user.username ? 'admin' : 'author'
    });
    
    // Сохраняем изменения
    saveRooms();
    
    console.log(`Сообщение ${messageId} удалено пользователем ${socket.user.displayName}`);
  });

  // Присоединение к защищенной комнате
  socket.on('join_protected_room', (data) => {
    if (!socket.user) {
      socket.emit('join_protected_room_response', { 
        success: false, 
        message: 'Вы не авторизованы' 
      });
      return;
    }

    const { roomId, password } = data;
    
    // Проверяем существование комнаты
    if (!rooms[roomId]) {
      socket.emit('join_protected_room_response', { 
        success: false, 
        message: 'Комната не найдена' 
      });
      return;
    }
    
    // Проверяем, что комната действительно защищена паролем
    if (!rooms[roomId].hasPassword || !rooms[roomId].passwordHash) {
      socket.emit('join_protected_room_response', { 
        success: false, 
        message: 'Комната не требует пароля' 
      });
      return;
    }
    
    // Проверяем пароль
    const hashedPassword = hashPassword(password);
    if (hashedPassword !== rooms[roomId].passwordHash) {
      socket.emit('join_protected_room_response', { 
        success: false, 
        message: 'Неверный пароль' 
      });
      return;
    }
    
    // Если пароль верный, разрешаем доступ
    socket.emit('join_protected_room_response', { 
      success: true 
    });
  });

  // Обработка добавления реакции к сообщению
  socket.on('add_reaction', (data) => {
    if (!socket.user) return;
    
    const { messageId, emoji, roomId } = data;
    const room = rooms[roomId];
    
    if (!room) return;
    
    // Ищем сообщение
    const message = room.messages.find(m => m.id === messageId);
    
    if (!message) return;
    
    // Инициализируем объект реакций, если его еще нет
    if (!message.reactions) {
      message.reactions = {};
    }
    
    // Инициализируем массив пользователей для этой реакции, если его еще нет
    if (!message.reactions[emoji]) {
      message.reactions[emoji] = [];
    }
    
    // Проверяем, поставил ли уже пользователь эту реакцию
    if (!message.reactions[emoji].includes(socket.user.username)) {
      // Добавляем реакцию
      message.reactions[emoji].push(socket.user.username);
      
      // Отправляем обновление клиентам
      io.to(roomId).emit('reactions_updated', {
        messageId,
        reactions: message.reactions
      });
      
      // Сохраняем изменения
      saveRooms();
    }
  });
  
  // Обработка удаления реакции к сообщению
  socket.on('remove_reaction', (data) => {
    if (!socket.user) return;
    
    const { messageId, emoji, roomId } = data;
    const room = rooms[roomId];
    
    if (!room) return;
    
    // Ищем сообщение
    const message = room.messages.find(m => m.id === messageId);
    
    if (!message || !message.reactions || !message.reactions[emoji]) return;
    
    // Удаляем пользователя из списка поставивших эту реакцию
    const index = message.reactions[emoji].indexOf(socket.user.username);
    if (index !== -1) {
      message.reactions[emoji].splice(index, 1);
      
      // Если реакций этого типа больше нет, удаляем ключ
      if (message.reactions[emoji].length === 0) {
        delete message.reactions[emoji];
      }
      
      // Если реакций вообще больше нет, удаляем объект реакций
      if (Object.keys(message.reactions).length === 0) {
        delete message.reactions;
      }
      
      // Отправляем обновление клиентам
      io.to(roomId).emit('reactions_updated', {
        messageId,
        reactions: message.reactions || {}
      });
      
      // Сохраняем изменения
      saveRooms();
    }
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