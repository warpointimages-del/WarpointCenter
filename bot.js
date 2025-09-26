const { Telegraf } = require('telegraf');
const ScheduleParser = require('./parser');
const { db } = require('./firebase');
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname, 'app')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'app', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

const bot = new Telegraf(process.env.BOT_TOKEN || '8367657341:AAElP8RNPS-jS5LacQQ2HcpWLpc5jbrpFF0');
const parser = new ScheduleParser('1leyP2K649JNfC8XvIV3amZPnQz18jFI95JAJoeXcXGk');

// Команда старта
bot.start(async (ctx) => {
  const userId = ctx.from.id;
  const username = ctx.from.username;
  const firstName = ctx.from.first_name;
  const lastName = ctx.from.last_name;
  
  // Сохраняем пользователя в Firebase
  const userRef = db.ref(`users/${userId}`);
  await userRef.set({
    telegramId: userId,
    username: username || '',
    firstName: firstName || '',
    lastName: lastName || '',
    joinedAt: new Date().toISOString(),
    employeeId: null,
    color: this.generateRandomColor()
  });
  
  const miniAppUrl = `https://your-domain.com`; // Замените на ваш домен
  await ctx.reply(
    'Добро пожаловать в планировщик смен! 🗓️\n\n' +
    'Нажмите кнопку ниже чтобы открыть график смен:',
    {
      reply_markup: {
        inline_keyboard: [[
          {
            text: '📅 Открыть график смен',
            web_app: { url: miniAppUrl }
          }
        ]]
      }
    }
  );
});

// Генерация случайного цвета
generateRandomColor() {
  return {
    h: Math.floor(Math.random() * 360),
    s: Math.floor(Math.random() * 30) + 70, // 70-100%
    l: Math.floor(Math.random() * 20) + 60  // 60-80%
  };
}

// Запуск парсера каждые 15 минут
const cron = require('node-cron');
cron.schedule('*/15 * * * *', async () => {
  console.log('Starting scheduled parsing...');
  try {
    await parser.parseAllSheets();
    console.log('Scheduled parsing completed successfully');
  } catch (error) {
    console.error('Scheduled parsing failed:', error);
  }
});

// Обработка сообщений от мини-приложения
bot.on('message', async (ctx) => {
  if (ctx.message.web_app_data) {
    const data = JSON.parse(ctx.message.web_app_data.data);
    
    if (data.type === 'color_update') {
      const userId = ctx.from.id;
      const userRef = db.ref(`users/${userId}`);
      await userRef.update({ color: data.color });
      await ctx.reply('Цвет успешно обновлен! ✅');
    }
    
    if (data.type === 'employee_link') {
      const userId = ctx.from.id;
      const userRef = db.ref(`users/${userId}`);
      await userRef.update({ employeeId: data.employeeId });
      await ctx.reply('Сотрудник успешно привязан! ✅');
    }
  }
});

// Запуск бота
bot.launch().then(() => {
  console.log('Bot started successfully');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
