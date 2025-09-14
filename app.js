import { 
    loadScheduleData, 
    saveUserData, 
    loadUserData, 
    loadAllUsers, 
    loadEmployeeLinks, 
    saveEmployeeLink, 
    registerUser, 
    updateUserLastSeen 
} from './firebase.js';

// Конфигурация
const ADMIN_ID = 1999947340;

// Глобальные переменные
const tg = window.Telegram.WebApp;
let currentUser = null;
let scheduleData = null;
let userData = null;
let isAdmin = false;
let employeeLinks = {};
let allUsers = {};
let allEmployees = [];
let currentWeekStart = null;
let isMonthView = false;

// Элементы DOM
const userName = document.getElementById('user-name');
const refreshBtn = document.getElementById('refresh-btn');
const adminPanel = document.getElementById('admin-panel');
const manageUsersBtn = document.getElementById('manage-users-btn');
const calendarGrid = document.getElementById('calendar-grid');
const loading = document.getElementById('loading');
const todayDate = document.getElementById('today-date');
const todayEmployee = document.getElementById('today-employee');
const todayStatus = document.getElementById('today-status');
const userModal = document.getElementById('user-modal');
const usersList = document.getElementById('users-list');
const prevWeekBtn = document.getElementById('prev-week');
const nextWeekBtn = document.getElementById('next-week');
const weekRange = document.getElementById('week-range');
const toggleViewBtn = document.getElementById('toggle-view');

// Инициализация приложения
document.addEventListener('DOMContentLoaded', async function() {
    if (tg) {
        tg.expand();
        tg.ready();
        tg.enableClosingConfirmation();
    }
    await initApp();
});

// Основная инициализация
async function initApp() {
    // Авторизация через Telegram
    if (tg?.initDataUnsafe?.user) {
        currentUser = tg.initDataUnsafe.user;
        localStorage.setItem('tg_user_data', JSON.stringify(currentUser));
    } else {
        const savedUser = localStorage.getItem('tg_user_data');
        if (savedUser) currentUser = JSON.parse(savedUser);
    }

    if (!currentUser) {
        showErrorMessage('Откройте приложение в Telegram');
        return;
    }

    // Настройка интерфейса
    userName.textContent = `${currentUser.first_name}${currentUser.last_name ? ' ' + currentUser.last_name : ''}`;
    
    // Проверка прав админа
    isAdmin = currentUser.id == ADMIN_ID;
    if (isAdmin) {
        adminPanel.classList.remove('hidden');
    }
    
    // Установка текущей недели
    const today = new Date();
    currentWeekStart = getWeekStartDate(today);
    
    // Настройка обработчиков
    setupEventListeners();

    // Регистрация и загрузка данных
    await registerCurrentUser();
    await loadData();
}

// Настройка обработчиков событий
function setupEventListeners() {
    refreshBtn.addEventListener('click', () => loadData());
    if (manageUsersBtn) {
        manageUsersBtn.addEventListener('click', () => showUserManagement());
    }
    prevWeekBtn.addEventListener('click', () => navigateWeek(-1));
    nextWeekBtn.addEventListener('click', () => navigateWeek(1));
    toggleViewBtn.addEventListener('click', () => toggleView());
}

// Регистрация текущего пользователя
async function registerCurrentUser() {
    try {
        const existingUser = await loadUserData(currentUser.id);
        
        if (!existingUser) {
            await registerUser(currentUser.id, {
                telegramId: currentUser.id,
                username: currentUser.username || '',
                firstName: currentUser.first_name,
                lastName: currentUser.last_name || '',
                isAdmin: currentUser.id == ADMIN_ID
            });
            console.log('Новый пользователь зарегистрирован');
        } else {
            await updateUserLastSeen(currentUser.id);
        }
    } catch (error) {
        console.error('Ошибка регистрации:', error);
    }
}

// Загрузка данных
async function loadData() {
    showLoading(true);
    
    try {
        // Загружаем данные из Firebase
        scheduleData = await loadScheduleData();
        
        if (!scheduleData) {
            showErrorMessage('Данные не найдены. Дождитесь синхронизации.');
            return;
        }

        // Загружаем привязки сотрудников
        employeeLinks = await loadEmployeeLinks();
        
        // Загружаем данные пользователя
        userData = await loadUserData(currentUser.id) || {};
        
        // Для обычных пользователей - фильтруем смены
        if (!isAdmin) {
            await filterShiftsForUser();
        }
        
        // Сохраняем список сотрудников для админки
        allEmployees = scheduleData.employees || [];
        
        // Обновляем интерфейс
        updateWeekDisplay();
        renderCalendar();
        updateTodayInfo();
        
    } catch (error) {
        console.error('Ошибка загрузки:', error);
        showErrorMessage('Ошибка загрузки данных: ' + error.message);
    } finally {
        showLoading(false);
    }
}

