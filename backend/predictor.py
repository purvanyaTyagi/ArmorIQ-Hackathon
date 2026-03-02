import json
import re
from openai import OpenAI
from datetime import datetime

# Initialize OpenAI client with OpenRouter
client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key="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",
)

MODEL_NAME = "google/gemini-2.0-flash-001"


def generate_prediction_for_sku(sku_data, historical_data, vendors, constraints=None, remaining_budget=None):
    """
    Generate purchase prediction for a single SKU using LLM.
    
    Args:
        sku_data: Dict with sku_id, sku_name, current_units
        historical_data: List of dicts with date and value (quantity sold)
        vendors: List of dicts with vendor_name, cost_price, delivery_time_days, min_order_quantity
        constraints: List of dicts with constraint_type, constraint_value, description
        remaining_budget: Float - remaining monthly budget available for all purchases
    
    Returns:
        Dict with prediction results
    """
    
    # Format historical data for prompt
    if not historical_data:
        return {
            "sku_id": sku_data["sku_id"],
            "sku_name": sku_data["sku_name"],
            "error": "No historical data available"
        }
    
    # Format historical data as CSV-like string
    historical_csv = "Date,Quantity\n"
    for row in historical_data:
        historical_csv += f"{row['date']},{row['value']}\n"
    
    # Format vendor data
    vendor_info = ""
    if vendors:
        vendor_info = "\n### Available Vendors:\n"
        for v in vendors:
            vendor_info += f"- {v['vendor_name']}: ${v['cost_price']} | Delivery: {v['delivery_time_days']} days | Min Order: {v.get('min_order_quantity', 'N/A')}\n"
    else:
        vendor_info = "\n### Available Vendors:\nNo vendor data available.\n"
    
    # Format constraints - vendor restrictions and budget limits
    constraints_info = ""
    blocked_vendors = []
    budget_limit = None
    
    if constraints:
        for c in constraints:
            if c["constraint_type"] == "vendor_restriction":
                blocked_vendors.append(c["constraint_value"])
            elif c["constraint_type"] == "budget_limit":
                try:
                    budget_limit = float(c["constraint_value"])
                except (ValueError, TypeError):
                    pass
        
        constraint_parts = []
        if blocked_vendors:
            constraint_parts.append(f"🚫 **BLOCKED VENDORS**: DO NOT use: {', '.join(blocked_vendors)}")
        if budget_limit:
            constraint_parts.append(f"💰 **BUDGET LIMIT**: Total order cost must NOT exceed ${budget_limit:.2f}")
        
        if constraint_parts:
            constraints_info = "\n### ⚠️ CONSTRAINTS:\n" + "\n".join(constraint_parts) + "\n"
    
    # Get current month
    current_month = datetime.now().strftime("%B %Y")
    
    # Get in-transit quantity (if provided)
    in_transit_units = sku_data.get("in_transit_units", 0)
    in_transit_info = ""
    if in_transit_units > 0:
        in_transit_info = f"\n### ⏳ PENDING ORDERS:\n- Units currently in-transit/pending: {in_transit_units}\n- These orders are already placed and will arrive soon.\n- DO NOT order again for this quantity!\n"
    
    # Add global budget info if provided
    global_budget_info = ""
    if remaining_budget is not None:
        global_budget_info = f"\n### 💵 REMAINING MONTHLY BUDGET: ${remaining_budget:.2f}\n- This is the total remaining budget for ALL SKU purchases this month.\n- Your order cost must NOT exceed this amount.\n- If budget is limited, REDUCE order quantity to fit within budget.\n- Prioritize ordering the most critical amount to prevent stockouts.\n"
    
    # Create prompt
    prompt = f"""
You are an intelligent inventory management system. Analyze the historical sales data and vendor information to generate a purchase recommendation.

### SKU Information:
- Name: {sku_data["sku_name"]}
- Current Units in Stock: {sku_data["current_units"]}
- Effective Stock (Current + In-Transit): {sku_data["current_units"] + in_transit_units}
{in_transit_info}
### Historical Sales Data (CSV):
{historical_csv}

{vendor_info}
{constraints_info}
{global_budget_info}
### Current Month:
"{current_month}"

### Task:
1. **CALCULATE MONTHLY DEMAND**:
   - Look at the historical sales data above
   - SUM UP all the Quantity values to get total historical sales
   - Calculate average monthly demand = total sales / number of months

2. **CHECK IF PURCHASE IS NEEDED** (SHOW YOUR MATH):
   - Effective Stock = {sku_data["current_units"]} + {in_transit_units} = {sku_data["current_units"] + in_transit_units}
   - Compare: Is Effective Stock >= Average Monthly Demand?
   - **If YES (stock covers demand)**: amount = 0, no order needed ✅
   - **If NO (stock is less than demand)**: amount = Average Monthly Demand - Effective Stock
   
   🔢 **VERIFY YOUR COMPARISON!**
   - Example: If Effective Stock is 15 and Demand is 254, then 15 < 254, so you NEED to order!
   - Example: If Effective Stock is 500 and Demand is 150, then 500 >= 150, so amount = 0

3. **OPTIMIZE VENDOR SELECTION** (Only if amount > 0):
   - Compare ALL vendors by cost, delivery time, and minimum order
   - Calculate total cost for EACH possible combination
   - If buying from multiple vendors saves money OR improves delivery, DO IT
   - Example: Buy 60% from cheapest vendor + 40% from fastest vendor
   - Only use single vendor if it's clearly the best for EVERYTHING
   - **NEVER use any blocked/restricted vendors**
   - **If amount = 0, leave vendors, quantities, and cost as empty arrays []**

### IMPORTANT: Multi-vendor is often optimal when:
- One vendor has lowest cost but slow delivery
- Another has faster delivery but higher cost
- Minimum order quantities force splitting

### Output Format (JSON ONLY, no markdown):
{{
  "sku": "{sku_data["sku_name"]}",
  "amount": <total_quantity_to_buy>,
  "reasoning": "<short_explanation_for_decision>",
  "vendors": ["vendor1", "vendor2"],
  "quantities": [<vendor1_qty>, <vendor2_qty>],
  "cost": [<vendor1_unit_cost>, <vendor2_unit_cost>],
  "constraint_blocked": <true if you NEED to order but CANNOT due to constraints like budget/vendor restrictions, false otherwise>
}}

RULES:
- Arrays MUST have same length
- Include ALL vendors you're buying from
- Use 1 vendor only if truly optimal
- NEVER include blocked vendors in your selection
- Set "constraint_blocked": true if stock is LOW but constraints prevent you from ordering (e.g., budget too low, all vendors blocked)
- Set "constraint_blocked": false if stock is sufficient OR if you successfully placed an order
"""

    try:
        # Call LLM with stricter settings for JSON output
        completion = client.chat.completions.create(
            model=MODEL_NAME,
            messages=[
                {
                    "role": "system",
                    "content": "You are a JSON API. Output ONLY valid JSON objects. No markdown, no explanations, just pure JSON."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            temperature=0.3  # Lower temperature for consistent JSON
        )
        
        raw_response = completion.choices[0].message.content.strip()
        
        # Parse JSON from response
        json_match = re.search(r"\{.*\}", raw_response, re.DOTALL)
        
        if json_match:
            json_str = json_match.group(0)
            prediction = json.loads(json_str)
            
            # Add SKU info to response
            prediction["sku_id"] = sku_data["sku_id"]
            prediction["sku_name"] = sku_data["sku_name"]
            prediction["current_units"] = sku_data["current_units"]
            
            return prediction
        else:
            return {
                "sku_id": sku_data["sku_id"],
                "sku_name": sku_data["sku_name"],
                "error": "Could not parse LLM response",
                "raw_response": raw_response
            }
            
    except Exception as e:
        return {
            "sku_id": sku_data["sku_id"],
            "sku_name": sku_data["sku_name"],
            "error": str(e)
        }
