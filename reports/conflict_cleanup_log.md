# Firebase Function Conflict Cleanup Log

**Date:** 2025-11-05T22:26:57Z  
**Project:** avalo-c8c46  
**Region:** europe-west3

## Conflicts Detected

### Function: awardPointsOnTx
- **Error:** Changing from an HTTPS function to a background triggered function is not allowed
- **Action:** Delete and redeploy
- **Status:** ✅ Successfully deleted

## Deletion Commands Executed

```bash
firebase functions:delete awardPointsOnTx --region europe-west3 --force --project avalo-c8c46
```

**Result:** ✅ Successful delete operation (2025-11-05T22:27:36Z)
