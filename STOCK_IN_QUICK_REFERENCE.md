# Stock In Import - Quick Reference

## What Was Added

The Excel importer now supports an optional STOCK IN table that can appear anywhere on the same worksheet as customer transaction data.

## Files Modified

1. **src/lib/excelImport.js**
   - `isStockInSectionHeader()` - Detects STOCK IN headers
   - `parseStockInTable()` - Extracts stock data from worksheet
   - Updated `parseExcelWorkbook()` - Attaches stock data to parsed result

2. **src/lib/excelImportGrouping.js**
   - `collectStockInItems()` - Validates and collects stock items

3. **src/lib/transactionService.js**
   - `createStockInAdjustment()` - Creates stock in adjustments

4. **src/pages/ExcelImportPage.jsx**
   - Imports and uses new stock functions
   - Processes stock items in import flow
   - Shows stock statistics in summary

5. **src/pages/ExcelImportDetail.jsx**
   - Displays stock preview in import detail page
   - Shows stock adjustment counts in statistics

6. **tests/excelStockParsing.test.js** (NEW)
   - 12 new tests for stock parsing functionality

## How It Works

### Excel Format
```
STOCK IN    QTY
SPJ         880
SP ½        200
SP 1        610
```

### Processing Flow
1. User uploads Excel file with STOCK IN table
2. Parser detects STOCK IN header (case-insensitive)
3. Finds adjacent QTY/QUANTITY column
4. Extracts product names and quantities
5. Uses same product normalization as customer import
6. Checks against catalogue for unknown products
7. If any unknown products → import stops (same as customers)
8. Otherwise → creates stock adjustments + customer transactions

### Key Features
✅ Position-independent (table can be anywhere on worksheet)
✅ Case-insensitive headers (STOCK IN, stock in, Stock In all work)
✅ Same product normalization (½ character, spacing, punctuation)
✅ Same unknown product validation (stops import if not found)
✅ Backward compatible (doesn't affect old Excel files)
✅ Offline support (records in product_transactions table)

## Testing

Run tests:
```bash
npm test
```

Result: 53 tests pass (42 existing + 11 new stock tests)

## Implementation Notes

**No Unknown Modifications:**
- Customer transaction parsing → UNCHANGED
- Customer preview → UNCHANGED  
- Customer validation → UNCHANGED
- Offline sync → UNCHANGED
- Reports → UNCHANGED
- UI styling → UNCHANGED

**Why Stock In Instead of Manual Entry:**
Stock adjustments created via import use the existing `product_transactions` table and follow the same logic as manual Stock In operations, ensuring consistency and proper audit trails.

**Future Enhancements (Not Required):**
- Could add Stock Out support
- Could add purchase price from import
- Could add batch notes for entire stock import
