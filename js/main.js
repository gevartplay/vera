// ===== ПРЕЛОАДЕР =====
window.addEventListener('load', () => {
  setTimeout(() => {
    const loader = document.getElementById('loader');
    if (loader) {
      loader.classList.add('hide');
      setTimeout(() => loader.style.display = 'none', 800);
    }
  }, 1800);
});

// ===== ЗАГРУЗКА СОХРАНЁННОГО КОНТЕНТА =====
async function loadSavedContent() {
  // Сначала пробуем загрузить из GitHub (публично, токен не нужен)
  if (window.GitHubSync && typeof window.GitHubSync.loadFromGitHub === 'function') {
    try {
      const loaded = await window.GitHubSync.loadFromGitHub();
      if (loaded) {
        console.log('✓ Контент загружен из GitHub');
        // Обновляем title
        const siteName = localStorage.getItem('vera_text_site-name');
        if (siteName) {
          document.title = siteName + ' — Перманентный макияж';
        }
        return; // Данные загружены из GitHub, локальные не нужны
      }
    } catch (err) {
      console.warn('Не удалось загрузить из GitHub, используем локальные данные:', err);
    }
  }

  // Если GitHub не настроен или загрузка не удалась - используем localStorage
  // Тексты
  document.querySelectorAll('[data-edit]').forEach(el => {
    const key = el.getAttribute('data-edit');
    const saved = localStorage.getItem('vera_text_' + key);
    if (saved !== null) el.innerHTML = saved;
  });
  // Картинки - сначала пробуем GitHub URL, потом локальный base64
  document.querySelectorAll('[data-edit-img]').forEach(img => {
    const key = img.getAttribute('data-edit-img');
    const githubUrl = localStorage.getItem('vera_img_url_' + key);
    const localData = localStorage.getItem('vera_img_' + key);

    if (githubUrl) {
      img.src = githubUrl;
    } else if (localData) {
      img.src = localData;
    }
  });
  // Применяем название сайта во все места с data-edit="site-name"
  const siteName = localStorage.getItem('vera_text_site-name');
  if (siteName) {
    document.title = siteName + ' — Перманентный макияж';
  }
}

// Загружаем контент при старте - ждём, пока GitHubSync загрузится
function waitForGitHubSync(callback, attempts = 0) {
  if (window.GitHubSync || attempts > 50) {
    // GitHubSync загружен или прошло 5 секунд (50 * 100ms)
    callback();
  } else {
    // Ждём ещё 100ms
    setTimeout(() => waitForGitHubSync(callback, attempts + 1), 100);
  }
}

waitForGitHubSync(() => {
  loadSavedContent();
});

// ===== АДМИНКА =====
const adminBtn = document.getElementById('adminBtn');
const adminModal = document.getElementById('adminModal');
const adminPanel = document.getElementById('adminPanel');
const adminPass = document.getElementById('adminPass');
const adminLogin = document.getElementById('adminLogin');
const adminClose = document.getElementById('adminClose');
const adminSave = document.getElementById('adminSave');
const adminLogout = document.getElementById('adminLogout');

const ADMIN_PASSWORD = '07051993';

function isAdmin() {
  return localStorage.getItem('vera_admin') === 'yes';
}

function enableAdminMode() {
  document.body.classList.add('admin-mode');

  // Скрываем кнопку "Редактировать" и показываем панель
  const editBtn = document.getElementById('editBtn');
  if(editBtn) editBtn.style.display = 'none';
  adminPanel.classList.add('show');

  // Показываем статус GitHub синхронизации
  const githubStatus = document.createElement('span');
  githubStatus.style.marginRight = '10px';
  githubStatus.style.fontSize = '12px';

  // Проверяем, что GitHubSync загружен
  if (window.GitHubSync) {
    const token = window.GitHubSync.getToken();
    const info = window.GitHubSync.getRepoInfo();

    if (info && token) {
      githubStatus.innerHTML = `✓ GitHub: ${info.username}/${info.repo}`;
      githubStatus.style.color = '#4CAF50';
    } else if (info && !token) {
      githubStatus.innerHTML = `⚠ <a href="#" id="setupGithubLink" style="color:#ff9800;text-decoration:underline">Настроить токен</a>`;
      githubStatus.style.color = '#ff9800';
    } else {
      githubStatus.innerHTML = '🏠 Локальная разработка';
      githubStatus.style.color = '#999';
    }
  } else {
    githubStatus.innerHTML = '⚠ GitHub модуль не загружен';
    githubStatus.style.color = '#f44336';
  }

  adminPanel.insertBefore(githubStatus, adminPanel.firstChild);

  // Обработчик для настройки токена
  setTimeout(() => {
    const setupLink = document.getElementById('setupGithubLink');
    if (setupLink) {
      setupLink.addEventListener('click', (e) => {
        e.preventDefault();
        showTokenSetup();
      });
    }
  }, 100);

  // Делаем тексты редактируемыми
  document.querySelectorAll('[data-edit]').forEach(el => {
    el.setAttribute('contenteditable', 'true');
    el.addEventListener('blur', () => {
      const key = el.getAttribute('data-edit');
      localStorage.setItem('vera_text_' + key, el.innerHTML);
    });
    // Запрет на переход по ссылке во время редактирования
    if (el.tagName === 'A') {
      el.addEventListener('click', (e) => {
        if (document.body.classList.contains('admin-mode')) e.preventDefault();
      });
    }
  });

  // Делаем картинки заменяемыми
  document.querySelectorAll('[data-edit-img]').forEach(img => {
    img.style.cursor = 'pointer';
    img.addEventListener('click', handleImgClick);
  });
}

