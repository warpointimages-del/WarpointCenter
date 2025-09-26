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
            await set(ref(this.db, 'users/' + userData.id), {
                id: userData.id,
                username: userData.username || '',
                firstName: userData.first_name || '',
                lastName: userData.last_name || '',
                isAdmin: userData.isAdmin || false,
                sheetNames: userData.sheetNames || [],
                color: userData.color || { h: 200, s: 80, l: 60 },
                createdAt: Date.now()
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

    // Обновление пользователя
    async updateUser(userId, updates) {
        try {
            await update(ref(this.db, 'users/' + userId), updates);
            return true;
        } catch (error) {
            console.error('Ошибка обновления пользователя:', error);
            return false;
        }
    }

    // Сохранение настроек фильтра
    async saveFilterSettings(userId, settings) {
        try {
            await set(ref(this.db, `filterSettings/${userId}`), settings);
            return true;
        } catch (error) {
            console.error('Ошибка сохранения настроек фильтра:', error);
            return false;
        }
    }

    // Получение настроек фильтра
    async getFilterSettings(userId) {
        try {
            const snapshot = await get(child(ref(this.db), `filterSettings/${userId}`));
            return snapshot.exists() ? snapshot.val() : { showOnlyMine: false };
        } catch (error) {
            console.error('Ошибка получения настроек фильтра:', error);
            return { showOnlyMine: false };
        }
    }
}

export const firebaseService = new FirebaseService();
