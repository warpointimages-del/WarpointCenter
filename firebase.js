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

// Минимальная версия Firebase
class FirebaseService {
    constructor() {
        this.db = null;
        this.cache = new Map();
        this.initPromise = this.initializeFirebase();
    }

    async initializeFirebase() {
        if (typeof firebase === 'undefined') {
            await new Promise(resolve => setTimeout(resolve, 100));
            return this.initializeFirebase();
        }

        try {
            const app = firebase.initializeApp(window.firebaseConfig);
            this.db = firebase.database();
            console.log('Firebase инициализирован');
        } catch (error) {
            console.log('Firebase уже инициализирован');
        }
    }

    async ensureInit() {
        await this.initPromise;
    }

    // Кэшированные запросы
    async getWithCache(path) {
        await this.ensureInit();
        
        if (this.cache.has(path)) {
            return this.cache.get(path);
        }

        try {
            const snapshot = await this.db.ref(path).once('value');
            const value = snapshot.exists() ? snapshot.val() : null;
            this.cache.set(path, value);
            return value;
        } catch (error) {
            console.error('Firebase error:', error);
            return null;
        }
    }

    async setWithCache(path, value) {
        await this.ensureInit();
        
        try {
            await this.db.ref(path).set(value);
            this.cache.set(path, value);
            return true;
        } catch (error) {
            console.error('Firebase set error:', error);
            return false;
        }
    }

    async updateUser(userId, updates) {
        const path = `users/${userId}`;
        const current = await this.getWithCache(path) || {};
        return this.setWithCache(path, { ...current, ...updates });
    }

    async getUser(userId) {
        return this.getWithCache(`users/${userId}`);
    }

    async saveUser(userData) {
        const path = `users/${userData.id}`;
        const existing = await this.getWithCache(path) || {};
        return this.setWithCache(path, {
            ...existing,
            ...userData,
            lastLogin: new Date().toISOString()
        });
    }

    async getScheduleData(monthYear) {
        const data = await this.getWithCache(`schedule/${monthYear}`);
        return data ? data.data : null;
    }

    async saveScheduleData(monthYear, scheduleData) {
        return this.setWithCache(`schedule/${monthYear}`, {
            data: scheduleData,
            lastUpdated: new Date().toISOString()
        });
    }

    async getAllUsers() {
        return this.getWithCache('users') || {};
    }
}

window.firebaseService = new FirebaseService();
