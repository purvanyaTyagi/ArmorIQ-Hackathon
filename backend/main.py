from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
import csv
import io
import os
import json
from predictor import generate_prediction_for_sku
from supabase_client import get_supabase_client
from datetime import datetime, timedelta

from contextlib import asynccontextmanager

# ------------------ LIFESPAN EVENTS ------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Starting up... Connecting to Supabase")
    # You can add cleanup code after the yield if needed
    yield
    print("Shutting down...")

app = FastAPI(lifespan=lifespan)

# ------------------ CORS MIDDLEWARE ------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ------------------ DB HELPERS ------------------

def get_supabase():
    return get_supabase_client()


def log_activity(actor: str, action_type: str, sku_id: int = None, sku_name: str = None, details: dict = None):
    """
    Log an activity to the activity_logs table.
    
    Args:
        actor: 'user' or 'ai'
        action_type: 'prediction', 'transaction', 'delivery', 'constraint_violation', 'add_sku', 'delete_sku', etc.
        sku_id: Optional SKU ID
        sku_name: Optional SKU name
        details: Optional dict with additional details (will be JSON serialized)
    """
    supabase = get_supabase()
    try:
        supabase.table("activity_logs").insert({
            "actor": actor,
            "action_type": action_type,
            "sku_id": sku_id,
            "sku_name": sku_name,
            "details": json.dumps(details) if details else None
        }).execute()
    except Exception as e:
        print(f"Failed to log activity: {e}")


def validate_constraints(sku_id: int, quantity: int, total_cost: float = None) -> tuple:
    """
    Validate transaction against SKU constraints.
    Returns (is_valid, message)
    """
    supabase = get_supabase()
    
    # Get constraints for this SKU
    res = supabase.table("sku_constraints").select("constraint_type, constraint_value, description").eq("sku_id", sku_id).execute()
    constraints = res.data
    
    for constraint in constraints:
        c_type = constraint["constraint_type"]
        try:
            c_value = float(constraint["constraint_value"])
        except (ValueError, TypeError):
            continue
        
        if c_type == "max_quantity" and quantity > c_value:
            return False, f"Quantity {quantity} exceeds max limit of {int(c_value)}"
        
        if c_type == "min_quantity" and quantity < c_value:
            return False, f"Quantity {quantity} is below min limit of {int(c_value)}"
        
        if c_type == "budget_limit" and total_cost is not None:
            if total_cost > c_value:
                return False, f"Total cost ${total_cost:.2f} exceeds budget limit of ${c_value:.2f}"
    
    return True, "All constraints satisfied"


@app.get("/")
def read_root():
    return {"message": "Inventory Management API (Supabase)", "status": "running"}


