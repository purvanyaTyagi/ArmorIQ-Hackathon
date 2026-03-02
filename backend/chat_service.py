import json
import re
from openai import OpenAI
from datetime import datetime, timedelta
from predictor import generate_prediction_for_sku
from supabase_client import get_supabase_client

# Initialize OpenAI client with OpenRouter (Same as predictor.py)
client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key="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",
)

MODEL_NAME = "google/gemini-2.0-flash-001"

def get_supabase():
    return get_supabase_client()

def process_chat_message(user_message):
    """
    Process a natural language message from the user.
    Returns a response dictionary with 'text' and 'action_taken'.
    """
    
    # 1. Get Context (List of SKUs for fuzzy matching)
    supabase = get_supabase()
    res = supabase.table("skus").select("sku_name, current_units").execute()
    skus_data = res.data
    sku_list = [f"{row['sku_name']} ({row['current_units']} units)" for row in skus_data]
    sku_context = ", ".join(sku_list)

    # 2. System Prompt for Intent Classification
    system_prompt = f"""
    You are an Inventory Management Assistant directly connected to a database.
    
    Available SKUs in system: [{sku_context}]
    
    Your job is to parse the User's Message into a strictly formatted JSON command.
    
    ### Supported Intents:
    1. **BUY**: User wants to purchase stock.
       - Extract: "sku" (string), "quantity" (int, optional - null if user implies "enough" or "auto"), "vendor" (string, optional).
    2. **SELL**: User sold items and wants to update inventory.
       - Extract: "sku" (string), "quantity" (int).
    3. **CHECK_STOCK**: User asks if stock is sufficient (e.g., "Do we have enough?", "Should we buy?").
       - Extract: "sku" (string).
    4. **QUERY**: User is asking a generic question about stock levels or data.
       - Extract: "topic" (string).
    5. **OTHER**: Chatting, greeting, or unclear.
    
    ### Output Format (JSON ONLY):
    {{
      "intent": "BUY" | "SELL" | "CHECK_STOCK" | "QUERY" | "OTHER",
      "sku": "exact_sku_name",
      "quantity": 100,
      "vendor": "vendor_name",
      "response_text": "Confirmation message." 
    }}
    
    RULES:
    - Map the user's item name to the closest matching SKU from the provided list.
    - If intent is BUY, quantity can be null (AI will calculate).
    - If intent is QUERY, "response_text" MUST be the actual answer based on the "Available SKUs" data.
    """

    try:
        completion = client.chat.completions.create(
            model=MODEL_NAME,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message}
            ],
            temperature=0.1 # Low temp for precision
        )
        
        raw_response = completion.choices[0].message.content.strip()
        
        # Parse JSON
        json_match = re.search(r"\{.*\}", raw_response, re.DOTALL)
        if not json_match:
            return {"text": "I'm sorry, I couldn't understand that command."}
            
        parsed = json.loads(json_match.group(0))
        
        intent = parsed.get("intent")
        sku_name = parsed.get("sku")
        quantity = parsed.get("quantity")
        vendor = parsed.get("vendor")
        
        # 3. Execute Action based on Intent
        if intent == "BUY":
            return execute_buy(sku_name, quantity, vendor)
        elif intent == "SELL":
            return execute_sell(sku_name, quantity)
        elif intent == "CHECK_STOCK":
            return execute_check_stock(sku_name)
        else:
            # For QUERY or OTHER, just return the AI's response text
            return {"text": parsed.get("response_text")}

    except Exception as e:
        print(f"Error processing chat: {e}")
        return {"text": f"Error processing request: {str(e)}"}

