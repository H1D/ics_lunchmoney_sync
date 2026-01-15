# ICS Transaction Fields

## API Endpoint

```
GET /api/nl/sec/frontendservices/transactionsv3/search
```

## Transaction Object

```json
{
  "lastFourDigits": "XXXX",
  "countryCode": "USA",
  "transactionDate": "2026-01-13",
  "description": "EXAMPLE MERCHANT CITY USA",
  "billingAmount": 10.00,
  "billingCurrency": "EUR",
  "sourceAmount": 10.00,
  "sourceCurrency": "EUR",
  "merchantCategoryCodeDescription": "Computer Software Stores",
  "typeOfTransaction": "T",
  "batchNr": 123456,
  "batchSequenceNr": 78901,
  "typeOfPurchase": "ONLINE",
  "processingTime": "12:00:00",
  "walletProvider": null,
  "indicatorExtraCard": "H",
  "embossingName": "J. DOE",
  "directDebitState": "",
  "mobile": false,
  "loyaltyPoints": null,
  "chargeBackAllowed": true
}
```

## Key Fields

| Field | Description |
|-------|-------------|
| `transactionDate` | Date of transaction (YYYY-MM-DD) |
| `processingTime` | Time of processing (HH:MM:SS) |
| `batchNr` | Batch number (not unique alone) |
| `batchSequenceNr` | Sequence within batch |
| `billingAmount/Currency` | Final billed amount |
| `sourceAmount/Currency` | Original currency (for FX) |
| `lastFourDigits` | Card last 4 digits |
| `countryCode` | Country of transaction |
| `embossingName` | Cardholder name |

## Gotcha

`batchNr` + `batchSequenceNr` alone is **not unique** across time. Include `transactionDate`, `processingTime`, and `billingAmount` for uniqueness.
