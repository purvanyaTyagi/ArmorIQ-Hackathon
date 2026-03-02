import React, { useState, useEffect } from 'react';
import api from '../services/api';
import './LogsPage.css';

function LogsPage() {
    const [logs, setLogs] = useState([]);
    const [filter, setFilter] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [expandedLogId, setExpandedLogId] = useState(null);

    useEffect(() => {
        fetchLogs();
    }, [filter]);

    const fetchLogs = async () => {
        try {
            setLoading(true);
            let actor = null;
            let actionType = null;

            if (filter === 'ai') actor = 'ai';
            if (filter === 'user') actor = 'user';
            if (filter === 'violations') actionType = 'constraint_violation';

            const response = await api.getLogs(actor, actionType);
            setLogs(response.logs || []);
        } catch (error) {
            console.error('Error fetching logs:', error);
        } finally {
            setLoading(false);
        }
    };

    const filteredLogs = logs.filter(log => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return (
            log.sku_name?.toLowerCase().includes(query) ||
            log.action_type?.toLowerCase().includes(query) ||
            log.actor?.toLowerCase().includes(query)
        );
    });

    const getActionIcon = (actionType) => {
        switch (actionType) {
            case 'prediction': return '🤖';
            case 'constraint_violation': return '⚠️';
            case 'delivery': return '📦';
            case 'add_sku': return '➕';
            case 'edit_sku': return '✏️';
            case 'delete_sku': return '🗑️';
            case 'transaction': return '💳';
            default: return '📝';
        }
    };

    const getActorBadge = (actor) => {
        if (actor === 'ai') {
            return <span className="actor-badge ai">AI</span>;
        }
        return <span className="actor-badge user">User</span>;
    };

    const formatDate = (dateStr) => {
        return new Date(dateStr).toLocaleString();
    };

    const stats = {
        total: logs.length,
        ai: logs.filter(l => l.actor === 'ai').length,
        user: logs.filter(l => l.actor === 'user').length,
        violations: logs.filter(l => l.action_type === 'constraint_violation').length
    };

    return (
        <div className="logs-page">
            <div className="page-header">
                <h1>Activity Logs</h1>
                <p className="text-secondary">Track all user and AI actions</p>
            </div>

            {/* Summary Cards */}
            <div className="summary-cards">
                <div className="summary-card glass-card">
                    <div className="summary-value">{stats.total}</div>
                    <div className="summary-label">Total Logs</div>
                </div>
                <div className="summary-card glass-card">
                    <div className="summary-value">{stats.ai}</div>
                    <div className="summary-label">AI Actions</div>
                </div>
                <div className="summary-card glass-card">
                    <div className="summary-value">{stats.user}</div>
                    <div className="summary-label">User Actions</div>
                </div>
                <div className="summary-card glass-card">
                    <div className="summary-value" style={{ color: stats.violations > 0 ? '#fbbf24' : 'inherit' }}>
                        {stats.violations}
                    </div>
                    <div className="summary-label">Constraint Violations</div>
                </div>
            </div>

            {/* Filters */}
            <div className="filters-section glass-card">
                <div className="search-box">
                    <span className="search-icon">🔍</span>
                    <input
                        type="text"
                        className="input"
                        placeholder="Search by SKU name, action type..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <div className="filter-buttons">
                    <button
                        className={`btn btn-sm ${filter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setFilter('all')}
                    >
                        All
                    </button>
                    <button
                        className={`btn btn-sm ${filter === 'ai' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setFilter('ai')}
                    >
                        🤖 AI
                    </button>
                    <button
                        className={`btn btn-sm ${filter === 'user' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setFilter('user')}
                    >
                        👤 User
                    </button>
                    <button
                        className={`btn btn-sm ${filter === 'violations' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setFilter('violations')}
                    >
                        ⚠️ Violations
                    </button>
                </div>
            </div>

            {/* Logs Table */}
            <div className="logs-section">
                {loading ? (
                    <div className="loading-state">Loading logs...</div>
                ) : filteredLogs.length === 0 ? (
                    <div className="empty-state glass-card">
                        <div className="empty-icon">📋</div>
                        <h3>No Logs Yet</h3>
                        <p className="text-secondary">Activity logs will appear here as actions are performed</p>
                    </div>
                ) : (
                    <div className="table-wrapper glass-card">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Time</th>
                                    <th>Actor</th>
                                    <th>Action</th>
                                    <th>SKU</th>
                                    <th>Details</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredLogs.map((log) => (
                                    <React.Fragment key={log.id}>
                                        <tr
                                            className={`${log.action_type === 'constraint_violation' ? 'violation-row' : ''} ${log.details?.reasoning ? 'clickable-row' : ''}`}
                                            onClick={() => log.details?.reasoning && setExpandedLogId(expandedLogId === log.id ? null : log.id)}
                                        >
                                            <td className="text-secondary">
                                                {formatDate(log.created_at)}
                                            </td>
                                            <td>{getActorBadge(log.actor)}</td>
                                            <td>
                                                <span className="action-badge">
                                                    {getActionIcon(log.action_type)} {log.action_type.replace(/_/g, ' ')}
                                                </span>
                                            </td>
                                            <td>
                                                {log.sku_name ? (
                                                    <strong>{log.sku_name}</strong>
                                                ) : (
                                                    <span className="text-muted">-</span>
                                                )}
                                            </td>
                                            <td className="details-cell">
                                                {log.details ? (
                                                    <div className="details-content">
                                                        {log.action_type === 'constraint_violation' && log.details.violation && (
                                                            <span className="violation-text">{log.details.violation}</span>
                                                        )}
                                                        {log.action_type === 'prediction' && log.details.amount && (
                                                            <span>
                                                                Ordered {log.details.amount} units (${log.details.total_cost?.toFixed(2)})
                                                                {log.details.reasoning && <span className="expand-hint"> 🔍</span>}
                                                            </span>
                                                        )}
                                                        {log.action_type === 'delivery' && (
                                                            <span>
                                                                +{log.details.quantity_added} units from {log.details.vendor}
                                                                {log.details.trigger === 'auto' && ' (auto)'}
                                                            </span>
                                                        )}
                                                        {log.action_type === 'add_sku' && (
                                                            <span>Stock: {log.details.current_units} units, {log.details.vendors_added} vendors</span>
                                                        )}
                                                        {log.action_type === 'edit_sku' && (
                                                            <span>
                                                                {log.details.sku_name && `Name → ${log.details.sku_name}`}
                                                                {log.details.current_units !== undefined && ` Stock → ${log.details.current_units}`}
                                                            </span>
                                                        )}
                                                        {!['constraint_violation', 'prediction', 'delivery', 'add_sku', 'edit_sku'].includes(log.action_type) && (
                                                            <span className="text-muted">{JSON.stringify(log.details)}</span>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-muted">-</span>
                                                )}
                                            </td>
                                        </tr>
                                        {/* Expanded reasoning row */}
                                        {expandedLogId === log.id && log.details?.reasoning && (
                                            <tr className="expanded-row">
                                                <td colSpan="5">
                                                    <div className="reasoning-panel">
                                                        <div className="reasoning-header">💡 AI Reasoning</div>
                                                        <div className="reasoning-content">{log.details.reasoning}</div>
                                                        {log.details.vendors && log.details.vendors.length > 0 && (
                                                            <div className="reasoning-vendors">
                                                                <strong>Vendors:</strong> {log.details.vendors.join(', ')}
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

export default LogsPage;