// Фильтрация смен для обычного пользователя
async function filterShiftsForUser() {
    const userLink = employeeLinks[currentUser.id];
    if (userLink && scheduleData?.shifts) {
        scheduleData.shifts = scheduleData.shifts.filter(
            shift => shift.employeeId == userLink.employeeId
        );
    }
}

// Навигация по неделям/месяцам
function navigateWeek(direction) {
    if (isMonthView) {
        // Навигация по месяцам
        const newDate = new Date(currentWeekStart);
        newDate.setMonth(newDate.getMonth() + direction);
        currentWeekStart = getWeekStartDate(newDate);
    } else {
        // Навигация по неделям
        const daysToAdd = direction * 7;
        currentWeekStart.setDate(currentWeekStart.getDate() + daysToAdd);
    }
    
    updateWeekDisplay();
    renderCalendar();
}

// Переключение между видом недели и месяца
function toggleView() {
    isMonthView = !isMonthView;
    toggleViewBtn.textContent = isMonthView ? '▲' : '▼';
    updateWeekDisplay();
    renderCalendar();
}

// Обновление отображения диапазона недели/месяца
function updateWeekDisplay() {
    if (isMonthView) {
        // Показываем месяц
        const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 
                          'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
        const month = currentWeekStart.getMonth();
        const year = currentWeekStart.getFullYear();
        weekRange.textContent = `${monthNames[month]} ${year}`;
    } else {
        // Показываем неделю
        const weekEnd = new Date(currentWeekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        
        const formatDate = (date) => {
            return date.toLocaleDateString('ru-RU', { 
                day: 'numeric', 
                month: 'short' 
            });
        };
        
        weekRange.textContent = `${formatDate(currentWeekStart)} - ${formatDate(weekEnd)}`;
    }
}

// Получение даты начала недели для указанной даты
function getWeekStartDate(date) {
    const dayOfWeek = date.getDay();
    const diff = date.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    return new Date(date.setDate(diff));
}

// Отображение календаря
function renderCalendar() {
    if (!scheduleData?.shifts) return;
    
    // Очищаем календарь
    calendarGrid.innerHTML = '';
    
    if (isMonthView) {
        renderMonthView();
    } else {
        renderWeekView();
    }
}

// Отображение вида недели
function renderWeekView() {
    const weekDays = [];
    const currentDate = new Date(currentWeekStart);
    
    // Создаем массив дней недели
    for (let i = 0; i < 7; i++) {
        const dayDate = new Date(currentDate);
        dayDate.setDate(currentDate.getDate() + i);
        weekDays.push(dayDate);
    }
    
    // Добавляем заголовки дней
    const dayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    dayNames.forEach(name => {
        const dayHeader = document.createElement('div');
        dayHeader.className = 'calendar-day-header';
        dayHeader.textContent = name;
        calendarGrid.appendChild(dayHeader);
    });
    
    // Добавляем дни недели
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    weekDays.forEach(dayDate => {
        const dayElement = document.createElement('div');
        const dateStr = dayDate.toISOString().split('T')[0];
        
        // Проверяем, сегодня ли это
        const dayCopy = new Date(dayDate);
        dayCopy.setHours(0, 0, 0, 0);
        if (dayCopy.getTime() === today.getTime()) {
            dayElement.classList.add('today');
        }
        
        dayElement.className = 'calendar-day';
        
        // Добавляем номер дня
        const dayNumber = document.createElement('div');
        dayNumber.className = 'day-number';
        dayNumber.textContent = dayDate.getDate();
        dayElement.appendChild(dayNumber);
        
        // Смены для этого дня
        const dayShifts = scheduleData.shifts.filter(s => s.date === dateStr);
        
        if (dayShifts.length > 0) {
            const shiftsContainer = document.createElement('div');
            shiftsContainer.className = 'shifts-container';
            
            dayShifts.forEach(shift => {
                const shiftItem = document.createElement('div');
                shiftItem.className = 'shift-item';
                
                const hoursSpan = document.createElement('span');
                hoursSpan.className = 'shift-hours';
                hoursSpan.textContent = `${shift.hours}ч`;
                
                shiftItem.appendChild(hoursSpan);
                shiftsContainer.appendChild(shiftItem);
            });
            
            dayElement.appendChild(shiftsContainer);
        }
        
        calendarGrid.appendChild(dayElement);
    });
}

// Отображение вида месяца
function renderMonthView() {
    const year = currentWeekStart.getFullYear();
    const month = currentWeekStart.getMonth();
    
    // Первый день месяца
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    // Пустые ячейки перед первым днем
    const startDay = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
    
    for (let i = 0; i < startDay; i++) {
        const emptyDay = document.createElement('div');
        emptyDay.className = 'calendar-day empty';
        calendarGrid.appendChild(emptyDay);
    }
    
    // Дни месяца
    const daysInMonth = lastDay.getDate();
    const today = new Date();
    
    for (let day = 1; day <= daysInMonth; day++) {
        const dayElement = document.createElement('div');
        const dateStr = `${year}-${(month + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        
        // Проверяем, сегодня ли это
        if (today.getDate() === day && 
            today.getMonth() === month && 
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
        const dayShifts = scheduleData.shifts.filter(s => s.date === dateStr);
        
        if (dayShifts.length > 0) {
            const shiftsContainer = document.createElement('div');
            shiftsContainer.className = 'shifts-container';
            
            dayShifts.forEach(shift => {
                const shiftItem = document.createElement('div');
                shiftItem.className = 'shift-item';
                
                const hoursSpan = document.createElement('span');
                hoursSpan.className = 'shift-hours';
                hoursSpan.textContent = `${shift.hours}ч`;
                
                shiftItem.appendChild(hoursSpan);
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
    const todayShifts = scheduleData?.shifts?.filter(shift => shift.date === todayStr) || [];
    
    if (todayShifts.length > 0) {
        const todayShift = todayShifts[0];
        todayStatus.textContent = `Есть смена: ${todayShift.hours} часов`;
        todayStatus.className = 'has-shift';
    } else {
        todayStatus.textContent = 'Сегодня смены нет';
        todayStatus.className = 'no-shift';
    }
}

// Управление пользователями
async function showUserManagement() {
    showLoading(true);
    
    try {
        // Загружаем всех пользователей
        allUsers = await loadAllUsers();
        
        // Показываем модальное окно
        userModal.classList.remove('hidden');
        renderUsersList();
        
    } catch (error) {
        console.error('Ошибка загрузки пользователей:', error);
        alert('Ошибка загрузки данных пользователей');
    } finally {
        showLoading(false);
    }
}

// Отрисовка списка пользователей
function renderUsersList() {
    usersList.innerHTML = Object.entries(allUsers)
        .sort(([idA, userA], [idB, userB]) => 
            new Date(userB.lastSeen) - new Date(userA.lastSeen)
        )
        .map(([userId, userData]) => {
            const userLink = employeeLinks[userId];
            const linkedEmployee = userLink ? allEmployees.find(e => e.id == userLink.employeeId) : null;
            
            return `
                <div class="user-item">
                    <div class="user-info">
                        <strong>ID: ${userId}</strong>
                        <span>@${userData.username || 'без username'}</span>
                        <span>${userData.firstName} ${userData.lastName || ''}</span>
                        <small>Последний вход: ${new Date(userData.lastSeen).toLocaleString()}</small>
                    </div>
                    <div class="user-actions">
                        <select class="employee-select" data-user-id="${userId}">
                            <option value="">-- Выберите сотрудника --</option>
                            ${allEmployees.map(emp => `
                                <option value="${emp.id}" ${userLink?.employeeId == emp.id ? 'selected' : ''}>
                                    ${emp.id} - ${emp.name}
                                </option>
                            `).join('')}
                        </select>
                        <button class="save-btn" onclick="saveEmployeeLink('${userId}')">💾</button>
                        ${linkedEmployee ? `<span class="linked-info">Привязан к: ${linkedEmployee.name}</span>` : ''}
                    </div>
                </div>
            `;
        }).join('');
}

// Сохранение привязки сотрудника
async function saveEmployeeLink(telegramId) {
    const select = document.querySelector(`.employee-select[data-user-id="${telegramId}"]`);
    const employeeId = select.value;
    
    if (!employeeId) {
        alert('Выберите сотрудника');
        return;
    }
    
    try {
        await saveEmployeeLink(telegramId, employeeId);
        alert('✅ Сотрудник привязан!');
        
        // Обновляем локальные данные
        employeeLinks = await loadEmployeeLinks();
        renderUsersList();
        
    } catch (error) {
        alert('❌ Ошибка сохранения: ' + error.message);
    }
}

// Закрытие модального окна
function closeModal() {
    userModal.classList.add('hidden');
}

// Вспомогательные функции
function showLoading(show) {
    loading.classList.toggle('hidden', !show);
}

function showErrorMessage(message) {
    const container = document.querySelector('.container');
    container.innerHTML = `
        <div class="error-message">
            <h2>😕 ${message}</h2>
            <button onclick="location.reload()">🔄 Обновить</button>
        </div>
    `;
}

// Глобальные функции
window.saveEmployeeLink = saveEmployeeLink;
window.closeModal = closeModal;
