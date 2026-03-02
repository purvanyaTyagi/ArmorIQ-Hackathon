# Inventory Management System

A dark-themed React inventory management application with AI-driven predictions and analytics.

## Features

### 🤖 AI Assistant Page
- Interactive chat interface for inventory queries
- Real-time AI predictions and recommendations
- Quick action suggestions for common tasks

### 📊 Dataset & Analytics Page
- CSV file upload with drag-and-drop support
- Interactive data visualizations (Recharts)
- Real-time statistics cards
- SKU distribution and entry tracking

### 📋 Transaction Logs Page
- Comprehensive AI transaction history
- Advanced filtering and search capabilities
- Confidence scores for AI predictions
- Status tracking (completed, pending, failed)

## Tech Stack

- **React 18** - UI framework
- **React Router** - Navigation
- **Recharts** - Data visualization
- **Vite** - Build tool
- **CSS3** - Styling with custom dark theme

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn

### Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start development server:**
   ```bash
   npm run dev
   ```

3. **Open your browser:**
   Navigate to `http://localhost:5173`

### Build for Production

```bash
npm run build
```

The production-ready files will be in the `dist` folder.

## Project Structure

```
hackathon/
├── src/
│   ├── components/
│   │   └── Navigation.jsx       # Sidebar navigation
│   ├── pages/
│   │   ├── PromptPage.jsx       # AI assistant page
│   │   ├── DatasetPage.jsx      # Upload & analytics
│   │   └── LogsPage.jsx         # Transaction logs
│   ├── App.jsx                  # Main app component
│   ├── main.jsx                 # Entry point
│   └── index.css                # Global styles & theme
├── index.html
├── package.json
└── vite.config.js
```

## Dark Theme

The app features a premium dark theme with:
- Deep black backgrounds (#0a0a0f)
- Vibrant accent colors (indigo, purple)
- Glassmorphism effects
- Smooth animations and transitions
- Responsive design for all screen sizes

## Future Enhancements

- Connect to SQLite database backend
- Implement actual AI/ML predictions
- Add user authentication
- Export data functionality
- Advanced analytics dashboard

## License

MIT
