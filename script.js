import { firebaseService } from './firebase.js';
import { adminPanel } from './admin-panel.js';

class ScheduleApp {
    constructor() {
        this.tg = window.Telegram.WebApp;
        this.currentUser = null;
        this.currentDate = new Date();
        this.isMonthView = false;
        this.scheduleData = { employees: [], schedule: {} };
        this.userColor = { h: 200, s: 80, l: 50 };
        
        this.init().catch(console.error);
    }

    async init() {
        // Быстрая инициализация UI
        this.tg.expand();
        this.showScreen('main');
        
        // Параллельная загрузка всего
        await Promise.all([
            this.initializeUser(),
            this.loadCriticalData()
        ]);
        
        this.initializeEventListeners();
        this.renderCalendar();
        
        // Фоновые задачи
        this.loadNonCriticalData();
    }

    async initializeUser() {
        const user = this.tg.initDataUnsafe?.user;
        if (!user) return;

        this.currentUser = {
            id: user.id,
            first_name: user.first_name,
            username: user.username,
            isAdmin: user.id === 1999947340
        };

        // Быстрое сохранение пользователя
        setTimeout(() => {
            firebaseService.saveUser(this.currentUser);
        }, 0);

        this.updateUserInfo();
    }

    async loadCriticalData() {
        // Загружаем только текущий месяц
        const monthYear = this.getMonthYearString(this.currentDate);
        
        try {
            const [schedule, userData] = await Promise.all([
                firebaseService.getScheduleData(monthYear),
                this.currentUser ? firebaseService.getUser(this.currentUser.id) : Promise.resolve(null)
            ]);
            
            if (schedule) {
                this.scheduleData = schedule;
            }
            
            if (userData && this.currentUser) {
                this.currentUser = { ...this.currentUser, ...userData };
                this.userColor = userData.color || this.userColor;
            }
        } catch (error) {
            console.log('Быстрая загрузка данных не удалась, продолжаем без них');
        }
    }

    async loadNonCriticalData() {
        // Фоновая загрузка остальных данных
        setTimeout(async () => {
            await this.tryParseGoogleSheets();
            this.renderCalendar();
            
            if (this.currentUser?.isAdmin) {
                this.loadAdminPanel();
            }
        }, 1000);
    }

    async tryParseGoogleSheets() {
        try {
            const monthYear = this.getMonthYearString(this.currentDate);
            const sheetName = this.getRussianMonthYear(this.currentDate);
            
            // Простой fetch без сложной обработки
            const response = await fetch(
                `https://docs.google.com/spreadsheets/d/1leyP2K649JNfC8XvIV3amZPnQz18jFI95JAJoeXcXGk/gviz/tq?sheet=${encodeURIComponent(sheetName)}&tqx=out:csv`
            );
            
            if (response.ok) {
                const csv = await response.text();
                const parsed = this.simpleCSVParse(csv);
                
                if (parsed.employees.length > 0) {
                    this.scheduleData = parsed;
                    await firebaseService.saveScheduleData(monthYear, parsed);
                }
            }
        } catch (error) {
            // Игнорируем ошибки парсинга
        }
    }

    simpleCSVParse(csvText) {
        const employees = [];
        const schedule = {};
        const lines = csvText.split('\n').filter(l => l.trim());
        
        if (lines.length < 2) return { employees, schedule };
        
        // Простая обработка CSV
        for (let i = 1; i < lines.length; i++) {
            const cells = lines[i].split(',').map(c => c.replace(/"/g, '').trim());
            const name = cells[0];
            
            if (!name) continue;
            
            employees.push(name);
            
            for (let j = 1; j < cells.length; j++) {
                const day = j;
                const hours = parseFloat(cells[j]) || 0;
                
                if (hours > 0) {
                    if (!schedule[day]) schedule[day] = {};
                    schedule[day][name] = hours;
                }
            }
        }
        
        return { employees, schedule };
    }

    initializeEventListeners() {
        // Делегирование событий для производительности
        document.addEventListener('click', (e) => {
            if (e.target.id === 'prev-btn') this.navigate(-1);
            if (e.target.id === 'next-btn') this.navigate(1);
            if (e.target.id === 'toggle-view') this.toggleView();
            if (e.target.id === 'save-color') this.saveColor();
        });
        
        ['hue-slider', 'saturation-slider', 'lightness-slider'].forEach(id => {
            document.getElementById(id)?.addEventListener('input', (e) => {
                this.userColor[e.target.id.split('-')[0][0]] = parseInt(e.target.value);
                this.renderCalendar();
            });
        });
    }

    navigate(direction) {
        if (this.isMonthView) {
            this.currentDate.setMonth(this.currentDate.getMonth() + direction);
        } else {
            this.currentDate.setDate(this.currentDate.getDate() + (direction * 7));
        }
        this.renderCalendar();
    }

    toggleView() {
        this.isMonthView = !this.isMonthView;
        document.getElementById('toggle-view').textContent = this.isMonthView ? '↑' : '↓';
        document.getElementById('week-view').classList.toggle('active', !this.isMonthView);
        document.getElementById('month-view').classList.toggle('active', this.isMonthView);
        this.renderCalendar();
    }

    renderCalendar() {
        this.updateCurrentPeriod();
        
        if (this.isMonthView) {
            this.renderMonthView();
        } else {
            this.renderWeekView();
        }
    }

    renderWeekView() {
        const grid = document.getElementById('week-grid');
        if (!grid) return;
        
        const weekStart = this.getWeekStart(this.currentDate);
        let html = '';
        
        for (let i = 0; i < 7; i++) {
            const day = new Date(weekStart);
            day.setDate(weekStart.getDate() + i);
            html += this.createDayHTML(day, true);
        }
        
        grid.innerHTML = html;
    }

    renderMonthView() {
        const grid = document.getElementById('month-grid');
        if (!grid) return;
        
        const monthStart = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), 1);
        const monthEnd = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() + 1, 0);
        const firstDay = (monthStart.getDay() + 6) % 7;
        
