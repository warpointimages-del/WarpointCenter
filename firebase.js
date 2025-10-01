// В классе ScheduleApp обновляем методы работы с чеками:

async loadReceiptsData() {
    try {
        // Загружаем чеки для текущего пользователя за сегодня
        const todayKey = this.formatDateKey(new Date());
        if (this.user) {
            const receipts = await firebaseService.getReceiptsByUserAndDate(this.user.id, todayKey);
            if (!this.receiptsData[todayKey]) {
                this.receiptsData[todayKey] = {};
            }
            this.receiptsData[todayKey][this.user.id] = receipts;
        }
    } catch (error) {
        console.error('Ошибка загрузки чеков:', error);
        this.receiptsData = {};
    }
}

async saveReceipt(date, receiptData) {
    try {
        if (!this.user) {
            throw new Error('Пользователь не авторизован');
        }
        
        const success = await firebaseService.saveReceipt(this.user.id, receiptData);
        if (success) {
            // Обновляем локальные данные
            const dateKey = this.formatDateKey(new Date(date));
            if (!this.receiptsData[dateKey]) {
                this.receiptsData[dateKey] = {};
            }
            if (!this.receiptsData[dateKey][this.user.id]) {
                this.receiptsData[dateKey][this.user.id] = [];
            }
            
            this.receiptsData[dateKey][this.user.id].push({
                ...receiptData,
                id: Date.now(), // Временный ID, в реальности будет из Firebase
                timestamp: Date.now()
            });
            
            return true;
        }
        return false;
    } catch (error) {
        console.error('Ошибка сохранения чека:', error);
        throw error;
    }
}

// В методе loadReceiptsForModal обновляем получение данных:
loadReceiptsForModal(employee, date) {
    const receiptList = document.querySelector('.receipt-list');
    const dateKey = this.formatDateKey(new Date(date));
    
    // Получаем чеки для текущего пользователя
    const receipts = this.receiptsData[dateKey]?.[this.user.id] || [];
    
    if (receipts.length === 0) {
        receiptList.innerHTML = '<div style="color: #888; text-align: center;">Чеков пока нет</div>';
        return;
    }
    
    receiptList.innerHTML = receipts.map(receipt => `
        <div class="receipt-item">
            <div class="receipt-item-header">
                <span class="receipt-number">Чек №${receipt.number}</span>
                <span class="receipt-amount">${receipt.amount} ₽</span>
            </div>
            <div class="receipt-description">${receipt.description}</div>
        </div>
    `).join('');
}
