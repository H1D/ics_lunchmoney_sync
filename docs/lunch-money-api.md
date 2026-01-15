# Lunch Money API Notes

## Base URL

```
https://dev.lunchmoney.app/v1/transactions
```

**Note**: `dev.lunchmoney.app` is the correct public API endpoint (not `api.lunchmoney.app` which is internal).

## Insert Transactions

```bash
POST https://dev.lunchmoney.app/v1/transactions
Authorization: Bearer <LUNCHMONEY_TOKEN>
Content-Type: application/json
```

### Request Body

```json
{
  "transactions": [...],
  "apply_rules": true,
  "check_for_recurring": true
}
```

### Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `apply_rules` | false | Apply existing rules |
| `check_for_recurring` | false | Check for recurring expenses |
| `skip_duplicates` | false | Dedupe by date/payee/amount (not needed if using `external_id`) |

### Deduplication

- `external_id` deduplication happens **automatically** - no flag needed
- `external_id` must be unique per `asset_id`
- `skip_duplicates` only needed if NOT using `external_id` (dedupes by date/payee/amount)

### Response

**Success (200):**
```json
{ "ids": [54, 55, 56, 57] }
```

**Error (200 with error body):**
```json
{
  "error": ["Key (user_external_id, asset_id, account_id)=(...) already exists."]
}
```

**Gotcha**: API can return HTTP 200 with an `error` field - always check for `result.error`.

## External ID Best Practice

Make `external_id` truly unique by including multiple fields:

```js
external_id: `${transactionDate}-${processingTime}-${batchNr}-${batchSequenceNr}-${amount}`
```

## Sources

- [API Reference](https://lunchmoney.dev/)
- [Developer API KB](https://support.lunchmoney.app/importing-transactions/developer-api)