@app.post("/add-sku")
async def add_sku(
    sku_name: str = Form(...),
    current_units: int = Form(...),
    previous_year_csv: UploadFile = File(...),
    vendor_csv: UploadFile = File(...)
):
    supabase = get_supabase()

    # ------------------ Insert SKU ------------------
    try:
        res = supabase.table("skus").insert({
            "sku_name": sku_name,
            "current_units": current_units
        }).execute()
        
        if not res.data:
            return {"status": "error", "message": "Failed to create SKU"}
            
        sku_id = res.data[0]['id']
    except Exception as e:
        return {"status": "error", "message": str(e)}

    # ------------------ Read Previous Year Sales CSV ------------------
    prev_csv_bytes = await previous_year_csv.read()
    prev_csv_file = io.StringIO(prev_csv_bytes.decode("utf-8"))
    
    # Store schema headers
    prev_csv_file.seek(0)
    headers_reader = csv.reader(prev_csv_file)
    headers = next(headers_reader)
    
    csv_schema_data = [{"sku_id": sku_id, "column_name": col.strip()} for col in headers]
    if csv_schema_data:
        supabase.table("sku_csv_schema").insert(csv_schema_data).execute()
    
    # Parse and store historical sales data (Date, Quantity format)
    prev_csv_file.seek(0)
    prev_reader = csv.DictReader(prev_csv_file)
    
    time_series_data = []
    for row in prev_reader:
        if 'Date' in row and 'Quantity' in row:
            time_series_data.append({
                "sku_id": sku_id,
                "date": row['Date'],
                "value": float(row['Quantity'])
            })
            
    if time_series_data:
        # Batch insert
        supabase.table("sku_vendor_time_series").insert(time_series_data).execute()

    # ------------------ Read vendor time-series CSV ------------------
    vendor_bytes = await vendor_csv.read()
    vendor_file = io.StringIO(vendor_bytes.decode("utf-8"))
    
    rows_inserted = 0
    vendor_file.seek(0)
    first_line = vendor_file.readline().strip()
    vendor_file.seek(0)
    
    # Check if it's vendor data format
    if 'Vendor' in first_line or 'vendor' in first_line.lower():
        vendor_reader = csv.DictReader(vendor_file)
        vendors_data = []
        for row in vendor_reader:
            vendors_data.append({
                "sku_id": sku_id,
                "vendor_name": row.get('Vendor', row.get('vendor', '')),
                "cost_price": float(row.get('Cost', row.get('cost', 0))),
                "delivery_time_days": int(row.get('Delivery', row.get('delivery', 0))),
                "min_order_quantity": int(row.get('MinOrder', row.get('minorder', row.get('min_order', 100))))
            })
        
        if vendors_data:
            supabase.table("sku_vendors").insert(vendors_data).execute()
            rows_inserted = len(vendors_data)
    else:
        # Parse time-series format: Date,Quantity
        vendor_reader = csv.DictReader(vendor_file)
        ts_data = []
        for row in vendor_reader:
            ts_data.append({
                "sku_id": sku_id,
                "date": row["Date"],
                "value": float(row["Quantity"])
            })
        
        if ts_data:
            supabase.table("sku_vendor_time_series").insert(ts_data).execute()
            rows_inserted = len(ts_data)

    # Log the SKU addition
    log_activity(
        actor="user",
        action_type="add_sku",
        sku_id=sku_id,
        sku_name=sku_name,
        details={"current_units": current_units, "vendors_added": rows_inserted}
    )

    return {
        "status": "success",
        "sku_id": sku_id,
        "sku_name": sku_name,
        "csv_columns_detected": headers,
        "vendors_added": rows_inserted
    }


@app.get("/skus")
def get_all_skus():
    """Get all SKUs with their basic information"""
    supabase = get_supabase()
    res = supabase.table("skus").select("id, sku_name, current_units, created_at").order("created_at", desc=True).execute()
    return {"skus": res.data}


@app.get("/sku/{sku_id}/time-series")
def get_sku_time_series(sku_id: int):
    """Get time series data for a specific SKU"""
    supabase = get_supabase()
    res = supabase.table("sku_vendor_time_series").select("date, value").eq("sku_id", sku_id).order("date").execute()
    return {"time_series": res.data}


@app.get("/sku/{sku_id}/vendors")
def get_sku_vendors(sku_id: int):
    """Get all vendors for a specific SKU"""
    supabase = get_supabase()
    res = supabase.table("sku_vendors").select("id, vendor_name, cost_price, delivery_time_days, min_order_quantity").eq("sku_id", sku_id).execute()
    return {"vendors": res.data}


@app.get("/sku/{sku_id}/schema")
def get_sku_schema(sku_id: int):
    """Get CSV schema columns for a specific SKU"""
    supabase = get_supabase()
    res = supabase.table("sku_csv_schema").select("column_name").eq("sku_id", sku_id).execute()
    columns = [row['column_name'] for row in res.data]
    return {"columns": columns}


