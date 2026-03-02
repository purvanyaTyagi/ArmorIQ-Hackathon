import { useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import api from '../services/api';
import './Navigation.css';

function Navigation() {
    useEffect(() => {
        // Auto-process deliveries when app loads/navigation mounts
        const checkDeliveries = async () => {
            try {
                const result = await api.processDeliveries();
                if (result.processed_count > 0) {
                    console.log(`Processed ${result.processed_count} deliveries`);
                    // Optional: You could show a toast notification here
                }
            } catch (err) {
                console.error('Error processing deliveries:', err);
            }
        };

        checkDeliveries();

        // Optional: Set up an interval to check every minute
        const interval = setInterval(checkDeliveries, 60000);
        return () => clearInterval(interval);
    }, []);

    return (
        <nav className="navigation glass-card">
            <div className="nav-brand">
                <span className="brand-icon">⚡</span>
                <h1>INVENTORY<span className="text-gradient">360</span></h1>
            </div>

            <div className="nav-menu">
                <NavLink to="/" className="nav-item">
                    <span className="nav-icon">✨</span>
                    <span>AI Predictor</span>
                </NavLink>

                <NavLink to="/dataset" className="nav-item">
                    <span className="nav-icon">📦</span>
                    <span>Inventory</span>
                </NavLink>

                <NavLink to="/transactions" className="nav-item">
                    <span className="nav-icon">💳</span>
                    <span>Transactions</span>
                </NavLink>

                <NavLink to="/logs" className="nav-item">
                    <span className="nav-icon">📋</span>
                    <span>Logs</span>
                </NavLink>

                <NavLink to="/settings" className="nav-item">
                    <span className="nav-icon">⚙️</span>
                    <span>Settings</span>
                </NavLink>
            </div>

            <div className="nav-footer">
                <div className="nav-status">
                    <div className="status-indicator"></div>
                    <span className="status-text">System Online</span>
                </div>
            </div>
        </nav>
    );
}

export default Navigation;