def execute_buy(sku_name, quantity, preferred_vendor=None):
    # Auto-calculate quantity if not provided
    if quantity is None:
        data = get_prediction_data(sku_name)
        if not data:
            return {"text": f"Error: SKU '{sku_name}' not found."}
            
        sku_data, history, vendors = data
        prediction = generate_prediction_for_sku(sku_data, history, vendors)
        
        if "error" in prediction:
            return {"text": f"Could not calculate quantity: {prediction['error']}"}
            
        amount_needed = prediction.get("amount", 0)
        incoming = get_incoming_stock(sku_data["sku_id"])
        
        # Net amount needed
        final_quantity = max(0, amount_needed - incoming)
        
        if final_quantity == 0:
            if incoming > 0:
                return {"text": f"⚠️ **No Purchase Needed!**\nAI predicts you need {amount_needed} units, but you already have {incoming} units coming in pending orders."}
            else:
                return {"text": f"⚠️ Stock is sufficient! AI recommends buying 0 units of {sku_name}."}
        
        if incoming > 0:
             # Inform user we adjusted for incoming
             quantity = final_quantity
             # Fall through to execute buy with adjusted quantity
        else:
             quantity = final_quantity
    
    supabase = get_supabase()
    
    # Check if SKU exists and get current stock
    res = supabase.table("skus").select("id, current_units").ilike("sku_name", sku_name).execute()
    if not res.data:
        return {"text": f"Error: SKU '{sku_name}' not found in inventory."}
    
    sku_id = res.data[0]['id']
    current_stock = res.data[0]['current_units'] or 0
    
    # Fetch SKU constraints
    const_res = supabase.table("sku_constraints").select("constraint_type, constraint_value, description").eq("sku_id", sku_id).execute()
    constraints = const_res.data
    
    # Parse constraints
    blocked_vendors = []
    budget_limit = None
    max_quantity = None
    min_quantity = None
    
    for c in constraints:
        c_type = c["constraint_type"]
        c_value = c["constraint_value"]
        if c_type == "vendor_restriction":
            blocked_vendors.append(c_value.lower())
        elif c_type == "budget_limit":
            try:
                budget_limit = float(c_value)
            except:
                pass
        elif c_type == "max_quantity":
            try:
                max_quantity = int(float(c_value))
            except:
                pass
        elif c_type == "min_quantity":
            try:
                min_quantity = int(float(c_value))
            except:
                pass
    
    # Check quantity constraints
    print(f"DEBUG: quantity={quantity}, max_quantity={max_quantity}, min_quantity={min_quantity}, current_stock={current_stock}")
    print(f"DEBUG: constraints={constraints}")
    
    # Ensure quantity is int for comparison
    if quantity is not None:
        quantity = int(quantity)
    
    # max_quantity = max total stock allowed (current + new order should not exceed this)
    if max_quantity is not None and quantity is not None:
        total_after_order = current_stock + quantity
        if total_after_order > max_quantity:
            max_can_order = max(0, max_quantity - current_stock)
            return {"text": f"⚠️ **Constraint Violation!** Ordering {quantity} units would bring total stock to {total_after_order}, exceeding max limit of {max_quantity}. You can order at most {max_can_order} units."}
    
    if min_quantity is not None and quantity is not None and quantity < min_quantity:
        return {"text": f"⚠️ **Constraint Violation!** Cannot order {quantity} units. Min order quantity is {min_quantity} units for {sku_name}."}
    
    # Get Vendors
    res_v = supabase.table("sku_vendors").select("vendor_name, cost_price, delivery_time_days").eq("sku_id", sku_id).execute()
    vendors_data = res_v.data
    
    if not vendors_data:
        return {"text": f"No vendors found for '{sku_name}'. Cannot place order."}
    
    # Filter out blocked vendors
    vendors_list = []
    for r in vendors_data:
        if r['vendor_name'].lower() not in blocked_vendors:
            vendors_list.append((r['vendor_name'], r['cost_price'], r['delivery_time_days']))
    
    if not vendors_list:
        return {"text": f"⚠️ **All vendors are blocked!** Cannot order {sku_name}. Blocked vendors: {', '.join(blocked_vendors)}"}
    
    # Select Vendor
    selected_vendor = None
    if preferred_vendor:
        # Check if preferred vendor is blocked
        if preferred_vendor.lower() in blocked_vendors:
            return {"text": f"⚠️ **Vendor Blocked!** {preferred_vendor} is restricted for {sku_name}. Available: {', '.join([v[0] for v in vendors_list])}"}
        # Try to find match
        for v in vendors_list:
            if preferred_vendor.lower() in v[0].lower():
                selected_vendor = v
                break
    
    if not selected_vendor:
        # Auto-select: Sort by cost, then delivery
        # v[1] is cost, v[2] is delivery
        vendors_list.sort(key=lambda x: (x[1], x[2]))
        selected_vendor = vendors_list[0]
        
    vendor_name, cost, delivery_days = selected_vendor
    
    # Create Transaction
    total_cost = quantity * cost
    
    # Check budget constraint
    if budget_limit and total_cost > budget_limit:
        return {"text": f"⚠️ **Budget Exceeded!** Order cost ${total_cost:.2f} exceeds budget limit of ${budget_limit:.2f} for {sku_name}."}
    
    # Prepare JSON fields for transaction table
    v_list = [vendor_name]
    q_list = [quantity]
    c_list = [cost]
    d_list = [delivery_days]
    s_list = ["pending"]
    
    expected_date = (datetime.now() + timedelta(days=delivery_days)).strftime("%Y-%m-%d")
    
    tx_res = supabase.table("transactions").insert({
        "sku_id": sku_id,
        "sku_name": sku_name,
        "total_quantity": quantity,
        "vendors": json.dumps(v_list),
        "quantities": json.dumps(q_list),
        "costs": json.dumps(c_list),
        "delivery_times": json.dumps(d_list),
        "vendor_statuses": json.dumps(s_list),
        "total_cost": total_cost,
        "status": "in_transit",
        "expected_delivery_date": expected_date
    }).execute()
    
    if tx_res.data:
        tx_id = tx_res.data[0]['id']
        return {"text": f"✅ Ordered {quantity} {sku_name} from {vendor_name}. Total: ${total_cost:.2f} (Tx #{tx_id})"}
    return {"text": "Error creating transaction."}

