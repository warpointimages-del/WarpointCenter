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

    // === МЕТОДЫ ДЛЯ ЗАРЕГИСТРИРОВАННЫХ СОТРУДНИКОВ ===
    
    // Получить всех зарегистрированных сотрудников
    async getRegisteredEmployees() {
        try {
            const snapshot = await get(child(ref(this.db), 'registeredEmployees'));
            return snapshot.exists() ? snapshot.val() : [];
        } catch (error) {
            console.error('Ошибка получения зарегистрированных сотрудников:', error);
            return [];
        }
    }

    // Добавить сотрудника в список зарегистрированных
    async addRegisteredEmployee(employeeName) {
        try {
            const currentEmployees = await this.getRegisteredEmployees();
            if (!currentEmployees.includes(employeeName)) {
                const updatedEmployees = [...currentEmployees, employeeName];
                await set(ref(this.db, 'registeredEmployees'), updatedEmployees);
                return true;
            }
            return false;
        } catch (error) {
            console.error('Ошибка добавления сотрудника:', error);
            return false;
        }
    }

    // Удалить сотрудника из списка зарегистрированных
    async removeRegisteredEmployee(employeeName) {
        try {
            const currentEmployees = await this.getRegisteredEmployees();
            const updatedEmployees = currentEmployees.filter(name => name !== employeeName);
            await set(ref(this.db, 'registeredEmployees'), updatedEmployees);
            return true;
        } catch (error) {
            console.error('Ошибка удаления сотрудника:', error);
            return false;
        }
    }

    // === СТАРЫЕ МЕТОДЫ (упрощаем) ===

    async saveUser(userData) {
        try {
            await set(ref(this.db, 'users/' + userData.id), {
                id: userData.id,
                username: userData.username || '',
                firstName: userData.firstName || '',
                lastName: userData.lastName || '',
                isAdmin: userData.isAdmin || false,
                color: userData.color || { h: 200, s: 80, l: 60 },
                createdAt: Date.now()
            });
            return true;
        } catch (error) {
            console.error('Ошибка сохранения пользователя:', error);
            return false;
        }
    }

    async getUser(userId) {
        try {
            const snapshot = await get(child(ref(this.db), `users/${userId}`));
            return snapshot.exists() ? snapshot.val() : null;
        } catch (error) {
            console.error('Ошибка получения пользователя:', error);
            return null;
        }
    }

    async getAllUsers() {
        try {
            const snapshot = await get(child(ref(this.db), 'users'));
            return snapshot.exists() ? snapshot.val() : {};
        } catch (error) {
            console.error('Ошибка получения пользователей:', error);
            return {};
        }
    }

    async updateUser(userId, updates) {
        try {
            await update(ref(this.db, 'users/' + userId), updates);
            return true;
        } catch (error) {
            console.error('Ошибка обновления пользователя:', error);
            return false;
        }
    }

    async saveFilterSettings(userId, settings) {
        try {
            await set(ref(this.db, `userSettings/${userId}/filter`), settings);
            return true;
        } catch (error) {
            console.error('Ошибка сохранения настроек фильтра:', error);
            return false;
        }
    }

    async getFilterSettings(userId) {
        try {
            const snapshot = await get(child(ref(this.db), `userSettings/${userId}/filter`));
            return snapshot.exists() ? snapshot.val() : { showOnlyMine: false };
        } catch (error) {
            console.error('Ошибка получения настроек фильтра:', error);
            return { showOnlyMine: false };
        }
    }

    async saveGlobalFilterSettings(settings) {
        try {
            await set(ref(this.db, 'globalSettings/filter'), settings);
            return true;
        } catch (error) {
            console.error('Ошибка сохранения глобальных настроек:', error);
            return false;
        }
    }

    async getGlobalFilterSettings() {
        try {
            const snapshot = await get(child(ref(this.db), 'globalSettings/filter'));
            return snapshot.exists() ? snapshot.val() : { showOnlyRegistered: true };
        } catch (error) {
            console.error('Ошибка получения глобальных настроек:', error);
            return { showOnlyRegistered: true };
        }
    }
}

export const firebaseService = new FirebaseService();
