const tg = window.Telegram.WebApp;
const APP_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwl2T5Gq29iZvrTosmqBYSO0g10W4AOH0KGFS3mCkV9jcj3KLDmoBw74hFSsElZcQJhQw/exec';

// Элементы DOM
const userName = document.getElementById('user-name');
const monthSelector = document.getElementById('month-selector');
const refreshBtn = document.getElementById('refresh-btn');
const calendarGrid = document.getElementById('calendar-grid');
const loading = document.getElementById('loading');
const todayDate = document.getElementById('today-date');
const todayEmployee = document.getElementById('today-employee');
const todayStatus = document.getElementById('today-status');

let currentUser = null;
let employeeIds = [];
let allShifts = [];

// Инициализация приложения
document.addEventListener('DOMContentLoaded', function() {
    if (tg) {
        tg.expand();
        tg.ready();
        tg.enableClosingConfirmation();
    }
    initApp();
});

// Инициализация приложения
function initApp() {
    // Авторизация через Telegram
    if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
        currentUser = tg.initDataUnsafe.user;
        localStorage.setItem('tg_user_data', JSON.stringify(currentUser));
    } else {
        // Fallback: проверяем localStorage
        const savedUser = localStorage.getItem('tg_user_data');
        if (savedUser) {
            currentUser = JSON.parse(savedUser);
        } else {
            // Если нет данных - показываем сообщение
            document.body.innerHTML = `
                <div style="padding: 40px; text-align: center;">
                    <h2>Откройте приложение в Telegram</h2>
                    <p style="margin-top: 10px; color: #666;">Это приложение работает только внутри Telegram</p>
                </div>
            `;
            return;
        }
    }

    // Показываем интерфейс
    userName.textContent = `${currentUser.first_name}${currentUser.last_name ? ' ' + currentUser.last_name : ''}`;
    
    // Настройка обработчиков
    refreshBtn.addEventListener('click', loadMonthData);
    monthSelector.addEventListener('change', loadMonthData);

    // Устанавливаем текущий месяц
    const today = new Date();
    const currentMonth = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}`;
    monthSelector.value = currentMonth;

    // Загружаем данные
    loadMonthData();
}

// Загрузка данных для выбранного месяца
async function loadMonthData() {
    showLoading(true);
    
    try {
        console.log('Загрузка данных для TG ID:', currentUser.id);
        
        // 1. Получаем ID сотрудников
        const idsResponse = await fetch(`${APP_SCRIPT_URL}?function=getEmployeeIds&telegramId=${currentUser.id}`);
        
        if (!idsResponse.ok) {
            throw new Error(`Ошибка сервера: ${idsResponse.status}`);
        }
        
        const idsData = await idsResponse.json();
        if (!idsData.success) {
            throw new Error(idsData.error || 'Ошибка получения ID сотрудников');
        }
        
        employeeIds = idsData.data;
        console.log('Найдены ID сотрудников:', employeeIds);
        
        if (employeeIds.length === 0) {
            alert('Сотрудник не найден. Обратитесь к администратору.');
            showLoading(false);
            return;
        }
        
        // 2. Загружаем смены ТОЛЬКО для выбранного месяца
        const selectedMonth = monthSelector.value;
        allShifts = [];
        
        for (const id of employeeIds) {
            try {
                const shiftsResponse = await fetch(`${APP_SCRIPT_URL}?function=getShiftsByMonth&employeeId=${id}&month=${selectedMonth}`);
                
                if (shiftsResponse.ok) {
                    const shiftsData = await shiftsResponse.json();
                    if (shiftsData.success) {
                        console.log(`Смены для ID ${id} за ${selectedMonth}:`, shiftsData.data);
                        
                        const shiftsWithId = shiftsData.data.map(shift => ({
                            ...shift,
                            employeeId: id,
                            isMainUser: true
                        }));
                        
                        allShifts.push(...shiftsWithId);
                    }
                }
            } catch (error) {
                console.warn(`Ошибка загрузки смен для ID ${id}:`, error);
            }
        }
        
        console.log('Смены за месяц:', allShifts.length);
        renderCalendar();
        updateTodayInfo();
        
    } catch (error) {
        console.error('Ошибка загрузки:', error);
        alert('Ошибка загрузки данных: ' + error.message);
    } finally {
        showLoading(false);
    }
}

// Отображение календаря
function renderCalendar() {
    const selectedMonth = monthSelector.value;
    const [year, month] = selectedMonth.split('-').map(Number);
    
    // Фильтруем смены по выбранному месяцу
    const monthShifts = allShifts.filter(shift => {
        if (!shift.date) return false;
        const shiftDate = new Date(shift.date);
        return shiftDate.getFullYear() === year && 
               shiftDate.getMonth() + 1 === month;
    });
    
    // Создаем календарь
    calendarGrid.innerHTML = '';
    
    // Первый день месяца
    const firstDay = new Date(year, month - 1, 1);
    const startDay = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
    
    // Пустые ячейки перед первым днем
    for (let i = 0; i < startDay; i++) {
        const emptyDay = document.createElement('div');
        emptyDay.className = 'calendar-day empty';
        calendarGrid.appendChild(emptyDay);
    }
    
    // Дни месяца
    const daysInMonth = new Date(year, month, 0).getDate();
    const today = new Date();
    
    for (let day = 1; day <= daysInMonth; day++) {
        const dayElement = document.createElement('div');
        const dateStr = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        
        // Проверяем, сегодня ли это
        if (today.getDate() === day && 
            today.getMonth() + 1 === month && 
            today.getFullYear() === year) {
            dayElement.classList.add('today');
        }
        
        dayElement.className = 'calendar-day';
        
        // Добавляем номер дня
        const dayNumber = document.createElement('div');
        dayNumber.className = 'day-number';
        dayNumber.textContent = day;
        dayElement.appendChild(dayNumber);
        
        // Смены для этого дня
        const dayShifts = monthShifts.filter(s => s.date === dateStr);
        
        if (dayShifts.length > 0) {
            const shiftsContainer = document.createElement('div');
            shiftsContainer.className = 'shifts-container';
            
            dayShifts.forEach(shift => {
                const shiftItem = document.createElement('div');
                shiftItem.className = `shift-item ${shift.isMainUser ? 'main-user' : 'other-user'} shift-${getShiftTypeClass(shift.hours)}`;
                
                const hoursSpan = document.createElement('span');
                hoursSpan.className = 'shift-hours';
                hoursSpan.textContent = `${shift.hours}ч`;
                
                const shiftText = document.createTextNode(shift.isMainUser ? ' Ваша смена' : ' Смена');
                
                shiftItem.appendChild(hoursSpan);
                shiftItem.appendChild(shiftText);
                shiftsContainer.appendChild(shiftItem);
            });
            
            dayElement.appendChild(shiftsContainer);
        }
        
        calendarGrid.appendChild(dayElement);
    }
}

// Обновление информации на сегодня
function updateTodayInfo() {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    // Устанавливаем дату
    const options = { day: 'numeric', month: 'long', year: 'numeric' };
    todayDate.textContent = today.toLocaleDateString('ru-RU', options);
    
    // Устанавливаем имя сотрудника
    todayEmployee.textContent = `${currentUser.first_name}${currentUser.last_name ? ' ' + currentUser.last_name : ''}`;
    
    // Проверяем есть ли смена сегодня
    const todayShifts = allShifts.filter(shift => shift.date === todayStr);
    
    if (todayShifts.length > 0) {
        const todayShift = todayShifts[0];
        todayStatus.textContent = `Есть смена: ${todayShift.hours} часов (${todayShift.shift_type || 'смена'})`;
        todayStatus.className = 'has-shift';
    } else {
        todayStatus.textContent = 'Сегодня смены нет';
        todayStatus.className = 'no-shift';
    }
}

// Получение класса типа смены
function getShiftTypeClass(hours) {
    if (hours <= 4) return 'short';
    if (hours <= 8) return 'day';
    if (hours <= 11) return 'full';
    if (hours === 12) return 'extended';
    if (hours > 12) return 'long';
    return 'full';
}

// Вспомогательные функции
function showLoading(show) {
    loading.classList.toggle('hidden', !show);
}
