const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

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
const AVATARS_DIR = path.join(UPLOADS_DIR, 'avatars');

// Директория для хранения пользовательских данных
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const CREDENTIALS_FILE = path.join(DATA_DIR, 'credentials.json');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');
const ROOMS_FILE = path.join(DATA_DIR, 'rooms.json');
const BANNED_USERS_FILE = path.join(DATA_DIR, 'banned_users.json');
const ADMINS_FILE = path.join(DATA_DIR, 'admins.json');
const USER_AVATARS_FILE = path.join(DATA_DIR, 'user_avatars.json');

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

  if (!fs.existsSync(AVATARS_DIR)) {
    fs.mkdirSync(AVATARS_DIR, { recursive: true });
    console.log(`Создана директория для аватаров: ${AVATARS_DIR}`);
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

// Загружаем забаненных пользователей при запуске
if (fs.existsSync(BANNED_USERS_FILE)) {
    try {
        const bannedData = JSON.parse(fs.readFileSync(BANNED_USERS_FILE, 'utf8'));
        bannedUsers.clear(); // Очищаем перед загрузкой
        
        // Загружаем из объекта в Map с преобразованием дат
        for (const [username, banInfo] of Object.entries(bannedData)) {
            bannedUsers.set(username, {
                ...banInfo,
                until: banInfo.until ? new Date(banInfo.until) : null
            });
        }
        console.log(`Загружены данные о ${bannedUsers.size} забаненных пользователях`);
    } catch (error) {
        console.error('Ошибка при загрузке списка забаненных пользователей:', error);
    }
}

// Загружаем аватары пользователей
if (fs.existsSync(USER_AVATARS_FILE)) {
    try {
        const avatarsData = fs.readFileSync(USER_AVATARS_FILE, 'utf8');
        Object.assign(userAvatars, JSON.parse(avatarsData));
        console.log(`Загружены аватары для ${Object.keys(userAvatars).length} пользователей`);
    } catch (error) {
        console.error('Ошибка при загрузке аватаров пользователей:', error);
    }
}

// Загрузка списка администраторов из файла
let admins = new Set();
try {
  if (fs.existsSync(ADMINS_FILE)) {
    const adminsData = fs.readFileSync(ADMINS_FILE, 'utf8');
    const adminsArray = JSON.parse(adminsData);
    // Преобразуем массив обратно в Set
    admins = new Set(adminsArray);
    console.log(`Загружено ${admins.size} администраторов`);
  } else {
    // Создаем пустой файл администраторов
    fs.writeFileSync(ADMINS_FILE, JSON.stringify([]), 'utf8');
    console.log('Создан новый файл администраторов');
  }
} catch (error) {
  console.error(`Ошибка при работе с файлом администраторов: ${error.message}`);
  // Продолжаем с пустым списком администраторов
  admins = new Set();
}

// Загрузка комнат из файла
try {
  if (fs.existsSync(ROOMS_FILE)) {
    const roomsData = fs.readFileSync(ROOMS_FILE, 'utf8');
    const roomsArray = JSON.parse(roomsData);
    // Преобразуем массив обратно в структуру комнат
    rooms = new Map();
    roomsArray.forEach(roomData => {
      const room = new Room(roomData.id, roomData.name, roomData.creator);
      room.members = new Set(roomData.members);
      room.autoDeleteEnabled = roomData.autoDeleteEnabled;
      room.messageLifetime = roomData.messageLifetime;
      
      // Восстанавливаем сообщения комнаты
      room.messages = roomData.messages || [];
      
      // Добавляем комнату в Map
      rooms.set(roomData.id, room);
    });
    console.log(`Загружено ${rooms.size} комнат`);
  } else {
    // Создаем пустой файл комнат
    fs.writeFileSync(ROOMS_FILE, JSON.stringify([]), 'utf8');
    console.log('Создан новый файл комнат');
  }
} catch (error) {
  console.error(`Ошибка при работе с файлом комнат: ${error.message}`);
  // Продолжаем с пустым списком комнат
  rooms = new Map();
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

// Функция сохранения забаненных пользователей в файл
function saveBannedUsers() {
  try {
    // Преобразуем Map в массив пар [ключ, значение] для сохранения
    const bannedArray = Array.from(bannedUsers.entries());
    fs.writeFileSync(BANNED_USERS_FILE, JSON.stringify(bannedArray), 'utf8');
    console.log('Данные забаненных пользователей сохранены');
  } catch (error) {
    console.error(`Ошибка при сохранении забаненных пользователей: ${error.message}`);
  }
}

// Функция сохранения администраторов в файл
function saveAdmins() {
  try {
    // Преобразуем Set в массив для сохранения
    const adminsArray = Array.from(admins);
    fs.writeFileSync(ADMINS_FILE, JSON.stringify(adminsArray), 'utf8');
    console.log('Данные администраторов сохранены');
  } catch (error) {
    console.error(`Ошибка при сохранении администраторов: ${error.message}`);
  }
}

// Функция сохранения комнат в файл
function saveRooms() {
  try {
    // Преобразуем Map в массив объектов для сохранения
    const roomsArray = Array.from(rooms.values()).map(room => {
      // Возвращаем сериализуемый объект комнаты
      return {
        id: room.id,
        name: room.name,
        creator: room.creator,
        members: Array.from(room.members),
        autoDeleteEnabled: room.autoDeleteEnabled,
        messageLifetime: room.messageLifetime,
        messages: room.messages // Сохраняем историю сообщений комнаты
      };
    });
    
    fs.writeFileSync(ROOMS_FILE, JSON.stringify(roomsArray), 'utf8');
    console.log('Данные комнат сохранены');
  } catch (error) {
    console.error(`Ошибка при сохранении комнат: ${error.message}`);
  }
}

// Функция для сохранения аватаров пользователей
function saveUserAvatars() {
    try {
        fs.writeFileSync(USER_AVATARS_FILE, JSON.stringify(userAvatars, null, 2));
        console.log('Аватары пользователей сохранены в:', USER_AVATARS_FILE);
    } catch (error) {
        console.error('Ошибка при сохранении аватаров пользователей:', error);
    }
}

// Функция для сохранения всех данных
function saveAllData() {
    saveUsers();
    saveBannedUsers();
    saveAdmins();
    saveRooms();
    saveUserAvatars();
    console.log('Все данные успешно сохранены');
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
const userAvatars = {}; // Хранение аватаров пользователей

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

// Класс для приватных комнат - объявляем раньше, чем используем
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

// Проверка, забанен ли пользователь
function isUserBanned(username) {
  if (!bannedUsers.has(username)) return false;
  
  const banInfo = bannedUsers.get(username);
  // Если бан навсегда (duration = -1)
  if (banInfo.banDuration === -1) return true;
  
  // Если срок бана истек, удаляем запись
  if (banInfo.banExpiry && Date.now() > banInfo.banExpiry) {
    bannedUsers.delete(username);
    console.log(`Срок бана для пользователя ${username} истек`);
    return false;
  }
  
  return true;
}

// Функция для бана пользователя
function banUser(username, duration) {
  // Если пользователь уже забанен, обновляем информацию
  let banExpiry = null;
  if (duration !== -1) {
    banExpiry = Date.now() + duration;
  }
  
  // Сохраняем информацию о бане
  bannedUsers.set(username, {
    username,
    banDuration: duration,
    banExpiry,
    bannedAt: Date.now()
  });
  
  // Если пользователь онлайн, отключаем его
  if (activeUsers[username]) {
    const socketId = activeUsers[username].socketId;
    const socket = io.sockets.sockets.get(socketId);
    if (socket) {
      // Отправляем уведомление о бане
      socket.emit('check_ban', { banned: true, banInfo: bannedUsers.get(username) });
      // Отключаем пользователя
      socket.disconnect();
    }
    
    // Удаляем из активных пользователей
    delete activeUsers[username];
  }
  
  // Сохраняем изменения в файл
  saveBannedUsers();
  
  console.log(`Пользователь ${username} забанен на ${duration === -1 ? 'навсегда' : `${duration}мс`}`);
  return true;
}

// Функция для разбана пользователя
function unbanUser(username) {
  if (!bannedUsers.has(username)) {
    return false;
  }
  
  // Удаляем информацию о бане
  bannedUsers.delete(username);
  
  // Сохраняем изменения в файл
  saveBannedUsers();
  
  console.log(`Пользователь ${username} разбанен`);
  return true;
}

// Получение списка забаненных пользователей
function getBannedUsers() {
  // Преобразуем Map в массив для отправки
  return Array.from(bannedUsers.values());
}

// Получение списка приватных комнат
function getPrivateRooms() {
  const roomsList = [];
  
  rooms.forEach((room, roomId) => {
    roomsList.push({
      id: roomId,
      name: room.name,
      creator: room.creator,
      members: Array.from(room.members)
    });
  });
  
  return roomsList;
}

// Получение сообщений комнаты для админа
function getRoomMessagesForAdmin(roomId) {
  if (!rooms.has(roomId)) {
    return { messages: [], roomName: 'Комната не найдена' };
  }
  
  const room = rooms.get(roomId);
  return {
    messages: room.messages,
    roomName: room.name
  };
}

// Для отладки подключений
io.engine.on("connection_error", (err) => {
  console.log(`Ошибка подключения Socket.IO: ${err.code} - ${err.message}`);
});

io.on('connection', (socket) => {
  console.log(`Новое соединение: ${socket.id}`);

  // Отправляем тестовое сообщение при подключении
  socket.emit('connection-test', { status: 'connected', server_time: new Date().toISOString() });

  // Обработка регистрации пользователя
  socket.on('register', (data) => {
    const { username, password, displayName, avatar } = data;
    
    // Базовая валидация
    if (!username || !password) {
      socket.emit('register_response', { 
        success: false, 
        message: 'Необходимо указать имя пользователя и пароль' 
      });
      return;
    }
    
    // Проверяем, существует ли уже такой пользователь
    if (userDatabase[username]) {
      socket.emit('register_response', { 
        success: false, 
        message: 'Пользователь с таким именем уже существует' 
      });
      return;
    }
    
    // Хешируем пароль
    const hashedPassword = crypto
      .createHash('sha256')
      .update(password)
      .digest('hex');
    
    // Сохраняем данные пользователя
    userDatabase[username] = {
      password: hashedPassword,
      displayName: displayName || username
    };
    
    // Сохраняем аватар, если он был предоставлен
    if (avatar) {
      // Конвертируем base64 в бинарные данные
      const base64Data = avatar.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      
      // Генерируем уникальное имя файла
      const filename = `${username}_${Date.now()}.jpg`;
      const avatarPath = path.join(AVATARS_DIR, filename);
      
      // Сохраняем файл
      fs.writeFile(avatarPath, buffer, (err) => {
        if (err) {
          console.error('Ошибка при сохранении аватара:', err);
        } else {
          console.log(`Аватар для ${username} сохранен: ${avatarPath}`);
          
          // Сохраняем путь к аватару (относительный путь для клиента)
          userAvatars[username] = `/uploads/avatars/${filename}`;
        }
      });
    } else {
      // Если аватар не предоставлен, используем аватар по умолчанию
      userAvatars[username] = '/uploads/default-avatar.png';
    }
    
    // Сохраняем учетные данные в файл
    saveUsers();
    
    // Отправляем успешный ответ
    socket.emit('register_response', { 
      success: true, 
      message: 'Регистрация успешна! Теперь вы можете войти.',
      avatarUrl: userAvatars[username]
    });
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
    
    // Проверяем, не забанен ли пользователь
    if (isUserBanned(username)) {
      socket.emit('registration_result', { 
        success: false, 
        message: 'Пользователь забанен' 
      });
      socket.emit('check_ban', { banned: true, banInfo: bannedUsers.get(username) });
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
    
    // Проверяем, не забанен ли пользователь
    if (isUserBanned(username)) {
      socket.emit('auth_result', { 
        success: false, 
        message: 'Пользователь забанен' 
      });
      socket.emit('check_ban', { banned: true, banInfo: bannedUsers.get(username) });
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

  // Авторизация как администратор
  socket.on('admin_login', (data) => {
    const username = data.username || users[socket.id];
    
    if (!username) {
      socket.emit('error', { message: 'Вы не авторизованы' });
      return;
    }
    
    // Добавляем пользователя в список администраторов
    admins.add(username);
    
    // Сохраняем изменения в файл
    saveAdmins();
    
    console.log(`Пользователь ${username} авторизован как администратор`);
    
    // Отправляем обновленные списки забаненных пользователей и комнат
    socket.emit('banned_users_list', getBannedUsers());
    socket.emit('private_rooms_list', getPrivateRooms());
  });

  // Получение списка забаненных пользователей
  socket.on('get_banned_users', () => {
    const username = users[socket.id];
    
    // Проверяем, является ли пользователь администратором
    if (!username || !admins.has(username)) {
      socket.emit('error', { message: 'У вас нет прав администратора' });
      return;
    }
    
    socket.emit('banned_users_list', getBannedUsers());
  });

  // Получение списка приватных комнат
  socket.on('get_private_rooms', () => {
    const username = users[socket.id];
    
    // Проверяем, является ли пользователь администратором
    if (!username || !admins.has(username)) {
      socket.emit('error', { message: 'У вас нет прав администратора' });
      return;
    }
    
    socket.emit('private_rooms_list', getPrivateRooms());
  });

  // Бан пользователя
  socket.on('ban_user', (data) => {
    const adminUsername = users[socket.id];
    const { username, duration } = data;
    
    // Проверяем, является ли пользователь администратором
    if (!adminUsername || !admins.has(adminUsername)) {
      socket.emit('error', { message: 'У вас нет прав администратора' });
      return;
    }
    
    if (!username) {
      socket.emit('error', { message: 'Необходимо указать имя пользователя' });
      return;
    }
    
    // Нельзя банить администратора
    if (admins.has(username)) {
      socket.emit('error', { message: 'Нельзя забанить администратора' });
      return;
    }
    
    // Баним пользователя
    const banResult = banUser(username, duration);
    
    if (banResult) {
      socket.emit('user_banned', { username, duration });
      // Обновляем список забаненных пользователей для всех админов
      updateAdminsWithBannedList();
    } else {
      socket.emit('error', { message: 'Ошибка при бане пользователя' });
    }
  });

  // Разбан пользователя
  socket.on('unban_user', (data) => {
    const adminUsername = users[socket.id];
    const { username } = data;
    
    // Проверяем, является ли пользователь администратором
    if (!adminUsername || !admins.has(adminUsername)) {
      socket.emit('error', { message: 'У вас нет прав администратора' });
      return;
    }
    
    if (!username) {
      socket.emit('error', { message: 'Необходимо указать имя пользователя' });
      return;
    }
    
    // Разбаниваем пользователя
    const unbanResult = unbanUser(username);
    
    if (unbanResult) {
      socket.emit('user_unbanned', { username });
      // Обновляем список забаненных пользователей для всех админов
      updateAdminsWithBannedList();
    } else {
      socket.emit('error', { message: 'Пользователь не найден или не забанен' });
    }
  });

  // Получение сообщений приватной комнаты для админа
  socket.on('get_room_messages_admin', (data) => {
    const adminUsername = users[socket.id];
    const { roomId } = data;
    
    // Проверяем, является ли пользователь администратором
    if (!adminUsername || !admins.has(adminUsername)) {
      socket.emit('error', { message: 'У вас нет прав администратора' });
      return;
    }
    
    if (!roomId) {
      socket.emit('error', { message: 'Необходимо указать ID комнаты' });
      return;
    }
    
    // Получаем сообщения комнаты
    const roomData = getRoomMessagesForAdmin(roomId);
    
    socket.emit('room_messages_admin', roomData);
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
    
    // Обновляем список приватных комнат для всех админов
    updateAdminsWithRoomsList();
    
    // Сохраняем комнаты в файл
    saveRooms();
    
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
    
    // Проверяем, имеет ли пользователь доступ к комнате
    // Админы имеют доступ ко всем комнатам
    if (!room.members.has(username) && !admins.has(username) && room.creator !== username) {
      socket.emit('error', { message: 'У вас нет доступа к этой комнате' });
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
    if (room.creator !== users[socket.id] && !admins.has(users[socket.id])) {
      socket.emit('error', { message: 'У вас нет прав на удаление этой комнаты' });
      return;
    }

    // Оповещаем всех участников комнаты
    io.to(roomId).emit('room_deleted', { roomId, roomName: room.name });
    
    // Удаляем комнату
    rooms.delete(roomId);
    
    // Сохраняем изменения в файл
    saveRooms();
    
    console.log(`Комната ${room.name} удалена пользователем ${users[socket.id]}`);
  });

  // Запрос сообщений общего чата
  socket.on('get_messages', () => {
    socket.emit('message-history', messages);
  });

  // Обработка сообщений
  socket.on('message', (messageData) => {
    // Получаем имя пользователя из активных пользователей
    const username = users[socket.id];
    
    // Проверка авторизации
    if (!username || !activeUsers[username]) {
        console.log('Неавторизованная попытка отправки сообщения');
        return;
    }
    
    // Формируем объект сообщения
    const msgObj = {
        id: messageData.id || Date.now() + Math.random().toString(36).substring(7),
        username: username,
        displayName: activeUsers[username].displayName || username,
        text: messageData.text,
        room: messageData.room, // ID комнаты или null для общего чата
        timestamp: new Date(),
        avatar: userAvatars[username] || '/uploads/default-avatar.png' // Добавляем аватар
    };
    
    // Проверяем наличие изображения
    if (messageData.hasImage && messageData.image) {
        // Если изображение передано в base64
        if (messageData.image.startsWith('data:image')) {
            const imageData = messageData.image.split(';base64,').pop();
            const fileExtension = messageData.image.split(';')[0].split('/')[1];
            const fileName = `${Date.now()}_${Math.floor(Math.random() * 10000)}.${fileExtension}`;
            
            // Используем UPLOADS_DIR вместо жестко заданного пути
            const filePath = path.join(UPLOADS_DIR, fileName);
            
            // Проверяем существование директории и создаем её при необходимости
            try {
                if (!fs.existsSync(UPLOADS_DIR)) {
                    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
                    console.log(`Создана директория для загрузок: ${UPLOADS_DIR}`);
                }
                
                // Сохраняем изображение
                fs.writeFileSync(filePath, Buffer.from(imageData, 'base64'));
                msgObj.image = `/uploads/${fileName}`;
                console.log(`Изображение успешно сохранено: ${filePath}`);
            } catch (error) {
                console.error('Ошибка при сохранении изображения:', error);
                msgObj.image = null;
                msgObj.hasImage = false;
            }
        }
    }
    
    // Сохраняем сообщение в соответствующем хранилище
    if (msgObj.room && msgObj.room !== 'general') {
        // Сообщение для приватной комнаты
        const room = rooms.get(msgObj.room);
        if (room) {
            // Создаем объект для хранения в истории комнаты
            const roomMessage = new Message(
                Date.now(),
                username,
                msgObj.text,
                new Date().toISOString(),
                msgObj.room,
                room.autoDeleteEnabled,
                room.messageLifetime,
                msgObj.image,
                msgObj.displayName
            );
            
            // Добавляем сообщение в историю комнаты
            room.messages.push(roomMessage);
            
            // Планируем удаление сообщения, если включено автоудаление в комнате
            if (room.autoDeleteEnabled) {
                scheduleMessageDeletion(roomMessage.id, room.messageLifetime);
            }
        }
    } else {
        // Сообщение для общего чата
        const generalMessage = new Message(
            Date.now(),
            username,
            msgObj.text,
            new Date().toISOString(),
            'general',
            false,
            DEFAULT_MESSAGE_LIFETIME,
            msgObj.image,
            msgObj.displayName
        );
        
        // Добавляем сообщение в историю общего чата
        messages.push(generalMessage);
    }
    
    // Отправляем сообщение всем клиентам в зависимости от типа (общий чат или комната)
    if (msgObj.room && msgObj.room !== 'general') {
        // Сообщение для приватной комнаты
        console.log(`Отправка сообщения всем пользователям в комнате ${msgObj.room}`);
        io.to(msgObj.room).emit('room_message', msgObj);
    } else {
        // Сообщение для общего чата
        console.log('Отправка сообщения всем пользователям в общем чате');
        io.emit('new-message', msgObj);
    }
  });

  // Обработчик обновления аватара
  socket.on('update_avatar', (data) => {
    const username = users[socket.id];
    
    // Проверка авторизации
    if (!username || !activeUsers[username]) {
        console.log('Неавторизованная попытка обновления аватара');
        return;
    }
    
    // Конвертируем base64 в бинарные данные
    const avatar = data.avatar;
    const base64Data = avatar.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    
    // Генерируем уникальное имя файла
    const filename = `${username}_${Date.now()}.jpg`;
    const avatarPath = path.join(AVATARS_DIR, filename);
    
    // Сохраняем файл
    fs.writeFile(avatarPath, buffer, (err) => {
        if (err) {
            console.error('Ошибка при сохранении аватара:', err);
            socket.emit('avatar_update_response', { 
                success: false, 
                message: 'Ошибка при сохранении аватара' 
            });
        } else {
            console.log(`Аватар для ${username} обновлен: ${avatarPath}`);
            
            // Сохраняем путь к аватару (относительный путь для клиента)
            const avatarUrl = `/uploads/avatars/${filename}`;
            userAvatars[username] = avatarUrl;
            
            // Отправляем успешный ответ
            socket.emit('avatar_update_response', { 
                success: true, 
                message: 'Аватар успешно обновлен',
                avatarUrl: avatarUrl
            });
        }
    });
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

  // Функция для обновления списка забаненных пользователей для всех админов
  function updateAdminsWithBannedList() {
    admins.forEach(adminUsername => {
      if (activeUsers[adminUsername]) {
        const adminSocketId = activeUsers[adminUsername].socketId;
        const adminSocket = io.sockets.sockets.get(adminSocketId);
        if (adminSocket) {
          adminSocket.emit('banned_users_list', getBannedUsers());
        }
      }
    });
  }

  // Функция для обновления списка приватных комнат для всех админов
  function updateAdminsWithRoomsList() {
    admins.forEach(adminUsername => {
      if (activeUsers[adminUsername]) {
        const adminSocketId = activeUsers[adminUsername].socketId;
        const adminSocket = io.sockets.sockets.get(adminSocketId);
        if (adminSocket) {
          adminSocket.emit('private_rooms_list', getPrivateRooms());
        }
      }
    });
  }
});

// Обработка SIGTERM и SIGINT для корректного завершения в Railway
['SIGTERM', 'SIGINT'].forEach(signal => {
  process.on(signal, () => {
    console.log(`Получен сигнал ${signal}, завершение работы...`);
    
    // Сохраняем все данные перед завершением
    console.log('Сохранение данных перед выключением...');
    saveAllData();
    
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
  console.log(`Директория для загрузок: ${UPLOADS_DIR}`);
  console.log(`__dirname: ${__dirname}`);
  console.log(`Полный путь: ${path.resolve(UPLOADS_DIR)}`);
  
  // Создаем директорию для загрузок если ее нет
  if (!fs.existsSync(UPLOADS_DIR)) {
    try {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
      console.log(`Директория для загрузок создана: ${UPLOADS_DIR}`);
    } catch (error) {
      console.error(`Ошибка при создании директории для загрузок: ${error}`);
    }
  }
  
  // Запускаем периодическую очистку старых изображений (важно для Railway)
  setInterval(cleanupOldImages, CLEANUP_INTERVAL);
  
  // Периодическое сохранение пользовательских данных
  setInterval(saveAllData, 1000 * 60 * 10); // Каждые 10 минут
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
    // Проверяем существование директории и создаем её при необходимости
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
      console.log(`Создана директория для загрузок: ${UPLOADS_DIR}`);
    }
  
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
    
    console.log(`Сохранение изображения в файл: ${filePath}`);
    
    // Конвертируем base64 в бинарные данные
    const base64Image = base64Data.split(';base64,').pop();
    const imageBuffer = Buffer.from(base64Image, 'base64');
    
    // Записываем файл на диск
    fs.writeFileSync(filePath, imageBuffer);
    console.log(`Изображение успешно сохранено: ${filePath}`);
    
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
    // Проверяем существование директории
    if (!fs.existsSync(UPLOADS_DIR)) {
      console.log(`Директория для загрузок не существует: ${UPLOADS_DIR}, создаём её`);
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
      return; // Нет смысла продолжать, если директория только что создана
    }
  
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

// Функция для добавления администратора напрямую из консоли
// Для использования: node -e "require('./server.js').addAdmin('имя_пользователя')"
function addAdmin(username) {
  if (!username) {
    console.error('Необходимо указать имя пользователя');
    return false;
  }

  // Проверяем, существует ли пользователь
  if (!userDatabase[username]) {
    console.error(`Пользователь ${username} не найден в базе данных`);
    return false;
  }

  // Добавляем пользователя в список администраторов
  admins.add(username);
  
  // Сохраняем изменения в файл
  saveAdmins();
  
  console.log(`Пользователь ${username} успешно добавлен в список администраторов`);
  return true;
}

// Экспортируем функцию для возможности вызова из консоли
module.exports = { addAdmin };

// Класс для управления пользователями и их данными
class UserManager {
  constructor() {
    this.loadUsers();
    this.loadBannedUsers();
    this.loadAdmins();
    this.loadRooms();
    
    // Настраиваем автоматическое сохранение данных
    this.setupAutoSave();
  }
  
  // Загрузка пользователей из файла
  loadUsers() {
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
      console.error(`Ошибка при загрузке пользователей: ${error.message}`);
      // Продолжаем с пустой базой пользователей
      userDatabase = {};
    }
  }
  
  // Загрузка забаненных пользователей из файла
  loadBannedUsers() {
    try {
      if (fs.existsSync(BANNED_USERS_FILE)) {
        const bannedData = fs.readFileSync(BANNED_USERS_FILE, 'utf8');
        const bannedArray = JSON.parse(bannedData);
        
        // Преобразуем массив обратно в Map
        bannedUsers = new Map(bannedArray);
        console.log(`Загружено ${bannedUsers.size} забаненных пользователей`);
      } else {
        // Создаем пустой файл забаненных пользователей
        fs.writeFileSync(BANNED_USERS_FILE, JSON.stringify([]), 'utf8');
        console.log('Создан новый файл забаненных пользователей');
      }
    } catch (error) {
      console.error(`Ошибка при загрузке забаненных пользователей: ${error.message}`);
      // Продолжаем с пустым списком забаненных пользователей
      bannedUsers = new Map();
    }
  }
  
  // Загрузка администраторов из файла
  loadAdmins() {
    try {
      if (fs.existsSync(ADMINS_FILE)) {
        const adminsData = fs.readFileSync(ADMINS_FILE, 'utf8');
        const adminsArray = JSON.parse(adminsData);
        
        // Преобразуем массив обратно в Set
        admins = new Set(adminsArray);
        console.log(`Загружено ${admins.size} администраторов`);
      } else {
        // Создаем пустой файл администраторов
        fs.writeFileSync(ADMINS_FILE, JSON.stringify([]), 'utf8');
        console.log('Создан новый файл администраторов');
      }
    } catch (error) {
      console.error(`Ошибка при загрузке администраторов: ${error.message}`);
      // Продолжаем с пустым списком администраторов
      admins = new Set();
    }
  }
  
  // Загрузка комнат из файла
  loadRooms() {
    try {
      if (fs.existsSync(ROOMS_FILE)) {
        const roomsData = fs.readFileSync(ROOMS_FILE, 'utf8');
        const roomsArray = JSON.parse(roomsData);
        
        // Преобразуем массив обратно в Map
        rooms = new Map();
        roomsArray.forEach(roomData => {
          const room = new Room(roomData.id, roomData.name, roomData.creator);
          room.members = new Set(roomData.members);
          room.autoDeleteEnabled = roomData.autoDeleteEnabled;
          room.messageLifetime = roomData.messageLifetime;
          room.messages = roomData.messages || [];
          rooms.set(roomData.id, room);
        });
        
        console.log(`Загружено ${rooms.size} комнат`);
      } else {
        // Создаем пустой файл комнат
        fs.writeFileSync(ROOMS_FILE, JSON.stringify([]), 'utf8');
        console.log('Создан новый файл комнат');
      }
    } catch (error) {
      console.error(`Ошибка при загрузке комнат: ${error.message}`);
      // Продолжаем с пустым списком комнат
      rooms = new Map();
    }
  }
  
  // Настройка автоматического сохранения данных
  setupAutoSave() {
    // Сохраняем данные каждые 5 минут
    setInterval(() => {
      this.saveAllData();
    }, 5 * 60 * 1000);
    
    // Сохраняем данные при завершении работы сервера
    ['SIGTERM', 'SIGINT'].forEach(signal => {
      process.on(signal, () => {
        console.log(`Получен сигнал ${signal}, сохраняем данные...`);
        this.saveAllData();
      });
    });
  }
  
  // Сохранение всех данных
  saveAllData() {
    this.saveUsers();
    this.saveBannedUsers();
    this.saveAdmins();
    this.saveRooms();
    console.log('Все данные успешно сохранены');
  }
  
  // Сохранение пользователей в файл
  saveUsers() {
    try {
      fs.writeFileSync(USERS_FILE, JSON.stringify(userDatabase), 'utf8');
      console.log('Данные пользователей сохранены');
    } catch (error) {
      console.error(`Ошибка при сохранении пользователей: ${error.message}`);
    }
  }
  
  // Сохранение забаненных пользователей в файл
  saveBannedUsers() {
    try {
      // Преобразуем Map в массив пар [ключ, значение] для сохранения
      const bannedArray = Array.from(bannedUsers.entries());
      fs.writeFileSync(BANNED_USERS_FILE, JSON.stringify(bannedArray), 'utf8');
      console.log('Данные забаненных пользователей сохранены');
    } catch (error) {
      console.error(`Ошибка при сохранении забаненных пользователей: ${error.message}`);
    }
  }
  
  // Сохранение администраторов в файл
  saveAdmins() {
    try {
      // Преобразуем Set в массив для сохранения
      const adminsArray = Array.from(admins);
      fs.writeFileSync(ADMINS_FILE, JSON.stringify(adminsArray), 'utf8');
      console.log('Данные администраторов сохранены');
    } catch (error) {
      console.error(`Ошибка при сохранении администраторов: ${error.message}`);
    }
  }
  
  // Сохранение комнат в файл
  saveRooms() {
    try {
      // Преобразуем Map в массив объектов для сохранения
      const roomsArray = Array.from(rooms.values()).map(room => {
        // Возвращаем сериализуемый объект комнаты
        return {
          id: room.id,
          name: room.name,
          creator: room.creator,
          members: Array.from(room.members),
          autoDeleteEnabled: room.autoDeleteEnabled,
          messageLifetime: room.messageLifetime,
          messages: room.messages // Сохраняем историю сообщений комнаты
        };
      });
      
      fs.writeFileSync(ROOMS_FILE, JSON.stringify(roomsArray), 'utf8');
      console.log('Данные комнат сохранены');
    } catch (error) {
      console.error(`Ошибка при сохранении комнат: ${error.message}`);
    }
  }
}

// Создаем экземпляр менеджера пользователей
const userManager = new UserManager();

// Обновляем определение функции saveAllData для использования userManager
function saveAllData() {
  userManager.saveAllData();
} 