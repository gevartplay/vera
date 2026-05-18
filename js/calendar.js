// ===== ИНТЕРАКТИВНЫЙ КАЛЕНДАРЬ =====
(function(){
  const WORK_START = 10;   // 10:00
  const WORK_END   = 18;   // 18:00
  const STORAGE_KEY = 'vera_calendar_v2';
  const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь',
                  'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

  // Структура данных:
  // { "2026-05-14": { dayOff:false, bookings:[{start:"14:25",end:"15:10",name:"",phone:"",service:"",note:""}], breaks:[{start:"12:00",end:"13:00"}] } }
  let data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');

  // Миграция старых данных
  const oldData = JSON.parse(localStorage.getItem('vera_calendar_v1') || '{}');
  if(Object.keys(oldData).length > 0 && Object.keys(data).length === 0){
    console.log('Миграция данных из старого формата...');
    Object.keys(oldData).forEach(dateKey => {
      const oldDay = oldData[dateKey];
      const newDay = { dayOff: oldDay.dayOff || false, bookings: [], breaks: [] };

      if(oldDay.slots){
        Object.keys(oldDay.slots).forEach(hour => {
          const slot = oldDay.slots[hour];
          const startTime = `${String(hour).padStart(2,'0')}:00`;
          const endTime = `${String(parseInt(hour)+1).padStart(2,'0')}:00`;

          if(slot.status === 'booked'){
            newDay.bookings.push({
              start: startTime,
              end: endTime,
              name: slot.name || '',
              phone: slot.phone || '',
              service: slot.service || '',
              note: slot.note || ''
            });
          } else if(slot.status === 'break'){
            newDay.breaks.push({ start: startTime, end: endTime });
          }
        });
      }

      data[dateKey] = newDay;
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    console.log('✓ Миграция завершена');
  }

  let viewDate = new Date();
  viewDate.setDate(1);
  let selectedKey = null;

  // Сохранение: сначала GitHub, потом localStorage
  async function save(){
    const oldData = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');

    // Синхронизация с GitHub (если настроен)
    if(window.GitHubSync && typeof window.GitHubSync.isConfigured === 'function' && window.GitHubSync.isConfigured()){
      try {
        const existing = await window.GitHubSync.getFile('calendar.json');
        const sha = existing ? existing.sha : null;
        await window.GitHubSync.saveFile('calendar.json', JSON.stringify(data, null, 2), 'Update calendar', sha);
        console.log('✓ Календарь синхронизирован с GitHub');
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch(err) {
        console.error('❌ Не удалось синхронизировать календарь с GitHub:', err);
        data = oldData;
        renderCalendar();
        if(selectedKey) renderHours();
        alert('Ошибка сохранения в GitHub. Изменения отменены.\n\n' + err.message);
        throw err;
      }
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      console.warn('⚠ GitHub не настроен. Данные сохранены только локально.');
    }
  }

  // Загрузка из GitHub при старте
  async function loadCalendarFromGitHub(){
    if(window.GitHubSync && typeof window.GitHubSync.getFile === 'function'){
      try {
        const file = await window.GitHubSync.getFile('calendar.json');
        if(file){
          const content = decodeURIComponent(escape(atob(file.content)));
          const githubData = JSON.parse(content);
          data = githubData;
          localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
          console.log('✓ Календарь загружен из GitHub');
          renderCalendar();
          return true;
        }
      } catch(err) {
        console.warn('Не удалось загрузить календарь из GitHub:', err);
      }
    }
    return false;
  }

  function isAdminMode(){
    return localStorage.getItem('vera_admin') === 'yes' && document.body.classList.contains('admin-mode');
  }

  function keyOf(d){
    const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  }

  function ensureDay(k){
    if(!data[k]) data[k] = { dayOff:false, bookings:[], breaks:[] };
    return data[k];
  }

  function isPast(d){
    const t=new Date(); t.setHours(0,0,0,0);
    return d < t;
  }

  // Конвертация времени в минуты от начала дня
  function timeToMinutes(timeStr){
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  }

  // Подсчет занятого времени в минутах
  function dayStats(k){
    const d = data[k];
    if(!d) return { off:false, bookedMinutes:0, breakMinutes:0, bookingCount:0 };

    let bookedMinutes = 0;
    let breakMinutes = 0;

    (d.bookings || []).forEach(b => {
      bookedMinutes += timeToMinutes(b.end) - timeToMinutes(b.start);
    });

    (d.breaks || []).forEach(b => {
      breakMinutes += timeToMinutes(b.end) - timeToMinutes(b.start);
    });

    return {
      off: !!d.dayOff,
      bookedMinutes,
      breakMinutes,
      bookingCount: (d.bookings || []).length
    };
  }

  // ===== РЕНДЕР СЕТКИ =====
  const grid = document.getElementById('calGrid');
  const monthLabel = document.getElementById('monthLabel');

  function renderCalendar(){
    grid.innerHTML='';
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    monthLabel.textContent = `${MONTHS[month]} ${year}`;

    let first = new Date(year, month, 1).getDay();
    first = first===0 ? 6 : first-1;
    const daysInMonth = new Date(year, month+1, 0).getDate();
    const today = new Date(); today.setHours(0,0,0,0);

    for(let i=0;i<first;i++){
      const e=document.createElement('div');
      e.className='cal-day empty';
      grid.appendChild(e);
    }

    for(let d=1; d<=daysInMonth; d++){
      const dateObj = new Date(year, month, d);
      const k = keyOf(dateObj);
      const cell = document.createElement('div');
      cell.className='cal-day';
      cell.dataset.key = k;

      if(isPast(dateObj)) cell.classList.add('past');
      if(dateObj.getTime()===today.getTime()) cell.classList.add('today');

      const stats = dayStats(k);
      const totalWorkMinutes = (WORK_END - WORK_START) * 60;
      const busyMinutes = stats.bookedMinutes + stats.breakMinutes;

      if(stats.off) cell.classList.add('day-off');
      else if(busyMinutes >= totalWorkMinutes) cell.classList.add('fully-busy');
      if(stats.bookingCount > 0 && isAdminMode()) cell.classList.add('has-bookings');

      const num = document.createElement('span');
      num.className='num'; num.textContent = d;
      cell.appendChild(num);

      const info = document.createElement('span');
      info.className='info';
      if(stats.off) info.textContent = 'выходной';
      else {
        const freeMinutes = totalWorkMinutes - busyMinutes;
        const freeHours = Math.floor(freeMinutes / 60);
        const freeMins = freeMinutes % 60;

        if(isAdminMode() && stats.bookingCount > 0) {
          info.textContent = `${stats.bookingCount} зап.`;
        } else if(freeMinutes <= 0) {
          info.textContent = 'занято';
        } else if(freeMins === 0) {
          info.textContent = `${freeHours} ч свободно`;
        } else {
          info.textContent = `${freeHours}ч ${freeMins}м свободно`;
        }
      }
      cell.appendChild(info);

      if(!cell.classList.contains('past')){
        cell.addEventListener('click', ()=> openDay(k, dateObj));
      }
      grid.appendChild(cell);
    }
  }

  // ===== ПАНЕЛЬ ДНЯ =====
  const dayPanel = document.getElementById('dayPanel');
  const dayTitle = document.getElementById('dayTitle');
  const hoursGrid = document.getElementById('hoursGrid');

  function openDay(k, dateObj){
    selectedKey = k;
    document.querySelectorAll('.cal-day').forEach(c=>c.classList.toggle('selected', c.dataset.key===k));
    const opts = { weekday:'long', day:'numeric', month:'long' };
    dayTitle.textContent = dateObj.toLocaleDateString('ru-RU', opts);
    renderHours();
    dayPanel.style.display='block';
    dayPanel.scrollIntoView({behavior:'smooth', block:'start'});
  }

  function renderHours(){
    hoursGrid.innerHTML='';
    const day = data[selectedKey] || { dayOff:false, bookings:[], breaks:[] };

    if(day.dayOff){
      hoursGrid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:30px;opacity:.6">🌙 В этот день не работаю</div>';
      return;
    }

    // Создаем временную шкалу
    const timeline = [];
    for(let h = WORK_START; h < WORK_END; h++){
      timeline.push({
        type: 'hour',
        hour: h,
        label: `${String(h).padStart(2,'0')}:00`
      });
    }

    // Добавляем записи клиентов
    (day.bookings || []).forEach((booking, idx) => {
      timeline.push({
        type: 'booking',
        data: booking,
        index: idx
      });
    });

    // Добавляем перерывы
    (day.breaks || []).forEach((brk, idx) => {
      timeline.push({
        type: 'break',
        data: brk,
        index: idx
      });
    });

    // Сортируем по времени начала
    timeline.sort((a, b) => {
      let timeA, timeB;
      if(a.type === 'hour') timeA = a.hour * 60;
      else timeA = timeToMinutes(a.data.start);

      if(b.type === 'hour') timeB = b.hour * 60;
      else timeB = timeToMinutes(b.data.start);

      return timeA - timeB;
    });

    // Рендерим элементы
    timeline.forEach(item => {
      if(item.type === 'hour'){
        // Показываем часовые метки только в режиме админа
        if(isAdminMode()){
          const el = document.createElement('div');
          el.className = 'hour-slot hour-marker';
          el.innerHTML = `<span style="opacity:0.5;font-size:12px">${item.label}</span>`;
          el.addEventListener('click', ()=> openBookingModal());
          hoursGrid.appendChild(el);
        }
      } else if(item.type === 'booking'){
        const b = item.data;
        const el = document.createElement('div');
        el.className = isAdminMode() ? 'hour-slot booked' : 'hour-slot busy';

        let html = `<strong>${b.start} — ${b.end}</strong>`;
        if(isAdminMode()){
          html += `<span class="client">${escapeHtml(b.name||'клиент')}</span>`;
          if(b.service) html += `<span class="label">${escapeHtml(b.service)}</span>`;
        } else {
          html += `<span class="label">занято</span>`;
        }

        el.innerHTML = html;
        if(isAdminMode()){
          el.addEventListener('click', ()=> openBookingModal(item.index));
        }
        hoursGrid.appendChild(el);
      } else if(item.type === 'break'){
        const b = item.data;
        const el = document.createElement('div');
        el.className = 'hour-slot break';
        el.innerHTML = `<strong>${b.start} — ${b.end}</strong><span class="label">перерыв</span>`;
        if(isAdminMode()){
          el.addEventListener('click', ()=> openBreakModal(item.index));
        }
        hoursGrid.appendChild(el);
      }
    });

    // Кнопка добавления записи для админа
    if(isAdminMode()){
      const addBtn = document.createElement('div');
      addBtn.className = 'hour-slot add-slot';
      addBtn.innerHTML = '<strong>+ Добавить запись</strong>';
      addBtn.addEventListener('click', ()=> openBookingModal());
      hoursGrid.appendChild(addBtn);
    }
  }

  // ===== АДМИН: BOOKING MODAL =====
  const bookingModal = document.getElementById('bookingModal');
  const bookingSlotInfo = document.getElementById('bookingSlotInfo');
  const clientName = document.getElementById('clientName');
  const clientPhone = document.getElementById('clientPhone');
  const clientService = document.getElementById('clientService');
  const clientNote = document.getElementById('clientNote');
  const bookingSave = document.getElementById('bookingSave');
  const bookingDelete = document.getElementById('bookingDelete');
  const bookingCancel = document.getElementById('bookingCancel');
  let editingBookingIndex = null;

  function openBookingModal(bookingIndex = null){
    editingBookingIndex = bookingIndex;
    const day = ensureDay(selectedKey);

    // Удаляем старые поля времени если есть
    document.querySelectorAll('.time-inputs').forEach(el => el.remove());

    // Создаем поля для ввода времени
    const timeInputs = document.createElement('div');
    timeInputs.className = 'time-inputs';
    timeInputs.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px';

    const startInput = document.createElement('input');
    startInput.type = 'time';
    startInput.id = 'bookingStartTime';
    startInput.placeholder = 'Начало';
    startInput.style.cssText = 'padding:10px;border:1px solid #444;background:#1a1a1a;color:#fff;border-radius:4px';

    const endInput = document.createElement('input');
    endInput.type = 'time';
    endInput.id = 'bookingEndTime';
    endInput.placeholder = 'Конец';
    endInput.style.cssText = 'padding:10px;border:1px solid #444;background:#1a1a1a;color:#fff;border-radius:4px';

    timeInputs.appendChild(startInput);
    timeInputs.appendChild(endInput);

    // Вставляем поля времени перед полем имени
    clientName.parentNode.insertBefore(timeInputs, clientName);

    if(bookingIndex !== null && day.bookings[bookingIndex]){
      const booking = day.bookings[bookingIndex];
      bookingSlotInfo.textContent = `${selectedKey} · Редактирование записи`;
      startInput.value = booking.start;
      endInput.value = booking.end;
      clientName.value = booking.name || '';
      clientPhone.value = booking.phone || '';
      clientService.value = booking.service || 'Перманент губ';
      clientNote.value = booking.note || '';
      bookingDelete.style.display = '';
    } else {
      bookingSlotInfo.textContent = `${selectedKey} · Новая запись`;
      const now = new Date();
      const roundedHour = Math.ceil(now.getHours());
      startInput.value = `${String(Math.max(WORK_START, Math.min(roundedHour, WORK_END-1))).padStart(2,'0')}:00`;
      endInput.value = `${String(Math.max(WORK_START+1, Math.min(roundedHour+1, WORK_END))).padStart(2,'0')}:00`;
      clientName.value = '';
      clientPhone.value = '';
      clientService.value = 'Перманент губ';
      clientNote.value = '';
      bookingDelete.style.display = 'none';
    }

    bookingModal.classList.add('show');
    setTimeout(()=>startInput.focus(),50);
  }

  bookingSave.addEventListener('click', ()=>{
    const startTime = document.getElementById('bookingStartTime').value;
    const endTime = document.getElementById('bookingEndTime').value;

    if(!startTime || !endTime){
      alert('Укажи время начала и конца записи');
      return;
    }

    if(timeToMinutes(startTime) >= timeToMinutes(endTime)){
      alert('Время окончания должно быть позже времени начала');
      return;
    }

    if(!clientName.value.trim()){
      alert('Укажи имя клиента');
      return;
    }

    const day = ensureDay(selectedKey);
    const booking = {
      start: startTime,
      end: endTime,
      name: clientName.value.trim(),
      phone: clientPhone.value.trim(),
      service: clientService.value,
      note: clientNote.value.trim()
    };

    if(editingBookingIndex !== null){
      day.bookings[editingBookingIndex] = booking;
    } else {
      if(!day.bookings) day.bookings = [];
      day.bookings.push(booking);
    }

    save();
    bookingModal.classList.remove('show');
    renderHours();
    renderCalendar();
  });

  bookingDelete.addEventListener('click', ()=>{
    if(!confirm('Удалить эту запись?')) return;
    const day = ensureDay(selectedKey);
    day.bookings.splice(editingBookingIndex, 1);
    save();
    bookingModal.classList.remove('show');
    renderHours();
    renderCalendar();
  });

  bookingCancel.addEventListener('click', ()=> bookingModal.classList.remove('show'));

  // ===== АДМИН: BREAK MODAL =====
  let editingBreakIndex = null;

  function openBreakModal(breakIndex = null){
    editingBreakIndex = breakIndex;
    const day = ensureDay(selectedKey);

    const startTime = breakIndex !== null ? day.breaks[breakIndex].start : '12:00';
    const endTime = breakIndex !== null ? day.breaks[breakIndex].end : '13:00';

    const newStart = prompt(`Начало перерыва (ЧЧ:ММ):`, startTime);
    if(!newStart) return;

    const newEnd = prompt(`Конец перерыва (ЧЧ:ММ):`, endTime);
    if(!newEnd) return;

    if(timeToMinutes(newStart) >= timeToMinutes(newEnd)){
      alert('Время окончания должно быть позже времени начала');
      return;
    }

    const brk = { start: newStart, end: newEnd };

    if(breakIndex !== null){
      day.breaks[breakIndex] = brk;
    } else {
      if(!day.breaks) day.breaks = [];
      day.breaks.push(brk);
    }

    save();
    renderHours();
    renderCalendar();
  }

  // ===== АДМИН: УПРАВЛЕНИЕ ДНЁМ =====
  document.getElementById('toggleDayOff').addEventListener('click', ()=>{
    const day = ensureDay(selectedKey);
    day.dayOff = !day.dayOff;
    save(); renderHours(); renderCalendar();
  });

  document.getElementById('clearDay').addEventListener('click', ()=>{
    if(!confirm('Очистить все записи и перерывы этого дня?')) return;
    data[selectedKey] = { dayOff:false, bookings:[], breaks:[] };
    save(); renderHours(); renderCalendar();
  });

  document.getElementById('dayClose').addEventListener('click', ()=>{
    dayPanel.style.display='none';
    selectedKey = null;
    document.querySelectorAll('.cal-day.selected').forEach(c=>c.classList.remove('selected'));
  });

  // ===== НАВИГАЦИЯ ПО МЕСЯЦАМ =====
  document.getElementById('prevMonth').addEventListener('click', ()=>{
    viewDate.setMonth(viewDate.getMonth()-1); renderCalendar();
  });
  document.getElementById('nextMonth').addEventListener('click', ()=>{
    viewDate.setMonth(viewDate.getMonth()+1); renderCalendar();
  });

  // ===== ЭКСПОРТ / ИМПОРТ =====
  const exportBtn = document.getElementById('adminExport');
  const exportJSONBtn = document.getElementById('adminExportJSON');
  const importBtn = document.getElementById('adminImport');
  const importFile = document.getElementById('importFile');

  if(exportBtn) exportBtn.addEventListener('click', ()=>{
    // Экспорт истории в читаемом формате
    let text = 'ИСТОРИЯ ЗАПИСЕЙ\n\n';
    const sortedDates = Object.keys(data).sort();

    sortedDates.forEach(dateKey => {
      const day = data[dateKey];
      if(day.bookings && day.bookings.length > 0){
        text += `${dateKey}:\n`;
        day.bookings.forEach(b => {
          text += `  ${b.start}-${b.end}: ${b.name}`;
          if(b.phone) text += ` (${b.phone})`;
          if(b.service) text += ` — ${b.service}`;
          if(b.note) text += `\n    Заметка: ${b.note}`;
          text += '\n';
        });
        text += '\n';
      }
    });

    const blob = new Blob([text], {type:'text/plain;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href=url; a.download = `vera-history-${keyOf(new Date())}.txt`;
    a.click(); URL.revokeObjectURL(url);
  });

  if(exportJSONBtn) exportJSONBtn.addEventListener('click', ()=>{
    const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href=url; a.download = `vera-calendar-${keyOf(new Date())}.json`;
    a.click(); URL.revokeObjectURL(url);
  });

  if(importBtn) importBtn.addEventListener('click', ()=> importFile.click());
  if(importFile) importFile.addEventListener('change', (e)=>{
    const f = e.target.files[0]; if(!f) return;
    const r = new FileReader();
    r.onload = (ev)=>{
      try{
        const obj = JSON.parse(ev.target.result);
        if(typeof obj!=='object') throw 0;
        if(confirm('Заменить текущие данные календаря импортированными?')){
          data = obj; save(); renderCalendar();
          if(selectedKey) renderHours();
        }
      }catch(err){ alert('Не удалось прочитать файл'); }
    };
    r.readAsText(f);
  });

  // ===== УТИЛИТЫ =====
  function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  // ===== ПЕРЕРЕНДЕР ПРИ СМЕНЕ РЕЖИМА АДМИНА =====
  const mo = new MutationObserver(()=>{
    renderCalendar();
    if(selectedKey) renderHours();
  });
  mo.observe(document.body, { attributes:true, attributeFilter:['class'] });

  // ===== КНОПКА НАСТРОЙКИ ТОКЕНА =====
  document.addEventListener('click', (e) => {
    if(e.target && e.target.id === 'setupGitHubToken'){
      e.preventDefault();
      e.stopPropagation();

      const currentToken = window.GitHubSync ? window.GitHubSync.getToken() : null;
      const tokenInfo = currentToken ? `\n\nТекущий токен: ${currentToken.substring(0, 10)}...` : '\n\nТокен не настроен.';

      const token = prompt(
        `Настройка GitHub токена для календаря${tokenInfo}\n\n` +
        `Введите Personal Access Token (Classic):\n` +
        `- Должен начинаться с ghp_\n` +
        `- Создать: https://github.com/settings/tokens\n` +
        `- Права: repo (полный доступ)\n\n` +
        `Оставьте пустым для отмены.`
      );

      if(token === null || token === '') return;

      if(!token.startsWith('ghp_') && !token.startsWith('github_pat_')){
        alert('❌ Неправильный формат токена!\n\nТокен должен начинаться с:\n- ghp_ (Classic token)\n- github_pat_ (Fine-grained token)');
        return;
      }

      if(window.GitHubSync){
        window.GitHubSync.saveToken(token);
        alert('✅ Токен сохранён!\n\nОбновите страницу для применения изменений.');
        location.reload();
      } else {
        alert('❌ GitHubSync не загружен. Обновите страницу и попробуйте снова.');
      }
    }
  });

  // ===== КНОПКА СОХРАНИТЬ В GITHUB =====
  const calendarSaveBtn = document.getElementById('calendarSave');
  if(calendarSaveBtn){
    calendarSaveBtn.addEventListener('click', async ()=>{
      calendarSaveBtn.textContent = '⏳ Сохранение...';
      calendarSaveBtn.disabled = true;

      if(window.GitHubSync && typeof window.GitHubSync.isConfigured === 'function' && window.GitHubSync.isConfigured()){
        try {
          const existing = await window.GitHubSync.getFile('calendar.json');
          const sha = existing ? existing.sha : null;
          await window.GitHubSync.saveFile('calendar.json', JSON.stringify(data, null, 2), 'Update calendar', sha);
          calendarSaveBtn.textContent = '✓ Сохранено!';
          setTimeout(() => {
            calendarSaveBtn.textContent = '💾 Сохранить в GitHub';
            calendarSaveBtn.disabled = false;
          }, 2000);
        } catch(err) {
          console.error('Ошибка сохранения:', err);
          alert('Ошибка сохранения в GitHub: ' + err.message);
          calendarSaveBtn.textContent = '💾 Сохранить в GitHub';
          calendarSaveBtn.disabled = false;
        }
      } else {
        alert('GitHub не настроен. Войдите как администратор и настройте токен на главной странице.');
        calendarSaveBtn.textContent = '💾 Сохранить в GitHub';
        calendarSaveBtn.disabled = false;
      }
    });
  }

  // ===== СТАРТ =====
  loadCalendarFromGitHub().then(loaded => {
    if(!loaded) renderCalendar();
  });

  // ===== ПОКАЗЫВАЕМ КНОПКУ "РЕДАКТИРОВАТЬ" ЕСЛИ АДМИН ЗАЛОГИНЕН =====
  const editBtn = document.getElementById('editBtn');
  if(editBtn && localStorage.getItem('vera_admin') === 'yes'){
    editBtn.style.display = '';
  }

  // ===== ОБРАБОТЧИК КНОПКИ "ВЫЙТИ" В КАЛЕНДАРЕ =====
  const adminLogout = document.getElementById('adminLogout');
  if(adminLogout){
    adminLogout.addEventListener('click', () => {
      localStorage.removeItem('vera_admin');
      document.body.classList.remove('admin-mode');
      const adminPanel = document.getElementById('adminPanel');
      if(adminPanel) adminPanel.classList.remove('show');
      if(editBtn) editBtn.style.display = 'none';
      location.reload();
    });
  }
})();
