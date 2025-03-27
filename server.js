const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const UserManager = require('./user_manager');

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

// В начале файла, перед созданием директорий добавлю расширенное логирование
// Проверка прав доступа к директориям
try {
  const testDir = path.join(__dirname, 'test_permission');
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
    console.log(`Проверка прав доступа: успешно создана тестовая директория ${testDir}`);
    
    // Проверка записи файла
    const testFile = path.join(testDir, 'test.txt');
    fs.writeFileSync(testFile, 'test', 'utf8');
    console.log(`Проверка прав доступа: успешно создан тестовый файл ${testFile}`);
    
    // Очистка
    fs.unlinkSync(testFile);
    fs.rmdirSync(testDir);
    console.log('Проверка прав доступа: успешно удалены тестовые файлы');
  }
} catch (error) {
  console.error('КРИТИЧЕСКАЯ ОШИБКА! Проблема с правами доступа к файловой системе:', error);
}

// Создаем нужные директории с проверкой ошибок
function ensureDirectoryExists(dirPath, description) {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`Создана директория для ${description}: ${dirPath}`);
    } else {
      console.log(`Директория для ${description} уже существует: ${dirPath}`);
    }
    return true;
  } catch (error) {
    console.error(`ОШИБКА при создании директории для ${description}: ${dirPath}`, error);
    return false;
  }
}

// Вызываем функцию для создания директорий
const uploadsExists = ensureDirectoryExists(UPLOADS_DIR, 'загрузок');
const dataExists = ensureDirectoryExists(DATA_DIR, 'данных');
const avatarsExists = ensureDirectoryExists(AVATARS_DIR, 'аватаров');

