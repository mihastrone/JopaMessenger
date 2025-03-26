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