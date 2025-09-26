import { firebaseService } from './firebase.js';
import { adminPanel } from './admin-panel.js';

class ScheduleApp {
    constructor() {
        this.tg = window.Telegram.WebApp;
        this.currentUser = null;
        this.currentDate = new Date();
        this.isMonthView = false;
        this.scheduleData = {};
        this.userColor = { h: 200, s: 80, l: 50 };
        
        this.init();
    }

    async init() {
        try {
            this.tg.expand();
            this.tg.enableClosingConfirmation();
            
            await this.initializeUser();
            await this.loadUserPreferences();
            await this.loadAndParseScheduleData(); // Изменено на новую функцию
            this.initializeEventListeners();
            this.renderCalendar();
            await adminPanel.init(this.currentUser);
            
            // Запускаем периодический парсинг
            this.startAutoParsing();
            
            this.showScreen('main');
        } catch (error) {
            console.error('Ошибка инициализации:', error);
        }
    }

    // Инициализация пользователя
    async initializeUser() {
        const initData = this.tg.initDataUnsafe;
        const user = initData.user;
        
        if (!user) {
            throw new Error('Пользователь не авторизован');
        }

        this.currentUser = {
            id: user.id,
            first_name: user.first_name,
            username: user.username
        };

        // Сначала загружаем существующие данные пользователя
        const existingUser = await firebaseService.getUser(user.id);
        if (existingUser) {
            this.currentUser = { ...this.currentUser, ...existingUser };
        } else {
            // Сохраняем нового пользователя
            await firebaseService.saveUser(this.currentUser);
        }

        // Проверяем админский статус
        this.currentUser.isAdmin = this.currentUser.isAdmin || user.id === 1999947340;

        this.updateUserInfo();
        console.log('Текущий пользователь:', this.currentUser);
    }

    // Загрузка и парсинг данных графика
    async loadAndParseScheduleData() {
        const currentMonthYear = this.getMonthYearString(this.currentDate);
        console.log('Загрузка графика для:', currentMonthYear);
        
        // Пытаемся загрузить из Firebase
        let data = await firebaseService.getScheduleData(currentMonthYear);
        
        if (!data || this.isDataOld(data)) {
            console.log('Данные устарели или отсутствуют, парсим таблицу...');
            data = await this.parseGoogleSheets();
            if (data && data.employees && data.employees.length > 0) {
                await firebaseService.saveScheduleData(currentMonthYear, data);
                console.log('Данные графика сохранены в Firebase');
            }
        }
        
        this.scheduleData = data || this.getEmptySchedule();
        console.log('Загруженные данные графика:', this.scheduleData);
    }

    // Проверка устаревания данных (больше 15 минут)
    isDataOld(data) {
        if (!data.lastUpdated) return true;
        const lastUpdate = new Date(data.lastUpdated);
        const now = new Date();
        return (now - lastUpdate) > 15 * 60 * 1000; // 15 минут
    }

