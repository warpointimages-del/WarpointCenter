import { loadScheduleData, saveUserData, loadUserData } from './firebase.js';

// Конфигурация
const APP_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzTezvV4Wa9L3zGy5qMilIVvFQRWH0h4YPiyUyJm_wI7_SSlgFZYcdhPYMCMUqWZkuNPw/exec';

// Глобальные переменные
const tg = window.Telegram.WebApp;
let currentUser = null;
let scheduleData = null;
let userData = null;

// Элементы DOM
const userName = document.getElementById('user-name');
const monthSelector = document.getElementById('month-selector');
const refreshBtn = document.getElementById('refresh-btn');
const forceUpdateBtn = document.getElementById('force-update-btn');
const calendarGrid = document.getElementById('calendar-grid');
const loading = document.getElementById('loading');
const todayDate = document.getElementById('today-date');
const todayEmployee = document.getElementById('today-employee');
const todayStatus = document.getElementById('today-status');

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
    
    // Установка текущего месяца
    const today = new Date();
    const currentMonth = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}`;
    monthSelector.value = currentMonth;

    // Настройка обработчиков
    setupEventListeners();

    // Загрузка данных
    await loadData();
}

// Настройка обработчиков событий
function setupEventListeners() {
    refreshBtn.addEventListener('click', () => loadData());
    forceUpdateBtn.addEventListener('click', () => forceUpdate());
    monthSelector.addEventListener('change', () => renderCalendar());
}

// Загрузка данных
async function loadData() {
    showLoading(true);
    
    try {
        // Загружаем данные из Firebase
        scheduleData = await loadScheduleData();
        
        if (!scheduleData) {
            showErrorMessage('Данные не найдены. Попробуйте синхронизировать.');
            return;
        }

        // Загружаем данные пользователя
        userData = await loadUserData(currentUser.id) || {};
        
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

// Принудительная синхронизация
async function forceUpdate() {
    showLoading(true);
    
    try {
        // Отправляем запрос на обновление в Google Script
        const response = await fetch(`${APP_SCRIPT_URL}?action=forceUpdate&telegramId=${currentUser.id}`);
        const result = await response.json();
        
        if (result.success) {
            // Перезагружаем данные после синхронизации
            await loadData();
            alert('✅ Данные синхронизированы!');
        } else {
            throw new Error(result.error || 'Ошибка синхронизации');
        }
        
    } catch (error) {
        console.error('Ошибка синхронизации:', error);
        alert('❌ Ошибка синхронизации: ' + error.message);
    } finally {
        showLoading(false);
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

// Сохранение настроек пользователя (пример)
async function saveUserSettings(settings) {
    try {
        await saveUserData(currentUser.id, {
            ...userData,
            settings: settings,
            lastUpdated: new Date().toISOString()
        });
        return true;
    } catch (error) {
        console.error('Ошибка сохранения настроек:', error);
        return false;
    }
}

// Глобальные функции для кнопок
window.forceUpdate = forceUpdate;
