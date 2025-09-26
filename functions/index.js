const functions = require('firebase-functions');
const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors');

admin.initializeApp();
const app = express();
app.use(cors({ origin: true }));

// API для получения данных расписания
app.get('/api/schedule', async (req, res) => {
    try {
        const snapshot = await admin.database().ref('schedules').once('value');
        res.json(snapshot.val() || {});
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API для получения данных пользователя
app.post('/api/user', async (req, res) => {
    try {
        const { telegramId } = req.body;
        const snapshot = await admin.database().ref(`users/${telegramId}`).once('value');
        res.json(snapshot.val() || {});
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

exports.api = functions.https.onRequest(app);
