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