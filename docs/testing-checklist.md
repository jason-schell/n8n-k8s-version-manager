# Web UI Enhancements Testing Checklist

## Custom Deployment Naming

- [ ] Deploy with blank name → auto-generates `n8n-v{version}`
- [ ] Deploy with custom name "acme-prod" → creates namespace `acme-prod`
- [ ] Deploy same version with different names → both succeed
- [ ] Invalid name (uppercase, special chars) → shows validation error
- [ ] Duplicate name → returns error before starting deploy
- [ ] Custom name deployment shows correct info in table
- [ ] Port calculation works for custom names (no conflicts)

## Manual Snapshot Management

- [ ] Click "Create Snapshot Now" → job starts
- [ ] Snapshot appears in list after completion
- [ ] Snapshot file has correct naming: `n8n-{timestamp}-manual.sql`
- [ ] Restore manual snapshot → works correctly
- [ ] Multiple rapid snapshot creates → don't conflict
- [ ] Snapshot creation fails gracefully if postgres unavailable

## GitHub Version Discovery

- [ ] Available versions load on page load
- [ ] Click version badge → fills input field
- [ ] Cache works (no re-fetch within 5 minutes)
- [ ] GitHub API failure → gracefully hides quick-select
- [ ] Version list shows recent releases only (no drafts/prereleases)