    // Парсинг Google Sheets
    async parseGoogleSheets() {
        const sheetId = '1leyP2K649JNfC8XvIV3amZPnQz18jFI95JAJoeXcXGk';
        const currentMonthYear = this.getMonthYearString(this.currentDate);
        const sheetName = this.getRussianMonthYear(this.currentDate);
        
        console.log('Парсинг таблицы:', sheetName);
        
        try {
            // Используем CORS proxy для обхода ограничений
            const proxyUrl = 'https://cors-anywhere.herokuapp.com/';
            const targetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?sheet=${encodeURIComponent(sheetName)}`;
            
            const response = await fetch(proxyUrl + targetUrl, {
                headers: {
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const text = await response.text();
            console.log('Raw response:', text.substring(0, 500));
            
            // Обработка ответа Google Sheets
            const jsonMatch = text.match(/google\.visualization\.Query\.setResponse\(({.*})\);/);
            if (!jsonMatch) {
                throw new Error('Invalid response format');
            }
            
            const json = JSON.parse(jsonMatch[1]);
            console.log('Parsed JSON:', json);
            
            return this.processSheetData(json);
            
        } catch (error) {
            console.error('Ошибка парсинга таблицы:', error);
            // Пробуем альтернативный метод
            return await this.tryAlternativeParse();
        }
    }

    // Альтернативный метод парсинга
    async tryAlternativeParse() {
        try {
            // Пробуем загрузить как CSV
            const sheetId = '1leyP2K649JNfC8XvIV3amZPnQz18jFI95JAJoeXcXGk';
            const sheetName = this.getRussianMonthYear(this.currentDate);
            const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
            
            const proxyUrl = 'https://cors-anywhere.herokuapp.com/';
            const response = await fetch(proxyUrl + csvUrl);
            
            if (response.ok) {
                const csvText = await response.text();
                return this.parseCSVData(csvText);
            }
        } catch (error) {
            console.error('Альтернативный парсинг также не удался:', error);
        }
        
        return this.getEmptySchedule();
    }

    // Парсинг CSV данных
    parseCSVData(csvText) {
        const lines = csvText.split('\n').filter(line => line.trim());
        if (lines.length < 2) return this.getEmptySchedule();
        
        const employees = [];
        const schedule = {};
        
        // Первая строка - даты
        const dates = lines[0].split(',').slice(1).map(date => {
            const match = date.match(/(\d+)/);
            return match ? parseInt(match[1]) : null;
        }).filter(Boolean);
        
        // Остальные строки - сотрудники
        for (let i = 1; i < lines.length; i++) {
            const cells = lines[i].split(',').map(cell => cell.replace(/^"|"$/g, '').trim());
            const employeeName = cells[0];
            
            if (!employeeName) continue;
            
            employees.push(employeeName);
            
            cells.slice(1).forEach((cell, index) => {
                const day = dates[index];
                if (day && cell) {
                    const shiftValue = parseFloat(cell) || 0;
                    if (shiftValue > 0) {
                        if (!schedule[day]) schedule[day] = {};
                        schedule[day][employeeName] = shiftValue;
                    }
                }
            });
        }
        
        return { employees, schedule, lastUpdated: new Date().toISOString() };
    }

    // Обработка данных таблицы
    processSheetData(data) {
        try {
            const employees = [];
            const schedule = {};
            
            if (!data.table || !data.table.rows) {
                console.error('Нет данных в таблице');
                return this.getEmptySchedule();
            }

            console.log('Все строки таблицы:', data.table.rows);

            // Первая строка - даты (пропускаем первую ячейку с заголовком)
            const dates = [];
            if (data.table.rows[0] && data.table.rows[0].c) {
                for (let i = 1; i < data.table.rows[0].c.length; i++) {
                    const cell = data.table.rows[0].c[i];
                    if (cell && cell.v !== null && cell.v !== undefined) {
                        dates.push(parseInt(cell.v) || i);
                    } else {
                        dates.push(i);
                    }
                }
            }
            console.log('Даты:', dates);

            // Обрабатываем строки с сотрудниками
            for (let i = 1; i < data.table.rows.length; i++) {
                const row = data.table.rows[i];
                if (!row.c || !row.c[0] || row.c[0].v === null) continue;
                
                const employeeName = row.c[0].v.toString().trim();
                if (!employeeName) continue;
                
                employees.push(employeeName);
                console.log(`Обработка сотрудника: ${employeeName}`);

                // Обрабатываем смены
                for (let j = 1; j < row.c.length; j++) {
                    const cell = row.c[j];
                    const day = dates[j-1];
                    
                    if (cell && cell.v !== null && cell.v !== undefined && day) {
                        const shiftValue = parseFloat(cell.v);
                        if (shiftValue > 0) {
                            if (!schedule[day]) schedule[day] = {};
                            schedule[day][employeeName] = shiftValue;
                            console.log(`Смена: день ${day}, ${employeeName}, ${shiftValue}ч`);
                        }
                    }
                }
            }

            const result = { 
                employees, 
                schedule,
                lastUpdated: new Date().toISOString()
            };
            
            console.log('Итоговые данные:', result);
            return result;
            
        } catch (error) {
            console.error('Ошибка обработки данных таблицы:', error);
            return this.getEmptySchedule();
        }
    }

    getEmptySchedule() {
        return { 
            employees: [], 
            schedule: {},
            lastUpdated: new Date().toISOString()
        };
    }

    // Периодический парсинг каждые 15 минут
    startAutoParsing() {
        setInterval(async () => {
            console.log('Автоматическое обновление данных...');
            await this.loadAndParseScheduleData();
            this.renderCalendar();
        }, 15 * 60 * 1000); // 15 минут
    }

    // Остальные методы остаются без изменений...
    // ... (initializeEventListeners, navigate, toggleView, renderCalendar и т.д.)

    // Проверка регистрации сотрудника
    isEmployeeRegistered(employeeName) {
        // Проверяем, привязан ли какой-либо пользователь к этому сотруднику
        return Object.values(this.currentUsers || {}).some(user => 
            user.employeeName === employeeName
        );
    }

}

// Запуск приложения
new ScheduleApp();