@app.get("/stats")
def get_stats():
    """Get dashboard statistics"""
    supabase = get_supabase()
    
    # Total SKUs
    res_skus = supabase.table("skus").select("*", count="exact").execute()
    total_skus = res_skus.count
    
    # Total units (manual sum because aggregate queries are limited in client)
    skus_data = res_skus.data
    total_units = sum(item['current_units'] for item in skus_data) if skus_data else 0
    
    # Total time series data points
    res_ts = supabase.table("sku_vendor_time_series").select("*", count="exact").execute()
    total_data_points = res_ts.count
    
    # Avg value calculation (limited sample)
    res_vals = supabase.table("sku_vendor_time_series").select("value").limit(1000).execute()
    avg_value = 0
    if res_vals.data:
        values = [row['value'] for row in res_vals.data]
        avg_value = sum(values) / len(values)
    
    return {
        "total_skus": total_skus,
        "total_units": total_units,
        "total_vendors": total_data_points,
        "avg_cost_price": round(avg_value, 2)
    }


@app.post("/sku/{sku_id}/constraints")
async def add_constraint(
    sku_id: int,
    constraint_type: str = Form(...),
    constraint_value: str = Form(...),
    description: str = Form(None)
):
    """Add a constraint to a SKU"""
    supabase = get_supabase()
    res = supabase.table("sku_constraints").insert({
        "sku_id": sku_id,
        "constraint_type": constraint_type,
        "constraint_value": constraint_value,
        "description": description
    }).execute()
    
    if res.data:
        return {
            "status": "success",
            "constraint_id": res.data[0]['id'],
            "sku_id": sku_id
        }
    return {"status": "error"}


@app.get("/sku/{sku_id}/constraints")
def get_sku_constraints(sku_id: int):
    """Get all constraints for a specific SKU"""
    supabase = get_supabase()
    res = supabase.table("sku_constraints").select("id, constraint_type, constraint_value, description, created_at").eq("sku_id", sku_id).execute()
    return {"constraints": res.data}


@app.delete("/constraint/{constraint_id}")
def delete_constraint(constraint_id: int):
    """Delete a constraint"""
    supabase = get_supabase()
    supabase.table("sku_constraints").delete().eq("id", constraint_id).execute()
    return {"status": "success", "deleted_id": constraint_id}


@app.put("/sku/{sku_id}")
async def update_sku(
    sku_id: int,
    sku_name: str = Form(None),
    current_units: int = Form(None)
):
    """Update SKU information"""
    supabase = get_supabase()
    updates = {}
    if sku_name is not None:
        updates["sku_name"] = sku_name
    if current_units is not None:
        updates["current_units"] = current_units
        
    if not updates:
        return {"status": "error", "message": "No fields to update"}
    
    # Get original SKU name for logging
    orig_res = supabase.table("skus").select("sku_name").eq("id", sku_id).execute()
    orig_name = orig_res.data[0]['sku_name'] if orig_res.data else sku_name
        
    supabase.table("skus").update(updates).eq("id", sku_id).execute()
    
    # Log the SKU update
    log_activity(
        actor="user",
        action_type="edit_sku",
        sku_id=sku_id,
        sku_name=orig_name,
        details=updates
    )
    
    return {"status": "success", "sku_id": sku_id}


@app.delete("/sku/{sku_id}")
def delete_sku(sku_id: int):
    """Delete a single SKU and all related data"""
    supabase = get_supabase()
    # Cascading delete is handled by database, but we can call delete on SKU
    supabase.table("skus").delete().eq("id", sku_id).execute()
    return {"status": "success", "deleted_id": sku_id}


@app.delete("/skus/clear-all")
def clear_all_skus():
    """Delete all SKUs and related data"""
    supabase = get_supabase()
    supabase.table("skus").delete().gt("id", 0).execute()
    return {"status": "success", "message": "All SKUs and related data cleared"}


