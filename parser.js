const axios = require('axios');
const { db } = require('./firebase');

class ScheduleParser {
  constructor(sheetId) {
    this.sheetId = sheetId;
    this.baseUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?`;
  }

  async parseSheet(sheetName) {
    try {
      const url = `${this.baseUrl}sheet=${encodeURIComponent(sheetName)}`;
      const response = await axios.get(url);
      
      // Парсинг данных из Google Sheets
      const jsonMatch = response.data.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);/);
      if (!jsonMatch) throw new Error('Invalid response format');
      
      const jsonData = JSON.parse(jsonMatch[1]);
      return this.processData(jsonData, sheetName);
    } catch (error) {
      console.error(`Error parsing sheet ${sheetName}:`, error);
      return null;
    }
  }

  processData(data, sheetName) {
    const table = data.table;
    const employees = [];
    const schedule = {};
    
    // Извлекаем даты из первой строки (начиная со второго столбца)
    const dates = [];
    if (table.cols.length > 1) {
      for (let i = 1; i < table.cols.length; i++) {
        const dateStr = table.cols[i].label;
        if (dateStr && !isNaN(dateStr)) {
          const day = parseInt(dateStr);
          const [month, year] = this.parseSheetName(sheetName);
          dates.push(new Date(year, month - 1, day));
        }
      }
    }
    
    // Обрабатываем строки с данными сотрудников
    table.rows.forEach((row, rowIndex) => {
      if (rowIndex === 0) return; // Пропускаем заголовок
      
      const employeeName = row.c[0]?.v;
      if (!employeeName) return;
      
      employees.push(employeeName);
      
      // Обрабатываем смены сотрудника
      row.c.forEach((cell, colIndex) => {
        if (colIndex === 0) return; // Пропускаем столбец с именем
        
        const value = cell?.v;
        if (value && value > 0) {
          const date = dates[colIndex - 1];
          if (date) {
            const dateKey = date.toISOString().split('T')[0];
            if (!schedule[dateKey]) schedule[dateKey] = {};
            
            schedule[dateKey][employeeName] = {
              hours: value,
              isShift: value === 1 ? true : value > 1
            };
          }
        }
      });
    });
    
    return {
      sheetName,
      employees,
      schedule,
      parsedAt: new Date().toISOString()
    };
  }

  parseSheetName(sheetName) {
    const months = {
      'январь': 1, 'февраль': 2, 'март': 3, 'апрель': 4, 'май': 5, 'июнь': 6,
      'июль': 7, 'август': 8, 'сентябрь': 9, 'октябрь': 10, 'ноябрь': 11, 'декабрь': 12
    };
    
    const [monthStr, yearStr] = sheetName.toLowerCase().split(' ');
    const month = months[monthStr];
    const year = parseInt(yearStr);
    
    return [month, year];
  }

  async saveToFirebase(data) {
    const ref = db.ref('schedules');
    await ref.set(data);
  }

  async parseAllSheets() {
    const sheets = [
      'Декабрь 22', 'Январь 23', 'Февраль 23', 'Март 23', 'Апрель 23', 'Май 23', 'Июнь 23',
      'Июль 23', 'Август 23', 'Сентябрь 23', 'Октябрь 23', 'Ноябрь 23', 'Декабрь 23',
      'Январь 24', 'Февраль 24', 'Март 24', 'Апрель 24', 'Май 24', 'Июнь 24',
      'Июль 24', 'Август 24', 'Сентябрь 24', 'Октябрь 24', 'Ноябрь 24', 'Декабрь 24',
      'Январь 25', 'Февраль 25', 'Март 25', 'Апрель 25', 'Май 25', 'Июнь 25',
      'Июль 25', 'Август 25', 'Сентябрь 25'
    ];
    
    const allSchedules = {};
    
    for (const sheet of sheets) {
      console.log(`Parsing sheet: ${sheet}`);
      const data = await this.parseSheet(sheet);
      if (data) {
        allSchedules[sheet] = data;
      }
      await new Promise(resolve => setTimeout(resolve, 1000)); // Задержка между запросами
    }
    
    await this.saveToFirebase(allSchedules);
    return allSchedules;
  }
}

module.exports = ScheduleParser;
