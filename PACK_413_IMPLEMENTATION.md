# PACK 413 — Public Launch KPI Command Center & Panic Playbooks

## Implementation Report

**Pack Number:** PACK 413  
**Stage:** D — Launch & Defense  
**Language:** EN  
**Target:** KiloCode / Claude Sonnet 4.5  
**Status:** ✅ COMPLETE  
**Date:** 2025-12-31

---

## Executive Summary

PACK 413 implements a comprehensive KPI Command Center that serves as "mission control" during and after public launch. The system provides real-time monitoring of critical metrics, automated alerting with configurable thresholds, and pre-defined panic mode playbooks for rapid response to critical situations.

### Core Capabilities

- **Single Mission Control Dashboard**: Unified view of all critical KPIs across 7 categories
- **Real-Time Monitoring**: Auto-refresh every 60 seconds with configurable time ranges
- **Automated Alerting**: KPI threshold monitoring with duration-based triggers
- **Panic Mode System**: 5 pre-defined response playbooks with activation/deactivation controls
- **Tight Integration**: Consumes data from PACKs 410, 411, 412, 300, 301, 302, 293, 296
- **Non-Invasive**: Read-only on tokenomics, no override of existing business logic

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    PACK 413 — KPI COMMAND CENTER                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────┐        ┌──────────────────────────────┐   │
│  │  Admin Web UI    │◄───────┤   Cloud Functions            │   │
│  │  - Dashboard     │        │   - KPI Fusion Service       │   │
│  │  - Alert Panel   │        │   - Alert Evaluation (5min)  │   │
│  │  - Panic Modes   │        │   - Panic Mode Management    │   │
│  └──────────────────┘        └──────────────────────────────┘   │
│         ▲                             ▲         │                │
│         │                             │         │                │
│         │        ┌────────────────────┘         │                │
│         │        │                              ▼                │
│         └────────┼─────────────────────►  Firestore             │
│                  │                        - kpiAlertRules        │
│                  │                        - kpiAlertStates       │
│                  │                        - activePanicModes     │
│                  │                        - panicModeConfigs     │
│                  │                        - systemCommands       │
│                  │                                               │
│                  └──────────────────────────────────────────────┤
│                                                                  │
│         Integration Layer (Read-Only Consumption)                │
│  ┌──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┐     │
│  │ P410 │ P411 │ P412 │ P300 │ P301 │ P302 │ P293 │ P296 │     │
│  │ KPIs │Store│Launch│ Supp │Growth│Safety│Notif.│Audit │     │
│  └──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┘     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Details

### 1. Shared Types (`shared/types/pack413-kpi.ts`)

Comprehensive TypeScript type definitions for:

- **KPI Models**: `KpiMetric`, `GroupedKpis`, `ToplineKpiData`, `RegionalKpiData`
- **Alert System**: `KpiAlertRule`, `KpiAlertState`, `KpiAlertEvent`
- **Panic Modes**: `PanicModeConfig`, `ActivePanicMode`, `PanicModeProposal`
- **Standard Metric Catalog**: 23 pre-defined metric IDs across 7 categories

#### KPI Categories

1. **GROWTH**: DAU, new registrations, verified users, first chat conversions
2. **ENGAGEMENT**: Chats per user, active chats, events booked
3. **REVENUE**: Token purchases, ARPU, paying users (read-only)
4. **SAFETY**: Incident rate, panic button triggers, blocked accounts
5. **SUPPORT**: Open tickets, SLA breaches, average response time
6. **STORE_REPUTATION**: Average rating, 1★ share, negative review volume
7. **PERFORMANCE**: Crash rate, P95 latency, API error rate

### 2. Backend Services

#### 2.1 KPI Fusion Service (`functions/src/pack413-kpi-command-center.ts`)

**Cloud Functions:**

- `pack413_getToplineKpis`: Global KPI dashboard (all categories)
- `pack413_getRegionKpis`: Region-specific KPI view
- `pack413_getSegmentKpis`: Segment-specific KPIs (e.g., new users, paying users)
- `pack413_evaluateKpiAlerts`: Scheduled function (every 5 minutes)

**Features:**

- Aggregates metrics from PACK 410 (analytics), 411 (store), 302 (safety), 300 (support)
- Supports flexible filtering: time range, region, segment
- Auto-calculates trends, baselines, change percentages
- Assigns severity levels (INFO/WARN/CRITICAL) based on thresholds
- Returns grouped metrics with category summaries

