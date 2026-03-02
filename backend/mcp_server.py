"""
MCP Server for Transaction Processing
Uses FastMCP to expose tools for creating validated transactions
"""

import json
from datetime import datetime
from fastmcp import FastMCP
from supabase_client import get_supabase_client

# Initialize FastMCP server
mcp = FastMCP("Inventory Transaction Server")


def get_supabase():
    """Get Supabase client"""
    return get_supabase_client()


def validate_constraints(sku_id: int, quantity: int, total_cost: float = None) -> tuple[bool, str]:
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


def get_sku_id_by_name(sku_name: str) -> int | None:
    """Get SKU ID by name"""
    supabase = get_supabase()
    res = supabase.table("skus").select("id").ilike("sku_name", sku_name).execute()
    row = res.data[0] if res.data else None
    return row["id"] if row else None


@mcp.tool
def create_transaction(
    sku: str,
    amount: int,
    vendors: list[str],
    quantities: list[int],
    cost: list[float]
) -> dict:
    """
    Create a purchase transaction from AI prediction.
    
    Args:
        sku: Name of the SKU to purchase
        amount: Total quantity to purchase
        vendors: List of vendor names
        quantities: Quantity to buy from each vendor
        cost: Unit cost from each vendor
    
    Returns:
        Transaction result with status and details
    """
    # Get SKU ID
    sku_id = get_sku_id_by_name(sku)
    if not sku_id:
        return {
            "success": False,
            "error": f"SKU '{sku}' not found in database"
        }
    
    # Validate constraints
    is_valid, message = validate_constraints(sku_id, amount)
    if not is_valid:
        return {
            "success": False,
            "error": f"Constraint violation: {message}"
        }
    
    # Validate arrays have same length
    if len(vendors) != len(quantities) or len(vendors) != len(cost):
        return {
            "success": False,
            "error": "Vendors, quantities, and cost arrays must have same length"
        }
    
    # Calculate total cost
    total_cost = sum(q * c for q, c in zip(quantities, cost))
    
    # Insert transaction
    supabase = get_supabase()
    
    res = supabase.table("transactions").insert({
        "sku_id": sku_id,
        "sku_name": sku,
        "total_quantity": amount,
        "vendors": json.dumps(vendors),
        "quantities": json.dumps(quantities),
        "costs": json.dumps(cost),
        "total_cost": total_cost,
        "status": "pending",
        "vendor_statuses": json.dumps(["pending"] * len(vendors)),
        "delivery_times": json.dumps([5] * len(vendors)) # Default
    }).execute()
    
    if not res.data:
        return {"success": False, "error": "Failed to create transaction"}

    transaction_id = res.data[0]['id']
    
    return {
        "success": True,
        "transaction_id": transaction_id,
        "sku": sku,
        "amount": amount,
        "vendors": vendors,
        "quantities": quantities,
        "cost": cost,
        "total_cost": total_cost,
        "status": "pending",
        "message": f"Transaction #{transaction_id} created successfully"
    }


@mcp.tool
def get_transactions(limit: int = 50) -> list[dict]:
    """
    Get list of recent transactions.
    
    Args:
        limit: Maximum number of transactions to return
    
    Returns:
        List of transaction records
    """
    supabase = get_supabase()
    
    res = supabase.table("transactions").select("*").order("created_at", desc=True).limit(limit).execute()
    rows = res.data
    
    transactions = []
    for row in rows:
        transactions.append({
            "id": row["id"],
            "sku_id": row["sku_id"],
            "sku_name": row["sku_name"],
            "total_quantity": row["total_quantity"],
            "vendors": json.loads(row["vendors"]),
            "quantities": json.loads(row["quantities"]),
            "costs": json.loads(row["costs"]),
            "total_cost": row["total_cost"],
            "status": row["status"],
            "created_at": row["created_at"]
        })
    
    return transactions


@mcp.tool
def update_transaction_status(transaction_id: int, status: str) -> dict:
    """
    Update transaction status.
    
    Args:
        transaction_id: ID of the transaction
        status: New status (pending, approved, completed, cancelled)
    
    Returns:
        Update result
    """
    valid_statuses = ["pending", "approved", "completed", "cancelled"]
    if status not in valid_statuses:
        return {
            "success": False,
            "error": f"Invalid status. Must be one of: {valid_statuses}"
        }
    
    supabase = get_supabase()
    
    res = supabase.table("transactions").update({"status": status}).eq("id", transaction_id).execute()
    
    if not res.data:
        return {
            "success": False,
            "error": f"Transaction #{transaction_id} not found or update failed"
        }
    
    return {
        "success": True,
        "message": f"Transaction #{transaction_id} status updated to '{status}'"
    }


if __name__ == "__main__":
    # Run the MCP server
    mcp.run()
