// ===== ИНТЕРАКТИВНЫЙ КАЛЕНДАРЬ =====
(function(){
  const WORK_START = 10;   // 10:00
  const WORK_END   = 20;   // 20:00 (последний слот 19:00-20:00)
  const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь',
                  'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

  // Структура данных:
  // { "2026-05-14": { dayOff:false, slots:{ "10":{status:"booked",name:"",phone:"",service:"",note:""}, "11":{status:"break"} } } }
  let data = {}; // Загружается из GitHub при старте
  let viewDate = new Date();
  viewDate.setDate(1);
  let selectedKey = null;

  // Сохранение ТОЛЬКО в GitHub (без localStorage)
  async function save(){
    // Синхронизация с GitHub (если настроен)
    if(window.GitHubSync && typeof window.GitHubSync.isConfigured === 'function' && window.GitHubSync.isConfigured()){
      try {
        const existing = await window.GitHubSync.getFile('calendar.json');
        const sha = existing ? existing.sha : null;
        await window.GitHubSync.saveFile('calendar.json', JSON.stringify(data, null, 2), 'Update calendar', sha);
        console.log('✓ Календарь синхронизирован с GitHub');
      } catch(err) {
        console.warn('Не удалось синхронизировать календарь с GitHub:', err);
        alert('Ошибка сохранения в GitHub. Проверьте подключение.');
      }
    } else {
      alert('GitHub не настроен. Войдите как администратор и настройте токен.');
    }
  }

  // Загрузка календаря из GitHub при старте (публично, токен не нужен)
  async function loadCalendarFromGitHub(){
    if(window.GitHubSync && typeof window.GitHubSync.getFile === 'function'){
      try {
        const file = await window.GitHubSync.getFile('calendar.json');
        if(file){
          const content = decodeURIComponent(escape(atob(file.content)));
          const githubData = JSON.parse(content);
          data = githubData;
          console.log('✓ Календарь загружен из GitHub');
          renderCalendar();
          return true;
        } else {
          // Файл не найден - показываем пустой календарь
          console.log('Файл calendar.json не найден - показываем пустой календарь');
          data = {};
          renderCalendar();
          return false;
        }
      } catch(err) {
        console.warn('Не удалось загрузить календарь из GitHub:', err);
        data = {};
        renderCalendar();
        return false;
      }
    } else {
      // GitHubSync не загружен - показываем пустой календарь
      console.log('GitHubSync не загружен - показываем пустой календарь');
      data = {};
      renderCalendar();
      return false;
    }
  }
    return false;
  }
  function isAdminMode(){ return document.body.classList.contains('admin-mode'); }
  function keyOf(d){
    const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  }
  function ensureDay(k){
    if(!data[k]) data[k] = { dayOff:false, slots:{} };
    return data[k];
  }
  function isPast(d){
    const t=new Date(); t.setHours(0,0,0,0);
    return d < t;
  }
  function dayStats(k){
    const d = data[k];
    if(!d) return { off:false, booked:0, breaks:0, total: WORK_END-WORK_START };
    let booked=0, breaks=0;
    Object.values(d.slots||{}).forEach(s=>{
      if(s.status==='booked') booked++;
      else if(s.status==='break') breaks++;
    });
    return { off:!!d.dayOff, booked, breaks, total: WORK_END-WORK_START };
  }

  // ===== РЕНДЕР СЕТКИ =====
  const grid = document.getElementById('calGrid');
  const monthLabel = document.getElementById('monthLabel');

  function renderCalendar(){
    if(!grid){
      console.error('Элемент calGrid не найден!');
      return;
    }

    grid.innerHTML='';
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    monthLabel.textContent = `${MONTHS[month]} ${year}`;

    console.log(`Рендерим календарь: ${MONTHS[month]} ${year}`);

    // первый день месяца (Пн=0)
    let first = new Date(year, month, 1).getDay();
    first = first===0 ? 6 : first-1;
    const daysInMonth = new Date(year, month+1, 0).getDate();
    const today = new Date(); today.setHours(0,0,0,0);

    console.log(`Дней в месяце: ${daysInMonth}, первый день: ${first}`);

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
      if(stats.off) cell.classList.add('day-off');
      else if(stats.booked + stats.breaks >= stats.total) cell.classList.add('fully-busy');
      if(stats.booked>0 && isAdminMode()) cell.classList.add('has-bookings');

      const num = document.createElement('span');
      num.className='num'; num.textContent = d;
      cell.appendChild(num);

      const info = document.createElement('span');
      info.className='info';
      if(stats.off) info.textContent = 'выходной';
      else {
        const free = stats.total - stats.booked - stats.breaks;
        if(isAdminMode() && stats.booked>0) info.textContent = `${stats.booked} зап.`;
        else if(free===0) info.textContent = 'занято';
        else info.textContent = `${free} ч свободно`;
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
    const day = data[selectedKey] || { dayOff:false, slots:{} };

    if(day.dayOff){
      hoursGrid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:30px;opacity:.6">🌙 В этот день не работаю</div>';
      return;
    }

    for(let h=WORK_START; h<WORK_END; h++){
      const slot = day.slots && day.slots[h];
      const el = document.createElement('div');
      el.className = 'hour-slot';
      el.dataset.hour = h;

      const timeLabel = `${String(h).padStart(2,'0')}:00`;
      let html = timeLabel;

      if(slot && slot.status==='booked'){
        el.classList.add(isAdminMode() ? 'booked' : 'busy');
        if(isAdminMode()){
          html += `<span class="client">${escapeHtml(slot.name||'клиент')}</span>`;
          if(slot.service) html += `<span class="label">${escapeHtml(slot.service)}</span>`;
        } else {
          html += `<span class="label">занято</span>`;
        }
      } else if(slot && slot.status==='break'){
        el.classList.add('break');
        html += `<span class="label">перерыв</span>`;
      } else {
        html += `<span class="label">свободно</span>`;
      }

      el.innerHTML = html;
      el.addEventListener('click', ()=> onSlotClick(h));
      hoursGrid.appendChild(el);
    }
  }

  function onSlotClick(h){
    if(!isAdminMode()) return; // клиент только смотрит
    openBookingModal(h);
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
  let editingHour = null;

  function openBookingModal(h){
    editingHour = h;
    const day = ensureDay(selectedKey);
    const slot = day.slots[h] || {};
    bookingSlotInfo.textContent = `${selectedKey} · ${String(h).padStart(2,'0')}:00 — ${String(h+1).padStart(2,'0')}:00`;
    clientName.value = slot.name || '';
    clientPhone.value = slot.phone || '';
    clientService.value = slot.service || 'Перманент губ';
    clientNote.value = slot.note || '';

    // Кнопка перерыва — добавим динамически
    let breakBtn = document.getElementById('toggleBreakBtn');
    if(!breakBtn){
      breakBtn = document.createElement('button');
      breakBtn.id='toggleBreakBtn';
      breakBtn.style.cssText='background:#2a2a2a;color:#ccc;border:1px solid #444';
      document.querySelector('.booking-btns').insertBefore(breakBtn, bookingCancel);
    }
    breakBtn.textContent = slot.status==='break' ? '✕ Убрать перерыв' : '☕ Перерыв';
    breakBtn.onclick = ()=>{
      if(slot.status==='break'){ delete day.slots[h]; }
      else { day.slots[h] = { status:'break' }; }
      save(); bookingModal.classList.remove('show'); renderHours(); renderCalendar();
    };

    bookingDelete.style.display = slot.status==='booked' ? '' : 'none';
    bookingModal.classList.add('show');
    setTimeout(()=>clientName.focus(),50);
  }

  bookingSave.addEventListener('click', ()=>{
    if(!clientName.value.trim()){ alert('Укажи имя клиента'); return; }
    const day = ensureDay(selectedKey);
    day.slots[editingHour] = {
      status:'booked',
      name: clientName.value.trim(),
      phone: clientPhone.value.trim(),
      service: clientService.value,
      note: clientNote.value.trim()
    };
    save(); bookingModal.classList.remove('show');
    renderHours(); renderCalendar();
  });

  bookingDelete.addEventListener('click', ()=>{
    const day = ensureDay(selectedKey);
    delete day.slots[editingHour];
    save(); bookingModal.classList.remove('show');
    renderHours(); renderCalendar();
  });

  bookingCancel.addEventListener('click', ()=> bookingModal.classList.remove('show'));

  // ===== АДМИН: УПРАВЛЕНИЕ ДНЁМ =====
  document.getElementById('toggleDayOff').addEventListener('click', ()=>{
    const day = ensureDay(selectedKey);
    day.dayOff = !day.dayOff;
    save(); renderHours(); renderCalendar();
  });

  document.getElementById('clearDay').addEventListener('click', ()=>{
    if(!confirm('Очистить все записи и перерывы этого дня?')) return;
    data[selectedKey] = { dayOff:false, slots:{} };
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

  // ===== ЭКСПОРТ / ИМПОРТ (резервная копия) =====
  const exportBtn = document.getElementById('adminExport');
  const exportJSONBtn = document.getElementById('adminExportJSON');
  const importBtn = document.getElementById('adminImport');
  const importFile = document.getElementById('importFile');

  if(exportBtn) exportBtn.addEventListener('click', ()=>{
    // Собираем все записи в читаемый формат
    let output = 'ИСТОРИЯ ЗАПИСЕЙ - СТУДИЯ ВЕРА\n';
    output += '='.repeat(60) + '\n';
    output += `Экспорт от: ${new Date().toLocaleString('ru-RU')}\n\n`;

    // Сортируем даты
    const sortedDates = Object.keys(data).sort();
    let totalBookings = 0;

    sortedDates.forEach(dateKey => {
      const day = data[dateKey];
      if(!day.slots || Object.keys(day.slots).length === 0) return;

      const dateObj = new Date(dateKey);
      const dateStr = dateObj.toLocaleDateString('ru-RU', {weekday:'long', day:'numeric', month:'long', year:'numeric'});

      output += '\n' + dateStr.toUpperCase() + '\n';
      output += '-'.repeat(60) + '\n';

      if(day.dayOff){
        output += '  ВЫХОДНОЙ ДЕНЬ\n';
        return;
      }

      // Сортируем часы
      const hours = Object.keys(day.slots).map(h=>parseInt(h)).sort((a,b)=>a-b);

      hours.forEach(h => {
        const slot = day.slots[h];
        const timeStr = `${String(h).padStart(2,'0')}:00 - ${String(h+1).padStart(2,'0')}:00`;

        if(slot.status === 'booked'){
          totalBookings++;
          output += `  ${timeStr}\n`;
          output += `    Клиент: ${slot.name || 'не указано'}\n`;
          output += `    Телефон: ${slot.phone || 'не указано'}\n`;
          output += `    Услуга: ${slot.service || 'не указано'}\n`;
          if(slot.note) output += `    Заметка: ${slot.note}\n`;
          output += '\n';
        } else if(slot.status === 'break'){
          output += `  ${timeStr} - ПЕРЕРЫВ\n`;
        }
      });
    });

    output += '\n' + '='.repeat(60) + '\n';
    output += `ВСЕГО ЗАПИСЕЙ: ${totalBookings}\n`;

    const blob = new Blob([output], {type:'text/plain;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href=url; a.download = `vera-история-${keyOf(new Date())}.txt`;
    a.click(); URL.revokeObjectURL(url);
  });

  if(exportJSONBtn) exportJSONBtn.addEventListener('click', ()=>{
    const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href=url; a.download = `vera-backup-${keyOf(new Date())}.json`;
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
  // main.js переключает класс admin-mode на body — слушаем мутации
  const mo = new MutationObserver(()=>{
    renderCalendar();
    if(selectedKey) renderHours();
  });
  mo.observe(document.body, { attributes:true, attributeFilter:['class'] });

  // ===== СТАРТ =====
  // Загружаем календарь из GitHub, если не удалось - рендерим локальные данные
  loadCalendarFromGitHub().then(loaded => {
    if(!loaded) renderCalendar();
  });
})();
