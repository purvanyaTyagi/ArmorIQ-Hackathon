# Sample CSV Files for Testing

## Files Created

1. **previous_year_sales.csv** - Historical sales data for all fruits
2. **vendor_mangoes.csv** - Vendor data for Mangoes
3. **vendor_oranges.csv** - Vendor data for Oranges
4. **vendor_bananas.csv** - Vendor data for Bananas

## How to Use

### To upload "Mangoes" SKU:

1. Go to Dataset & Analytics page
2. Fill in the form:
   - **SKU Name**: `Mangoes`
   - **Current Units**: `1000`
   - **Previous Year Sales CSV**: Upload `previous_year_sales.csv`
   - **Vendor Data CSV**: Upload `vendor_mangoes.csv`
3. Click "Add SKU"

### To upload "Oranges" SKU:

1. **SKU Name**: `Oranges`
2. **Current Units**: `1000`
3. **Previous Year Sales CSV**: Upload `previous_year_sales.csv` (same file)
4. **Vendor Data CSV**: Upload `vendor_oranges.csv`

## Important Notes

- You can reuse the same `previous_year_sales.csv` for all SKUs
- Each SKU needs its own vendor CSV file
- The SKU name in the vendor CSV must match exactly what you enter in the form
- Make sure both backend and frontend servers are running

## File Formats

### Previous Year Sales CSV
```
Fruits,Current inventory,Previous Month sales,Past 10 days sales,cost price,selling market price
Mangoes,1000,3000,2000,100,200
...
```

### Vendor CSV (for specific SKU)
```
,Vendor A,Vendor B,Vendor C
Delivery Time (SKU_NAME),10 days,5 days,1 day
cost Price (SKU_NAME),80,100,150
```
