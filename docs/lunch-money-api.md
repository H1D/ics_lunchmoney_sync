# Lunch Money API v2 Notes

## Base URL

```
https://api.lunchmoney.dev/v2/transactions
```

**Note**: v2 API uses `api.lunchmoney.dev` (not `dev.lunchmoney.app` which is v1).

## Insert Transactions

```bash
POST https://api.lunchmoney.dev/v2/transactions
Authorization: Bearer <LUNCHMONEY_TOKEN>
Content-Type: application/json
```

### Request Body

```json
{
  "transactions": [...],
  "apply_rules": true,
  "skip_duplicates": true
}
```

### Transaction Object (v2)

```json
{
  "date": "2026-01-15",
  "payee": "Example Store",
  "amount": 42.50,
  "manual_account_id": 12345,
  "notes": "Optional notes",
  "external_id": "unique-id-123",
  "status": "unreviewed"
}
```

### Key Changes from v1

| v1 | v2 | Notes |
|----|-----|-------|
| `asset_id` | `manual_account_id` | Renamed |
| `category_name` | `category_id` | Must use ID, not name |
| `tags: ["name"]` | `tag_ids: [123]` | Must use IDs, not names |
| `cleared`/`uncleared` | `reviewed`/`unreviewed` | Status renamed |
| Max 100/batch | Max 500/batch | Increased limit |
| Returns 200 | Returns 201 Created | Proper HTTP codes |

### Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `apply_rules` | false | Apply existing rules |
| `skip_duplicates` | false | Dedupe by date/payee/amount |
| `skip_balance_update` | false | Don't update account balance |

### Deduplication

- `external_id` deduplication happens **automatically** - no flag needed
- `external_id` must be unique per `manual_account_id`
- `skip_duplicates` dedupes by date/payee/amount (separate from external_id)

### Response

**Success (201 Created):**
```json
{
  "transactions": [{ "id": 54, ... }, { "id": 55, ... }],
  "skipped_duplicates": [{ ... }]
}
```

**Error responses** now use proper HTTP status codes:
- `400` - Bad request (invalid parameters)
- `401` - Unauthorized (invalid token)
- `404` - Not found (invalid account ID)
- `429` - Rate limited (check Retry-After header)

## External ID Best Practice

Make `external_id` truly unique by including multiple fields:

```js
external_id: `${transactionDate}-${processingTime}-${batchNr}-${batchSequenceNr}-${amount}`
```

## Amount Sign Convention

- **Positive** = Debit (expense, money out)
- **Negative** = Credit (income, money in)

## Sources

- [v2 API Reference](https://alpha.lunchmoney.dev/v2/docs)
- [Migration Guide](https://alpha.lunchmoney.dev/v2/migration-guide)
- [Developer API KB](https://support.lunchmoney.app/importing-transactions/developer-api)