@app.post("/predict")
def generate_predictions():
    """Generate AI-powered purchase predictions for all SKUs"""
    supabase = get_supabase()
    
    # Get all SKUs
    skus_res = supabase.table("skus").select("id, sku_name, current_units").execute()
    skus = skus_res.data
    
    # Get global monthly budget constraint
    global_const_res = supabase.table("global_constraints").select("constraint_type, constraint_value").eq("constraint_type", "monthly_budget").execute()
    
    monthly_budget = None
    remaining_budget = None
    if global_const_res.data:
        try:
            monthly_budget = float(global_const_res.data[0]["constraint_value"])
            monthly_spending = get_monthly_spending()
            remaining_budget = max(0, monthly_budget - monthly_spending)
            print(f"Global Budget: ${monthly_budget}, Spent: ${monthly_spending}, Remaining: ${remaining_budget}")
        except:
            pass
    
    predictions = []
    
    for sku_row in skus:
        sku_id = sku_row['id']
        sku_name = sku_row['sku_name']
        current_units = sku_row['current_units']
        
        sku_data = {
            "sku_id": sku_id,
            "sku_name": sku_name,
            "current_units": current_units
        }
        
        # Get historical data
        hist_res = supabase.table("sku_vendor_time_series").select("date, value").eq("sku_id", sku_id).order("date").execute()
        historical_data = hist_res.data
        
        # Get vendors
        vend_res = supabase.table("sku_vendors").select("vendor_name, cost_price, delivery_time_days, min_order_quantity").eq("sku_id", sku_id).execute()
        vendors = vend_res.data
        
        # Get constraints (including vendor restrictions)
        const_res = supabase.table("sku_constraints").select("constraint_type, constraint_value, description").eq("sku_id", sku_id).execute()
        constraints = const_res.data
        
        # Get in-transit orders for this SKU (to avoid duplicate orders)
        in_transit_res = supabase.table("transactions").select("total_quantity, expected_delivery_date, status").eq("sku_id", sku_id).in_("status", ["pending", "in_transit", "partially_delivered"]).execute()
        in_transit_qty = sum(tx.get("total_quantity", 0) for tx in in_transit_res.data) if in_transit_res.data else 0
        
        # Add in-transit info to sku_data so predictor knows about pending orders
        sku_data["in_transit_units"] = in_transit_qty
        
        # Generate prediction with constraints and in-transit awareness
        prediction = generate_prediction_for_sku(sku_data, historical_data, vendors, constraints, remaining_budget)
        
        # Auto-create transaction from prediction
        if prediction.get("amount") and prediction.get("vendors"):
            amount = prediction.get("amount")
            quantities = prediction.get("quantities", [])
            costs = prediction.get("cost", [])
            total_cost = sum(q * c for q, c in zip(quantities, costs)) if quantities and costs else 0
            
            # VALIDATE CONSTRAINTS before creating transaction (including budget)
            is_valid, validation_msg = validate_constraints(sku_id, amount, total_cost)
            
            if not is_valid:
                # Constraint violation - skip transaction, log it
                prediction["constraint_violation"] = True
                prediction["violation_reason"] = validation_msg
                prediction["status"] = "blocked"
                
                log_activity(
                    actor="ai",
                    action_type="constraint_violation",
                    sku_id=sku_id,
                    sku_name=sku_name,
                    details={
                        "predicted_amount": amount,
                        "total_cost": total_cost,
                        "violation": validation_msg,
                        "vendors": prediction.get("vendors", [])
                    }
                )
                predictions.append(prediction)
                continue
            
            # Constraints passed - create transaction
            
            # Get delivery times for each vendor
            pred_vendors = prediction.get("vendors", [])
            delivery_times = []
            for v_name in pred_vendors:
                for v in vendors:
                    if v["vendor_name"] == v_name:
                        delivery_times.append(v["delivery_time_days"])
                        break
                else:
                    delivery_times.append(5)  # Default 5 days
            
            # Calculate expected delivery date
            max_delivery_days = max(delivery_times) if delivery_times else 5
            expected_date = (datetime.now() + timedelta(days=max_delivery_days)).strftime("%Y-%m-%d")
            
            vendor_statuses = ["pending"] * len(pred_vendors)
            
            tx_data = {
                "sku_id": sku_id,
                "sku_name": sku_name,
                "total_quantity": amount,
                "vendors": json.dumps(prediction.get("vendors", [])),
                "quantities": json.dumps(quantities),
                "costs": json.dumps(costs),
                "delivery_times": json.dumps(delivery_times),
                "vendor_statuses": json.dumps(vendor_statuses),
                "total_cost": total_cost,
                "status": "in_transit",
                "expected_delivery_date": expected_date
            }
            
            tx_res = supabase.table("transactions").insert(tx_data).execute()
            if tx_res.data:
                transaction_id = tx_res.data[0]['id']
                prediction["transaction_id"] = transaction_id
                prediction["expected_delivery_date"] = expected_date
                prediction["vendor_statuses"] = vendor_statuses
                prediction["status"] = "in_transit"
                
                # Log successful AI prediction
                log_activity(
                    actor="ai",
                    action_type="prediction",
                    sku_id=sku_id,
                    sku_name=sku_name,
                    details={
                        "transaction_id": transaction_id,
                        "amount": amount,
                        "vendors": pred_vendors,
                        "total_cost": total_cost,
                        "reasoning": prediction.get("reasoning", "")
                    }
                )
        
        # Log AI-detected constraint block (when AI needs to order but constraints prevent it)
        if prediction.get("constraint_blocked") and not prediction.get("amount"):
            log_activity(
                actor="ai",
                action_type="constraint_violation",
                sku_id=sku_id,
                sku_name=sku_name,
                details={
                    "violation": "Unable to order due to constraints",
                    "reasoning": prediction.get("reasoning", ""),
                    "constraint_type": "ai_detected"
                }
            )
        
        predictions.append(prediction)
    print(predictions)
    return {"predictions": predictions}


