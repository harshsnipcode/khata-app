# ⚠️ ACTIVATION CHECKLIST

Before the new product-based transaction system works, you **MUST** run this SQL in your Supabase database:

---

## Step 1: Create the transaction_items Table

Go to your Supabase dashboard → SQL Editor → paste and run:

```sql
-- Create transaction_items table
CREATE TABLE IF NOT EXISTS public.transaction_items (
  id serial PRIMARY KEY,
  transaction_id integer REFERENCES public.transactions(id) ON DELETE CASCADE,
  product_id integer REFERENCES public.products(id) ON DELETE CASCADE,
  quantity numeric NOT NULL,
  price numeric NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS transaction_items_transaction_id_idx ON public.transaction_items(transaction_id);
CREATE INDEX IF NOT EXISTS transaction_items_product_id_idx ON public.transaction_items(product_id);
```

---

## Step 2: Test the New Flow

1. Navigate to a customer: `/customer/1`
2. Click "YOU GAVE"
3. Should see product catalogue with +/- buttons
4. Select products (e.g., Milk × 2, Bread × 3)
5. Amount should auto-calculate (₹260 in example)
6. Click SAVE
7. Should see success: "Sold 2 Products for ₹260"
8. Go back to customer - transaction history should show product names

---

## Step 3: Verify Stock Reduction

After saving a transaction:

1. Go to Catalogue tab in home
2. Click a product you just sold
3. Stock quantity should be reduced
   - Example: Milk had 20, sold 2, now shows 18

---

## Files Changed

| File | Purpose |
|------|---------|
| `db/create_transaction_items_table.sql` | New database schema |
| `src/pages/TransactionEntry.jsx` | Complete rewrite - product selection |
| `src/pages/TransactionSuccess.jsx` | Updated to show product count |
| `src/pages/CustomerDetails.jsx` | Updated to fetch and display items |

---

## ❌ If It Doesn't Work

### Error: "Could not find the table 'public.transaction_items'"

**Solution**: You skipped Step 1. Run the SQL to create the table.

### Error: "Cannot find products" on transaction page

**Solution**: 
- Make sure you have created the `products` table first
- Add some products via Catalogue → Add New Product
- Or verify products exist: Go to admin/catalogue, should see products listed

### Amount always shows ₹0

**Solution**:
- Make sure products have `sale_price` defined
- Try clicking +/- button to see if amount updates
- Check browser console for errors (F12)

### Stock doesn't reduce

**Solution**:
- Check that transaction saved successfully (you saw the success page)
- Go to that product details page - refresh page
- Stock should be reduced

---

## Testing Scenario

Create this test flow:

1. **Add a product**: Milk, Sale Price ₹70, Stock 20
2. **Add a customer**: Sneha, Phone 9999999999
3. **Create transaction**:
   - Go to customer → YOU GAVE
   - Select Milk × 5
   - Amount shows ₹350
   - Click SAVE
4. **Verify**:
   - Success page shows "Sold 1 Product for ₹350"
   - Customer details shows transaction with "Milk × 5"
   - Catalogue shows Milk stock is now 15 (was 20)

---

## Ready?

Once table is created and tested, your app now has:

✅ Product-based transactions
✅ Auto stock reduction
✅ Detailed product history
✅ Real inventory integration

This is exactly where a khata app becomes a real **Inventory + Billing System**!