def get_prediction_data(sku_name):
    supabase = get_supabase()
    
    # 1. Get SKU
    res = supabase.table("skus").select("id, sku_name, current_units").ilike("sku_name", sku_name).execute()
    if not res.data:
        return None
        
    sku_row = res.data[0]
    sku_data = {"sku_id": sku_row['id'], "sku_name": sku_row['sku_name'], "current_units": sku_row['current_units']}
    
    # 2. Get Search History
    res_h = supabase.table("sku_vendor_time_series").select("date, value").eq("sku_id", sku_row['id']).order("date").execute()
    historical_data = [{"date": r['date'], "value": r['value']} for r in res_h.data]
    
    # 3. Get Vendors
    res_v = supabase.table("sku_vendors").select("vendor_name, cost_price, delivery_time_days, min_order_quantity").eq("sku_id", sku_row['id']).execute()
    vendors = [{"vendor_name": r['vendor_name'], "cost_price": r['cost_price'], "delivery_time_days": r['delivery_time_days'], "min_order_quantity": r['min_order_quantity']} for r in res_v.data]
    
    return sku_data, historical_data, vendors

def get_incoming_stock(sku_id):
    """
    Calculate total units currently in transit/pending for a SKU.
    """
    supabase = get_supabase()
    
    # Fetch all transactions for this SKU that are NOT fully delivered/cancelled
    res = supabase.table("transactions").select("quantities, vendor_statuses") \
        .eq("sku_id", sku_id) \
        .neq("status", "delivered") \
        .neq("status", "cancelled") \
        .neq("status", "completed") \
        .execute()
    
    rows = res.data
    
    total_incoming = 0
    for row in rows:
        try:
            qtys = json.loads(row['quantities'])
            statuses_json = row.get('vendor_statuses')
            statuses = json.loads(statuses_json) if statuses_json else ["pending"] * len(qtys)
            
            # Sum up items that are NOT delivered yet
            for q, s in zip(qtys, statuses):
                if s != 'delivered':
                    total_incoming += q
        except:
            continue
            
    return total_incoming

def execute_check_stock(sku_name):
    data = get_prediction_data(sku_name)
    if not data:
        return {"text": f"Error: SKU '{sku_name}' not found."}
        
    sku_data, history, vendors = data
    prediction = generate_prediction_for_sku(sku_data, history, vendors)
    
    if "error" in prediction:
        return {"text": f"Could not analyze stock: {prediction['error']}"}
        
    amount_needed = prediction.get("amount", 0)
    current = sku_data["current_units"]
    incoming = get_incoming_stock(sku_data["sku_id"])
    
    # Calculate effective stock
    effective_needed = max(0, amount_needed - incoming)
    
    status_msg = f"We have {current} units"
    if incoming > 0:
        status_msg += f" (+{incoming} incoming)"
    
    if amount_needed == 0:
        return {"text": f"✅ **Stock Sufficient!**\n{status_msg}. AI predicts this is enough."}
    elif effective_needed == 0:
         return {"text": f"🚚 **Delivery Incoming!**\n{status_msg}. You needed {amount_needed} more, but your pending orders cover it."}
    else:
        return {"text": f"⚠️ **Low Stock Warning**\n{status_msg}.\nAI predicts we still need {effective_needed} more units (accounting for incoming).\n\nRecommended: Buy {effective_needed} units."}

def execute_sell(sku_name, quantity):
    supabase = get_supabase()
    
    # Check if SKU exists
    res = supabase.table("skus").select("id, current_units").ilike("sku_name", sku_name).execute()
    if not res.data:
        return {"text": f"Error: SKU '{sku_name}' not found."}
    
    sku_row = res.data[0]
    sku_id = sku_row['id']
    current_units = sku_row['current_units']
    
    if current_units < quantity:
        return {"text": f"⚠️ Prediction: Insufficient stock! Have {current_units}, trying to sell {quantity}."}
    
    # Update inventory
    new_units = current_units - quantity
    supabase.table("skus").update({"current_units": new_units}).eq("id", sku_id).execute()
    
    return {"text": f"📉 Sold {quantity} {sku_name}. New stock level: {new_units}"}
