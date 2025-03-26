// Класс для управления пользователями и их данными
class UserManager {
  constructor() {
    // Инициализируем коллекции
    this.bannedUsers = bannedUsers;
    this.rooms = rooms;
    
    this.loadUsers();
    this.loadBannedUsers();
    this.loadAdmins();
    this.loadRooms();
    this.loadUserAvatars();
    
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
        
        // Преобразуем массив обратно в Map и обновляем глобальную переменную
        this.bannedUsers = new Map(bannedArray);
        bannedUsers = this.bannedUsers; // Обновляем глобальную переменную
        console.log(`Загружено ${this.bannedUsers.size} забаненных пользователей`);
      } else {
        // Создаем пустой файл забаненных пользователей
        fs.writeFileSync(BANNED_USERS_FILE, JSON.stringify([]), 'utf8');
        console.log('Создан новый файл забаненных пользователей');
      }
    } catch (error) {
      console.error(`Ошибка при загрузке забаненных пользователей: ${error.message}`);
      // Продолжаем с пустым списком забаненных пользователей
      this.bannedUsers = new Map();
      bannedUsers = this.bannedUsers; // Обновляем глобальную переменную
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
        this.rooms = new Map();
        rooms = this.rooms; // Обновляем глобальную переменную
        
        roomsArray.forEach(roomData => {
          const room = new Room(roomData.id, roomData.name, roomData.creator);
          room.members = new Set(roomData.members);
          room.autoDeleteEnabled = roomData.autoDeleteEnabled;
          room.messageLifetime = roomData.messageLifetime;
          room.messages = roomData.messages || [];
          this.rooms.set(roomData.id, room);
        });
        
        console.log(`Загружено ${this.rooms.size} комнат`);
      } else {
        // Создаем пустой файл комнат
        fs.writeFileSync(ROOMS_FILE, JSON.stringify([]), 'utf8');
        console.log('Создан новый файл комнат');
      }
    } catch (error) {
      console.error(`Ошибка при загрузке комнат: ${error.message}`);
      // Продолжаем с пустым списком комнат
      this.rooms = new Map();
      rooms = this.rooms; // Обновляем глобальную переменную
    }
  }
  
  // Загрузка аватаров пользователей
  loadUserAvatars() {
    try {
      if (fs.existsSync(USER_AVATARS_FILE)) {
        const avatarsData = fs.readFileSync(USER_AVATARS_FILE, 'utf8');
        Object.assign(userAvatars, JSON.parse(avatarsData));
        console.log(`Загружены аватары для ${Object.keys(userAvatars).length} пользователей`);
      } else {
        // Создаем пустой файл аватаров пользователей
        fs.writeFileSync(USER_AVATARS_FILE, JSON.stringify({}), 'utf8');
        console.log('Создан новый файл аватаров пользователей');
      }
    } catch (error) {
      console.error(`Ошибка при загрузке аватаров пользователей: ${error.message}`);
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
    this.saveUserAvatars();
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
      const roomsArray = Array.from(this.rooms.values()).map(room => {
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
  
  // Сохранение аватаров пользователей
  saveUserAvatars() {
    try {
      fs.writeFileSync(USER_AVATARS_FILE, JSON.stringify(userAvatars, null, 2));
      console.log('Аватары пользователей сохранены в:', USER_AVATARS_FILE);
    } catch (error) {
      console.error('Ошибка при сохранении аватаров пользователей:', error);
    }
  }
}

// Экспортируем класс для использования в других файлах
module.exports = UserManager; 