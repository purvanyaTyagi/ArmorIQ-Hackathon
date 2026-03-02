import { useState, useEffect } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, AreaChart, Area } from 'recharts';
import api from '../services/api';
import './SKUDetails.css';

function SKUDetails({ sku, onClose }) {
    const [timeSeriesData, setTimeSeriesData] = useState([]);
    const [vendors, setVendors] = useState([]);
    const [constraints, setConstraints] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showConstraintForm, setShowConstraintForm] = useState(false);

    const [constraintType, setConstraintType] = useState('max_quantity');
    const [constraintValue, setConstraintValue] = useState('');
    const [constraintDesc, setConstraintDesc] = useState('');

    useEffect(() => {
        fetchData();
    }, [sku.id]);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [timeSeriesRes, vendorsRes, constraintsRes] = await Promise.all([
                api.getSKUTimeSeries(sku.id),
                api.getSKUVendors(sku.id),
                api.getConstraints(sku.id)
            ]);

            setTimeSeriesData(timeSeriesRes.time_series || []);
            setVendors(vendorsRes.vendors || []);
            setConstraints(constraintsRes.constraints || []);
        } catch (error) {
            console.error('Error fetching SKU details:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleAddConstraint = async (e) => {
        e.preventDefault();
        try {
            await api.addConstraint(sku.id, constraintType, constraintValue, constraintDesc);
            setConstraintType('max_quantity');
            setConstraintValue('');
            setConstraintDesc('');
            setShowConstraintForm(false);
            await fetchData();
        } catch (error) {
            console.error('Error adding constraint:', error);
            alert('Failed to add constraint');
        }
    };

    const handleDeleteConstraint = async (constraintId) => {
        if (window.confirm('Are you sure you want to delete this constraint?')) {
            try {
                await api.deleteConstraint(constraintId);
                await fetchData();
            } catch (error) {
                console.error('Error deleting constraint:', error);
                alert('Failed to delete constraint');
            }
        }
    };

    const getConstraintLabel = (type) => {
        const labels = {
            max_quantity: 'Max Quantity',
            min_quantity: 'Min Quantity',
            budget_limit: 'Budget Limit',
            vendor_restriction: 'Vendor Restriction'
        };
        return labels[type] || type;
    };

    // Prepare vendor chart data
    const vendorChartData = vendors.map(v => ({
        vendor: v.vendor_name,
        price: v.cost_price,
        delivery: v.delivery_time_days
    }));

    const bestPrice = vendors.length > 0 ? Math.min(...vendors.map(v => v.cost_price)) : 0;
    const fastestDelivery = vendors.length > 0 ? Math.min(...vendors.map(v => v.delivery_time_days)) : 0;

    if (loading) {
        return (
            <div className="sku-details-overlay">
                <div className="sku-details-modal">
                    <div className="loading-state" style={{ padding: '2rem', textAlign: 'center', color: 'white' }}>
                        Loading...
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="sku-details-overlay" onClick={onClose}>
            <div className="sku-details-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>{sku.sku_name}</h2>
                    <button className="close-btn" onClick={onClose}>✕</button>
                </div>

                <div className="modal-content">
                    {/* Constraints Section (Moved to Top) */}
                    <div className="details-section">
                        <div className="section-header">
                            <h3>🔒 Purchase Constraints</h3>
                            <button
                                className="btn btn-primary btn-sm"
                                onClick={() => setShowConstraintForm(!showConstraintForm)}
                            >
                                {showConstraintForm ? 'Cancel' : '+ Add Constraint'}
                            </button>
                        </div>

                        {showConstraintForm && (
                            <form onSubmit={handleAddConstraint} className="constraint-form card">
                                <div className="form-group">
                                    <label>Constraint Type</label>
                                    <select
                                        className="input"
                                        value={constraintType}
                                        onChange={(e) => setConstraintType(e.target.value)}
                                        style={{ background: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid rgba(255,255,255,0.1)' }}
                                    >
                                        <option value="max_quantity">Max Quantity</option>
                                        <option value="min_quantity">Min Quantity</option>
                                        <option value="budget_limit">Budget Limit</option>
                                        <option value="vendor_restriction">Vendor Restriction</option>
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label>Value</label>
                                    <input
                                        type="text"
                                        className="input"
                                        placeholder={
                                            constraintType.includes('quantity') ? 'e.g., 100' :
                                                constraintType === 'budget_limit' ? 'e.g., 5000' :
                                                    'e.g., Vendor A, Vendor B'
                                        }
                                        value={constraintValue}
                                        onChange={(e) => setConstraintValue(e.target.value)}
                                        style={{ background: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid rgba(255,255,255,0.1)' }}
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Description (Optional)</label>
                                    <input
                                        type="text"
                                        className="input"
                                        placeholder="e.g., Maximum purchase limit per order"
                                        value={constraintDesc}
                                        onChange={(e) => setConstraintDesc(e.target.value)}
                                        style={{ background: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid rgba(255,255,255,0.1)' }}
                                    />
                                </div>

                                <button type="submit" className="btn btn-primary">
                                    Add Constraint
                                </button>
                            </form>
                        )}

                        {constraints.length > 0 ? (
                            <div className="constraints-list">
                                {constraints.map((constraint) => (
                                    <div key={constraint.id} className="constraint-item card">
                                        <div className="constraint-info">
                                            <div className="constraint-type">
                                                {getConstraintLabel(constraint.constraint_type)}
                                            </div>
                                            <div className="constraint-value">{constraint.constraint_value}</div>
                                            {constraint.description && (
                                                <div className="constraint-desc text-muted">{constraint.description}</div>
                                            )}
                                        </div>
                                        <button
                                            className="btn-delete"
                                            onClick={() => handleDeleteConstraint(constraint.id)}
                                            title="Delete constraint"
                                        >
                                            🗑️
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            !showConstraintForm && <p className="text-muted" style={{ fontStyle: 'italic', opacity: 0.7 }}>No constraints defined for this SKU</p>
                        )}
                    </div>

                    {/* Time Series Chart */}
                    {timeSeriesData.length > 0 && (
                        <div className="details-section">
                            <h3>📈 Sales Trend</h3>
                            <ResponsiveContainer width="100%" height={300}>
                                <AreaChart data={timeSeriesData}>
                                    <defs>
                                        <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8} />
                                            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                                    <XAxis
                                        dataKey="date"
                                        stroke="rgba(255,255,255,0.5)"
                                        style={{ fontSize: '0.75rem' }}
                                        tick={{ fill: 'rgba(255,255,255,0.5)' }}
                                    />
                                    <YAxis
                                        stroke="rgba(255,255,255,0.5)"
                                        style={{ fontSize: '0.75rem' }}
                                        tick={{ fill: 'rgba(255,255,255,0.5)' }}
                                    />
                                    <Tooltip
                                        contentStyle={{
                                            background: '#1e1e2e',
                                            border: '1px solid rgba(255,255,255,0.1)',
                                            borderRadius: '8px',
                                            color: 'white'
                                        }}
                                        itemStyle={{ color: '#c4b5fd' }}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="value"
                                        stroke="#8b5cf6"
                                        fillOpacity={1}
                                        fill="url(#colorValue)"
                                        name="Quantity"
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    )}

                    {/* Vendor Comparison */}
                    {vendors.length > 0 && (
                        <div className="details-section">
                            <h3>📊 Vendor Comparison</h3>
                            <ResponsiveContainer width="100%" height={280}>
                                <BarChart data={vendorChartData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                                    <XAxis
                                        dataKey="vendor"
                                        stroke="rgba(255,255,255,0.5)"
                                        style={{ fontSize: '0.75rem' }}
                                        tick={{ fill: 'rgba(255,255,255,0.5)' }}
                                    />
                                    <YAxis
                                        stroke="rgba(255,255,255,0.5)"
                                        style={{ fontSize: '0.75rem' }}
                                        tick={{ fill: 'rgba(255,255,255,0.5)' }}
                                    />
                                    <Tooltip
                                        contentStyle={{
                                            background: '#1e1e2e',
                                            border: '1px solid rgba(255,255,255,0.1)',
                                            borderRadius: '8px',
                                            color: 'white'
                                        }}
                                        cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                    />
                                    <Legend wrapperStyle={{ paddingTop: '10px' }} />
                                    <Bar dataKey="price" fill="#8b5cf6" name="Cost Price ($)" radius={[8, 8, 0, 0]} />
                                    <Bar dataKey="delivery" fill="#3b82f6" name="Delivery Time (days)" radius={[8, 8, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>

                            {/* Vendor Cards */}
                            <div className="vendor-cards">
                                {vendors.map((vendor) => (
                                    <div key={vendor.id} className="vendor-card card">
                                        <div className="vendor-name">{vendor.vendor_name}</div>
                                        <div className="vendor-details">
                                            <div className="vendor-stat">
                                                <span className="label">Cost Price</span>
                                                <span className={`value ${vendor.cost_price === bestPrice ? 'best' : ''}`}>
                                                    ${vendor.cost_price}
                                                    {vendor.cost_price === bestPrice && <span className="badge-best">Best</span>}
                                                </span>
                                            </div>
                                            <div className="vendor-stat">
                                                <span className="label">Delivery Time</span>
                                                <span className={`value ${vendor.delivery_time_days === fastestDelivery ? 'best' : ''}`}>
                                                    {vendor.delivery_time_days} days
                                                    {vendor.delivery_time_days === fastestDelivery && <span className="badge-best">Fastest</span>}
                                                </span>
                                            </div>
                                            {vendor.min_order_quantity && (
                                                <div className="vendor-stat">
                                                    <span className="label">Min Order</span>
                                                    <span className="value">{vendor.min_order_quantity} units</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default SKUDetails;