#### 2.2 Panic Mode Management (`functions/src/pack413-panic-modes.ts`)

**Cloud Functions:**

- `pack413_initPanicModes`: Initialize default panic mode configurations
- `pack413_proposePanicModeActivation`: Create activation proposal (system/user)
- `pack413_activatePanicMode`: Admin-only activation with mandatory reason
- `pack413_deactivatePanicMode`: Admin-only deactivation with reason
- `pack413_getActivePanicModes`: Fetch currently active modes
- `pack413_getPanicModeHistory`: Historical panic mode activations

**Pre-Defined Panic Modes:**

1. **SLOWDOWN_GROWTH**
   - Trigger: Infrastructure overload
   - Actions: Reduce acquisition spend, limit registrations, throttle referrals
   - Affects: PACK 412 (traffic caps), PACK 301 (campaigns)

2. **SAFETY_LOCKDOWN**
   - Trigger: Safety incident spike
   - Actions: Limit risky features, force re-verification, tighten filters
   - Affects: PACK 302 (moderation), PACK 412 (feature flags), PACK 159 (safety)

3. **PAYMENT_PROTECT**
   - Trigger: Payment errors/fraud spike
   - Actions: Disable risky payment methods, extra verification
   - Affects: PACK 302 (fraud), PACK 174 (payment), Wallet packs

4. **SUPPORT_OVERLOAD**
   - Trigger: Support backlog/SLA failures
   - Actions: Rate-limit rollouts, reduce notifications, auto-responses
   - Affects: PACK 300 (support), PACK 412 (launch), PACK 301 (campaigns)

5. **STORE_DEFENSE**
   - Trigger: Negative rating attack
   - Actions: Activate PACK 411 defense, ramp up rating prompts
   - Affects: PACK 411 (store), PACK 301B (retention)

**Action Execution:**

Panic mode activations write system commands to Firestore (`systemCommands` collection). Downstream packs (412, 301, 302, etc.) listen for these commands and adjust behavior accordingly. No direct override of tokenomics or revenue logic.

#### 2.3 Alert Evaluation System

**Scheduled Evaluation (Every 5 Minutes):**

1. Load all enabled `KpiAlertRule` records
2. Query current metric values from data sources
3. Compare against thresholds (ABOVE / BELOW / DELTA_PCT)
4. Track violation state with `minDurationMinutes` requirement
5. Trigger alerts only when duration threshold exceeded
6. Create `KpiAlertEvent` records
7. Send notifications via PACK 293
8. Log to audit (PACK 296)
9. Propose panic mode activation for CRITICAL alerts (requires admin approval)

**Alert Rule Structure:**

```typescript
{
  id: "ALERT_CRASH_RATE_HIGH",
  metricId: "CRASH_RATE",
  thresholdType: "ABOVE",
  thresholdValue: 5.0,
  minDurationMinutes: 15,  // Must exceed threshold for 15+ minutes
  severity: "CRITICAL",
  linkedPanicModeId: "SLOWDOWN_GROWTH",
  enabled: true,
  notificationChannels: ["admin-kpi-alerts", "slack-emergency"]
}
```

### 3. Admin UI Components

#### 3.1 Command Center Dashboard (`admin-web/command-center/index.tsx`)

**Features:**

- Real-time KPI cards with trend indicators
- Color-coded severity (green/orange/red borders)
- Active panic mode chips in header
- Launch stage indicator (from PACK 412)
- Time range selector (15min / 1hr / today / 7d / 30d)
- Region filter (global + specific regions)
- Tabbed view (All / Growth+Engagement / Revenue+Safety / Support+Performance)
- Active alert banner with count
- Auto-refresh every 60 seconds
- Deep links to alerts and panic modes panels

**KPI Card Display:**

- Metric name and value
- Trend icon (up/down/flat)
- Change percentage vs baseline
- Baseline comparison
- Severity indicator (border color)

#### 3.2 Panic Modes Panel (`admin-web/command-center/panic-modes.tsx`)

**Features:**

- List of all 5 panic mode configurations
- Active/Inactive status indicators
- Recommended actions list
- Affected integrations display
- Manual/Auto-trigger labels
- Activate button (opens confirmation dialog)
- Deactivate button for active modes
- Mandatory reason field for activation/deactivation
- Active panic modes summary banner
- Real-time status updates

**Activation Flow:**

