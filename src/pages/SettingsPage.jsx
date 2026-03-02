import { useState, useEffect } from 'react';
import './SettingsPage.css';

function SettingsPage() {
    const [constraints, setConstraints] = useState([]);
    const [monthlyBudget, setMonthlyBudget] = useState('');
    const [monthlySpending, setMonthlySpending] = useState(0);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState(null);

    useEffect(() => {
        fetchConstraints();

        // Auto-refresh when page becomes visible
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') {
                fetchConstraints();
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);

        // Also refresh every 30 seconds
        const interval = setInterval(fetchConstraints, 30000);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibility);
            clearInterval(interval);
        };
    }, []);

    const fetchConstraints = async () => {
        try {
            const response = await fetch('http://localhost:8000/global-constraints');
            const data = await response.json();
            setConstraints(data.constraints || []);
            setMonthlySpending(data.monthly_spending || 0);

            // Find monthly budget constraint
            const budgetConstraint = data.constraints?.find(c => c.constraint_type === 'monthly_budget');
            if (budgetConstraint) {
                setMonthlyBudget(budgetConstraint.constraint_value);
            }
        } catch (error) {
            console.error('Error fetching constraints:', error);
        } finally {
            setLoading(false);
        }
    };

    const saveBudget = async () => {
        if (!monthlyBudget || isNaN(parseFloat(monthlyBudget))) {
            setMessage({ type: 'error', text: 'Please enter a valid budget amount' });
            return;
        }

        setSaving(true);
        try {
            const formData = new FormData();
            formData.append('constraint_type', 'monthly_budget');
            formData.append('constraint_value', monthlyBudget);
            formData.append('description', 'Maximum monthly spending across all SKUs');

            const response = await fetch('http://localhost:8000/global-constraints', {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                setMessage({ type: 'success', text: 'Monthly budget saved successfully!' });
                fetchConstraints();
            } else {
                setMessage({ type: 'error', text: 'Failed to save budget' });
            }
        } catch (error) {
            console.error('Error saving budget:', error);
            setMessage({ type: 'error', text: 'Error saving budget' });
        } finally {
            setSaving(false);
        }
    };

    const remainingBudget = monthlyBudget ? parseFloat(monthlyBudget) - monthlySpending : null;
    const budgetPercentUsed = monthlyBudget ? (monthlySpending / parseFloat(monthlyBudget)) * 100 : 0;

    if (loading) {
        return <div className="settings-page"><div className="loading">Loading settings...</div></div>;
    }

    return (
        <div className="settings-page">
            <div className="settings-header">
                <div className="header-row">
                    <div>
                        <h1>⚙️ Global Settings</h1>
                        <p className="settings-subtitle">Configure system-wide constraints and limits</p>
                    </div>
                    <button className="refresh-btn" onClick={fetchConstraints}>🔄 Refresh</button>
                </div>
            </div>

            {message && (
                <div className={`message ${message.type}`}>
                    {message.text}
                    <button className="message-close" onClick={() => setMessage(null)}>×</button>
                </div>
            )}

            <div className="settings-section">
                <h2>💰 Monthly Budget</h2>
                <p className="section-description">
                    Set a maximum monthly spending limit across all SKU purchases.
                    The AI will optimize orders to stay within this budget.
                </p>

                <div className="budget-card">
                    <div className="budget-input-row">
                        <label>Monthly Budget Limit ($)</label>
                        <div className="input-group">
                            <span className="input-prefix">$</span>
                            <input
                                type="number"
                                value={monthlyBudget}
                                onChange={(e) => setMonthlyBudget(e.target.value)}
                                placeholder="Enter budget amount"
                                min="0"
                                step="0.01"
                            />
                            <button
                                className="save-btn"
                                onClick={saveBudget}
                                disabled={saving}
                            >
                                {saving ? 'Saving...' : 'Save'}
                            </button>
                        </div>
                    </div>

                    {monthlyBudget && (
                        <div className="budget-stats">
                            <div className="budget-progress">
                                <div className="progress-bar">
                                    <div
                                        className={`progress-fill ${budgetPercentUsed > 90 ? 'critical' : budgetPercentUsed > 70 ? 'warning' : ''}`}
                                        style={{ width: `${Math.min(budgetPercentUsed, 100)}%` }}
                                    ></div>
                                </div>
                                <span className="progress-text">{budgetPercentUsed.toFixed(1)}% used</span>
                            </div>

                            <div className="budget-numbers">
                                <div className="stat">
                                    <span className="stat-label">Spent This Month</span>
                                    <span className="stat-value spent">${monthlySpending.toFixed(2)}</span>
                                </div>
                                <div className="stat">
                                    <span className="stat-label">Remaining Budget</span>
                                    <span className={`stat-value ${remainingBudget < 0 ? 'negative' : 'remaining'}`}>
                                        ${remainingBudget?.toFixed(2)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="settings-section">
                <h2>📋 Active Global Constraints</h2>
                {constraints.length > 0 ? (
                    <div className="constraints-list">
                        {constraints.map((c) => (
                            <div key={c.id} className="constraint-item">
                                <div className="constraint-type">{c.constraint_type}</div>
                                <div className="constraint-value">{c.constraint_value}</div>
                                <div className="constraint-desc">{c.description || '-'}</div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="no-constraints">No global constraints configured yet.</p>
                )}
            </div>
        </div>
    );
}

export default SettingsPage;
