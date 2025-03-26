const UserManager = require('./user_manager'); // Подключаем класс UserManager
const userManager = new UserManager(); // Создаем экземпляр менеджера пользователей

// Обновляем определение функции saveAllData для использования userManager
function saveAllData() {
  userManager.saveAllData();
}

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
    
    // Получаем список всех файлов в директории аватаров
    const files = fs.readdirSync(AVATARS_DIR);
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
    
    // Проверяем каждый файл
    files.forEach(file => {
      // Пропускаем файл аватара по умолчанию
      if (file === 'default-avatar.png') return;
      
      const filePath = path.join(AVATARS_DIR, file);
      
      try {
        // Получаем информацию о файле
        const stats = fs.statSync(filePath);
        const fileAge = now - stats.mtimeMs;
        
        // Удаляем файлы, которые старше указанного возраста И не используются
        if ((fileAge > IMAGE_MAX_AGE) && !usedAvatars.has(file)) {
          fs.unlinkSync(filePath);
          deletedCount++;
          console.log(`Удален старый аватар: ${file}, возраст: ${Math.round(fileAge / (1000 * 60 * 60))} часов`);
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

// В блоке запуска сервера, перед server.listen(PORT, '0.0.0.0', () => {
// Добавить вызов функции очистки старых аватаров:
setInterval(cleanupOldAvatars, CLEANUP_INTERVAL);

// В блоке socket.on('connection', (socket) => { найти и заменить обработчик 'update_avatar' на:
  // Обработчик обновления аватара
  socket.on('update_avatar', (data) => {
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
        
        // Сохраняем изменения
        saveUserAvatars();
        
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
            
            // Сохраняем путь к аватару (относительный путь для клиента)
            const avatarUrl = `/uploads/avatars/${filename}`;
            userAvatars[username] = avatarUrl;
            
            // Сохраняем обновленные аватары
            saveUserAvatars();
            
            // Отправляем успешный ответ
            socket.emit('avatar_update_response', { 
                success: true, 
                message: 'Аватар успешно обновлен',
                avatarUrl: avatarUrl
            });
        }
    });
  }); 