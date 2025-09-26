import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js';
import { getDatabase, ref, set, get, child, update } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-database.js';

const firebaseConfig = {
    apiKey: "AIzaSyAbLz1MnfjYIQMDkmqgMa09Z3W_j8dnJbM",
    authDomain: "database-a9dee.firebaseapp.com",
    databaseURL: "https://database-a9dee-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "database-a9dee",
    storageBucket: "database-a9dee.firebasestorage.app",
    messagingSenderId: "68358730239",
    appId: "1:68358730239:web:21d9e409f80df8e815b7ca"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

class FirebaseService {
    constructor() {
        this.db = database;
    }

    // Сохранение пользователя
    async saveUser(userData) {
        try {
            await set(ref(this.db, `users/${userData.id}`), {
                ...userData,
                lastLogin: new Date().toISOString(),
                isAdmin: userData.id === 1999947340 ? true : false
            });
            return true;
        } catch (error) {
            console.error('Ошибка сохранения пользователя:', error);
            return false;
        }
    }

    // Получение пользователя
    async getUser(userId) {
        try {
            const snapshot = await get(child(ref(this.db), `users/${userId}`));
            return snapshot.exists() ? snapshot.val() : null;
        } catch (error) {
            console.error('Ошибка получения пользователя:', error);
            return null;
        }
    }

    // Обновление пользователя
    async updateUser(userId, updates) {
        try {
            await update(ref(this.db, `users/${userId}`), updates);
            return true;
        } catch (error) {
            console.error('Ошибка обновления пользователя:', error);
            return false;
        }
    }

    // Сохранение данных графика
    async saveScheduleData(monthYear, scheduleData) {
        try {
            await set(ref(this.db, `schedule/${monthYear}`), {
                data: scheduleData,
                lastUpdated: new Date().toISOString()
            });
            return true;
        } catch (error) {
            console.error('Ошибка сохранения графика:', error);
            return false;
        }
    }

    // Получение данных графика
    async getScheduleData(monthYear) {
        try {
            const snapshot = await get(child(ref(this.db), `schedule/${monthYear}`));
            return snapshot.exists() ? snapshot.val().data : null;
        } catch (error) {
            console.error('Ошибка получения графика:', error);
            return null;
        }
    }

    // Получение всех пользователей
    async getAllUsers() {
        try {
            const snapshot = await get(child(ref(this.db), 'users'));
            return snapshot.exists() ? snapshot.val() : {};
        } catch (error) {
            console.error('Ошибка получения пользователей:', error);
            return {};
        }
    }

    // Получение всех данных графика
    async getAllScheduleData() {
        try {
            const snapshot = await get(child(ref(this.db), 'schedule'));
            return snapshot.exists() ? snapshot.val() : {};
        } catch (error) {
            console.error('Ошибка получения всех графиков:', error);
            return {};
        }
    }
}

export const firebaseService = new FirebaseService();
