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
    const sheetName = this.getRussianMonthYear(this.currentDate);
    
    console.log('Парсинг таблицы:', sheetName);
    
    try {
        // Прямой запрос к Google Sheets API
        const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?sheet=${encodeURIComponent(sheetName)}&tqx=responseHandler:parseSheet`;
        
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const text = await response.text();
        console.log('Raw response:', text.substring(0, 1000));
        
        return this.processSheetResponse(text);
        
    } catch (error) {
        console.error('Ошибка парсинга таблицы:', error);
        return await this.tryCSVParse(sheetId, sheetName);
    }
}

// Обработка ответа Google Sheets
processSheetResponse(text) {
    try {
        // Извлекаем JSON из ответа
        const jsonStr = text.match(/google\.visualization\.Query\.setResponse\(({.*})\);/)[1];
        const data = JSON.parse(jsonStr);
        
        console.log('Sheet data structure:', data);
        
        const employees = [];
        const schedule = {};
        
        if (!data.table || !data.table.rows) {
            console.error('Нет данных в таблице');
            return this.getEmptySchedule();
        }
        
        // Получаем даты из первой строки (пропускаем первую ячейку)
        const dates = [];
        const firstRow = data.table.rows[0];
        if (firstRow && firstRow.c) {
            for (let i = 1; i < firstRow.c.length; i++) {
                const cell = firstRow.c[i];
                if (cell && cell.v !== null) {
                    dates.push(parseInt(cell.v) || i);
                } else {
                    dates.push(i); // Если ячейка пустая, используем номер столбца
                }
            }
        }
        console.log('Распознанные даты:', dates);
        
        // Обрабатываем сотрудников
        for (let i = 1; i < data.table.rows.length; i++) {
            const row = data.table.rows[i];
            if (!row.c || row.c.length === 0) continue;
            
            // Первая ячейка - имя сотрудника
            const nameCell = row.c[0];
            if (!nameCell || !nameCell.v) continue;
            
            const employeeName = nameCell.v.toString().trim();
            if (!employeeName) continue;
            
            employees.push(employeeName);
            console.log(`Обработка сотрудника: ${employeeName}`);
            
            // Обрабатываем смены
            for (let j = 1; j < row.c.length; j++) {
                const dayIndex = j - 1;
                if (dayIndex >= dates.length) break;
                
                const day = dates[dayIndex];
                const cell = row.c[j];
                
                if (cell && cell.v !== null && cell.v !== undefined) {
                    const hours = parseFloat(cell.v);
                    if (hours > 0) {
                        if (!schedule[day]) schedule[day] = {};
                        schedule[day][employeeName] = hours;
                        console.log(`День ${day}: ${employeeName} - ${hours}ч`);
                    }
                }
            }
        }
        
        const result = {
            employees: employees,
            schedule: schedule,
            lastUpdated: new Date().toISOString()
        };
        
        console.log('Результат парсинга:', result);
        return result;
        
    } catch (error) {
        console.error('Ошибка обработки данных:', error);
        return this.getEmptySchedule();
    }
}

// Альтернативный парсинг через CSV
async tryCSVParse(sheetId, sheetName) {
    try {
        const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
        const response = await fetch(csvUrl);
        
        if (response.ok) {
            const csvText = await response.text();
            return this.parseCSVData(csvText);
        }
    } catch (error) {
        console.error('CSV парсинг также не удался:', error);
    }
    
    return this.getEmptySchedule();
}

// Парсинг CSV данных
parseCSVData(csvText) {
    const lines = csvText.split('\n').filter(line => line.trim());
    if (lines.length < 2) return this.getEmptySchedule();
    
    const employees = [];
    const schedule = {};
    
    // Первая строка - даты (пропускаем первую ячейку)
    const firstLine = lines[0].split(',');
    const dates = [];
    
    for (let i = 1; i < firstLine.length; i++) {
        const dateStr = firstLine[i].replace(/^"|"$/g, '').trim();
        const dateMatch = dateStr.match(/(\d+)/);
        dates.push(dateMatch ? parseInt(dateMatch[1]) : i);
    }
    
    console.log('CSV даты:', dates);
    
    // Обрабатываем строки с сотрудниками
    for (let i = 1; i < lines.length; i++) {
        const cells = lines[i].split(',').map(cell => 
            cell.replace(/^"|"$/g, '').trim()
        );
        
        const employeeName = cells[0];
        if (!employeeName) continue;
        
        employees.push(employeeName);
        console.log(`CSV сотрудник: ${employeeName}`);
        
        // Обрабатываем смены
        for (let j = 1; j < cells.length; j++) {
            const dayIndex = j - 1;
            if (dayIndex >= dates.length) break;
            
            const day = dates[dayIndex];
            const cellValue = cells[j];
            
            if (cellValue) {
                const hours = parseFloat(cellValue.replace(',', '.'));
                if (!isNaN(hours) && hours > 0) {
                    if (!schedule[day]) schedule[day] = {};
                    schedule[day][employeeName] = hours;
                    console.log(`CSV день ${day}: ${employeeName} - ${hours}ч`);
                }
            }
        }
    }
    
    return {
        employees: employees,
        schedule: schedule,
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
