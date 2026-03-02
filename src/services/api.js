const API_BASE_URL = 'http://localhost:8000';

class InventoryAPI {
    /**
     * Add a new SKU with CSV files
     */
    async addSKU(skuName, currentUnits, previousYearCSV, vendorCSV) {
        const formData = new FormData();
        formData.append('sku_name', skuName);
        formData.append('current_units', currentUnits);
        formData.append('previous_year_csv', previousYearCSV);
        formData.append('vendor_csv', vendorCSV);

        const response = await fetch(`${API_BASE_URL}/add-sku`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            throw new Error('Failed to add SKU');
        }

        return await response.json();
    }

    /**
     * Get all SKUs
     */
    async getAllSKUs() {
        const response = await fetch(`${API_BASE_URL}/skus`);

        if (!response.ok) {
            throw new Error('Failed to fetch SKUs');
        }

        return await response.json();
    }

    /**
     * Get vendors for a specific SKU
     */
    async getSKUVendors(skuId) {
        const response = await fetch(`${API_BASE_URL}/sku/${skuId}/vendors`);

        if (!response.ok) {
            throw new Error('Failed to fetch vendors');
        }

        return await response.json();
    }

    /**
     * Get time-series data for a specific SKU
     */
    async getSKUTimeSeries(skuId) {
        const response = await fetch(`${API_BASE_URL}/sku/${skuId}/time-series`);

        if (!response.ok) {
            throw new Error('Failed to fetch time-series data');
        }

        return await response.json();
    }

    /**
     * Get CSV schema for a specific SKU
     */
    async getSKUSchema(skuId) {
        const response = await fetch(`${API_BASE_URL}/sku/${skuId}/schema`);

        if (!response.ok) {
            throw new Error('Failed to fetch schema');
        }

        return await response.json();
    }

    /**
     * Get dashboard statistics
     */
    async getStats() {
        const response = await fetch(`${API_BASE_URL}/stats`);

        if (!response.ok) {
            throw new Error('Failed to fetch stats');
        }

        return await response.json();
    }

    /**
     * Check if backend is running
     */
    async pingBackend() {
        try {
            const response = await fetch(`${API_BASE_URL}/`);
            return response.ok;
        } catch (error) {
            return false;
        }
    }

    /**
     * Add a constraint to a SKU
     */
    async addConstraint(skuId, constraintType, constraintValue, description) {
        const formData = new FormData();
        formData.append('constraint_type', constraintType);
        formData.append('constraint_value', constraintValue);
        if (description) {
            formData.append('description', description);
        }

        const response = await fetch(`${API_BASE_URL}/sku/${skuId}/constraints`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            throw new Error('Failed to add constraint');
        }

        return await response.json();
    }

    /**
     * Get constraints for a SKU
     */
    async getConstraints(skuId) {
        const response = await fetch(`${API_BASE_URL}/sku/${skuId}/constraints`);

        if (!response.ok) {
            throw new Error('Failed to fetch constraints');
        }

        return await response.json();
    }

    /**
     * Delete a constraint
     */
    async deleteConstraint(constraintId) {
        const response = await fetch(`${API_BASE_URL}/constraint/${constraintId}`, {
            method: 'DELETE',
        });

        if (!response.ok) {
            throw new Error('Failed to delete constraint');
        }

        return await response.json();
    }

    /**
     * Update SKU information
     */
    async updateSKU(skuId, skuName, currentUnits) {
        const formData = new FormData();
        if (skuName) formData.append('sku_name', skuName);
        if (currentUnits !== undefined) formData.append('current_units', currentUnits);

        const response = await fetch(`${API_BASE_URL}/sku/${skuId}`, {
            method: 'PUT',
            body: formData,
        });

        if (!response.ok) {
            throw new Error('Failed to update SKU');
        }

        return await response.json();
    }

    /**
     * Delete a single SKU
     */
    async deleteSKU(skuId) {
        const response = await fetch(`${API_BASE_URL}/sku/${skuId}`, {
            method: 'DELETE',
        });

        if (!response.ok) {
            throw new Error('Failed to delete SKU');
        }

        return await response.json();
    }

    /**
     * Clear all SKUs
     */
    async clearAllSKUs() {
        const response = await fetch(`${API_BASE_URL}/skus/clear-all`, {
            method: 'DELETE',
        });

        if (!response.ok) {
            throw new Error('Failed to clear all SKUs');
        }

        return await response.json();
    }

    /**
     * Generate AI predictions for all SKUs
     */
    async generatePredictions() {
        const response = await fetch(`${API_BASE_URL}/predict`, {
            method: 'POST',
        });

        if (!response.ok) {
            throw new Error('Failed to generate predictions');
        }

        return await response.json();
    }

    /**
     * Get all transactions
     */
    async getTransactions() {
        const response = await fetch(`${API_BASE_URL}/transactions`);

        if (!response.ok) {
            throw new Error('Failed to fetch transactions');
        }

        return await response.json();
    }

    /**
     * Create a transaction from prediction
     */
    async createTransaction(predictionData) {
        const response = await fetch(`${API_BASE_URL}/transactions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(predictionData),
        });

        if (!response.ok) {
            throw new Error('Failed to create transaction');
        }

        return await response.json();
    }

    /**
     * Process pending deliveries
     */
    async processDeliveries() {
        const response = await fetch(`${API_BASE_URL}/process-deliveries`, {
            method: 'POST',
        });

        if (!response.ok) {
            throw new Error('Failed to process deliveries');
        }

        return await response.json();
    }

    /**
     * Get activity logs with optional filters
     */
    async getLogs(actor = null, actionType = null, limit = 100) {
        let url = `${API_BASE_URL}/logs?limit=${limit}`;
        if (actor) url += `&actor=${actor}`;
        if (actionType) url += `&action_type=${actionType}`;

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error('Failed to fetch logs');
        }

        return await response.json();
    }

    /**
     * Create an activity log entry
     */
    async createLog(actor, actionType, skuId = null, skuName = null, details = null) {
        const formData = new FormData();
        formData.append('actor', actor);
        formData.append('action_type', actionType);
        if (skuId) formData.append('sku_id', skuId);
        if (skuName) formData.append('sku_name', skuName);
        if (details) formData.append('details', JSON.stringify(details));

        const response = await fetch(`${API_BASE_URL}/log`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            throw new Error('Failed to create log');
        }

        return await response.json();
    }
}

export default new InventoryAPI();
