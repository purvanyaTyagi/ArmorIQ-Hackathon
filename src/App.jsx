import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navigation from './components/Navigation';
import PromptPage from './pages/PromptPage';
import DatasetPage from './pages/DatasetPage';
import TransactionsPage from './pages/TransactionsPage';
import LogsPage from './pages/LogsPage';
import SettingsPage from './pages/SettingsPage';
import './App.css';

function App() {
    return (
        <Router>
            <div className="app-container">
                <Navigation />
                <div className="main-content">
                    <Routes>
                        <Route path="/" element={<PromptPage />} />
                        <Route path="/dataset" element={<DatasetPage />} />
                        <Route path="/transactions" element={<TransactionsPage />} />
                        <Route path="/logs" element={<LogsPage />} />
                        <Route path="/settings" element={<SettingsPage />} />
                    </Routes>
                </div>
            </div>
        </Router>
    );
}

export default App;