        let html = '';
        
        // Заголовки
        for (let i = 0; i < 7; i++) {
            html += `<div class="day-header">${['Пн','Вт','Ср','Чт','Пт','Сб','Вс'][i]}</div>`;
        }
        
        // Пустые ячейки
        for (let i = 0; i < firstDay; i++) {
            html += '<div class="month-day empty"></div>';
        }
        
        // Дни месяца
        for (let day = 1; day <= monthEnd.getDate(); day++) {
            const date = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), day);
            html += this.createDayHTML(date, false);
        }
        
        grid.innerHTML = html;
    }

    createDayHTML(date, isWeekView) {
        const day = date.getDate();
        const shifts = this.scheduleData.schedule[day] || {};
        const className = isWeekView ? 'day-cell' : 'month-day';
        const employeeName = this.currentUser?.employeeName;
        
        let shiftsHTML = '';
        let shiftIndex = 0;
        
        Object.entries(shifts).forEach(([name, hours]) => {
            const isUser = name === employeeName;
            const color = isUser ? this.getUserColor() : this.getEmployeeColor(name);
            const top = 10 + (shiftIndex * 6);
            
            shiftsHTML += `
                <div class="shift-marker ${isUser ? 'user-shift' : ''}" 
                     style="background:${color};top:${top}px"
                     title="${name}: ${hours}ч">
                </div>
            `;
            shiftIndex++;
        });
        
        return `
            <div class="${className}">
                <div class="day-number">${day}</div>
                ${shiftsHTML}
            </div>
        `;
    }

    getEmployeeColor(name) {
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }
        return `hsl(${hash % 360}, 70%, 50%)`;
    }

    getUserColor() {
        return `hsl(${this.userColor.h}, ${this.userColor.s}%, ${this.userColor.l}%)`;
    }

    updateCurrentPeriod() {
        const element = document.getElementById('current-period');
        if (!element) return;
        
        if (this.isMonthView) {
            element.textContent = this.getRussianMonthYear(this.currentDate);
        } else {
            const weekStart = this.getWeekStart(new Date(this.currentDate));
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 6);
            
            element.textContent = 
                `${weekStart.getDate()} ${this.getRussianMonthYear(weekStart)} - ${weekEnd.getDate()} ${this.getRussianMonthYear(weekEnd)}`;
        }
    }

    updateUserInfo() {
        const element = document.getElementById('user-info');
        if (element && this.currentUser) {
            element.textContent = `${this.currentUser.first_name} @${this.currentUser.username}`;
        }
    }

    async saveColor() {
        if (this.currentUser) {
            await firebaseService.updateUser(this.currentUser.id, { color: this.userColor });
            this.tg.showPopup({ title: 'Успех', message: 'Цвет сохранен' });
        }
    }

    async loadAdminPanel() {
        const panel = document.getElementById('admin-panel');
        if (panel) panel.classList.remove('hidden');
        
        // Простая админка
        setTimeout(async () => {
            const users = await firebaseService.getAllUsers();
            const list = document.getElementById('users-list');
            if (list) {
                list.innerHTML = Object.entries(users).map(([id, user]) => `
                    <div class="user-item">
                        <strong>${user.first_name}</strong> @${user.username}
                    </div>
                `).join('');
            }
        }, 2000);
    }

    // Вспомогательные методы
    getWeekStart(date) {
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1);
        return new Date(date.setDate(diff));
    }

    getMonthYearString(date) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }

    getRussianMonthYear(date) {
        const months = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
        return `${months[date.getMonth()]} ${date.getFullYear().toString().slice(2)}`;
    }

    showScreen(screenName) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.toggle('active', screen.id === screenName);
        });
    }
}

// Запуск приложения когда всё готово
if (window.Telegram?.WebApp) {
    new ScheduleApp();
} else {
    window.addEventListener('DOMContentLoaded', () => new ScheduleApp());
}
