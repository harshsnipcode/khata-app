# Product Stock Import Implementation

This document describes the extension to the Excel importer to support an optional **Product Stock** table.

## Overview

The Excel importer now supports an optional STOCK IN table on the same worksheet as customer ledger tables. This feature is **completely backward compatible** - existing Excel sheets without a STOCK IN table work exactly as before.

## Changes Made

### 1. Core Parsing (`src/lib/excelImport.js`)

**Added Functions:**
- `isStockInSectionHeader(value)` - Detects "STOCK IN" header (case-insensitive)
- `parseStockInTable(matrix)` - Parses the optional STOCK IN table from the worksheet
  - Searches the entire worksheet for the STOCK IN header
  - Finds the adjacent "QTY" or "QUANTITY" column
  - Extracts product names and quantities
  - Returns `null` if no STOCK IN table exists
  - Builds a preview section with header and data rows

**Updated Function:**
- `parseExcelWorkbook()` - Now extracts stock data and attaches it to the parsed result

### 2. Item Collection (`src/lib/excelImportGrouping.js`)

**Added Function:**
- `collectStockInItems({ stockInData, productMap })` - Processes stock items
  - Uses the same product normalization as customer import (handles ½, spacing, punctuation)
  - Validates quantities using existing `quantityFromCell` logic
  - Detects unknown products (same as customer import validation)
  - Returns items, unknown products, and errors

### 3. Stock Adjustment (`src/lib/transactionService.js`)

**Added Function:**
- `createStockInAdjustment({ product, quantity, createdBy, notes, importHistoryId })` - Creates stock adjustment
  - Records a `stock_in` transaction in `product_transactions` table
  - Updates product stock level using the same logic as manual Stock In
  - Updates the product object for bulk loop reuse

### 4. Import Flow (`src/pages/ExcelImportPage.jsx`)

**Updated Logic:**
- Stock data is parsed from the worksheet automatically
- Unknown products from BOTH customer transactions and stock items are collected
- Import stops if ANY unknown products exist (matching current customer import behavior)
- Stock adjustments are processed after customer transactions
- Statistics include:
  - `stockInAdjustmentsCreated` - Number of stock adjustments
  - `totalStockInQuantity` - Total quantity of stock adjustments
- History record stores `stock_in_preview` for display

### 5. Import Detail Page (`src/pages/ExcelImportDetail.jsx`)

**Added Display:**
- Stock preview section shows as a separate table with:
  - Product name
  - Quantity being added (prefixed with +)
- Displays only if stock in data exists in the history record
- Stats updated to include stock adjustment counts

## Usage

### Excel Worksheet Format

The STOCK IN table can appear anywhere on the worksheet:

```
STOCK IN    QTY
SPJ         880
SP ½        200
SP 1        610
T ½         10
D1          30
```

**Header Format (case-insensitive):**
- First column: "STOCK IN", "stock in", "Stock In", etc.
- Second column: "QTY", "qty", "QUANTITY", "quantity", etc.

**Rules:**
- The table can be placed anywhere on the worksheet (before, after, or mixed with customer tables)
- Empty rows within the table are skipped
- The first completely empty row terminates the table
- If no STOCK IN table is detected, the importer works exactly as before

### Product Normalization

Stock In uses the same product normalization as customer import:
- Unicode ½ character handled
- Spacing normalized
- Case-insensitive
- Punctuation handled consistently

### Unknown Products

If a product from the STOCK IN table doesn't exist in the catalogue:
- The product name is added to the unknown products list
- The import stops (same as customer import)
- User sees the unknown products in the validation report

### Stock Adjustment Mechanics

Each stock item in the STOCK IN table:
1. Creates a `stock_in` record in `product_transactions` table
2. Updates the product's `stock_quantity` field
3. Uses the product's `purchase_price` field
4. Adds a note linking to the import batch ID

This behaves exactly like a manual Stock In operation - no special handling.

## Testing

All existing tests pass. New tests added in `tests/excelStockParsing.test.js`:

- Header detection (case-insensitive)
- Table parsing with various header formats
- Empty table handling
- Position-independent table detection
- Row skipping and termination
- Quantity validation
- Preview building

Run: `npm test`

## Database Schema

No database changes required. Uses existing:
- `product_transactions` table (already used for manual stock adjustments)
- `products.stock_quantity` column
- `import_history` table (new `stock_in_preview` column needed)

## Backward Compatibility

✅ All existing functionality preserved:
- Customer transaction parsing unchanged
- Customer transaction preview unchanged
- Customer import validation unchanged
- Transaction calculations unchanged
- Offline sync unchanged
- Reports unchanged
- If no STOCK IN table exists, importer behaves identically to before

## Error Handling

All validation follows existing patterns:
- Invalid quantities → error message in report
- Unknown products → stop import and list unknowns
- Network errors → same handling as customer import
- Offline support → stock adjustments recorded and synced
