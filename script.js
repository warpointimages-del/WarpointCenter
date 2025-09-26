class ScheduleApp {
    constructor() {
        this.tg = window.Telegram.WebApp;
        this.currentUser = null;
        this.currentDate = new Date();
        this.isMonthView = false;
        this.scheduleData = { employees: [], schedule: {} };
        this.userColor = { h: 200, s: 80, l: 50 };
        
        this.init();
    }

    async init() {
        try {
            console.log('Starting app initialization...');
            
            // Быстрая инициализация UI
            this.tg.expand();
            this.tg.enableClosingConfirmation();
            
            // Инициализируем пользователя
            await this.initializeUser();
            
            // Показываем основной интерфейс
            this.showScreen('main');
            this.updateUserInfo();
            
            // Загружаем данные параллельно
            await Promise.all([
                this.loadUserPreferences(),
                this.loadScheduleData()
            ]);
            
            // Инициализируем UI
            this.initializeEventListeners();
            this.renderCalendar();
            
            console.log('App initialized successfully');
            
        } catch (error) {
            console.error('Initialization error:', error);
            document.getElementById('loading').innerHTML = 'Ошибка инициализации';
        }
    }

    async initializeUser() {
        const user = this.tg.initDataUnsafe?.user;
        if (!user) throw new Error('User not authorized');

        this.currentUser = {
            id: user.id,
            first_name: user.first_name,
            username: user.username || 'no_username',
            isAdmin: user.id === 1999947340
        };

        console.log('User initialized:', this.currentUser);
        
        // Сохраняем пользователя в Firebase
        await firebaseService.saveUser(this.currentUser);
    }

    async loadUserPreferences() {
        if (!this.currentUser) return;
        
        const userData = await firebaseService.getUser(this.currentUser.id);
        if (userData && userData.color) {
            this.userColor = userData.color;
            this.updateColorSliders();
        }
    }

    async loadScheduleData() {
        const monthYear = this.getMonthYearString(this.currentDate);
        console.log('Loading schedule for:', monthYear);
        
        // Сначала пробуем загрузить из Firebase
        let scheduleData = await firebaseService.getScheduleData(monthYear);
        
        if (!scheduleData) {
            console.log('No data in Firebase, parsing Google Sheets...');
            scheduleData = await this.parseGoogleSheets();
            
            if (scheduleData && scheduleData.employees.length > 0) {
                await firebaseService.saveScheduleData(monthYear, scheduleData);
                console.log('Schedule data saved to Firebase');
            }
        }
        
        this.scheduleData = scheduleData || { employees: [], schedule: {} };
        console.log('Schedule data loaded:', this.scheduleData);
    }

    async parseGoogleSheets() {
        const sheetName = this.getRussianMonthYear(this.currentDate);
        console.log('Parsing sheet:', sheetName);
        
        try {
            // Используем прямой URL для CSV
            const sheetId = '1leyP2K649JNfC8XvIV3amZPnQz18jFI95JAJoeXcXGk';
            const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
            
            console.log('Fetching from:', url);
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const csvText = await response.text();
            console.log('CSV response received, length:', csvText.length);
            
            return this.parseCSVData(csvText);
            
        } catch (error) {
            console.error('Error parsing Google Sheets:', error);
            return this.getEmptySchedule();
        }
    }

    parseCSVData(csvText) {
        const lines = csvText.split('\n').filter(line => line.trim().length > 0);
        console.log('CSV lines:', lines.length);
        
        if (lines.length < 2) {
            console.log('Not enough lines in CSV');
            return this.getEmptySchedule();
        }
        
        const employees = [];
        const schedule = {};
        
        try {
            // Парсим первую строку с датами
            const dates = this.parseCSVLine(lines[0]).slice(1); // Пропускаем первую пустую ячейку
            console.log('Dates found:', dates);
            
            // Парсим строки с сотрудниками
            for (let i = 1; i < lines.length; i++) {
                const cells = this.parseCSVLine(lines[i]);
                const employeeName = cells[0] ? cells[0].trim() : '';
                
                if (!employeeName) continue;
                
                employees.push(employeeName);
                console.log('Processing employee:', employeeName);
                
                // Парсим смены
                for (let j = 1; j < cells.length; j++) {
                    const day = j; // Используем номер столбца как день месяца
                    const cellValue = cells[j] ? cells[j].trim() : '';
                    
                    if (cellValue) {
                        const hours = parseFloat(cellValue.replace(',', '.'));
                        if (!isNaN(hours) && hours > 0) {
                            if (!schedule[day]) schedule[day] = {};
                            schedule[day][employeeName] = hours;
                            console.log(`Day ${day}: ${employeeName} - ${hours}h`);
                        }
                    }
                }
            }
            
            console.log('Parsing result - Employees:', employees.length, 'Schedule days:', Object.keys(schedule).length);
            return { employees, schedule };
            
        } catch (error) {
            console.error('Error parsing CSV data:', error);
            return this.getEmptySchedule();
        }
    }

    parseCSVLine(line) {
        // Простой парсинг CSV с учетом кавычек
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        
        result.push(current);
        return result.map(cell => cell.replace(/^"|"$/g, '').trim());
    }

    getEmptySchedule() {
        return { employees: [], schedule: {} };
    }

    initializeEventListeners() {
        document.getElementById('prev-btn').addEventListener('click', () => this.navigate(-1));
        document.getElementById('next-btn').addEventListener('click', () => this.navigate(1));
        document.getElementById('toggle-view').addEventListener('click', () => this.toggleView());
        document.getElementById('save-color').addEventListener('click', () => this.saveColor());
        
        // Слайдеры цвета
        document.getElementById('hue-slider').addEventListener('input', (e) => {
            this.userColor.h = parseInt(e.target.value);
            this.renderCalendar();
        });
        document.getElementById('saturation-slider').addEventListener('input', (e) => {
            this.userColor.s = parseInt(e.target.value);
            this.renderCalendar();
        });
        document.getElementById('lightness-slider').addEventListener('input', (e) => {
            this.userColor.l = parseInt(e.target.value);
            this.renderCalendar();
        });
    }

    navigate(direction) {
        if (this.isMonthView) {
            this.currentDate.setMonth(this.currentDate.getMonth() + direction);
        } else {
            this.currentDate.setDate(this.currentDate.getDate() + (direction * 7));
        }
        this.loadScheduleData().then(() => this.renderCalendar());
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
        
        // Показываем админку если нужно
        if (this.currentUser?.isAdmin) {
            document.getElementById('admin-panel').classList.remove('hidden');
            this.loadAdminPanel();
        }
    }

    renderWeekView() {
        const grid = document.getElementById('week-grid');
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
        const monthStart = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), 1);
        const monthEnd = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() + 1, 0);
        const firstDay = (monthStart.getDay() + 6) % 7;
        
        let html = '';
        
        // Заголовки дней недели
        for (let i = 0; i < 7; i++) {
            html += `<div class="day-header">${['Пн','Вт','Ср','Чт','Пт','Сб','Вс'][i]}</div>`;
        }
        
        // Пустые ячейки до первого дня
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
            
            shiftsHTML += `<div class="shift-marker ${isUser ? 'user-shift' : ''}" 
                             style="background:${color};top:${top}px"
                             title="${name}: ${hours}ч"></div>`;
            shiftIndex++;
        });
        
        return `<div class="${className}">
            <div class="day-number">${day}</div>
            ${shiftsHTML}
        </div>`;
    }

    getEmployeeColor(name) {
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }
        return `hsl(${Math.abs(hash) % 360}, 70%, 50%)`;
    }

    getUserColor() {
        return `hsl(${this.userColor.h}, ${this.userColor.s}%, ${this.userColor.l}%)`;
    }

    updateColorSliders() {
        document.getElementById('hue-slider').value = this.userColor.h;
        document.getElementById('saturation-slider').value = this.userColor.s;
        document.getElementById('lightness-slider').value = this.userColor.l;
    }

    async saveColor() {
        if (this.currentUser) {
            await firebaseService.updateUser(this.currentUser.id, { color: this.userColor });
            this.tg.showPopup({ title: 'Успех', message: 'Цвет сохранен' });
        }
    }

    async loadAdminPanel() {
        try {
            const users = await firebaseService.getAllUsers();
            const list = document.getElementById('users-list');
            
            list.innerHTML = Object.entries(users).map(([id, user]) => `
                <div class="user-item">
                    <strong>${user.first_name}</strong> (@${user.username})<br>
                    ID: ${id}<br>
                    ${user.employeeName ? `Сотрудник: ${user.employeeName}` : 'Не привязан'}
                </div>
            `).join('');
        } catch (error) {
            console.error('Error loading admin panel:', error);
        }
    }

    updateCurrentPeriod() {
        const element = document.getElementById('current-period');
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

    showScreen(screenName) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        document.getElementById(screenName).classList.add('active');
    }

    getWeekStart(date) {
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1);
        return new Date(date.setDate(diff));
    }

    getMonthYearString(date) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }

    getRussianMonthYear(date) {
        const months = [
            'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
            'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
        ];
        return `${months[date.getMonth()]} ${date.getFullYear().toString().slice(2)}`;
    }
}

// Запускаем приложение когда всё готово
window.addEventListener('DOMContentLoaded', () => {
    new ScheduleApp();
});
