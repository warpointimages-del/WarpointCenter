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

// Элементы DOM
const userName = document.getElementById('user-name');
const monthSelector = document.getElementById('month-selector');
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
    
    // Установка текущего месяца
    const today = new Date();
    const currentMonth = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}`;
    monthSelector.value = currentMonth;

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
    monthSelector.addEventListener('change', () => renderCalendar());
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

// Отображение календаря
function renderCalendar() {
    if (!scheduleData?.shifts) return;
    
    const selectedMonth = monthSelector.value;
    const [year, month] = selectedMonth.split('-').map(Number);
    
    // Фильтруем смены по выбранному месяцу
    const monthShifts = scheduleData.shifts.filter(shift => {
        if (!shift.date) return false;
        const shiftDate = new Date(shift.date);
        return shiftDate.getFullYear() === year && 
               shiftDate.getMonth() + 1 === month;
    });
    
    // Очищаем календарь
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
                shiftItem.className = `shift-item shift-${getShiftTypeClass(shift.hours)}`;
                
                const hoursSpan = document.createElement('span');
                hoursSpan.className = 'shift-hours';
                hoursSpan.textContent = `${shift.hours}ч`;
                
                const shiftText = document.createTextNode(' Смена');
                
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
    const todayShifts = scheduleData?.shifts?.filter(shift => shift.date === todayStr) || [];
    
    if (todayShifts.length > 0) {
        const todayShift = todayShifts[0];
        todayStatus.textContent = `Есть смена: ${todayShift.hours} часов (${todayShift.type || 'смена'})`;
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