# ==================== TRANSACTIONS ====================

@app.get("/transactions")
def get_transactions():
    """Get all transactions"""
    supabase = get_supabase()
    res = supabase.table("transactions").select("*").order("created_at", desc=True).execute()
    
    transactions = []
    for row in res.data:
        transactions.append({
            "id": row['id'],
            "sku_id": row['sku_id'],
            "sku_name": row['sku_name'],
            "total_quantity": row['total_quantity'],
            "vendors": json.loads(row['vendors']),
            "quantities": json.loads(row['quantities']),
            "costs": json.loads(row['costs']),
            "total_cost": row['total_cost'],
            "status": row['status'],
            "created_at": row['created_at'],
            "vendor_statuses": json.loads(row['vendor_statuses']) if row.get('vendor_statuses') else []
        })
    
    return {"transactions": transactions}


@app.post("/transactions")
def create_transaction(data: dict):
    """Create a new transaction from prediction JSON"""
    supabase = get_supabase()
    sku = data.get("sku")
    amount = data.get("amount")
    vendors = data.get("vendors", [])
    quantities = data.get("quantities", [])
    costs = data.get("cost", [])
    
    # Get SKU ID
    res = supabase.table("skus").select("id").eq("sku_name", sku).execute()
    if not res.data:
        return {"success": False, "error": f"SKU '{sku}' not found"}
    
    sku_id = res.data[0]['id']
    
    # Validate constraints
    res_cons = supabase.table("sku_constraints").select("constraint_type, constraint_value").eq("sku_id", sku_id).execute()
    for row in res_cons.data:
        c_type = row['constraint_type']
        c_value = row['constraint_value']
        if c_type == "max_quantity" and amount > float(c_value):
            return {"success": False, "error": f"Quantity {amount} exceeds max limit of {int(float(c_value))}"}
        if c_type == "min_quantity" and amount < float(c_value):
            return {"success": False, "error": f"Quantity {amount} below min limit of {int(float(c_value))}"}
    
    # Calculate total cost
    total_cost = sum(q * c for q, c in zip(quantities, costs))
    
    # Insert transaction
    tx_data = {
        "sku_id": sku_id,
        "sku_name": sku,
        "total_quantity": amount,
        "vendors": json.dumps(vendors),
        "quantities": json.dumps(quantities),
        "costs": json.dumps(costs),
        "total_cost": total_cost,
        "status": "pending",
        # Default empty delivery times/statuses for pending if not provided
        "delivery_times": "[]",
        "vendor_statuses": "[]"
    }
    
    tx_res = supabase.table("transactions").insert(tx_data).execute()
    if tx_res.data:
        transaction_id = tx_res.data[0]['id']
        return {
            "success": True,
            "transaction_id": transaction_id,
            "message": f"Transaction #{transaction_id} created"
        }
    return {"success": False, "message": "Failed to create transaction"}


