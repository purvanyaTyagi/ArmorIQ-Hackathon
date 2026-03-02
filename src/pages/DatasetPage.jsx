import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import api from '../services/api';
import SKUDetails from '../components/SKUDetails';
import './DatasetPage.css';

function DatasetPage() {
    const [skuName, setSkuName] = useState('');
    const [currentUnits, setCurrentUnits] = useState('');
    const [previousYearCSV, setPreviousYearCSV] = useState(null);
    const [vendorCSV, setVendorCSV] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadStatus, setUploadStatus] = useState(null);
    const [skuList, setSkuList] = useState([]);
    const [selectedSKU, setSelectedSKU] = useState(null);
    const [editingSKU, setEditingSKU] = useState(null);
    const [editName, setEditName] = useState('');
    const [editUnits, setEditUnits] = useState('');
    const [predictions, setPredictions] = useState([]);
    const [showPredictions, setShowPredictions] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [stats, setStats] = useState({
        total_skus: 0,
        total_units: 0,
        total_vendors: 0,
        avg_cost_price: 0
    });
    const [isBackendOnline, setIsBackendOnline] = useState(false);

    // Check backend status on mount
    useEffect(() => {
        checkBackend();
        fetchData();
    }, []);

    const checkBackend = async () => {
        const online = await api.pingBackend();
        setIsBackendOnline(online);
        if (!online) {
            setUploadStatus({ type: 'error', message: 'Backend server is offline. Please start the FastAPI server.' });
        }
    };

    const fetchData = async () => {
        try {
            const [skusResponse, statsResponse] = await Promise.all([
                api.getAllSKUs(),
                api.getStats()
            ]);
            setSkuList(skusResponse.skus || []);
            setStats(statsResponse);
        } catch (error) {
            console.error('Error fetching data:', error);
        }
    };

    const handlePreviousYearChange = (e) => {
        const file = e.target.files[0];
        if (file && file.type === 'text/csv') {
            setPreviousYearCSV(file);
        } else {
            alert('Please upload a CSV file');
        }
    };

    const handleVendorChange = (e) => {
        const file = e.target.files[0];
        if (file && file.type === 'text/csv') {
            setVendorCSV(file);
        } else {
            alert('Please upload a CSV file');
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!skuName || !currentUnits || !previousYearCSV || !vendorCSV) {
            setUploadStatus({ type: 'error', message: 'Please fill all fields and upload both CSV files' });
            return;
        }

        if (!isBackendOnline) {
            setUploadStatus({ type: 'error', message: 'Backend server is offline. Please start the FastAPI server on port 8000.' });
            return;
        }

        setIsUploading(true);
        setUploadStatus(null);

        try {
            const response = await api.addSKU(skuName, parseInt(currentUnits), previousYearCSV, vendorCSV);

            setUploadStatus({
                type: 'success',
                message: `✅ Successfully added SKU: ${response.sku_name}`,
                details: response
            });

            // Reset form
            setSkuName('');
            setCurrentUnits('');
            setPreviousYearCSV(null);
            setVendorCSV(null);

            // Refresh data
            await fetchData();

        } catch (error) {
            setUploadStatus({
                type: 'error',
                message: '❌ Failed to upload SKU. Please check if the backend server is running.'
            });
        } finally {
            setIsUploading(false);
        }
    };

    const handleEditSKU = (sku, e) => {
        e.stopPropagation();
        setEditingSKU(sku);
        setEditName(sku.sku_name);
        setEditUnits(sku.current_units);
    };

    const handleUpdateSKU = async (e) => {
        e.preventDefault();
        try {
            await api.updateSKU(editingSKU.id, editName, parseInt(editUnits));
            setEditingSKU(null);
            await fetchData();
        } catch (error) {
            console.error('Error updating SKU:', error);
            alert('Failed to update SKU');
        }
    };

    const handleDeleteSKU = async (skuId, e) => {
        e.stopPropagation();
        if (window.confirm('Are you sure you want to delete this SKU? This will also delete all related vendors and constraints.')) {
            try {
                await api.deleteSKU(skuId);
                await fetchData();
            } catch (error) {
                console.error('Error deleting SKU:', error);
                alert('Failed to delete SKU');
            }
        }
    };

    const handleClearAll = async () => {
        if (window.confirm('⚠️ Are you sure you want to delete ALL SKUs and their data? This cannot be undone!')) {
            try {
                await api.clearAllSKUs();
                await fetchData();
            } catch (error) {
                console.error('Error clearing all SKUs:', error);
                alert('Failed to clear all SKUs');
            }
        }
    };

    const handlePredict = async () => {
        try {
            setIsGenerating(true);
            const result = await api.generatePredictions();
            setPredictions(result.predictions || []);
            setShowPredictions(true);
        } catch (error) {
            console.error('Error generating predictions:', error);
            alert('Failed to generate predictions. Make sure the backend is running.');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleMarkDelivered = async (transactionId, vendorIdx, vendorName) => {
        console.log('handleMarkDelivered called with:', { transactionId, vendorIdx, vendorName });

        if (!transactionId) {
            console.error('Missing transactionId');
            alert('Error: Missing transaction ID. Please regenerate predictions.');
            return;
        }

        if (!window.confirm(`Mark delivery from ${vendorName} as DELIVERED? This will add units to your inventory.`)) {
            return;
        }

        try {
            console.log(`Sending request to: http://localhost:8000/transaction/${transactionId}/vendor/${vendorIdx}/deliver`);
            const response = await fetch(`http://localhost:8000/transaction/${transactionId}/vendor/${vendorIdx}/deliver`, {
                method: 'POST'
            });
            const data = await response.json();
            console.log('Response:', data);

            if (data.success) {
                // Update local state to reflect change immediately
                setPredictions(prev => prev.map(pred => {
                    if (pred.transaction_id === transactionId) {
                        const newStatuses = [...(pred.vendor_statuses || [])];
                        newStatuses[vendorIdx] = 'delivered';
                        return {
                            ...pred,
                            vendor_statuses: newStatuses,
                            status: data.new_status
                        };
                    }
                    return pred;
                }));
                // Refresh data to show updated units
                fetchData();
            } else {
                alert('Failed to update status: ' + data.message);
            }
        } catch (error) {
            console.error('Error updating delivery status:', error);
            alert('Error updating status');
        }
    };

    // Sample data for visualization (will be replaced with real data)
    const skuData = skuList.slice(0, 5).map(sku => ({
        name: sku.sku_name,
        value: sku.current_units
    }));

    const COLORS = ['#8b5cf6', '#d946ef', '#06b6d4', '#ec4899', '#3b82f6'];

    return (
        <div className="dataset-page">
            <div className="page-header">
                <h1>Dataset & Analytics</h1>
                <p className="text-secondary">Upload inventory data and visualize insights</p>

                {/* Backend Status Indicator */}
                <div className="backend-status">
                    <span className={`status-dot ${isBackendOnline ? 'online' : 'offline'}`}></span>
                    <span className="text-muted">
                        Backend: {isBackendOnline ? 'Online' : 'Offline'}
                    </span>
                </div>
            </div>

            {/* Upload Form */}
            <div className="upload-section">
                <form onSubmit={handleSubmit} className="upload-form glass-card">
                    <h3>Add New SKU</h3>

                    <div className="form-row">
                        <div className="form-group">
                            <label htmlFor="sku-name">SKU Name</label>
                            <input
                                id="sku-name"
                                type="text"
                                className="input"
                                placeholder="e.g., Mangoes, Oranges"
                                value={skuName}
                                onChange={(e) => setSkuName(e.target.value)}
                                disabled={isUploading}
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="current-units">Current Units</label>
                            <input
                                id="current-units"
                                type="number"
                                className="input"
                                placeholder="e.g., 1000"
                                value={currentUnits}
                                onChange={(e) => setCurrentUnits(e.target.value)}
                                disabled={isUploading}
                            />
                        </div>
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label htmlFor="previous-year-csv">Previous Year Sales CSV</label>
                            <input
                                id="previous-year-csv"
                                type="file"
                                accept=".csv"
                                onChange={handlePreviousYearChange}
                                disabled={isUploading}
                                className="file-input"
                            />
                            {previousYearCSV && (
                                <div className="file-preview">
                                    <span>✅ {previousYearCSV.name}</span>
                                </div>
                            )}
                        </div>

                        <div className="form-group">
                            <label htmlFor="vendor-csv">Vendor Data CSV</label>
                            <input
                                id="vendor-csv"
                                type="file"
                                accept=".csv"
                                onChange={handleVendorChange}
                                disabled={isUploading}
                                className="file-input"
                            />
                            {vendorCSV && (
                                <div className="file-preview">
                                    <span>✅ {vendorCSV.name}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={isUploading || !isBackendOnline}
                    >
                        {isUploading ? (
                            <>
                                <span>Uploading...</span>
                                <span className="spinner">⏳</span>
                            </>
                        ) : (
                            <>
                                <span>Add SKU</span>
                                <span>📤</span>
                            </>
                        )}
                    </button>
                </form>

                {/* Upload Status */}
                {uploadStatus && (
                    <div className={`upload-status ${uploadStatus.type}`}>
                        <p>{uploadStatus.message}</p>
                        {uploadStatus.details && (
                            <div className="upload-details">
                                <p>SKU ID: {uploadStatus.details.sku_id}</p>
                                <p>Columns Detected: {uploadStatus.details.csv_columns_detected?.join(', ')}</p>
                                <p>Vendors Added: {uploadStatus.details.vendors_added}</p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Statistics Cards */}
            <div className="stats-grid">
                <div className="stat-card card">
                    <div className="stat-icon" style={{ background: 'rgba(99, 102, 241, 0.15)' }}>📊</div>
                    <div className="stat-content">
                        <div className="stat-value">{stats.total_skus}</div>
                        <div className="stat-label">Total SKUs</div>
                    </div>
                </div>

                <div className="stat-card card">
                    <div className="stat-icon" style={{ background: 'rgba(139, 92, 246, 0.15)' }}>📦</div>
                    <div className="stat-content">
                        <div className="stat-value">{stats.total_units.toLocaleString()}</div>
                        <div className="stat-label">Total Units</div>
                    </div>
                </div>

                <div className="stat-card card">
                    <div className="stat-icon" style={{ background: 'rgba(16, 185, 129, 0.15)' }}>🏪</div>
                    <div className="stat-content">
                        <div className="stat-value">{stats.total_vendors}</div>
                        <div className="stat-label">Total Vendors</div>
                    </div>
                </div>

                <div className="stat-card card">
                    <div className="stat-icon" style={{ background: 'rgba(245, 158, 11, 0.15)' }}>💰</div>
                    <div className="stat-content">
                        <div className="stat-value">${stats.avg_cost_price}</div>
                        <div className="stat-label">Avg Cost Price</div>
                    </div>
                </div>
            </div>

            {/* Visualization Section */}
            {skuList.length > 0 && (
                <div className="visualization-grid">
                    <div className="chart-card glass-card">
                        <h3>SKU Distribution</h3>
                        <ResponsiveContainer width="100%" height={300}>
                            <PieChart>
                                <Pie
                                    data={skuData}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={true}
                                    label={({ name, value }) => `${name}: ${value}`}
                                    outerRadius={100}
                                    fill="#8884d8"
                                    dataKey="value"
                                    stroke="none"
                                    style={{ filter: 'drop-shadow(0px 0px 5px rgba(255,255,255,0.2))' }}
                                >
                                    {skuData.map((entry, index) => (
                                        <Cell
                                            key={`cell-${index}`}
                                            fill={COLORS[index % COLORS.length]}
                                            stroke="rgba(0,0,0,0.2)"
                                            strokeWidth={1}
                                        />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{
                                        background: 'rgba(30, 30, 46, 0.8)',
                                        border: '1px solid rgba(255, 255, 255, 0.1)',
                                        borderRadius: '12px',
                                        color: '#f5f5f7',
                                        backdropFilter: 'blur(10px)'
                                    }}
                                    itemStyle={{ color: '#e2e8f0' }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {/* SKU List Table */}
            {skuList.length > 0 && (
                <div className="table-section">
                    <div className="table-header">
                        <h3>All SKUs</h3>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button className="btn btn-danger btn-sm" onClick={handleClearAll}>
                                🗑️ Clear All
                            </button>
                            <button
                                className="btn btn-primary btn-sm"
                                onClick={handlePredict}
                                disabled={isGenerating || skuList.length === 0}
                            >
                                {isGenerating ? '🔮 Generating...' : '🤖 Predict'}
                            </button>
                        </div>
                    </div>
                    <div className="table-wrapper card">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>SKU Name</th>
                                    <th>Current Units</th>
                                    <th>Created At</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {skuList.map((sku) => (
                                    <tr
                                        key={sku.id}
                                        onClick={() => setSelectedSKU(sku)}
                                        style={{ cursor: 'pointer' }}
                                        title="Click to view details, vendors, and constraints"
                                    >
                                        <td><code>#{sku.id}</code></td>
                                        <td><strong>{sku.sku_name}</strong></td>
                                        <td>{sku.current_units.toLocaleString()}</td>
                                        <td className="text-secondary">
                                            {new Date(sku.created_at).toLocaleString()}
                                        </td>
                                        <td>
                                            <div className="action-buttons">
                                                <button
                                                    className="btn-icon"
                                                    onClick={(e) => handleEditSKU(sku, e)}
                                                    title="Edit SKU"
                                                >
                                                    ✏️
                                                </button>
                                                <button
                                                    className="btn-icon btn-icon-danger"
                                                    onClick={(e) => handleDeleteSKU(sku.id, e)}
                                                    title="Delete SKU"
                                                >
                                                    🗑️
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {skuList.length === 0 && isBackendOnline && (
                <div className="empty-state">
                    <div className="empty-icon">📦</div>
                    <h3>No SKUs Yet</h3>
                    <p className="text-secondary">Upload your first SKU to get started</p>
                </div>
            )}





            {/* SKU Details Modal */}
            {
                selectedSKU && (
                    <SKUDetails
                        sku={selectedSKU}
                        onClose={() => setSelectedSKU(null)}
                    />
                )
            }

            {/* Edit SKU Modal */}
            {
                editingSKU && (
                    <div className="sku-details-overlay" onClick={() => setEditingSKU(null)}>
                        <div className="sku-details-modal edit-modal" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <h2>Edit SKU</h2>
                                <button className="close-btn" onClick={() => setEditingSKU(null)}>✕</button>
                            </div>
                            <div className="modal-content">
                                <form onSubmit={handleUpdateSKU}>
                                    <div className="form-group">
                                        <label>SKU Name</label>
                                        <input
                                            type="text"
                                            className="input"
                                            value={editName}
                                            onChange={(e) => setEditName(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Current Units</label>
                                        <input
                                            type="number"
                                            className="input"
                                            value={editUnits}
                                            onChange={(e) => setEditUnits(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div className="modal-actions">
                                        <button type="submit" className="btn btn-primary">Save Changes</button>
                                        <button type="button" className="btn btn-secondary" onClick={() => setEditingSKU(null)}>Cancel</button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
}

export default DatasetPage;