1. Admin clicks "Activate" on panic mode card
2. Confirmation dialog opens with warning
3. Admin enters mandatory reason
4. Calls `pack413_activatePanicMode` Cloud Function
5. System logs to audit (PACK 296)
6. Sends notifications (PACK 293)
7. Writes system commands to Firestore
8. Downstream packs consume commands and adjust behavior

### 4. Firestore Collections

#### Core Collections

- **`kpiAlertRules`**: Alert rule definitions (admin-managed)
- **`kpiAlertStates`**: Current violation state per rule (system-managed)
- **`kpiAlertEvents`**: Triggered alert history with acknowledgment/resolution
- **`panicModeConfigs`**: Panic mode definitions (seeded, admin-editable)
- **`activePanicModes`**: Currently/historically active panic modes
- **`panicModeProposals`**: System/user proposals awaiting approval
- **`systemCommands`**: Integration commands for downstream packs

#### Security Rules (`firestore-pack413-kpi.rules`)

- **Admin-only writes** for alert rules and panic mode configs
- **Service account writes** for alert states and events
- **Admin updates** for alert acknowledgment and panic mode deactivation
- **No deletes** on critical audit trails (alerts, panic modes)
- **Read access** for admin and service accounts only

#### Indexes (`firestore-pack413-kpi.indexes.json`)

13 composite indexes for efficient queries:

- Alert rules by enabled + severity
- Alert events by resolution status + time
- Active panic modes by deactivation status
- Proposals by status + time
- Regional filtering support

### 5. Integration Points

#### Upstream Dependencies (Data Sources)

- **PACK 410**: Core analytics, event tracking, metric aggregations
- **PACK 411**: Store reputation metrics (rating, reviews)
- **PACK 412**: Launch orchestration state, region stages
- **PACK 300/300A/300B**: Support ticket metrics, SLA tracking
- **PACK 301/301A/301B**: Growth campaigns, retention metrics
- **PACK 302**: Fraud detection, safety incident tracking

#### Downstream Integrations (Action Consumers)

- **PACK 293**: Notification delivery (email, push, admin channels)
- **PACK 296**: Audit logging for all actions
- **PACK 412**: Launch orchestration (traffic caps, rollout controls)
- **PACK 301**: Growth engines (campaign intensity adjustment)
- **PACK 302**: Safety systems (moderation sensitivity)
- **PACK 411**: Store defense tactics

#### Non-Invasive Design

- **Read-only** consumption of wallet/revenue metrics
- **No direct modification** of token prices or revenue splits
- **Signal-based** integration via Firestore commands
- **Downstream opt-in** for panic mode responses
- **Audit trail** for all activation/deactivation events

---

## Deployment

### Prerequisites

1. Firebase project with Firestore and Cloud Functions
2. Existing PACKs 410, 411, 412, 300, 301, 302, 293, 296
3. Admin web application infrastructure
4. Firebase CLI installed

### Deployment Steps

```bash
# Make deployment script executable
chmod +x deploy-pack413.sh

# Run deployment
./deploy-pack413.sh
```

**Script Actions:**

1. Validates Firebase project
2. Deploys Firestore rules and indexes
3. Compiles TypeScript shared types
4. Builds and deploys Cloud Functions (10 functions)
5. Creates example alert rule templates
6. Generates initialization instructions

### Post-Deployment

1. **Initialize Panic Modes:**
   ```typescript
   // Call from Firebase Console or admin script
   firebase functions:shell
   pack413_initPanicModes()
   ```

2. **Create Alert Rules:**
   Import examples from `docs/pack413-example-alert-rules.json` into Firestore

3. **Configure Notification Channels:**
   Set up topics in PACK 293: `admin-kpi-alerts`, `admin-launch-control`

4. **Integrate Admin UI:**
   Add Command Center routes to admin navigation
   ```typescript
   /admin/command-center         // Main dashboard
   /admin/command-center/alerts  // Alerts panel
   /admin/command-center/panic   // Panic modes
   ```

5. **Test Alert System:**
   - Create test alert rule with low threshold
   - Verify scheduled evaluation runs every 5 minutes
   - Confirm notifications arrive
   - Test panic mode proposal generation

6. **Monitor Scheduled Function:**
   Check Cloud Functions logs for `pack413_evaluateKpiAlerts` execution

---

## Testing Scenarios

### Unit Tests

- [x] KPI metric serialization/deserialization
- [x] Alert threshold evaluation (ABOVE/BELOW/DELTA_PCT)
- [x] Minimum duration requirement logic
- [x] Panic mode eligibility checks
- [x] Permission validation (admin-only operations)

### Integration Tests

