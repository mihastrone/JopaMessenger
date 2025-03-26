// Добавляем необходимые импорты для работы с файлами и путями
const fs = require('fs');
const path = require('path');

// Директории и пути к файлам
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const CREDENTIALS_FILE = path.join(DATA_DIR, 'credentials.json');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');
const ROOMS_FILE = path.join(DATA_DIR, 'rooms.json');
const BANNED_USERS_FILE = path.join(DATA_DIR, 'banned_users.json');
const ADMINS_FILE = path.join(DATA_DIR, 'admins.json');
const USER_AVATARS_FILE = path.join(DATA_DIR, 'user_avatars.json');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
const AVATARS_DIR = path.join(UPLOADS_DIR, 'avatars');

// Класс для управления пользователями и их данными
class UserManager {
  constructor(options = {}) {
    // Используем либо переданные объекты, либо создаем новые
    this.userDatabase = options.userDatabase || {};
    this.bannedUsers = options.bannedUsers || new Map();
    this.rooms = options.rooms || new Map();
    this.admins = options.admins || new Set();
    this.userAvatars = options.userAvatars || {};
    this.Room = options.Room; // Класс Room для создания новых комнат
    
    // Создаем нужные директории
    this.ensureDirectoriesExist();
  }
  
  // Создание необходимых директорий
  ensureDirectoriesExist() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        console.log(`Создана директория для данных: ${DATA_DIR}`);
      }
      
      if (!fs.existsSync(UPLOADS_DIR)) {
        fs.mkdirSync(UPLOADS_DIR, { recursive: true });
        console.log(`Создана директория для загрузок: ${UPLOADS_DIR}`);
      }
      
      if (!fs.existsSync(AVATARS_DIR)) {
        fs.mkdirSync(AVATARS_DIR, { recursive: true });
        console.log(`Создана директория для аватаров: ${AVATARS_DIR}`);
      }
    } catch (error) {
      console.error('Ошибка при создании директорий:', error);
    }
  }
  
  // Функция для проверки доступа к файлу
  isFileWritable(filePath) {
    // Проверяем существование файла
    const exists = fs.existsSync(filePath);
    
    if (exists) {
      try {
        // Проверяем возможность записи в существующий файл
        fs.accessSync(filePath, fs.constants.W_OK);
        console.log(`Файл ${filePath} доступен для записи`);
        return true;
      } catch (err) {
        console.error(`Файл ${filePath} существует, но не доступен для записи:`, err);
        return false;
      }
    } else {
      try {
        // Если файл не существует, проверяем возможность создания
        const dirPath = path.dirname(filePath);
        
        if (!fs.existsSync(dirPath)) {
          fs.mkdirSync(dirPath, { recursive: true });
        }
        
        // Создаем тестовый файл
        fs.writeFileSync(filePath, '{}', 'utf8');
        console.log(`Тестовый файл ${filePath} успешно создан`);
        return true;
      } catch (err) {
        console.error(`Не удалось создать файл ${filePath}:`, err);
        return false;
      }
    }
  }
  
  // Обновляю метод init для корректной загрузки данных
  init() {
    console.log('Инициализация UserManager...');
    
    // Проверяем доступ к файлам
    console.log('Проверка доступа к файлам данных...');
    this.isFileWritable(USERS_FILE);
    this.isFileWritable(BANNED_USERS_FILE);
    this.isFileWritable(ADMINS_FILE);
    this.isFileWritable(ROOMS_FILE);
    this.isFileWritable(USER_AVATARS_FILE);
    
    // Загружаем существующие данные
    console.log('Загрузка существующих данных...');
    
    try {
      this.loadUsers();
      this.loadBannedUsers();
      this.loadAdmins();
      this.loadRooms();
      this.loadUserAvatars();
      
      // Проверка данных после загрузки
      console.log(`После загрузки: ${Object.keys(this.userDatabase).length} пользователей, ${this.bannedUsers.size} забаненных пользователей, ${this.admins.size} администраторов, ${this.rooms.size} комнат, ${Object.keys(this.userAvatars).length} аватаров`);
      
      // Настраиваем автоматическое сохранение данных
      this.setupAutoSave();
      
      console.log('Инициализация UserManager успешно завершена');
    } catch (error) {
      console.error('ОШИБКА при инициализации UserManager:', error);
    }
    
    return this;
  }
  
  // Загрузка пользователей из файла
  loadUsers() {
    try {
      if (fs.existsSync(USERS_FILE)) {
        const userData = fs.readFileSync(USERS_FILE, 'utf8');
        Object.assign(this.userDatabase, JSON.parse(userData));
        console.log(`Загружено ${Object.keys(this.userDatabase).length} пользователей`);
      } else {
        // Создаем пустой файл пользователей
        fs.writeFileSync(USERS_FILE, JSON.stringify({}), 'utf8');
        console.log('Создан новый файл пользователей');
      }
    } catch (error) {
      console.error(`Ошибка при загрузке пользователей: ${error.message}`);
    }
    
    return this.userDatabase;
  }
  
  // Загрузка забаненных пользователей из файла
  loadBannedUsers() {
    try {
      if (fs.existsSync(BANNED_USERS_FILE)) {
        const bannedData = fs.readFileSync(BANNED_USERS_FILE, 'utf8');
        try {
          const bannedArray = JSON.parse(bannedData);
          
          // Проверяем, действительно ли это массив
          if (Array.isArray(bannedArray)) {
            // Очищаем текущие данные
            this.bannedUsers.clear();
            
            // Преобразуем массив в Map
            bannedArray.forEach(([username, banInfo]) => {
              this.bannedUsers.set(username, banInfo);
            });
            
            console.log(`Загружены данные о ${this.bannedUsers.size} забаненных пользователях`);
          } else {
            console.log('Файл забаненных пользователей содержит некорректные данные (не массив), создаем новый');
            this.bannedUsers.clear();
            this.saveBannedUsers();
          }
        } catch (parseError) {
          console.log('Ошибка при парсинге файла забаненных пользователей:', parseError.message);
          this.bannedUsers.clear();
          this.saveBannedUsers();
        }
      } else {
        // Создаем пустой файл забаненных пользователей
        fs.writeFileSync(BANNED_USERS_FILE, JSON.stringify([]), 'utf8');
        console.log('Создан новый файл забаненных пользователей');
      }
    } catch (error) {
      console.error(`Ошибка при загрузке забаненных пользователей: ${error.message}`);
    }
    
    return this.bannedUsers;
  }
  
  // Загрузка администраторов из файла
  loadAdmins() {
    try {
      if (fs.existsSync(ADMINS_FILE)) {
        const adminsData = fs.readFileSync(ADMINS_FILE, 'utf8');
        const adminsArray = JSON.parse(adminsData);
        
        // Очищаем текущие данные
        this.admins.clear();
        
        // Добавляем администраторов из массива
        adminsArray.forEach(admin => {
          this.admins.add(admin);
        });
        
        console.log(`Загружено ${this.admins.size} администраторов`);
      } else {
        // Создаем пустой файл администраторов
        fs.writeFileSync(ADMINS_FILE, JSON.stringify([]), 'utf8');
        console.log('Создан новый файл администраторов');
      }
    } catch (error) {
      console.error(`Ошибка при загрузке администраторов: ${error.message}`);
    }
    
    return this.admins;
  }
  
  // Загрузка комнат из файла
  loadRooms() {
    try {
      if (fs.existsSync(ROOMS_FILE)) {
        const roomsData = fs.readFileSync(ROOMS_FILE, 'utf8');
        try {
          const roomsArray = JSON.parse(roomsData);
          
          // Проверяем, действительно ли это массив
          if (Array.isArray(roomsArray)) {
            this.rooms = new Map();
            roomsArray.forEach(room => {
              this.rooms.set(room.id, room);
            });
            console.log(`Загружены данные о ${this.rooms.size} комнатах`);
          } else {
            console.log('Файл комнат содержит некорректные данные (не массив), создаем новый');
            this.rooms = new Map();
            this.saveRooms();
          }
        } catch (parseError) {
          console.log('Ошибка при парсинге файла комнат:', parseError.message);
          this.rooms = new Map();
          this.saveRooms();
        }
      } else {
        console.log('Файл комнат не существует, создаем новый');
        this.rooms = new Map();
        this.saveRooms();
      }
    } catch (error) {
      console.log('Ошибка при работе с файлом комнат:', error.message);
      this.rooms = new Map();
    }
  }
  
  // Загрузка аватаров пользователей
  loadUserAvatars() {
    try {
      if (fs.existsSync(USER_AVATARS_FILE)) {
        const avatarsData = fs.readFileSync(USER_AVATARS_FILE, 'utf8');
        Object.assign(this.userAvatars, JSON.parse(avatarsData));
        console.log(`Загружены аватары для ${Object.keys(this.userAvatars).length} пользователей`);
      } else {
        // Создаем пустой файл аватаров пользователей
        fs.writeFileSync(USER_AVATARS_FILE, JSON.stringify({}), 'utf8');
        console.log('Создан новый файл аватаров пользователей');
      }
    } catch (error) {
      console.error(`Ошибка при загрузке аватаров пользователей: ${error.message}`);
    }
    
    return this.userAvatars;
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
    this.saveUserAvatars();
    console.log('Все данные успешно сохранены');
  }
  
  // Сохранение пользователей в файл
  saveUsers() {
    try {
      fs.writeFileSync(USERS_FILE, JSON.stringify(this.userDatabase), 'utf8');
      console.log('Данные пользователей сохранены');
    } catch (error) {
      console.error(`Ошибка при сохранении пользователей: ${error.message}`);
    }
  }
  
  // Сохранение забаненных пользователей в файл
  saveBannedUsers() {
    try {
      // Преобразуем Map в массив пар [ключ, значение] для сохранения
      const bannedArray = Array.from(this.bannedUsers.entries());
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
      const adminsArray = Array.from(this.admins);
      fs.writeFileSync(ADMINS_FILE, JSON.stringify(adminsArray), 'utf8');
      console.log('Данные администраторов сохранены');
    } catch (error) {
      console.error(`Ошибка при сохранении администраторов: ${error.message}`);
    }
  }
  
  // Сохранение комнат в файл
  saveRooms() {
    try {
      // Преобразуем Map в массив для хранения
      const roomsArray = Array.from(this.rooms.values()).map(room => {
        // Если у комнаты есть метод toJSON, используем его
        if (typeof room.toJSON === 'function') {
          return room.toJSON();
        }
        
        // Иначе просто возвращаем объект комнаты
        // Если у комнаты есть свойство members типа Set, преобразуем его в массив
        const roomData = { ...room };
        if (roomData.members instanceof Set) {
          roomData.members = Array.from(roomData.members);
        }
        return roomData;
      });
      
      fs.writeFileSync(ROOMS_FILE, JSON.stringify(roomsArray, null, 2), 'utf8');
      console.log(`Сохранено ${roomsArray.length} комнат`);
    } catch (error) {
      console.error(`Ошибка при сохранении комнат: ${error.message}`);
    }
  }
  
  // Сохранение аватаров пользователей
  saveUserAvatars() {
    try {
      fs.writeFileSync(USER_AVATARS_FILE, JSON.stringify(this.userAvatars, null, 2));
      console.log('Аватары пользователей сохранены в:', USER_AVATARS_FILE);
    } catch (error) {
      console.error('Ошибка при сохранении аватаров пользователей:', error);
    }
  }
}

// Экспортируем класс для использования в других файлах
module.exports = UserManager; 