// Создаем дефолтный аватар, если его нет
const defaultAvatarPath = path.join(AVATARS_DIR, 'default-avatar.png');
if (!fs.existsSync(defaultAvatarPath) && avatarsExists) {
  try {
    // Создаем простой цветной квадрат в качестве аватара по умолчанию
    // Мы просто скопируем существующий файл аватара, если он есть, или создадим пустой файл
    const files = fs.readdirSync(AVATARS_DIR);
    const imageFiles = files.filter(file => file.match(/\.(jpg|jpeg|png|gif)$/i));
    
    if (imageFiles.length > 0) {
      // Берем любой существующий файл изображения
      fs.copyFileSync(path.join(AVATARS_DIR, imageFiles[0]), defaultAvatarPath);
      console.log(`Создан аватар по умолчанию, скопирован из ${imageFiles[0]}`);
    } else {
      // Создаем пустой файл, если изображений нет
      fs.writeFileSync(defaultAvatarPath, Buffer.from(''), 'binary');
      console.log('Создан пустой файл аватара по умолчанию');
  }
} catch (error) {
    console.error('ОШИБКА при создании аватара по умолчанию:', error);
  }
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

// Инициализация списка забаненных пользователей
let bannedUsers = new Map();

// Инициализация словаря аватаров пользователей
let userAvatars = {};

// Инициализация карты комнат
let rooms = new Map();

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

// Класс для сообщений с расширенными атрибутами
class Message {
  constructor(id, user, text, timestamp, roomId = null, autoDelete = false, lifetime = DEFAULT_MESSAGE_LIFETIME, image = null, displayName = null, avatar = null) {
    this.id = id;
    this.user = user;
    this.text = text;
    this.timestamp = timestamp;
    this.roomId = roomId;
    this.autoDelete = autoDelete;
    this.lifetime = lifetime;
    this.image = image; // Добавляем поле для хранения изображения
    this.displayName = displayName; // Добавляем отображаемое имя
    this.avatar = avatar; // Добавляем аватар пользователя
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

// Создаем экземпляр менеджера пользователей и инициализируем его
const userManager = new UserManager({
  userDatabase: userDatabase,
  bannedUsers: bannedUsers,
  rooms: rooms,
  admins: admins,
  userAvatars: userAvatars,
  Room: Room // Передаем класс Room для создания комнат
}).init();

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

// Загрузка комнат из файла
try {
  if (fs.existsSync(ROOMS_FILE)) {
    const roomsData = fs.readFileSync(ROOMS_FILE, 'utf8');
    const roomsArray = JSON.parse(roomsData);
    // Преобразуем массив обратно в структуру комнат
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
  // rooms уже определена как new Map() выше
}

// Обновляем определение функции saveAllData для использования userManager
function saveAllData() {
  userManager.saveAllData();
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
  saveAllData();
  
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
  
  // Проверяем пароль в зависимости от формата данных пользователя
  // Обратная совместимость со старым форматом
  if (user.password) {
    // Старый формат - простой хеш SHA-256
    const hashedPassword = crypto
      .createHash('sha256')
      .update(password)
      .digest('hex');
    
    if (hashedPassword !== user.password) {
      return { success: false, message: 'Неверный пароль' };
    }
    
    // Миграция пользователя на новый формат хеширования
    console.log(`Обновление формата хеширования для пользователя ${username}`);
    const { salt, hash } = hashPassword(password);
    user.salt = salt;
    user.hash = hash;
    delete user.password; // Удаляем старое поле
    
    // Сохраняем обновленные данные
    saveAllData();
  } 
  else if (user.salt && user.hash) {
    // Новый формат - с солью и более сложным хешированием
  if (!verifyPassword(password, user.salt, user.hash)) {
    return { success: false, message: 'Неверный пароль' };
    }
  }
  else {
    // Неизвестный формат данных
    return { success: false, message: 'Ошибка формата данных пользователя' };
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
  saveAllData();
  
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
  saveAllData();
  
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

// Функция для обновления списка забаненных пользователей у всех админов
function updateAdminsWithBannedList() {
  const bannedList = getBannedUsers();
  
  // Отправляем обновленный список всем админам
  for (const username of admins) {
    if (activeUsers[username]) {
      const socketId = activeUsers[username].socketId;
      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit('banned_users_list', bannedList);
      }
    }
  }
}

// Функция для обновления списка приватных комнат у всех админов
function updateAdminsWithRoomsList() {
  const roomsList = getPrivateRooms();
  
  // Отправляем обновленный список всем админам
  for (const username of admins) {
    if (activeUsers[username]) {
      const socketId = activeUsers[username].socketId;
      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit('private_rooms_list', roomsList);
      }
    }
  }
}

// Для отладки подключений
io.engine.on("connection_error", (err) => {
  console.log(`Ошибка подключения Socket.IO: ${err.code} - ${err.message}`);
});

// Настройка периодической очистки старых аватаров и сохранения данных
setInterval(cleanupOldAvatars, CLEANUP_INTERVAL);
setInterval(saveAllData, 1000 * 60 * 5); // Сохраняем данные каждые 5 минут

// Настройка обработки завершения сервера для сохранения данных
process.on('SIGINT', () => {
  console.log('Получен сигнал завершения. Сохраняем данные...');
  saveAllData();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Получен сигнал завершения. Сохраняем данные...');
  saveAllData();
  process.exit(0);
});

io.on('connection', (socket) => {
  console.log(`Новое соединение: ${socket.id}`);

  // Отправляем тестовое сообщение при подключении
  socket.emit('connection-test', { status: 'connected', server_time: new Date().toISOString() });

  // Обработка регистрации пользователя
  socket.on('register', (data) => {
    console.log('Получен запрос на регистрацию:', { 
        username: data.username, 
        displayName: data.displayName,
        hasPassword: !!data.password,
        hasAvatar: !!data.avatar,
        disableAvatars: !!data.disableAvatars
    });
    
    const { username, password, displayName, avatar, disableAvatars } = data;
    
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
    
    try {
        // Хешируем пароль с использованием более безопасного метода с солью
        const { salt, hash } = hashPassword(password);
        
        // Создаем запись о пользователе
    userDatabase[username] = {
            displayName: displayName || username,
            salt,
            hash,
            created: Date.now(),
            disableAvatars: !!disableAvatars
        };
        
        console.log(`Пользователь ${username} успешно добавлен в базу данных`);
        
        // Обрабатываем аватар, если он предоставлен и аватары не отключены
        if (avatar && !disableAvatars) {
            try {
                console.log(`Начинаем обработку аватара для пользователя ${username}`);
                
                // Проверяем существование директории
                if (!fs.existsSync(AVATARS_DIR)) {
                    fs.mkdirSync(AVATARS_DIR, { recursive: true });
                    console.log(`Создана директория для аватаров: ${AVATARS_DIR}`);
                }
                
                // Проверяем формат (должен быть base64 изображения)
                if (!avatar.startsWith('data:image/')) {
                    throw new Error('Неверный формат изображения аватара');
                }
                
      // Конвертируем base64 в бинарные данные
      const base64Data = avatar.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      
      // Генерируем уникальное имя файла
      const filename = `${username}_${Date.now()}.jpg`;
      const avatarPath = path.join(AVATARS_DIR, filename);
      
                // Сохраняем файл синхронно
                fs.writeFileSync(avatarPath, buffer);
                console.log(`Аватар для ${username} успешно сохранен: ${avatarPath}`);
                
                // Сохраняем путь к аватару
          userAvatars[username] = `/uploads/avatars/${filename}`;
            } catch (error) {
                console.error(`Ошибка при обработке аватара для ${username}:`, error);
                // В случае ошибки используем аватар по умолчанию
                userAvatars[username] = '/uploads/default-avatar.png';
        }
    } else {
            // Если аватары отключены или аватар не предоставлен
            userAvatars[username] = disableAvatars ? null : '/uploads/default-avatar.png';
        }
        
        // Синхронизируем с userManager
        userManager.userDatabase = userDatabase;
        userManager.userAvatars = userAvatars;
        
        // Сохраняем все данные
        saveAllData();
    
    // Отправляем успешный ответ
    socket.emit('register_response', { 
      success: true, 
      message: 'Регистрация успешна! Теперь вы можете войти.',
      avatarUrl: userAvatars[username]
    });
        
        console.log(`Регистрация пользователя ${username} завершена успешно`);
    } catch (error) {
        console.error('Ошибка при регистрации пользователя:', error);
        socket.emit('register_response', { 
            success: false, 
            message: 'Ошибка при регистрации: ' + error.message 
        });
    }
  });
  
  // Регистрация нового пользователя через пароль
  socket.on('register_user', (data) => {
    const { username, displayName, password, avatar } = data;
    
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
      try {
        // Устанавливаем аватар по умолчанию, если не предоставлен
        if (avatar) {
          // Проверяем существование директории
          if (!fs.existsSync(AVATARS_DIR)) {
            fs.mkdirSync(AVATARS_DIR, { recursive: true });
            console.log(`Создана директория для аватаров: ${AVATARS_DIR}`);
          }
          
          // Проверяем формат (должен быть base64 изображения)
          if (!avatar.startsWith('data:image/')) {
            userAvatars[username] = '/uploads/default-avatar.png';
            console.log(`Для пользователя ${username} установлен аватар по умолчанию: неверный формат изображения`);
          } else {
            // Обработка аватара пользователя
            const base64Data = avatar.replace(/^data:image\/\w+;base64,/, '');
            const buffer = Buffer.from(base64Data, 'base64');
            
            // Генерируем уникальное имя файла
            const filename = `${username}_${Date.now()}.jpg`;
            const avatarPath = path.join(AVATARS_DIR, filename);
            
            // Сохраняем файл синхронно
            fs.writeFileSync(avatarPath, buffer);
            userAvatars[username] = `/uploads/avatars/${filename}`;
            console.log(`Аватар для ${username} сохранен: ${avatarPath}`);
          }
        } else {
          // Если аватар не предоставлен, используем аватар по умолчанию
          userAvatars[username] = '/uploads/default-avatar.png';
        }
        
        // Синхронизируем с userManager
        userManager.userAvatars = userAvatars;
        
        // Сохраняем данные
        saveAllData();
        
      // Авторизуем пользователя после успешной регистрации
      users[socket.id] = username;
      activeUsers[username] = { socketId: socket.id, displayName };
        
        // Добавляем URL аватара к результату
        result.avatar = userAvatars[username];
      
      // Отправляем актуальные сообщения
      socket.emit('message-history', messages);
      
      // Обновляем список пользователей для всех
      io.emit('user-list', Object.values(activeUsers).map(u => u.displayName || u.username));
      
      // Создаем системное сообщение о подключении
      const systemMessage = `${displayName} подключился к чату`;
      io.emit('system-message', systemMessage);
      
      console.log(`Пользователь ${username} (${displayName}) зарегистрирован`);
      } catch (error) {
        console.error(`Ошибка при регистрации пользователя ${username}:`, error);
        // Устанавливаем аватар по умолчанию в случае ошибки
        userAvatars[username] = '/uploads/default-avatar.png';
        result.avatar = userAvatars[username];
        result.message = 'Регистрация успешна, но возникла ошибка при обработке аватара';
        
        // Синхронизируем с userManager
        userManager.userAvatars = userAvatars;
        
        // Сохраняем данные
        saveAllData();
      }
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
      
      // Добавляем URL аватара, если он есть
      if (userAvatars[username]) {
        authResult.avatar = userAvatars[username];
      } else {
        // Если аватар не найден, используем аватар по умолчанию
        authResult.avatar = '/uploads/default-avatar.png';
      }
      
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
    saveAllData();
    
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
    saveAllData();
    
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
    saveAllData();
    
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
    
    // Получаем аватар пользователя или устанавливаем аватар по умолчанию
    const userAvatar = userAvatars[username] || '/uploads/default-avatar.png';
    
    // Формируем объект сообщения
    const msgObj = {
        id: messageData.id || Date.now() + Math.random().toString(36).substring(7),
        username: username,
        displayName: activeUsers[username].displayName || username,
        text: messageData.text,
        room: messageData.room, // ID комнаты или null для общего чата
        timestamp: new Date(),
        avatar: userAvatar // Добавляем аватар пользователя в сообщение
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
                msgObj.displayName,
                msgObj.avatar
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
            msgObj.displayName,
            msgObj.avatar
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
  socket.on('update_avatar', async (data) => {
    const username = users[socket.id];
    
    // Проверка авторизации
    if (!username || !activeUsers[username]) {
        console.log('Неавторизованная попытка обновления аватара');
        return;
    }
    
    // Проверяем, запрошен ли сброс аватара
    if (data.reset) {
        // Устанавливаем аватар по умолчанию
        userAvatars[username] = '/uploads/default-avatar.png';
        
        // Синхронизируем с userManager
        userManager.userAvatars = userAvatars;
        
        // Сохраняем изменения
        saveAllData();
            
            // Отправляем успешный ответ
            socket.emit('avatar_update_response', { 
                success: true, 
            message: 'Аватар сброшен на стандартный',
            avatarUrl: '/uploads/default-avatar.png'
        });
        
        console.log(`Аватар пользователя ${username} сброшен на стандартный`);
        return;
    }
    
    // Проверка наличия аватара
    const avatar = data.avatar;
    if (!avatar) {
        socket.emit('avatar_update_response', { 
            success: false, 
            message: 'Изображение аватара не предоставлено' 
        });
        return;
    }
    
    try {
        // Проверяем существование директории
        if (!fs.existsSync(AVATARS_DIR)) {
            fs.mkdirSync(AVATARS_DIR, { recursive: true });
            console.log(`Создана директория для аватаров: ${AVATARS_DIR}`);
        }
        
        // Проверка формата (должен быть base64 изображения)
        if (!avatar.startsWith('data:image/')) {
            socket.emit('avatar_update_response', { 
                success: false, 
                message: 'Неверный формат изображения' 
            });
            return;
        }
        
        // Получаем тип изображения
        const imageType = avatar.split(';')[0].split('/')[1];
        
        // Проверка поддерживаемых форматов
        const supportedFormats = ['jpeg', 'jpg', 'png', 'gif', 'webp'];
        if (!supportedFormats.includes(imageType.toLowerCase())) {
            socket.emit('avatar_update_response', { 
                success: false, 
                message: 'Неподдерживаемый формат изображения. Поддерживаются: JPEG, PNG, GIF, WebP' 
            });
            return;
        }
        
        // Конвертируем base64 в бинарные данные
        const base64Data = avatar.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        
        // Проверка размера файла (максимум 2 МБ)
        const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 МБ
        if (buffer.length > MAX_FILE_SIZE) {
            socket.emit('avatar_update_response', { 
                success: false, 
                message: 'Размер файла превышает максимально допустимый (2 МБ)' 
            });
            return;
        }
        
        // Генерируем уникальное имя файла
        const filename = `${username}_${Date.now()}.${imageType.toLowerCase()}`;
        const avatarPath = path.join(AVATARS_DIR, filename);
        
        // Удаляем старый аватар, если он не является аватаром по умолчанию
        const oldAvatarUrl = userAvatars[username];
        if (oldAvatarUrl && !oldAvatarUrl.includes('default-avatar')) {
            try {
                // Получаем имя файла из URL
                const oldFileName = oldAvatarUrl.split('/').pop();
                const oldFilePath = path.join(AVATARS_DIR, oldFileName);
                
                // Проверяем, существует ли файл
                if (fs.existsSync(oldFilePath)) {
                    fs.unlinkSync(oldFilePath);
                    console.log(`Удален старый аватар пользователя ${username}: ${oldFilePath}`);
                }
            } catch (error) {
                console.error('Ошибка при удалении старого аватара:', error);
            }
        }
        
        // Сохраняем файл синхронно
        fs.writeFileSync(avatarPath, buffer);
        console.log(`Аватар для ${username} обновлен: ${avatarPath}`);
        
        // Сохраняем путь к аватару (относительный путь для клиента)
        const avatarUrl = `/uploads/avatars/${filename}`;
        userAvatars[username] = avatarUrl;
        
        // Синхронизируем с userManager
        userManager.userAvatars = userAvatars;
        
        // Сохраняем обновленные аватары
    saveAllData();
    
        // Отправляем успешный ответ
        socket.emit('avatar_update_response', { 
            success: true, 
            message: 'Аватар успешно обновлен',
            avatarUrl: avatarUrl
        });
    } catch (error) {
        console.error('Ошибка при обновлении аватара:', error);
        socket.emit('avatar_update_response', { 
            success: false, 
            message: `Ошибка при обновлении аватара: ${error.message}` 
        });
    }
  });

  // Альтернативный обработчик регистрации, который работает без сохранения файлов
  socket.on('register_simple', (data) => {
    console.log('Получен запрос на упрощенную регистрацию:', data);
    
    const { username, password, displayName, disableAvatars } = data;
    
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
    
    try {
      // Сохраняем данные пользователя непосредственно в память
      userDatabase[username] = {
        displayName: displayName || username,
        // Для тестовой версии используем простое хеширование без соли
        password: crypto.createHash('sha256').update(password).digest('hex'),
        created: Date.now(),
        disableAvatars: !!disableAvatars
      };
      
      // Устанавливаем аватар по умолчанию если аватары не отключены
      if (!disableAvatars) {
        userAvatars[username] = '/uploads/default-avatar.png';
      }
      
      console.log(`Пользователь ${username} успешно зарегистрирован (упрощенная регистрация)`);
      console.log(`Аватары для пользователя ${username}: ${disableAvatars ? 'отключены' : 'включены'}`);
      
      // Отправляем успешный ответ
      socket.emit('register_response', { 
        success: true, 
        message: 'Регистрация успешна! Теперь вы можете войти.',
        avatarUrl: disableAvatars ? null : userAvatars[username]
      });
  } catch (error) {
      console.error('Ошибка при упрощенной регистрации:', error);
      socket.emit('register_response', { 
        success: false, 
        message: 'Ошибка при регистрации: ' + error.message 
      });
    }
  });

  // Соответствующий упрощенный обработчик аутентификации
  socket.on('authenticate_simple', (data) => {
    console.log('Получен запрос на упрощенную аутентификацию:', data);
    
    const { username, password } = data;
    
    if (!username || !password) {
      socket.emit('authenticate_response', { 
        success: false, 
        message: 'Отсутствуют обязательные поля' 
      });
      return;
    }
    
    // Проверка пользователя
    try {
      const user = userDatabase[username];
      
      if (!user) {
        socket.emit('authenticate_response', { 
          success: false, 
          message: 'Пользователь не найден' 
        });
        return;
      }
      
      // Проверка пароля (упрощенная)
      const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
      if (user.password && user.password === hashedPassword) {
        // Авторизуем пользователя
        users[socket.id] = username;
        activeUsers[username] = { 
          socketId: socket.id, 
          displayName: user.displayName || username 
        };
        
        // Проверяем, отключены ли аватары у пользователя
        const disableAvatars = user.disableAvatars || false;
        console.log(`Аутентификация пользователя ${username}, аватары: ${disableAvatars ? 'отключены' : 'включены'}`);
        
        // Формируем результат
        const authResult = {
          success: true,
          message: 'Авторизация успешна',
          username: username,
          displayName: user.displayName || username,
          token: 'simple-mode-token', // Добавляем токен для совместимости
          avatarUrl: disableAvatars ? null : (userAvatars[username] || '/uploads/default-avatar.png')
        };
        
        // Отправляем актуальные сообщения
        socket.emit('message-history', messages);
        
        // Обновляем список пользователей для всех
        io.emit('user-list', Object.values(activeUsers).map(u => u.displayName || u.username));
        
        // Создаем системное сообщение о подключении
        const systemMessage = `${user.displayName || username} подключился к чату`;
        io.emit('system-message', systemMessage);
        
        console.log(`Пользователь ${username} успешно авторизован (упрощенный метод)`);
        
        // Отправляем результат
        socket.emit('authenticate_response', authResult);
      } else {
        socket.emit('authenticate_response', { 
          success: false, 
          message: 'Неверный пароль' 
        });
      }
    } catch (error) {
      console.error('Ошибка при упрощенной аутентификации:', error);
      socket.emit('authenticate_response', { 
        success: false, 
        message: 'Ошибка при аутентификации: ' + error.message 
      });
    }
  });

  // Обработчик сообщений чата
  socket.on('chat_message', (message) => {
    console.log('Получено сообщение:', message);
    
    // Проверяем, авторизован ли пользователь
    if (!socket.user) {
        console.log('Попытка отправить сообщение неавторизованным пользователем');
        return;
    }
    
    // Добавляем информацию о пользователе
    message.username = socket.user.username;
    message.displayName = socket.user.displayName;
    message.timestamp = Date.now();
    
    // Отправляем сообщение всем подключенным клиентам
    io.emit('chat_message', message);
    
    // Сохраняем сообщение в истории
    messages.push(message);
    
    // Ограничиваем историю последними 100 сообщениями
    if (messages.length > 100) {
        messages.shift();
    }
  });
});

// Функция очистки старых аватаров
function cleanupOldAvatars() {
  console.log('Запуск очистки старых аватаров...');
  
  try {
    // Проверяем существование директории
    if (!fs.existsSync(AVATARS_DIR)) {
      console.log(`Директория для аватаров не существует: ${AVATARS_DIR}, создаём её`);
      fs.mkdirSync(AVATARS_DIR, { recursive: true });
      return;
    }
    
    // Проверяем, что путь действительно является директорией
    const stats = fs.statSync(AVATARS_DIR);
    if (!stats.isDirectory()) {
      console.error(`Путь ${AVATARS_DIR} существует, но не является директорией!`);
      return;
    }
    
    // Получаем список всех файлов в директории аватаров
    const files = fs.readdirSync(AVATARS_DIR);
    console.log(`В директории ${AVATARS_DIR} найдено ${files.length} файлов`);
    
    const now = Date.now();
    let deletedCount = 0;
    
    // Создаем множество используемых аватаров
    const usedAvatars = new Set();
    
    // Собираем все используемые аватары из userAvatars
    for (const avatar of Object.values(userAvatars)) {
      if (avatar && !avatar.includes('default-avatar')) {
        // Преобразуем полный путь в имя файла (например, /uploads/avatars/user_123.jpg -> user_123.jpg)
        const fileName = avatar.split('/').pop();
        usedAvatars.add(fileName);
      }
    }
    
    console.log(`Найдено ${usedAvatars.size} используемых аватаров`);
    
    // Проверяем каждый файл
    files.forEach(file => {
      // Пропускаем файл аватара по умолчанию
      if (file === 'default-avatar.png') {
        console.log('Пропускаем аватар по умолчанию');
        return;
      }
      
      const filePath = path.join(AVATARS_DIR, file);
      
      try {
        // Проверяем, что это файл, а не директория
        const fileStats = fs.statSync(filePath);
        if (!fileStats.isFile()) {
          console.log(`Пропускаем ${file}, так как это не файл`);
          return;
        }
        
        // Получаем информацию о файле
        const fileAge = now - fileStats.mtimeMs;
        
        // Удаляем файлы, которые старше указанного возраста И не используются
        if ((fileAge > IMAGE_MAX_AGE) && !usedAvatars.has(file)) {
          fs.unlinkSync(filePath);
          deletedCount++;
          console.log(`Удален старый аватар: ${file}, возраст: ${Math.round(fileAge / (1000 * 60 * 60))} часов`);
        } else {
          if (usedAvatars.has(file)) {
            console.log(`Файл ${file} используется - пропускаем`);
          } else {
            console.log(`Файл ${file} еще не достиг возраста для удаления: ${Math.round(fileAge / (1000 * 60 * 60))}/${Math.round(IMAGE_MAX_AGE / (1000 * 60 * 60))} часов`);
          }
        }
    } catch (error) {
        console.error(`Ошибка при обработке файла аватара ${file}:`, error);
      }
    });
    
    console.log(`Очистка аватаров завершена. Удалено ${deletedCount} файлов.`);
    } catch (error) {
    console.error('Ошибка при очистке старых аватаров:', error);
  }
}

// Запускаем HTTP сервер
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Сервер запущен на порту ${PORT}`);
  console.log(`Хост: ${HOST_URL}`);
  
  // Очищаем старые аватары при запуске
  cleanupOldAvatars();
}); 