1. **KPI Dashboard Load**
   - Fetch topline KPIs with different time ranges
   - Verify metric aggregation accuracy
   - Check trend calculation
   - Validate severity assignment

2. **Alert Evaluation Cycle**
   - Create test rule with low threshold
   - Trigger metric spike
   - Wait for scheduled evaluation
   - Verify alert event created
   - Confirm notification sent
   - Check audit log entry

3. **Panic Mode Activation**
   - Activate SLOWDOWN_GROWTH mode
   - Verify system commands written
   - Check PACK 412 receives signals
   - Confirm PACK 301 adjusts campaigns
   - Validate audit log
   - Test deactivation flow

4. **Regional KPI Filtering**
   - Query region-specific KPIs
   - Verify regional alert rules
   - Test panic mode regional scope

### E2E Scenarios

1. **Crash Rate Spike**
   - Crash rate exceeds 5% for 15+ minutes
   - Alert `ALERT_CRASH_RATE_HIGH` triggers
   - System proposes `SLOWDOWN_GROWTH` panic mode
   - Admin activates with reason
   - PACK 412 reduces traffic caps
   - Alert acknowledged
   - Normal operations resume after fix
   - Panic mode deactivated

2. **Safety Incident Surge**
   - Safety incident rate spikes globally
   - `ALERT_SAFETY_INCIDENT_SPIKE` triggers
   - `SAFETY_LOCKDOWN` proposed
   - Admin activates
   - Risky features disabled in affected regions
   - PACK 302 increases moderation sensitivity
   - Incident rate drops
   - Lockdown deactivated

3. **Store Rating Attack**
   - Average rating drops from 4.6 to 3.2 rapidly
   - `ALERT_RATING_DROP_CRITICAL` triggers
   - `STORE_DEFENSE` activated
   - PACK 411 defensive tactics deployed
   - Rating prompts ramped up
   - Rating stabilizes
   - Defense mode deactivated

4. **Support Overload**
   - Open tickets exceed 500 for 30+ minutes
   - `ALERT_SUPPORT_BACKLOG_CRITICAL` triggers
   - `SUPPORT_OVERLOAD` activated
   - New feature rollouts paused (PACK 412)
   - Campaign intensity reduced (PACK 301)
   - Auto-responses enabled (PACK 300)
   - Backlog clears
   - Normal operations restored

---

## Metrics & KPIs

### System Health Metrics

- Alert evaluation latency (target: <10s per cycle)
- Dashboard load time (target: <2s)
- Panic mode activation time (target: <5s)
- Notification delivery rate (target: 99%+)

### Operational Metrics

- Active alerts count
- Alert false positive rate
- Panic mode activation frequency
- Average panic mode duration
- Time to acknowledge alerts
- Time to resolve alerts

### Business Impact

- Time to detect critical issues (alert trigger lag)
- Time to respond to incidents (panic mode activation lag)
- Downtime prevented by proactive panic modes
- Support ticket reduction during SUPPORT_OVERLOAD mode
- Revenue protection during PAYMENT_PROTECT mode

---

## Security & Compliance

### Access Control

- **Admin-only** panic mode activation/deactivation
- **Service accounts** for system-generated alerts
- **Audit trail** for all sensitive operations
- **No public access** to KPI data

### Data Privacy

- KPIs aggregated at system level (no PII)
- Regional filtering respects data residency
- Alert notifications exclude sensitive user data

### Token Economics Protection

- **Read-only** access to revenue metrics
- **No direct modification** of pricing or splits
- **Signal-based** integration (no forced changes)
- **Panic modes cannot override** core monetization logic

---

## Maintenance & Operations

### Daily Operations

- **Review active alerts** in Command Center
- **Acknowledge resolved alerts** with notes
- **Monitor panic mode proposals** for false positives
- **Check scheduled function execution** in Cloud Functions logs

### Weekly Review

- Analyze alert false positive rate
- Review panic mode activation history
- Tune alert thresholds based on patterns
- Update recommended actions in panic mode playbooks

### Monthly Audit

- Review KPI baseline accuracy
- Update regional alert rules for new launches
- Assess panic mode effectiveness
- Plan new alert rules for emerging risks

### Troubleshooting

**Alert Not Triggering:**
1. Check rule enabled status
2. Verify metric data availability (PACK 410)
3. Review threshold and duration settings
4. Check scheduled function logs

**Panic Mode Not Activating:**
1. Verify admin permissions
2. Check launch stage compatibility
3. Review activation attempts in audit log
4. Confirm no existing active mode of same type

