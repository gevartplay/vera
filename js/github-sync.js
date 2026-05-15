// ===== СИНХРОНИЗАЦИЯ С GITHUB =====
// Автоматически определяет настройки из URL сайта

window.GitHubSync = (function() {
  // Автоопределение username и repo из URL
  function getRepoInfo() {
    const hostname = window.location.hostname;
    const pathname = window.location.pathname;

    // Если это GitHub Pages
    if (hostname.includes('github.io')) {
      const parts = hostname.split('.');
      const username = parts[0]; // username.github.io

      // Определяем repo из пути
      const pathParts = pathname.split('/').filter(p => p);
      const repo = pathParts.length > 0 ? pathParts[0] : `${username}.github.io`;

      return { username, repo, branch: 'main' };
    }

    // Для локальной разработки - вернуть null
    return null;
  }

  // Получение токена из localStorage
  function getToken() {
    return localStorage.getItem('vera_github_token');
  }

  // Сохранение токена
  function saveToken(token) {
    localStorage.setItem('vera_github_token', token);
  }

  // Проверка настроек
  function isConfigured() {
    const info = getRepoInfo();
    const token = getToken();
    return !!(info && token);
  }

  // Загрузка файла из GitHub (публично, без токена)
  async function getFile(path) {
    const info = getRepoInfo();
    if (!info) return null;

    // Добавляем timestamp для обхода кеша браузера
    const timestamp = Date.now();
    const url = `https://api.github.com/repos/${info.username}/${info.repo}/contents/${path}?t=${timestamp}`;
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });

    if (response.ok) {
      return await response.json();
    } else if (response.status === 404) {
      return null;
    } else {
      throw new Error(`GitHub API error: ${response.status}`);
    }
  }

  // Сохранение файла в GitHub (требует токен)
  async function saveFile(path, content, message, sha = null) {
    const info = getRepoInfo();
    const token = getToken();

    if (!info || !token) throw new Error('GitHub не настроен');

    const url = `https://api.github.com/repos/${info.username}/${info.repo}/contents/${path}`;
    const contentBase64 = btoa(unescape(encodeURIComponent(content)));

    const body = {
      message: message,
      content: contentBase64,
      branch: info.branch
    };

    if (sha) body.sha = sha;

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`GitHub API error: ${error.message}`);
    }

    return await response.json();
  }

  // Загрузка изображения в GitHub
  async function uploadImage(file, key) {
    const info = getRepoInfo();
    const token = getToken();

    if (!info || !token) {
      console.warn('GitHub не настроен');
      return null;
    }

    try {
      const timestamp = Date.now();
      const ext = file.name.split('.').pop();
      const filename = `img_${timestamp}_${key}.${ext}`;
      const path = `images/${filename}`;

      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const base64String = reader.result.split(',')[1];
          resolve(base64String);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const url = `https://api.github.com/repos/${info.username}/${info.repo}/contents/${path}`;
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Authorization': `token ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: `Upload image: ${filename}`,
          content: base64,
          branch: info.branch
        })
      });

      if (!response.ok) {
        throw new Error(`GitHub upload failed: ${response.status}`);
      }

      const result = await response.json();
      return result.content.download_url;
    } catch (error) {
      console.error('Ошибка загрузки изображения в GitHub:', error);
      throw error;
    }
  }

  // Определение имени текущей страницы
  function getCurrentPageName() {
    const pathname = window.location.pathname;
    const filename = pathname.split('/').pop() || 'index.html';
    return filename.replace('.html', '');
  }

  // Синхронизация всех данных с GitHub
  async function syncAll() {
    if (!isConfigured()) {
      console.warn('GitHub не настроен. Данные сохраняются только локально.');
      return false;
    }

    try {
      const pageName = getCurrentPageName();
      const texts = {};
      document.querySelectorAll('[data-edit]').forEach(el => {
        const key = el.getAttribute('data-edit');
        texts[key] = el.innerHTML;
      });

      const images = {};
      document.querySelectorAll('[data-edit-img]').forEach(img => {
        const key = img.getAttribute('data-edit-img');
        const url = localStorage.getItem('vera_img_url_' + key);
        if (url) {
          images[key] = url;
        }
      });

      const data = { texts, images, updated: Date.now() };
      const content = JSON.stringify(data, null, 2);

      // Каждая страница сохраняется в свой файл
      const filename = `content-${pageName}.json`;
      const existing = await getFile(filename);
      const sha = existing ? existing.sha : null;

      await saveFile(filename, content, `Update ${pageName} content`, sha);

      console.log(`✓ Данные страницы ${pageName} синхронизированы с GitHub`);
      return true;
    } catch (error) {
      console.error('Ошибка синхронизации с GitHub:', error);
      return false;
    }
  }

  // Загрузка данных из GitHub
  async function loadFromGitHub() {
    try {
      const pageName = getCurrentPageName();
      const filename = `content-${pageName}.json`;

      const file = await getFile(filename);
      if (!file) {
        console.log(`Файл ${filename} не найден в репозитории`);
        return false;
      }

      const content = decodeURIComponent(escape(atob(file.content)));
      const data = JSON.parse(content);

      // ВАЖНО: Сначала очищаем старые данные из localStorage для этой страницы
      // чтобы не показывать устаревший контент
      document.querySelectorAll('[data-edit]').forEach(el => {
        const key = el.getAttribute('data-edit');
        localStorage.removeItem('vera_text_' + key);
      });
      document.querySelectorAll('[data-edit-img]').forEach(img => {
        const key = img.getAttribute('data-edit-img');
        localStorage.removeItem('vera_img_url_' + key);
        localStorage.removeItem('vera_img_' + key);
      });

      // Теперь загружаем свежие данные из GitHub
      if (data.texts) {
        for (let key in data.texts) {
          const el = document.querySelector(`[data-edit="${key}"]`);
          if (el) {
            el.innerHTML = data.texts[key];
            localStorage.setItem('vera_text_' + key, data.texts[key]);
          }
        }
      }

      if (data.images) {
        for (let key in data.images) {
          const img = document.querySelector(`[data-edit-img="${key}"]`);
          if (img) {
            img.src = data.images[key];
            localStorage.setItem('vera_img_url_' + key, data.images[key]);
          }
        }
      }

      console.log(`✓ Данные страницы ${pageName} загружены из GitHub`);
      return true;
    } catch (error) {
      console.error('Ошибка загрузки из GitHub:', error);
      return false;
    }
  }

  // Автоматическая загрузка при старте страницы
  const info = getRepoInfo();
  if (info) {
    console.log(`📦 GitHub: ${info.username}/${info.repo}`);
    loadFromGitHub().catch(err => {
      console.warn('Не удалось загрузить данные из GitHub, используются локальные:', err);
    });
  } else {
    console.log('🏠 Локальная разработка (GitHub отключен)');
  }

  return {
    isConfigured,
    saveToken,
    getToken,
    uploadImage,
    syncAll,
    loadFromGitHub,
    getFile,
    saveFile,
    getRepoInfo,
    getCurrentPageName
  };
})();
