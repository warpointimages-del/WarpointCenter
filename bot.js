const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const cors = require('cors');
const path = require('path');
const { google } = require('googleapis');

const app = express();
const PORT = process.env.PORT || 3000;

// Конфигурация
const BOT_TOKEN = '8367657341:AAElP8RNPS-jS5LacQQ2HcpWLpc5jbrpFF0';
const GOOGLE_SHEETS_ID = '1leyP2K649JNfC8XvIV3amZPnQz18jFI95JAJoeXcXGk';

// Инициализация бота
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.')); // Обслуживаем файлы из текущей директории

// Маршрут для мини-приложения
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Маршрут для стилей
app.get('/styles.css', (req, res) => {
  res.sendFile(path.join(__dirname, 'styles.css'));
});

// Маршрут для скрипта приложения
app.get('/app.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'app.js'));
});

// API endpoint для получения данных графика
app.get('/api/schedule', async (req, res) => {
  try {
    const scheduleData = await getScheduleData();
    res.json(scheduleData);
  } catch (error) {
    console.error('Error fetching schedule:', error);
    res.status(500).json({ error: 'Failed to fetch schedule data' });
  }
});

// Команда для бота
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  
  // Используем локальный сервер для разработки
  const miniAppUrl = `http://localhost:${PORT}`;
  
  bot.sendMessage(chatId, '📅 Добро пожаловать в график работы!', {
    reply_markup: {
      inline_keyboard: [[
        {
          text: '📅 Открыть график работы',
          web_app: { url: miniAppUrl }
        }
      ]]
    }
  });
});

// Функция для парсинга Google Sheets
async function getScheduleData() {
  try {
    // Для анонимного доступа к Google Sheets
    const auth = new google.auth.GoogleAuth({
      keyFile: null, // Анонимный доступ
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    
    // Получаем список всех листов
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: GOOGLE_SHEETS_ID,
    });

    const sheetsList = spreadsheet.data.sheets;
    const currentMonth = getCurrentMonthSheetName();
    
    // Ищем текущий месяц
    let targetSheet = null;
    for (const sheet of sheetsList) {
      if (sheet.properties.title.includes(currentMonth)) {
        targetSheet = sheet;
        break;
      }
    }

    if (!targetSheet) {
      throw new Error(`Sheet for ${currentMonth} not found`);
    }

    // Читаем данные из листа
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEETS_ID,
      range: targetSheet.properties.title,
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      throw new Error('No data found in sheet');
    }

    // Парсим данные
    return parseSheetData(rows);
  } catch (error) {
    console.error('Error accessing Google Sheets:', error);
    return getMockData(); // Возвращаем тестовые данные при ошибке
  }
}

function getCurrentMonthSheetName() {
  const months = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
  ];
  const now = new Date();
  const month = months[now.getMonth()];
  const year = now.getFullYear().toString().slice(-2);
  return `${month} ${year}`;
}

function parseSheetData(rows) {
  const employees = [];
  const schedule = {};
  
  // Первая строка - даты (начиная со второго столбца)
  const dates = rows[0].slice(1).map(date => parseInt(date));
  
  // Остальные строки - сотрудники
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    
    const employeeName = row[0];
    if (!employeeName) continue;
    
    const employeeId = i;
    employees.push({
      id: employeeId,
      name: employeeName.trim(),
      color: generateRandomColor()
    });
    
    // Данные смен
    for (let j = 1; j < row.length; j++) {
      const date = dates[j - 1];
      if (!date) continue;
      
      const shiftValue = parseFloat(row[j]) || 0;
      if (shiftValue > 0) {
        const monthKey = getCurrentMonthKey();
        if (!schedule[monthKey]) schedule[monthKey] = {};
        if (!schedule[monthKey][employeeId]) schedule[monthKey][employeeId] = {};
        
        schedule[monthKey][employeeId][date] = shiftValue;
      }
    }
  }
  
  return {
    employees,
    schedule,
    lastUpdated: new Date().toISOString()
  };
}

function getCurrentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
}

function generateRandomColor() {
  const hues = [0, 30, 60, 120, 180, 240, 300];
  const randomHue = hues[Math.floor(Math.random() * hues.length)];
  return `hsl(${randomHue}, 70%, 50%)`;
}

function getMockData() {
  // Тестовые данные для демонстрации
  return {
    employees: [
      { id: 1, name: 'Иван Иванов', color: 'hsl(0, 70%, 50%)' },
      { id: 2, name: 'Петр Петров', color: 'hsl(120, 70%, 50%)' },
      { id: 3, name: 'Мария Сидорова', color: 'hsl(240, 70%, 50%)' },
      { id: 4, name: 'Анна Козлова', color: 'hsl(60, 70%, 50%)' },
      { id: 5, name: 'Сергей Смирнов', color: 'hsl(300, 70%, 50%)' }
    ],
    schedule: {
      '2024-01': {
        1: { 1: 1, 5: 1, 10: 8, 15: 1, 20: 1, 25: 6 },
        2: { 2: 1, 6: 1, 11: 1, 16: 8, 21: 1, 26: 1 },
        3: { 3: 1, 7: 1, 12: 6, 17: 1, 22: 1, 27: 8 },
        4: { 4: 1, 8: 8, 13: 1, 18: 1, 23: 6, 28: 1 },
        5: { 5: 1, 9: 1, 14: 1, 19: 8, 24: 1, 29: 1 }
      }
    },
    lastUpdated: new Date().toISOString()
  };
}

// Запуск сервера
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`🤖 Telegram bot is polling for messages...`);
});