# ==================== DELIVERY PROCESSING ====================

@app.post("/process-deliveries")
def process_deliveries():
    """
    Check for transactions where expected_delivery_date <= today
    and add units to SKU current_units
    """
    supabase = get_supabase()
    today = datetime.now().strftime("%Y-%m-%d")
    
    # Find all transactions that are not fully delivered
    res = supabase.table("transactions").select("*").neq("status", "delivered").neq("status", "cancelled").execute()
    active_transactions = res.data
    
    processed = []
    
    for tx in active_transactions:
        tx_id = tx['id']
        sku_id = tx['sku_id']
        sku_name = tx['sku_name']
        vendors_json = tx['vendors']
        quantities_json = tx['quantities']
        statuses_json = tx.get('vendor_statuses')
        delivery_times_json = tx.get('delivery_times')
        created_at_str = tx['created_at']
        
        try:
            vendors = json.loads(vendors_json)
            quantities = json.loads(quantities_json)
            # Handle potential None or missing JSON
            delivery_times = json.loads(delivery_times_json) if delivery_times_json else [5] * len(vendors)
            current_statuses = json.loads(statuses_json) if statuses_json else ["pending"] * len(vendors)
            
            # Check creating date. Postgres timestamp format: 2023-10-27T10:00:00+00:00
            # We need to be careful with parsing.
            # Simple approach: If expected_delivery_date is present in DB, use that.
            # If not, calc from created_at + delivery_time.
            # My 'transactions' table has 'expected_delivery_date' now.
            
            expected_date_str = tx.get('expected_delivery_date')
            
            
            tx_updated = False
            
            # Overall expected date check (simplification: if expected_date <= today, mark all pending as delivered?)
            # Better: Check per vendor if we have per-vendor info.
            # The current implementation uses 'vendor_statuses' array.
            
            # If we rely on the overall expected_date:
            if expected_date_str and expected_date_str <= today:
                 # Deliver all pending items
                 for i in range(len(vendors)):
                     if current_statuses[i] == "pending":
                        qty_to_add = quantities[i]
                        
                        # Update SKU units
                        # Fetch current
                        sku_res = supabase.table("skus").select("current_units").eq("id", sku_id).execute()
                        if sku_res.data:
                            current_units = sku_res.data[0]['current_units']
                            new_units = current_units + qty_to_add
                            supabase.table("skus").update({"current_units": new_units}).eq("id", sku_id).execute()
                            
                            current_statuses[i] = "delivered"
                            tx_updated = True
                            
                            processed.append({
                                "transaction_id": tx_id,
                                "sku_name": sku_name,
                                "vendor": vendors[i],
                                "quantity_added": qty_to_add
                            })
                            
                            # Log AI auto-delivery
                            log_activity(
                                actor="ai",
                                action_type="delivery",
                                sku_id=sku_id,
                                sku_name=sku_name,
                                details={
                                    "transaction_id": tx_id,
                                    "vendor": vendors[i],
                                    "quantity_added": qty_to_add,
                                    "trigger": "auto"
                                }
                            )
            
            if tx_updated:
                new_statuses_json = json.dumps(current_statuses)
                if all(s == "delivered" for s in current_statuses):
                    new_overall_status = "delivered"
                elif any(s == "delivered" for s in current_statuses):
                    new_overall_status = "partially_delivered"
                else:
                    new_overall_status = "in_transit"
                
                supabase.table("transactions").update({
                    "vendor_statuses": new_statuses_json,
                    "status": new_overall_status
                }).eq("id", tx_id).execute()
                
        except Exception as e:
            print(f"Error processing tx {tx_id}: {e}")

    return {
        "processed_count": len(processed),
        "transactions": processed,
        "message": "Delivery processing complete"
    }


