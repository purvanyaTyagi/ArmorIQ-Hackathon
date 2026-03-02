# Inventory Management System - Setup Guide

## Project Structure

```
hackathon/
├── backend/
│   ├── main.py              # FastAPI application
│   ├── requirements.txt     # Python dependencies
│   └── database/            # SQLite database (auto-created)
│       └── inventory.db
└── src/                     # React frontend
    ├── components/
    ├── pages/
    └── services/
        └── api.js           # Backend API client
```

## Backend Setup

### 1. Install Python Dependencies

```bash
cd hackathon/backend
pip install -r requirements.txt
```

### 2. Start FastAPI Server

```bash
python main.py
```

Or using uvicorn directly:

```bash
uvicorn main:app --reload --port 8000
```

The backend will be available at: `http://localhost:8000`

**API Endpoints:**
- `GET /` - Health check
- `POST /add-sku` - Add new SKU with CSV files
- `GET /skus` - Get all SKUs
- `GET /sku/{sku_id}/vendors` - Get vendors for SKU
- `GET /sku/{sku_id}/schema` - Get CSV schema for SKU
- `GET /stats` - Get dashboard statistics

## Frontend Setup

### 1. Install Node Dependencies

```bash
cd hackathon
npm install
```

### 2. Start React Development Server

```bash
npm run dev
```

The frontend will be available at: `http://localhost:5173`

## Using the Application

### Adding a SKU

1. Navigate to the **Dataset & Analytics** page
2. Fill in the form:
   - **SKU Name**: Name of the product (e.g., "Mangoes")
   - **Current Units**: Current inventory count
   - **Previous Year Sales CSV**: Upload sales history CSV
   - **Vendor Data CSV**: Upload vendor information CSV

### CSV Format Examples

**Previous Year Sales CSV:**
```csv
Fruits,Current inventory,Previous Month sales,Past 10 days sales,cost price,selling market price
Mangoes,1000,3000,2000,100,200
```

**Vendor Data CSV:**
```csv
,Vendor A,Vendor B,Vendor C
Delivery Time (Mangoes),10 days,5 days,1 day
cost Price (Mangoes),80,100,150
```

### Viewing Data

- **Statistics Cards**: Shows total SKUs, units, vendors, and average cost
- **Charts**: Visualizes SKU distribution
- **Table**: Lists all uploaded SKUs with details

## Database Schema

The SQLite database has three main tables:

### `skus`
- `id`: Primary key
- `sku_name`: Product name (unique)
- `current_units`: Inventory count
- `created_at`: Timestamp

### `sku_csv_schema`
- `id`: Primary key
- `sku_id`: Foreign key to skus
- `column_name`: CSV column name

### `sku_vendors`
- `id`: Primary key
- `sku_id`: Foreign key to skus
- `vendor_name`: Vendor name
- `delivery_time_days`: Delivery time
- `cost_price`: Cost from vendor

## Troubleshooting

### Backend shows "offline"
- Ensure FastAPI server is running on port 8000
- Check if `uvicorn` is installed: `pip install uvicorn`

### CORS errors
- The backend already has CORS configured for `localhost:5173`
- If using a different port, update the CORS origins in `main.py`

### File upload fails
- Ensure both CSV files are selected
- Check file format is `.csv`
- Verify SKU name and current units are filled

## Development

### Backend Changes
Edit `backend/main.py` and the server will auto-reload (if using `--reload` flag)

### Frontend Changes
Edit files in `src/` and Vite will hot-reload automatically

## Production Build

```bash
npm run build
```

Outputs to `dist/` folder, ready for deployment.