// Окно настройки токена
function showTokenSetup() {
  if (!window.GitHubSync) {
    alert('GitHub модуль не загружен. Обновите страницу.');
    return;
  }

  const info = window.GitHubSync.getRepoInfo();
  if (!info) {
    alert('GitHub Pages не обнаружен. Загрузите сайт на GitHub.');
    return;
  }

  const token = prompt(
    `Настройка GitHub синхронизации\n\n` +
    `Репозиторий: ${info.username}/${info.repo}\n\n` +
    `Введите Personal Access Token (ghp_...):\n` +
    `Создать токен: https://github.com/settings/tokens`
  );

  if (token && token.startsWith('ghp_')) {
    window.GitHubSync.saveToken(token);
    alert('✓ Токен сохранен! Обновите страницу.');
    location.reload();
  } else if (token) {
    alert('Токен должен начинаться с ghp_');
  }
}

function handleImgClick(e) {
  if (!isAdmin()) return;
  e.preventDefault();
  const img = e.target;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;

    // Показываем индикатор загрузки
    const originalSrc = img.src;
    img.style.opacity = '0.5';

    const reader = new FileReader();
    reader.onload = async (re) => {
      const key = img.getAttribute('data-edit-img');

      // Сначала показываем изображение локально
      img.src = re.target.result;
      img.style.opacity = '1';

      try {
        // Сохраняем локально (для быстрого доступа)
        localStorage.setItem('vera_img_' + key, re.target.result);

        // Загружаем в GitHub (если настроен)
        if(window.GitHubSync && typeof window.GitHubSync.isConfigured === 'function' && window.GitHubSync.isConfigured()){
          const githubUrl = await window.GitHubSync.uploadImage(file, key);
          if(githubUrl){
            // Сохраняем URL из GitHub
            localStorage.setItem('vera_img_url_' + key, githubUrl);
            img.src = githubUrl;
            alert('✓ Изображение загружено в GitHub и будет видно на всех устройствах');
          }
        } else {
          console.warn('GitHub не настроен. Изображение сохранено только локально.');
        }
      } catch (err) {
        console.error('Ошибка сохранения:', err);
        if(err.name === 'QuotaExceededError'){
          alert('Изображение слишком большое для localStorage. Настрой GitHub синхронизацию.');
          img.src = originalSrc;
        }
      }
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

function disableAdminMode() {
  document.body.classList.remove('admin-mode');
  adminPanel.classList.remove('show');

  // Показываем кнопку "Редактировать" обратно
  const editBtn = document.getElementById('editBtn');
  if(editBtn) editBtn.style.display = '';

  document.querySelectorAll('[data-edit]').forEach(el => {
    el.removeAttribute('contenteditable');
  });
}

adminBtn.addEventListener('click', () => {
  if (isAdmin()) {
    if (confirm('Выйти из режима администратора?')) {
      localStorage.removeItem('vera_admin');
      disableAdminMode();
    }
  } else {
    adminModal.classList.add('show');
    adminPass.value = '';
    adminPass.focus();
  }
});

adminLogin.addEventListener('click', () => {
  if (adminPass.value === ADMIN_PASSWORD) {
    localStorage.setItem('vera_admin', 'yes');
    adminModal.classList.remove('show');
    enableAdminMode();
  } else {
    alert('Неверный пароль');
    adminPass.value = '';
  }
});

adminPass.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') adminLogin.click();
});

adminClose.addEventListener('click', () => {
  adminModal.classList.remove('show');
});

adminSave.addEventListener('click', async () => {
  // Сохраняем все тексты
  document.querySelectorAll('[data-edit]').forEach(el => {
    const key = el.getAttribute('data-edit');
    localStorage.setItem('vera_text_' + key, el.innerHTML);
  });

  // Кнопка обратной связи
  adminSave.textContent = '⏳ Сохранение...';

  // Синхронизация с GitHub
  if (window.GitHubSync && typeof window.GitHubSync.isConfigured === 'function' && window.GitHubSync.isConfigured()) {
    try {
      await window.GitHubSync.syncAll();
      adminSave.textContent = '✓ Сохранено в GitHub!';
    } catch (err) {
      console.error('Ошибка синхронизации:', err);
      adminSave.textContent = '✓ Сохранено локально';
    }
  } else {
    adminSave.textContent = '✓ Сохранено локально';
  }

  setTimeout(() => {
    adminSave.textContent = '💾 Сохранить';
    // Скрываем панель и показываем кнопку "Редактировать"
    disableAdminMode();
  }, 2000);
});

adminLogout.addEventListener('click', () => {
  localStorage.removeItem('vera_admin');
  disableAdminMode();
});

// Кнопка "Редактировать" для залогиненных админов
const editBtn = document.getElementById('editBtn');
if(editBtn){
  editBtn.addEventListener('click', () => {
    enableAdminMode();
  });
}

// Если уже залогинен — показываем кнопку "Редактировать"
if (isAdmin()) {
  if(editBtn) editBtn.style.display = '';
} else {
  if(editBtn) editBtn.style.display = 'none';
}

// ===== ПЛАВНОЕ ПОЯВЛЕНИЕ РАБОТ ПРИ СКРОЛЛЕ =====
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = '1';
      entry.target.style.transform = 'translateY(0)';
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll('.work-item, .feature, .service-card, .contact-card').forEach(el => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(30px)';
  el.style.transition = 'opacity .8s, transform .8s';
  observer.observe(el);
});