@app.post("/transaction/{transaction_id}/vendor/{vendor_idx}/deliver")
def mark_vendor_delivered(transaction_id: int, vendor_idx: int):
    """Manually mark a specific vendor in a transaction as delivered"""
    supabase = get_supabase()

    try:
        # Get transaction details
        res = supabase.table("transactions").select("sku_id, sku_name, vendors, quantities, vendor_statuses, status").eq("id", transaction_id).execute()
        if not res.data:
            return {"success": False, "message": "Transaction not found"}
            
        row = res.data[0]
        sku_id = row['sku_id']
        sku_name = row['sku_name']
        vendors = json.loads(row['vendors'])
        quantities_json = row['quantities']
        statuses_json = row.get('vendor_statuses')
        
        quantities = json.loads(quantities_json)
        statuses = json.loads(statuses_json) if statuses_json else ["pending"] * len(quantities)
        
        if vendor_idx < 0 or vendor_idx >= len(quantities):
            return {"success": False, "message": "Invalid vendor index"}
            
        if statuses[vendor_idx] == "delivered":
            return {"success": False, "message": "Already delivered"}
        
        vendor_name = vendors[vendor_idx] if vendor_idx < len(vendors) else f"Vendor {vendor_idx}"
        statuses[vendor_idx] = "delivered"
        qty_to_add = quantities[vendor_idx]
        
        # Update SKU units
        sku_res = supabase.table("skus").select("current_units").eq("id", sku_id).execute()
        if sku_res.data:
            current_units = sku_res.data[0]['current_units']
            new_units = current_units + qty_to_add
            supabase.table("skus").update({"current_units": new_units}).eq("id", sku_id).execute()
        
        # Update transaction status
        new_statuses_json = json.dumps(statuses)
        if all(s == "delivered" for s in statuses):
            new_status = "delivered"
        else:
            new_status = "partially_delivered"
            
        supabase.table("transactions").update({
            "vendor_statuses": new_statuses_json,
            "status": new_status
        }).eq("id", transaction_id).execute()
        
        # Log user-initiated delivery
        log_activity(
            actor="user",
            action_type="delivery",
            sku_id=sku_id,
            sku_name=sku_name,
            details={
                "transaction_id": transaction_id,
                "vendor": vendor_name,
                "quantity_added": qty_to_add,
                "trigger": "manual"
            }
        )
        
        return {
            "success": True, 
            "message": f"Marked vendor {vendor_idx} as delivered. Added {qty_to_add} units."
        }
        
    except Exception as e:
        return {"success": False, "message": f"Error: {str(e)}"}


@app.get("/check-deliveries")
def check_deliveries():
    """Check pending deliveries status"""
    supabase = get_supabase()
    today = datetime.now().strftime("%Y-%m-%d")
    
    # Fetch in_transit transactions
    res = supabase.table("transactions").select("id, sku_name, total_quantity, expected_delivery_date").eq("status", "in_transit").execute()
    
    pending_deliveries = []
    for row in res.data:
        expected = row['expected_delivery_date']
        # Simple string comparison works for YYYY-MM-DD
        status = 'ready' if expected and expected <= today else 'pending'
        
        pending_deliveries.append({
            "id": row['id'],
            "sku_name": row['sku_name'],
            "quantity": row['total_quantity'],
            "expected_date": expected,
            "status": status
        })
    
    return {"pending_deliveries": pending_deliveries}


@app.post("/chat")
async def chat_endpoint(request: dict):
    from chat_service import process_chat_message
    user_message = request.get("message", "")
    result = process_chat_message(user_message)
    # Frontend expects 'response' key, chat_service returns 'text' key
    return {"response": result.get("text", "Sorry, I couldn't process that.")} 


# ==================== ACTIVITY LOGS ====================

