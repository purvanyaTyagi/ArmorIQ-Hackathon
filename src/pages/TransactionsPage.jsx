import { useState, useEffect } from 'react';
import api from '../services/api';
import './TransactionsPage.css';

function TransactionsPage() {
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchTransactions();
    }, []);

    const fetchTransactions = async () => {
        try {
            setLoading(true);
            const data = await api.getTransactions();
            setTransactions(data.transactions || []);
        } catch (error) {
            console.error('Error fetching transactions:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleMarkDelivered = async (transactionId, vendorIdx, vendorName) => {
        if (!window.confirm(`Mark delivery from ${vendorName} as DELIVERED? This will add units to your inventory.`)) {
            return;
        }

        try {
            const response = await fetch(`http://localhost:8000/transaction/${transactionId}/vendor/${vendorIdx}/deliver`, {
                method: 'POST'
            });
            const data = await response.json();

            if (data.success) {
                // Refresh data to show updated status
                fetchTransactions();
            } else {
                alert('Failed to update status: ' + data.message);
            }
        } catch (error) {
            console.error('Error updating delivery status:', error);
            alert('Error updating status');
        }
    };

    const getStatusBadge = (status) => {
        const colors = {
            pending: '#f59e0b',
            approved: '#3b82f6',
            in_transit: '#8b5cf6',
            delivered: '#10b981', // Updated to match green theme
            completed: '#22c55e',
            cancelled: '#ef4444',
            partially_delivered: '#3b82f6'
        };
        const labels = {
            pending: 'PENDING',
            approved: 'APPROVED',
            in_transit: 'IN TRANSIT',
            delivered: 'DELIVERED',
            completed: 'COMPLETED',
            cancelled: 'CANCELLED',
            partially_delivered: 'PARTIALLY DELIVERED'
        };
        return (
            <span
                className="status-badge"
                style={{ backgroundColor: colors[status] || '#6b7280' }}
            >
                {labels[status] || status}
            </span>
        );
    };

    const formatDate = (dateStr) => {
        return new Date(dateStr).toLocaleString();
    };

    return (
        <div className="page transactions-page">
            <div className="page-header">
                <h1>📦 Transactions</h1>
                <p>Purchase orders created from AI predictions</p>
            </div>

            {loading ? (
                <div className="loading-state">Loading transactions...</div>
            ) : transactions.length === 0 ? (
                <div className="empty-state card">
                    <h3>No Transactions Yet</h3>
                    <p>Create transactions from AI predictions on the Dataset page</p>
                </div>
            ) : (
                <div className="transactions-grid">
                    {transactions.map((tx) => (
                        <div key={tx.id} className="transaction-card card">
                            <div className="transaction-header">
                                <div className="transaction-title">
                                    <h3>{tx.sku_name}</h3>
                                    <span className="transaction-id">#{tx.id}</span>
                                </div>
                                {getStatusBadge(tx.status)}
                            </div>

                            <div className="transaction-body">
                                <div className="transaction-stat">
                                    <span className="label">Total Quantity</span>
                                    <span className="value">{tx.total_quantity} units</span>
                                </div>

                                <div className="transaction-stat">
                                    <span className="label">Total Cost</span>
                                    <span className="value highlight">${tx.total_cost.toFixed(2)}</span>
                                </div>

                                {tx.expected_delivery_date && (
                                    <div className="transaction-stat">
                                        <span className="label">Expected Delivery</span>
                                        <span className="value" style={{ color: '#8b5cf6' }}>
                                            {formatDate(tx.expected_delivery_date)}
                                        </span>
                                    </div>
                                )}

                                <div className="vendor-breakdown-section">
                                    <h4>Vendor Distribution</h4>
                                    {tx.vendors.map((vendor, idx) => {
                                        // Handle backward compatibility or missing statuses
                                        const statuses = tx.vendor_statuses || [];
                                        const status = statuses[idx] || 'pending';

                                        return (
                                            <div key={idx} className="vendor-breakdown">
                                                <div className="vendor-info">
                                                    <span className="vendor-name">{vendor}</span>
                                                    <span className="vendor-details">
                                                        {tx.quantities[idx]} units @ ${tx.costs[idx]}
                                                    </span>
                                                </div>
                                                <button
                                                    className={`status-chip ${status}`}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (status !== 'delivered') {
                                                            handleMarkDelivered(tx.id, idx, vendor);
                                                        }
                                                    }}
                                                    disabled={status === 'delivered'}
                                                    title={status === 'delivered' ? 'Already delivered' : 'Click to mark as delivered'}
                                                >
                                                    {status}
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="transaction-footer">
                                <span className="created-at">
                                    Created: {formatDate(tx.created_at)}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default TransactionsPage;