**KPI Dashboard Empty:**
1. Verify PACK 410 data pipeline
2. Check Cloud Function permissions
3. Review Firestore security rules
4. Test individual KPI endpoints

---

## Future Enhancements

### Phase 2 (Optional)

- **Custom KPI Builder**: Let admins define new metrics without code
- **Machine Learning Alerts**: Anomaly detection beyond static thresholds
- **Playbook Automation**: Auto-activate panic modes for specific scenarios
- **Historical Trend Analysis**: Compare current KPIs to historical patterns
- **Mobile Command Center**: Native mobile app for on-the-go monitoring
- **Slack Integration**: Native Slack bot for KPI queries and alerts
- **Advanced Visualizations**: Time-series graphs, heatmaps, correlation matrices

### Possible Extensions

- **Multi-Region Comparison View**: Side-by-side KPI comparison
- **User Cohort KPIs**: Segment by registration date, country, behavior
- **Revenue Forecasting**: Predictive models based on current trends
- **Incident Management**: Full post-mortem workflow integration
- **Custom Panic Modes**: Let admins create new response playbooks

---

## Success Criteria

✅ **PACK 413 is considered successful if:**

1. Command Center dashboard loads in <2 seconds
2. Alert evaluation runs every 5 minutes without failures
3. All 5 panic modes can be activated/deactivated
4. Integrations with PACKs 410-412 functional
5. Notifications delivered within 30 seconds of alert trigger
6. No false panic mode activations in first week
7. Admin team can navigate UI without training
8. Audit logs capture all critical operations
9. System handles 10,000+ concurrent users without degradation
10. Zero impact on token pricing or revenue logic

---

## File Manifest

### Shared Types
- [`shared/types/pack413-kpi.ts`](shared/types/pack413-kpi.ts) — TypeScript types and interfaces

### Cloud Functions
- [`functions/src/pack413-kpi-command-center.ts`](functions/src/pack413-kpi-command-center.ts) — KPI fusion service (4 functions)
- [`functions/src/pack413-panic-modes.ts`](functions/src/pack413-panic-modes.ts) — Panic mode management (6 functions)

### Admin UI
- [`admin-web/command-center/index.tsx`](admin-web/command-center/index.tsx) — Main KPI dashboard
- [`admin-web/command-center/panic-modes.tsx`](admin-web/command-center/panic-modes.tsx) — Panic modes panel

### Firestore
- [`firestore-pack413-kpi.rules`](firestore-pack413-kpi.rules) — Security rules
- [`firestore-pack413-kpi.indexes.json`](firestore-pack413-kpi.indexes.json) — Composite indexes

### Deployment
- [`deploy-pack413.sh`](deploy-pack413.sh) — Automated deployment script
- [`docs/pack413-example-alert-rules.json`](docs/pack413-example-alert-rules.json) — Example alert rules (created by deploy script)

### Documentation
- [`PACK_413_IMPLEMENTATION.md`](PACK_413_IMPLEMENTATION.md) — This file

---

## Conclusion

PACK 413 delivers a production-ready KPI Command Center for public launch monitoring and defense. The system provides comprehensive visibility into critical metrics, automated alerting with configurable thresholds, and pre-defined response playbooks for rapid incident response.

**Key Achievements:**

- ✅ Unified mission control dashboard
- ✅ Real-time monitoring across 7 KPI categories
- ✅ Automated alert evaluation (5-minute cycles)
- ✅ 5 pre-defined panic mode playbooks
- ✅ Tight integration with 8+ existing packs
- ✅ Non-invasive design (read-only on tokenomics)
- ✅ Comprehensive audit trails
- ✅ Admin-friendly UI with one-click actions

The Command Center is ready for immediate deployment and testing. Integration with existing analytics (PACK 410) and launch orchestration (PACK 412) ensures seamless operation during critical launch phases.

**Deployment Status:** Ready for production  
**Estimated Setup Time:** 2-3 hours  
**Team Sign-Off Required:** CTO, DevOps Lead, Head of Product

---

## Contact & Support

For questions or issues with PACK 413:

- Review this implementation guide
- Check Cloud Functions logs for errors
- Consult Firestore security rules for permission issues
- Verify integration dependencies (PACKs 410, 411, 412, etc.)
- Test with example alert rules before production use

**Remember**: Panic modes are powerful tools. Always provide clear reasons for activation and monitor downstream effects on user experience.

---

**End of PACK 413 Implementation Report**