@app.get("/logs")
def get_logs(actor: str = None, action_type: str = None, limit: int = 100):
    """
    Get activity logs with optional filters.
    
    Args:
        actor: Filter by 'user' or 'ai'
        action_type: Filter by action type
        limit: Maximum number of logs to return
    """
    supabase = get_supabase()
    
    query = supabase.table("activity_logs").select("*").order("created_at", desc=True).limit(limit)
    
    if actor:
        query = query.eq("actor", actor)
    if action_type:
        query = query.eq("action_type", action_type)
    
    res = query.execute()
    
    logs = []
    for row in res.data:
        logs.append({
            "id": row['id'],
            "actor": row['actor'],
            "action_type": row['action_type'],
            "sku_id": row['sku_id'],
            "sku_name": row['sku_name'],
            "details": json.loads(row['details']) if row['details'] else None,
            "created_at": row['created_at']
        })
    
    return {"logs": logs}


@app.post("/log")
def create_log(
    actor: str = Form(...),
    action_type: str = Form(...),
    sku_id: int = Form(None),
    sku_name: str = Form(None),
    details: str = Form(None)
):
    """
    Create an activity log entry (for frontend user actions).
    """
    log_activity(
        actor=actor,
        action_type=action_type,
        sku_id=sku_id,
        sku_name=sku_name,
        details=json.loads(details) if details else None
    )
    return {"success": True, "message": "Log created"}


# ==================== GLOBAL CONSTRAINTS ====================

def get_monthly_spending():
    """Get total spending from transactions created this month."""
    supabase = get_supabase()
    
    # Get first day of current month (use UTC for consistency with Supabase)
    today = datetime.now()
    first_of_month = today.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    # Query ALL transactions (simpler approach, filter in Python)
    res = supabase.table("transactions").select("id, total_cost, created_at, status").execute()
    
    total = 0
    print(f"DEBUG get_monthly_spending: first_of_month={first_of_month.isoformat()}")
    print(f"DEBUG get_monthly_spending: found {len(res.data) if res.data else 0} transactions")
    
    if res.data:
        for tx in res.data:
            tx_cost = tx.get("total_cost", 0) or 0
            total += tx_cost
            print(f"  - TX ID {tx.get('id')}: cost={tx_cost}, status={tx.get('status')}, created_at={tx.get('created_at')}")
    
    print(f"DEBUG get_monthly_spending: total={total}")
    return total


@app.get("/global-constraints")
def get_global_constraints():
    """Get all global constraints."""
    supabase = get_supabase()
    res = supabase.table("global_constraints").select("*").execute()
    
    # Also return current month spending for context
    monthly_spending = get_monthly_spending()
    
    return {
        "constraints": res.data,
        "monthly_spending": monthly_spending
    }


@app.post("/global-constraints")
def set_global_constraint(
    constraint_type: str = Form(...),
    constraint_value: str = Form(...),
    description: str = Form(None)
):
    """Create or update a global constraint."""
    supabase = get_supabase()
    
    # Check if constraint type already exists (upsert)
    existing = supabase.table("global_constraints").select("id").eq("constraint_type", constraint_type).execute()
    
    if existing.data:
        # Update existing
        res = supabase.table("global_constraints").update({
            "constraint_value": constraint_value,
            "description": description
        }).eq("constraint_type", constraint_type).execute()
    else:
        # Insert new
        res = supabase.table("global_constraints").insert({
            "constraint_type": constraint_type,
            "constraint_value": constraint_value,
            "description": description
        }).execute()
    
    log_activity(
        actor="user",
        action_type="global_constraint_updated",
        details={
            "constraint_type": constraint_type,
            "constraint_value": constraint_value
        }
    )
    
    return {"success": True, "data": res.data}


@app.delete("/global-constraints/{constraint_type}")
def delete_global_constraint(constraint_type: str):
    """Delete a global constraint."""
    supabase = get_supabase()
    supabase.table("global_constraints").delete().eq("constraint_type", constraint_type).execute()
    return {"success": True, "message": f"Deleted constraint: {constraint_type}"}


if __name__ == "__main__":
    import uvicorn
    # Allow running directly with `python main.py`
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
